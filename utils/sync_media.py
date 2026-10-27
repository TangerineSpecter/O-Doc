"""Media discovery and file operations, independent of snapshot database writes."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from urllib.parse import urlparse
from django.conf import settings
from .sync_policy import SyncError
from .sync_repository import SnapshotRepository

class SnapshotMedia:
    """Referenced local media, content hashes, blobs and verified restoration."""

    def __init__(self, remote: SnapshotRepository):
        self.remote = remote

    @staticmethod
    def normalize_rel_path(rel_path):
        return rel_path.replace('\\', '/').lstrip('/')


    @staticmethod
    def join_remote_path(base_path, child_name):
        base_path = base_path.rstrip('/')
        child_name = child_name.strip('/')
        return f"{base_path}/{child_name}" if child_name else base_path


    @staticmethod
    def hash_file(file_path):
        digest = hashlib.md5()
        with open(file_path, 'rb') as file_obj:
            for chunk in iter(lambda: file_obj.read(1024 * 1024), b''):
                digest.update(chunk)
        return digest.hexdigest()


    @staticmethod
    def get_media_relative_path(media_url):
        media_url_path = urlparse(settings.MEDIA_URL).path.rstrip('/') + '/'
        url_path = urlparse(media_url).path
        if not url_path.startswith(media_url_path):
            return ''

        media_root = os.path.realpath(settings.MEDIA_ROOT)
        local_path = os.path.realpath(os.path.join(media_root, url_path[len(media_url_path):]))
        if os.path.commonpath([media_root, local_path]) != media_root:
            return ''

        return os.path.relpath(local_path, media_root).replace(os.sep, '/')


    def iter_valid_books(self):
        from anthology.models import Book
        return Book.objects.filter(is_valid=True).select_related('asset')


    def book_body_rel_path(self, book):
        if not book.asset or not book.asset.file_path:
            return ''
        return self.normalize_rel_path(book.asset.file_path)


    def book_body_asset_ids(self):
        return {book.asset_id for book in self.iter_valid_books() if book.asset_id}


    def released_book_rel_paths(self):
        return [
            rel_path for book in self.iter_valid_books()
            if book.local_state == 'cloud_only' and (rel_path := self.book_body_rel_path(book))
        ]


    def collect_asset_relative_paths(self):
        from assets.models import Asset

        relative_paths = []
        missing_files = []
        released_asset_ids = {
            book.asset_id for book in self.iter_valid_books()
            if book.local_state == 'cloud_only' and book.asset_id
        }
        for asset in Asset.objects.filter(is_valid=True):
            if not asset.file_path:
                continue

            rel_path = self.normalize_rel_path(asset.file_path)
            local_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            if not os.path.isfile(local_path):
                # A cloud-only book has an explicit remote hash and is intentionally absent locally.
                if asset.id in released_asset_ids:
                    continue
                missing_files.append(rel_path)
                continue

            relative_paths.append(rel_path)

        return sorted(set(relative_paths)), missing_files


    def collect_user_avatar_relative_paths(self):
        """收集保存在 MEDIA_ROOT 下的用户头像。"""
        from user.models import UserProfile

        relative_paths = []
        missing_files = []
        for avatar_url in UserProfile.objects.exclude(avatar='').values_list('avatar', flat=True):
            rel_path = self.get_media_relative_path(avatar_url)
            if not rel_path:
                continue

            local_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            if not os.path.isfile(local_path):
                missing_files.append(rel_path)
                continue

            relative_paths.append(rel_path)

        return sorted(set(relative_paths)), missing_files


    def collect_media_relative_paths(self):
        asset_paths, asset_missing = self.collect_asset_relative_paths()
        avatar_paths, avatar_missing = self.collect_user_avatar_relative_paths()
        return sorted(set(asset_paths) | set(avatar_paths)), asset_missing + avatar_missing


    def reconcile_missing_book_media(self, *, drop_missing_assets=True):
        """将本地已缺失的媒体降级，避免资源记录阻断整个数据同步。

        图书正文是按需下载的大文件；正文不在本机时，保留书架记录并标记为
        ``cloud_only``。封面丢失不影响阅读，移除封面引用后由前端使用默认封面。
        ``drop_missing_assets`` 为真时，其他 Asset 若文件已不存在，则将资源记录软删除；
        用户头像则清空头像引用。
        这样缺失文件不会继续出现在下一份快照中，也不会阻断其他数据同步。
        """
        from anthology.models import Book
        from assets.models import Asset

        missing_body_ids = []
        missing_cover_ids = []
        for book in self.iter_valid_books():
            body_path = self.book_body_rel_path(book)
            if body_path and not os.path.isfile(os.path.join(settings.MEDIA_ROOT, body_path)):
                if book.local_state != 'cloud_only':
                    missing_body_ids.append(book.book_id)
            if book.cover_asset_id:
                cover_path = self.normalize_rel_path(book.cover_asset.file_path)
                if cover_path and not os.path.isfile(os.path.join(settings.MEDIA_ROOT, cover_path)):
                    missing_cover_ids.append(book.cover_asset_id)
                    book.cover_asset = None
                    book.save(update_fields=['cover_asset', 'updated_at'])

        if missing_body_ids:
            Book.objects.filter(book_id__in=missing_body_ids).update(local_state='cloud_only')

        # 封面 Asset 只服务书架时可以安全失效，避免其残留资源记录继续阻断同步。
        if missing_cover_ids:
            body_asset_ids = set(Book.objects.filter(is_valid=True).values_list('asset_id', flat=True))
            for asset in Asset.objects.filter(id__in=set(missing_cover_ids) - body_asset_ids).exclude(quant_references__isnull=False).exclude(mt4_references__isnull=False):
                metadata = asset.metadata if isinstance(asset.metadata, dict) else {}
                if metadata.get('book_cover') and not asset.linked_article_id:
                    asset.is_valid = False
                    asset.save(update_fields=['is_valid'])

        if not drop_missing_assets:
            return {'bodies': len(missing_body_ids), 'covers': len(set(missing_cover_ids)), 'assets': 0, 'avatars': 0}

        # 图书正文已有 cloud_only 语义，绝不能将其 Asset 软删除；其余缺失 Asset
        # 代表本机已不存在的附件/图片，保留有效记录只会让每次快照再次失败。
        book_body_asset_ids = self.book_body_asset_ids()
        missing_asset_ids = []
        for asset in Asset.objects.filter(is_valid=True).exclude(id__in=book_body_asset_ids).exclude(quant_references__isnull=False).exclude(mt4_references__isnull=False):
            rel_path = self.normalize_rel_path(asset.file_path)
            if rel_path and not os.path.isfile(os.path.join(settings.MEDIA_ROOT, rel_path)):
                missing_asset_ids.append(asset.id)
        if missing_asset_ids:
            Asset.objects.filter(id__in=missing_asset_ids).update(is_valid=False)

        # 头像没有独立 Asset，文件丢失时直接回退为默认头像。
        from user.models import UserProfile
        missing_avatar_urls = []
        for avatar_url in UserProfile.objects.exclude(avatar='').values_list('avatar', flat=True):
            rel_path = self.get_media_relative_path(avatar_url)
            if rel_path and not os.path.isfile(os.path.join(settings.MEDIA_ROOT, rel_path)):
                missing_avatar_urls.append(avatar_url)
        if missing_avatar_urls:
            UserProfile.objects.filter(avatar__in=missing_avatar_urls).update(avatar='')

        return {
            'bodies': len(missing_body_ids),
            'covers': len(set(missing_cover_ids)),
            'assets': len(set(missing_asset_ids)),
            'avatars': len(set(missing_avatar_urls)),
        }


    def list_local_files(self, local_root):
        local_root = str(local_root)
        if not os.path.isdir(local_root):
            return []

        file_list = []
        for root, dirs, files in os.walk(local_root):
            dirs[:] = [name for name in dirs if not name.startswith('.')]
            for file_name in files:
                if file_name.startswith('.') or file_name == 'Thumbs.db':
                    continue
                local_path = os.path.join(root, file_name)
                rel_path = os.path.relpath(local_path, local_root)
                file_list.append(self.normalize_rel_path(rel_path))
        return sorted(file_list)


    def remove_local_extra_files(self, local_root, expected_rel_paths):
        deleted_count = 0
        expected_rel_paths = set(expected_rel_paths)
        for rel_path in self.list_local_files(local_root):
            if rel_path in expected_rel_paths:
                continue

            local_path = os.path.join(local_root, rel_path)
            try:
                os.remove(local_path)
                deleted_count += 1
            except FileNotFoundError:
                continue

        return deleted_count


    def book_body_rel_path_set(self):
        return {
            rel_path for book in self.iter_valid_books()
            if (rel_path := self.book_body_rel_path(book))
        }


    def restore_media_from_directory(self, backup_media_root):
        copied = set()
        if os.path.isdir(backup_media_root):
            for rel_path in self.list_local_files(backup_media_root):
                source_path = os.path.join(backup_media_root, rel_path)
                dest_path = os.path.join(str(settings.MEDIA_ROOT), rel_path)
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                shutil.copy2(source_path, dest_path)
                copied.add(rel_path)

        expected_rel_paths, _missing = self.collect_media_relative_paths()
        keep_book_bodies = {
            rel_path for rel_path in self.book_body_rel_path_set()
            if os.path.isfile(os.path.join(str(settings.MEDIA_ROOT), rel_path))
        }
        self.remove_local_extra_files(
            str(settings.MEDIA_ROOT),
            set(expected_rel_paths) | copied | keep_book_bodies,
        )

        from anthology.models import Book
        for book in self.iter_valid_books():
            rel_path = self.book_body_rel_path(book)
            if not rel_path:
                continue
            local_path = os.path.join(str(settings.MEDIA_ROOT), rel_path)
            if not os.path.isfile(local_path) and book.local_state != 'cloud_only':
                Book.objects.filter(book_id=book.book_id).update(local_state='cloud_only')
        return len(copied)


    def media_hash_cache_path(self):
        return os.path.join(str(settings.MEDIA_ROOT), '.sync-v2-safety', 'media-hash-index.json')


    def load_media_hash_cache(self):
        path = self.media_hash_cache_path()
        try:
            with open(path, encoding='utf-8') as cache_file:
                payload = json.load(cache_file)
        except (OSError, json.JSONDecodeError):
            return {}
        return payload if isinstance(payload, dict) else {}


    def save_media_hash_cache(self, cache, keep_paths):
        retained = {path: entry for path, entry in cache.items() if path in keep_paths}
        path = self.media_hash_cache_path()
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            temporary = path + '.tmp'
            with open(temporary, 'w', encoding='utf-8') as cache_file:
                json.dump(retained, cache_file, ensure_ascii=False)
            os.replace(temporary, path)
        except OSError:
            return


    def digest_media_file(self, rel_path, cache):
        local_path = os.path.join(settings.MEDIA_ROOT, rel_path)
        file_stat = os.stat(local_path)
        cached = cache.get(rel_path) or {}
        if (
            cached.get('size') == file_stat.st_size
            and cached.get('mtime_ns') == file_stat.st_mtime_ns
            and cached.get('hash')
        ):
            return cached['hash'], file_stat.st_size
        digest = self.hash_file(local_path)
        cache[rel_path] = {'size': file_stat.st_size, 'mtime_ns': file_stat.st_mtime_ns, 'hash': digest}
        return digest, file_stat.st_size


    def compose_media_manifest(self, previous_media=None, *, allow_missing=False):
        previous_media = previous_media or {}
        paths, missing = self.collect_media_relative_paths()
        if missing:
            if allow_missing:
                return None
            raise SyncError('无法创建安全快照，本地存在缺失资源：' + '，'.join(missing[:3]))
        cache = self.load_media_hash_cache()
        media = {}
        for rel_path in paths:
            local_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            if not os.path.isfile(local_path):
                continue
            digest, size = self.digest_media_file(rel_path, cache)
            media[rel_path] = {'hash': digest, 'size': size}
        self.save_media_hash_cache(cache, set(media))
        released_book_paths = set(self.released_book_rel_paths())
        for rel_path, entry in previous_media.items():
            if rel_path in released_book_paths and rel_path not in media and entry.get('hash'):
                media[rel_path] = {'hash': entry.get('hash'), 'size': int(entry.get('size') or 0)}
        return media


    def build_v2_media_manifest(self, previous_media=None):
        # 只有明确释放的 cloud_only 图书正文保留上一个 v2 快照的 blob 引用；
        # 其他资源缺失时不能静默延续旧引用。
        return self.compose_media_manifest(previous_media)


    @staticmethod
    def format_size(size):
        size = int(size or 0)
        for unit in ('B', 'KB', 'MB', 'GB'):
            if size < 1024 or unit == 'GB':
                return f'{size:.1f} {unit}' if unit != 'B' else f'{size} B'
            size /= 1024


    def upload_v2_blobs(self, media_manifest, report=None):
        uploaded = 0
        uploaded_bytes = 0
        total = len(media_manifest)
        for index, (rel_path, entry) in enumerate(media_manifest.items(), start=1):
            digest = entry.get('hash')
            local_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            if not digest or not os.path.isfile(local_path):
                continue
            blob_path = f'{self.remote.v2_blobs_dir}/{digest}'
            if self.remote.client.exists(blob_path):
                continue
            self.remote.client.ensure_directory(self.remote.v2_blobs_dir)
            if not self.remote.client.upload_file(local_path, blob_path):
                raise SyncError(f'上传媒体 blob 失败：{rel_path}')
            uploaded += 1
            uploaded_bytes += int(entry.get('size', 0) or 0)
            if callable(report):
                progress = 80 + int(index / max(total, 1) * 12)
                report(f'媒体上传 {index}/{total}：{rel_path}（{self.format_size(entry.get("size", 0))}）', progress)
        return uploaded, uploaded_bytes


    def restore_v2_media(self, media_manifest, *, skip_paths=None):
        skip_paths = set(skip_paths or ())
        for rel_path, entry in (media_manifest or {}).items():
            if rel_path in skip_paths:
                continue
            digest = entry.get('hash')
            local_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            if digest and os.path.isfile(local_path) and self.hash_file(local_path) == digest:
                continue
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            tmp_path = local_path + '.sync-v2-partial'
            remote_path = self.join_remote_path(self.remote.media_dir, rel_path) if entry.get('legacy_path') else f'{self.remote.v2_blobs_dir}/{digest}'
            if not self.remote.client.download_file(remote_path, tmp_path):
                raise SyncError(f'下载 v2 媒体失败：{rel_path}')
            if digest and self.hash_file(tmp_path) != digest:
                os.remove(tmp_path)
                raise SyncError(f'下载的媒体校验失败：{rel_path}')
            os.replace(tmp_path, local_path)


    @staticmethod
    def book_body_paths_from_snapshot(data_list):
        """从快照数据中取出图书正文路径，供同步下载时跳过。"""
        assets_by_id = {}
        book_asset_ids = set()
        for item in data_list or []:
            fields = item.get('fields') or {}
            if item.get('model') == 'assets.asset':
                assets_by_id[str(item.get('pk'))] = fields.get('file_path') or ''
            elif item.get('model') == 'anthology.book' and not fields.get('is_valid') is False:
                if fields.get('asset'):
                    book_asset_ids.add(str(fields['asset']))
        return {
            path for asset_id, path in assets_by_id.items()
            if asset_id in book_asset_ids and path
        }


    def restore_file(self, rel_path, *, remote, expected_hash=''):
        """按当前 v2 快照恢复一个媒体文件，供图书按需下载使用。"""
        entry = (remote or {}).get('media', {}).get(self.normalize_rel_path(rel_path))
        if not entry or not entry.get('hash'):
            raise SyncError('云端没有这本图书的可用副本，请选择本地文件补传')
        digest = entry['hash']
        if expected_hash and digest != expected_hash:
            raise SyncError('云端图书副本与当前书架记录不一致，请选择本地文件补传')

        local_path = os.path.join(settings.MEDIA_ROOT, self.normalize_rel_path(rel_path))
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        tmp_path = local_path + '.book-restore-partial'
        remote_path = self.join_remote_path(self.remote.media_dir, rel_path) if entry.get('legacy_path') else f'{self.remote.v2_blobs_dir}/{digest}'
        try:
            if not self.remote.client.download_file(remote_path, tmp_path):
                raise SyncError('云端图书副本不存在或下载失败，请选择本地文件补传')
            if self.hash_file(tmp_path) != digest:
                raise SyncError('云端图书副本校验失败，请选择本地文件补传')
            os.replace(tmp_path, local_path)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
