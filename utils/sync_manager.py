import hashlib
import json
import os
import shutil
import tempfile
import uuid
import zipfile
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime
from urllib.parse import urlparse

from django.apps import apps
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.conf import settings
from django.core import serializers
from django.db import transaction
from django.db.models import PROTECT
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from system_settings.sync_state import (
    LOCAL_ONLY_MODEL_LABELS, canonical_hash, get_device_id, suspend_tracking,
    sync_entity_identity,
)


class SyncError(Exception):
    """同步过程中的显式失败。"""


class SyncManager:
    SNAPSHOT_FORMAT = 2
    SNAPSHOT_RETENTION = 10
    REMOTE_LOCK_TTL_SECONDS = 2 * 60 * 60
    TARGET_APPS = [
        'article', 'anthology', 'categories', 'tags',
        'assets', 'stats', 'ai_assistant', 'system_settings', 'user'
    ]
    LOCAL_ONLY_SYSTEM_SETTING_KEYS = frozenset({
        'system_webdav_config',
        'system_webdav_sync_runtime',
        'system_sync_v2_device',
    })

    def __init__(self, storage_client=None, remote_base_path=''):
        self.client = storage_client
        if storage_client is None:
            self.base_path = ''
            self.data_file = 'data_index.json'
            self.meta_file = 'snapshot_meta.json'
            self.media_dir = 'media'
            self.v2_dir = 'sync-v2'
            self.v2_snapshots_dir = 'sync-v2/snapshots'
            self.v2_blobs_dir = 'sync-v2/blobs'
            self.v2_current_file = 'sync-v2/current.json'
            return

        path = (remote_base_path or '').strip().strip('/')
        if not path:
            raise ValueError('请填写远程路径，不要留空，以免写到错误的备份目录')
        self.base_path = f"/{path}"

        self.data_file = f"{self.base_path}/data_index.json"
        self.meta_file = f"{self.base_path}/snapshot_meta.json"
        self.media_dir = f"{self.base_path}/media"
        self.v2_dir = f"{self.base_path}/sync-v2"
        self.v2_snapshots_dir = f"{self.v2_dir}/snapshots"
        self.v2_blobs_dir = f"{self.v2_dir}/blobs"
        self.v2_current_file = f"{self.v2_dir}/current.json"

    @staticmethod
    def get_current_app_version():
        package_file = settings.BASE_DIR / 'frontend_react' / 'package.json'
        try:
            with open(package_file, 'r', encoding='utf-8') as file_obj:
                return json.load(file_obj).get('version') or 'unknown'
        except Exception:
            return os.getenv('ODOC_APP_VERSION', 'unknown')

    @staticmethod
    def _parse_version(version):
        try:
            parts = str(version).lstrip('v').split('.')
            return tuple(int(part) for part in parts[:3])
        except (TypeError, ValueError):
            return None

    @classmethod
    def _is_snapshot_version_compatible(cls, remote_version, current_version):
        if remote_version == current_version:
            return True

        remote_parts = cls._parse_version(remote_version)
        current_parts = cls._parse_version(current_version)
        if not remote_parts or not current_parts:
            return False

        remote_parts = remote_parts + (0,) * (3 - len(remote_parts))
        current_parts = current_parts + (0,) * (3 - len(current_parts))
        remote_major, remote_minor, remote_patch = remote_parts
        current_major, current_minor, current_patch = current_parts

        # 同步快照只做向后兼容：当前版本可以读取同一主版本下的当前小版本
        # 或上一个小版本快照，但不能读取由更新系统生成的快照。
        if remote_major != current_major:
            return False

        if remote_minor > current_minor:
            return False

        if remote_minor == current_minor and remote_patch > current_patch:
            return False

        # 允许新版服务读取上一个小版本生成的快照，完成升级后的首次同步。
        return current_minor - remote_minor <= 1

    @classmethod
    def is_remote_version_older(cls, remote_version, current_version=None):
        current_version = current_version or cls.get_current_app_version()
        if not remote_version or remote_version == current_version:
            return False

        remote_parts = cls._parse_version(remote_version)
        current_parts = cls._parse_version(current_version)
        if not remote_parts or not current_parts:
            return False

        remote_parts = remote_parts + (0,) * (3 - len(remote_parts))
        current_parts = current_parts + (0,) * (3 - len(current_parts))
        return remote_parts < current_parts

    @classmethod
    def is_remote_version_newer(cls, remote_version, current_version=None):
        current_version = current_version or cls.get_current_app_version()
        if not remote_version or remote_version == current_version:
            return False

        remote_parts = cls._parse_version(remote_version)
        current_parts = cls._parse_version(current_version)
        if not remote_parts or not current_parts:
            return False

        remote_parts = remote_parts + (0,) * (3 - len(remote_parts))
        current_parts = current_parts + (0,) * (3 - len(current_parts))
        return remote_parts > current_parts

    def validate_remote_snapshot_version(self, remote_meta):
        if not remote_meta:
            return

        remote_version = remote_meta.get('app_version')
        current_version = self.get_current_app_version()
        if not remote_version:
            raise SyncError(
                "远端快照缺少版本信息，可能由旧版本系统生成。"
                "请先将两端系统升级到同一版本后再同步。"
            )

        if self.is_remote_version_newer(remote_version, current_version):
            raise SyncError(
                f"远端快照由更新的系统 v{remote_version} 生成，当前系统为 v{current_version}。"
                "请先升级本机后再同步。不要用旧版本上传或先拉后推，以免覆盖另一台已经更新的数据。"
            )

        if not self._is_snapshot_version_compatible(remote_version, current_version):
            raise SyncError(
                f"远端快照由系统版本 v{remote_version} 生成，当前系统版本为 v{current_version}。"
                "请先将两端系统升级到同一版本后再同步。"
            )

    @staticmethod
    def _normalize_rel_path(rel_path):
        return rel_path.replace('\\', '/').lstrip('/')

    @staticmethod
    def _join_remote_path(base_path, child_name):
        base_path = base_path.rstrip('/')
        child_name = child_name.strip('/')
        return f"{base_path}/{child_name}" if child_name else base_path

    @staticmethod
    def _hash_file(file_path):
        digest = hashlib.md5()
        with open(file_path, 'rb') as file_obj:
            for chunk in iter(lambda: file_obj.read(1024 * 1024), b''):
                digest.update(chunk)
        return digest.hexdigest()

    def _iter_target_models(self):
        yield Group
        yield get_user_model()
        for app_label in self.TARGET_APPS:
            app_config = apps.get_app_config(app_label)
            for model in app_config.get_models():
                if model._meta.label_lower in LOCAL_ONLY_MODEL_LABELS:
                    continue
                yield model

    def _queryset_for_export(self, model):
        queryset = model.objects.all()
        if model._meta.label_lower == 'system_settings.systemsetting':
            queryset = queryset.exclude(key__in=self.LOCAL_ONLY_SYSTEM_SETTING_KEYS)
        return queryset

    def _drop_local_only_settings(self, data_list):
        filtered = []
        for item in data_list:
            if (
                item.get('model') == 'system_settings.systemsetting'
                and str(item.get('pk')) in self.LOCAL_ONLY_SYSTEM_SETTING_KEYS
            ):
                continue
            filtered.append(item)
        return filtered

    @staticmethod
    def _ensure_not_aborted(should_abort):
        if callable(should_abort) and should_abort():
            raise SyncError('同步已取消')

    def _fill_missing_snapshot_fields_from_local(self, data_list, model_map):
        """旧快照没有的字段保留本地值，避免新版本字段被写成模型默认值。"""
        items_by_model = defaultdict(list)
        for item in data_list:
            model = model_map.get(item.get('model'))
            fields = item.get('fields')
            pk = item.get('pk')
            if model is None or pk is None or not isinstance(fields, dict):
                continue
            items_by_model[model].append(item)

        for model, items in items_by_model.items():
            local_objects = model.objects.in_bulk([item.get('pk') for item in items])
            if not local_objects:
                continue
            serialized = {
                str(row['pk']): (row.get('fields') or {})
                for row in json.loads(serializers.serialize('json', list(local_objects.values())))
            }
            for item in items:
                local_fields = serialized.get(str(item.get('pk')))
                if not local_fields:
                    continue
                fields = item['fields']
                for field_name, value in local_fields.items():
                    if field_name not in fields:
                        fields[field_name] = value

    def _models_for_stale_cleanup(self):
        """先删引用方，再删被 PROTECT 的记录，避免图书正文资源删不掉。"""
        models = list(self._iter_target_models())
        model_set = set(models)
        blockers = {model: set() for model in models}

        for model in models:
            for field in model._meta.get_fields():
                if not getattr(field, 'many_to_one', False):
                    continue
                remote = getattr(field, 'remote_field', None)
                if remote is None or remote.on_delete is not PROTECT:
                    continue
                target = field.related_model
                if target in model_set:
                    blockers[target].add(model)

        remaining = set(models)
        preferred = list(reversed(models))
        ordered = []
        while remaining:
            ready = [
                model for model in preferred
                if model in remaining and not (blockers[model] & remaining)
            ]
            if not ready:
                ready = [model for model in preferred if model in remaining]
            chosen = ready[0]
            ordered.append(chosen)
            remaining.remove(chosen)
        return ordered

    @staticmethod
    def _get_media_relative_path(media_url):
        media_url_path = urlparse(settings.MEDIA_URL).path.rstrip('/') + '/'
        url_path = urlparse(media_url).path
        if not url_path.startswith(media_url_path):
            return ''

        media_root = os.path.realpath(settings.MEDIA_ROOT)
        local_path = os.path.realpath(os.path.join(media_root, url_path[len(media_url_path):]))
        if os.path.commonpath([media_root, local_path]) != media_root:
            return ''

        return os.path.relpath(local_path, media_root).replace(os.sep, '/')

    def _iter_valid_books(self):
        from anthology.models import Book
        return Book.objects.filter(is_valid=True).select_related('asset')

    def _book_body_rel_path(self, book):
        if not book.asset or not book.asset.file_path:
            return ''
        return self._normalize_rel_path(book.asset.file_path)

    def _book_body_asset_ids(self):
        return {book.asset_id for book in self._iter_valid_books() if book.asset_id}

    def _released_book_rel_paths(self):
        return [
            rel_path for book in self._iter_valid_books()
            if book.local_state == 'cloud_only' and (rel_path := self._book_body_rel_path(book))
        ]

    def _already_backed_up_book_rel_paths(self):
        paths = []
        for book in self._iter_valid_books():
            rel_path = self._book_body_rel_path(book)
            if not rel_path or not book.remote_available:
                continue
            if book.remote_hash != book.asset.file_hash:
                continue
            paths.append(rel_path)
        return paths

    def _collect_asset_relative_paths(self):
        from assets.models import Asset

        relative_paths = []
        missing_files = []
        released_asset_ids = {
            book.asset_id for book in self._iter_valid_books()
            if book.local_state == 'cloud_only' and book.asset_id
        }
        for asset in Asset.objects.filter(is_valid=True):
            if not asset.file_path:
                continue

            rel_path = self._normalize_rel_path(asset.file_path)
            local_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            if not os.path.isfile(local_path):
                # A cloud-only book has an explicit remote hash and is intentionally absent locally.
                if asset.id in released_asset_ids:
                    continue
                missing_files.append(rel_path)
                continue

            relative_paths.append(rel_path)

        return sorted(set(relative_paths)), missing_files

    def _collect_user_avatar_relative_paths(self):
        """收集保存在 MEDIA_ROOT 下的用户头像。"""
        from user.models import UserProfile

        relative_paths = []
        missing_files = []
        for avatar_url in UserProfile.objects.exclude(avatar='').values_list('avatar', flat=True):
            rel_path = self._get_media_relative_path(avatar_url)
            if not rel_path:
                continue

            local_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            if not os.path.isfile(local_path):
                missing_files.append(rel_path)
                continue

            relative_paths.append(rel_path)

        return sorted(set(relative_paths)), missing_files

    def _collect_media_relative_paths(self):
        asset_paths, asset_missing = self._collect_asset_relative_paths()
        avatar_paths, avatar_missing = self._collect_user_avatar_relative_paths()
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
        for book in self._iter_valid_books():
            body_path = self._book_body_rel_path(book)
            if body_path and not os.path.isfile(os.path.join(settings.MEDIA_ROOT, body_path)):
                if book.local_state != 'cloud_only':
                    missing_body_ids.append(book.book_id)
            if book.cover_asset_id:
                cover_path = self._normalize_rel_path(book.cover_asset.file_path)
                if cover_path and not os.path.isfile(os.path.join(settings.MEDIA_ROOT, cover_path)):
                    missing_cover_ids.append(book.cover_asset_id)
                    book.cover_asset = None
                    book.save(update_fields=['cover_asset', 'updated_at'])

        if missing_body_ids:
            Book.objects.filter(book_id__in=missing_body_ids).update(local_state='cloud_only')

        # 封面 Asset 只服务书架时可以安全失效，避免其残留资源记录继续阻断同步。
        if missing_cover_ids:
            body_asset_ids = set(Book.objects.filter(is_valid=True).values_list('asset_id', flat=True))
            for asset in Asset.objects.filter(id__in=set(missing_cover_ids) - body_asset_ids):
                metadata = asset.metadata if isinstance(asset.metadata, dict) else {}
                if metadata.get('book_cover') and not asset.linked_article_id:
                    asset.is_valid = False
                    asset.save(update_fields=['is_valid'])

        if not drop_missing_assets:
            return {'bodies': len(missing_body_ids), 'covers': len(set(missing_cover_ids)), 'assets': 0, 'avatars': 0}

        # 图书正文已有 cloud_only 语义，绝不能将其 Asset 软删除；其余缺失 Asset
        # 代表本机已不存在的附件/图片，保留有效记录只会让每次快照再次失败。
        book_body_asset_ids = self._book_body_asset_ids()
        missing_asset_ids = []
        for asset in Asset.objects.filter(is_valid=True).exclude(id__in=book_body_asset_ids):
            rel_path = self._normalize_rel_path(asset.file_path)
            if rel_path and not os.path.isfile(os.path.join(settings.MEDIA_ROOT, rel_path)):
                missing_asset_ids.append(asset.id)
        if missing_asset_ids:
            Asset.objects.filter(id__in=missing_asset_ids).update(is_valid=False)

        # 头像没有独立 Asset，文件丢失时直接回退为默认头像。
        from user.models import UserProfile
        missing_avatar_urls = []
        for avatar_url in UserProfile.objects.exclude(avatar='').values_list('avatar', flat=True):
            rel_path = self._get_media_relative_path(avatar_url)
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

    def validate_upload_state(self):
        _, missing_files = self._collect_media_relative_paths()
        if not missing_files:
            return []

        preview = '，'.join(missing_files[:3])
        if len(missing_files) > 3:
            preview += f' 等 {len(missing_files)} 个文件'

        return [f"检测到资源记录存在但本地文件缺失：{preview}"]

    def _list_local_files(self, local_root):
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
                file_list.append(self._normalize_rel_path(rel_path))
        return sorted(file_list)

    def _list_remote_files(self, remote_root):
        root_dir = remote_root.rstrip('/')
        remote_files = set()
        stack = [root_dir]

        while stack:
            current_dir = stack.pop()
            entries = self.client.list_directory(current_dir)
            if entries is None:
                if current_dir == root_dir:
                    return None
                raise SyncError(f"无法列出远程目录：{current_dir}")

            for entry in entries:
                remote_path = self._join_remote_path(current_dir, entry)
                if self.client.is_directory(remote_path):
                    stack.append(remote_path)
                else:
                    remote_files.add(remote_path)

        return remote_files

    def _remove_local_extra_files(self, local_root, expected_rel_paths):
        deleted_count = 0
        expected_rel_paths = set(expected_rel_paths)
        for rel_path in self._list_local_files(local_root):
            if rel_path in expected_rel_paths:
                continue

            local_path = os.path.join(local_root, rel_path)
            try:
                os.remove(local_path)
                deleted_count += 1
            except FileNotFoundError:
                continue

        return deleted_count

    def _sync_tree_upload_stream(self, *, local_root, remote_root, relative_paths, label, preserve_remote_rel_paths=(), should_abort=None):
        local_root = str(local_root)
        self.client.ensure_directory(remote_root)

        total_files = len(relative_paths)
        yield json.dumps({
            "step": "scan",
            "total": total_files,
            "msg": f"{label}：扫描到 {total_files} 个文件"
        }) + "\n"

        remote_existing_files = self._list_remote_files(remote_root) or set()
        expected_remote_files = {
            self._join_remote_path(remote_root, rel_path)
            for rel_path in preserve_remote_rel_paths
        }

        for index, rel_path in enumerate(relative_paths, start=1):
            self._ensure_not_aborted(should_abort)
            local_path = os.path.join(local_root, rel_path)
            if not os.path.isfile(local_path):
                raise SyncError(f"{label}：本地文件缺失，无法同步 {rel_path}")

            remote_path = self._join_remote_path(remote_root, rel_path)
            expected_remote_files.add(remote_path)

            remote_dir = os.path.dirname(remote_path)
            self.client.ensure_directory(remote_dir)
            if not self.client.upload_file(local_path, remote_path):
                raise SyncError(f"{label}：上传失败 {rel_path}")

            progress = 100 if total_files == 0 else int(index * 100 / total_files)
            if index == 1 or index == total_files or index % 5 == 0:
                yield json.dumps({
                    "step": "uploading",
                    "file": rel_path,
                    "progress": progress,
                    "msg": f"{label}：上传 {rel_path}"
                }) + "\n"

        stale_remote_files = sorted(remote_existing_files - expected_remote_files)
        for stale_path in stale_remote_files:
            if not self.client.delete_path(stale_path):
                raise SyncError(f"{label}：删除远程冗余文件失败 {stale_path}")
            yield json.dumps({
                "step": "cleanup",
                "msg": f"{label}：删除远程冗余文件 {stale_path}"
            }) + "\n"

        yield json.dumps({
            "step": "summary",
            "msg": f"✅ {label}同步完成（上传 {total_files} 个文件，清理 {len(stale_remote_files)} 个冗余文件）"
        }) + "\n"

    def sync_data_upload_stream(self, should_abort=None):
        """
        上传数据库快照。
        """
        self._ensure_not_aborted(should_abort)
        self.client.ensure_directory(self.base_path)
        yield json.dumps({"step": "init", "msg": "正在初始化数据库导出..."}) + "\n"

        all_data = []
        total_count = 0

        try:
            for model in self._iter_target_models():
                model_name = model.__name__
                queryset = self._queryset_for_export(model)
                count = queryset.count()
                if count > 0:
                    yield json.dumps({
                        "step": "processing",
                        "msg": f"正在导出 {model_name} ({count}条)..."
                    }) + "\n"

                    json_str = serializers.serialize('json', queryset)
                    data_list = json.loads(json_str)
                    all_data.extend(data_list)
                    total_count += count
        except Exception as e:
            raise SyncError(f"导出数据库快照失败: {str(e)}")

        yield json.dumps({"step": "processing", "msg": f"正在打包上传 {total_count} 条数据..."}) + "\n"

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(mode='w+', encoding='utf-8', delete=False, suffix='.json') as tmp:
                json.dump(all_data, tmp, ensure_ascii=False)
                tmp_path = tmp.name

            if not self.client.upload_file(tmp_path, self.data_file):
                raise SyncError("数据库快照上传失败")

            yield json.dumps({"step": "data_done", "msg": "✅ 数据库备份完成！"}) + "\n"

        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)

    def sync_assets_upload_stream(self, should_abort=None):
        """按资产记录同步媒体资源，避免数据库与文件集脱节。"""
        relative_paths, missing_files = self._collect_media_relative_paths()
        if missing_files:
            preview = '，'.join(missing_files[:3])
            if len(missing_files) > 3:
                preview += f' 等 {len(missing_files)} 个文件'
            raise SyncError(f"资源同步前校验失败：以下文件缺失 {preview}")

        from anthology.models import Book
        already_backed_up = set(self._already_backed_up_book_rel_paths())
        released_paths = set(self._released_book_rel_paths())
        upload_paths = [rel_path for rel_path in relative_paths if rel_path not in already_backed_up]
        skipped = len(relative_paths) - len(upload_paths)
        if skipped:
            yield json.dumps({
                "step": "scan",
                "msg": f"媒体文件：跳过 {skipped} 个已备份的图书正文"
            }) + "\n"

        yield from self._sync_tree_upload_stream(
            local_root=settings.MEDIA_ROOT,
            remote_root=self.media_dir,
            relative_paths=upload_paths,
            label='媒体文件',
            preserve_remote_rel_paths=already_backed_up | released_paths,
            should_abort=should_abort,
        )
        # File upload has completed successfully. Persist a hash-bound remote availability marker
        # before the database snapshot is written by the caller.
        local_books = Book.objects.filter(is_valid=True, local_state='local').select_related('asset')
        for book in local_books:
            path = os.path.join(settings.MEDIA_ROOT, book.asset.file_path)
            if os.path.isfile(path):
                Book.objects.filter(book_id=book.book_id).update(remote_available=True, remote_hash=book.asset.file_hash)

    def apply_snapshot_data(self, data_list, remote_meta=None, *, full_overwrite=False, should_abort=None):
        """把快照写回数据库。full_overwrite 用于本地压缩包导入，按备份全量覆盖。"""
        data_list = self._drop_local_only_settings(data_list)
        self._reuse_local_builtin_skill_ids(data_list)
        group_id_mapping = self._reuse_local_group_ids(data_list)
        user_id_mapping = self._reuse_local_user_ids(data_list, group_id_mapping)
        self._reuse_local_user_profile_ids(data_list, user_id_mapping)
        remote_pk_map = defaultdict(set)
        model_map = {}
        for model in self._iter_target_models():
            model_label = f"{model._meta.app_label}.{model._meta.model_name}"
            model_map[model_label] = model

        if not full_overwrite:
            self._fill_missing_snapshot_fields_from_local(data_list, model_map)

        for item in data_list:
            model_label = item.get('model')
            pk = item.get('pk')
            if model_label in model_map:
                remote_pk_map[model_label].add(str(pk))

        skip_extra_delete = (not full_overwrite) and self.is_remote_version_older((remote_meta or {}).get('app_version'))

        with transaction.atomic():
            self._ensure_not_aborted(should_abort)
            for obj in serializers.deserialize('json', json.dumps(data_list)):
                obj.save()

            self._ensure_not_aborted(should_abort)
            if not skip_extra_delete:
                for model in self._models_for_stale_cleanup():
                    model_label = f"{model._meta.app_label}.{model._meta.model_name}"
                    # 兼容旧快照：此前未导出 auth.User，不能在恢复时删除当前登录账号。
                    if model in (Group, get_user_model()) and model_label not in remote_pk_map:
                        continue
                    remote_pks = set(remote_pk_map.get(model_label, set()))
                    if model._meta.label_lower == 'system_settings.systemsetting':
                        remote_pks.update(self.LOCAL_ONLY_SYSTEM_SETTING_KEYS)
                    local_objects = model.objects.all()

                    stale_pks = [
                        str(pk) for pk in local_objects.values_list(model._meta.pk.attname, flat=True)
                        if str(pk) not in remote_pks
                    ]
                    if stale_pks:
                        local_objects.filter(**{f"{model._meta.pk.attname}__in": stale_pks}).delete()

        return len(data_list)

    def sync_data_download(self, remote_meta=None, should_abort=None):
        """下载并恢复数据库快照，同时清理本地多余记录。"""
        self._ensure_not_aborted(should_abort)
        content = self.client.get_file_content(self.data_file)
        if not content:
            raise SyncError("云端未找到数据快照 data_index.json")
        return self.apply_snapshot_data(
            json.loads(content),
            remote_meta=remote_meta,
            should_abort=should_abort,
        )

    @staticmethod
    def _reuse_local_builtin_skill_ids(data_list):
        """将快照内置 Skill 映射到本地已有记录，避免启动初始化产生同名冲突。"""
        from system_settings.models import Skill

        skill_id_mapping = {}
        for item in data_list:
            if item.get('model') != 'system_settings.skill':
                continue

            fields = item.get('fields') or {}
            skill_key = fields.get('skill_key') or ''
            is_builtin = (
                fields.get('is_system')
                or fields.get('source') == 'built_in'
                or bool(skill_key)
            )
            if not is_builtin:
                continue

            existing = None
            if skill_key:
                existing = Skill.objects.filter(skill_key=skill_key).first()
            if not existing and fields.get('name'):
                # 兼容早期内置 Skill 尚未写入 skill_key 的数据。
                existing = Skill.objects.filter(name=fields['name']).first()

            remote_id = str(item.get('pk'))
            if existing and str(existing.pk) != remote_id:
                skill_id_mapping[remote_id] = str(existing.pk)
                item['pk'] = str(existing.pk)

        if not skill_id_mapping:
            return

        for item in data_list:
            if item.get('model') != 'system_settings.agent':
                continue

            fields = item.get('fields') or {}
            skills = fields.get('skills')
            if isinstance(skills, list):
                fields['skills'] = [skill_id_mapping.get(str(skill_id), skill_id) for skill_id in skills]

    @staticmethod
    def _reuse_local_group_ids(data_list):
        """按组名复用本地用户组，并返回远端到本地的主键映射。"""
        group_label = Group._meta.label_lower
        used_ids = set(Group.objects.values_list('pk', flat=True))
        next_id = max(used_ids, default=0) + 1
        group_id_mapping = {}

        for item in data_list:
            if item.get('model') != group_label:
                continue

            fields = item.get('fields') or {}
            group_name = fields.get('name')
            remote_id = item.get('pk')
            if remote_id is None or not group_name:
                continue

            local_group = Group.objects.filter(name=group_name).first()
            if local_group:
                local_id = local_group.pk
            elif remote_id in used_ids:
                local_id = next_id
                next_id += 1
            else:
                local_id = remote_id

            group_id_mapping[str(remote_id)] = local_id
            item['pk'] = local_id
            used_ids.add(local_id)

        return group_id_mapping

    @staticmethod
    def _reuse_local_user_ids(data_list, group_id_mapping):
        """按用户名复用本地用户，并保留当前初始化管理员的密码。"""
        User = get_user_model()
        user_label = User._meta.label_lower
        used_ids = set(User.objects.values_list('pk', flat=True))
        next_id = max(used_ids, default=0) + 1
        user_id_mapping = {}

        for item in data_list:
            if item.get('model') != user_label:
                continue

            fields = item.get('fields') or {}
            username = fields.get('username')
            remote_id = item.get('pk')
            if remote_id is None or not username:
                continue

            local_user = User.objects.filter(username=username).first()
            if local_user:
                local_id = local_user.pk
                if local_user.is_superuser:
                    fields['password'] = local_user.password
            elif remote_id in used_ids:
                local_id = next_id
                next_id += 1
            else:
                local_id = remote_id

            user_id_mapping[str(remote_id)] = local_id
            item['pk'] = local_id
            used_ids.add(local_id)

            groups = fields.get('groups')
            if isinstance(groups, list):
                fields['groups'] = [group_id_mapping.get(str(group_id), group_id) for group_id in groups]

        return user_id_mapping

    @staticmethod
    def _reuse_local_user_profile_ids(data_list, user_id_mapping):
        """按业务用户 ID 复用本地 Profile，避免跨环境使用自增用户 ID。"""
        from user.models import UserProfile

        for item in data_list:
            if item.get('model') != 'user.userprofile':
                continue

            fields = item.get('fields') or {}
            userid = fields.get('userid') or ''
            if not userid:
                continue

            local_profile = UserProfile.objects.filter(userid=userid).first()
            if local_profile:
                # UserProfile 对 auth.User 是一对一关系，主键和外键都必须复用本地记录。
                item['pk'] = local_profile.pk
                fields['user'] = local_profile.user_id
                continue

            remote_user_id = str(fields.get('user'))
            if remote_user_id in user_id_mapping:
                fields['user'] = user_id_mapping[remote_user_id]

    def sync_assets_download(self, should_abort=None):
        """根据数据库快照修复本地媒体资源，并清理多余文件。"""
        from assets.models import Asset
        from user.models import UserProfile

        count = 0
        local_media_root = str(settings.MEDIA_ROOT)
        expected_rel_paths = set()

        from anthology.models import Book
        book_body_asset_ids = self._book_body_asset_ids()
        assets = Asset.objects.filter(is_valid=True)
        for asset in assets:
            self._ensure_not_aborted(should_abort)
            if not asset.file_path:
                continue

            rel_path = self._normalize_rel_path(asset.file_path)
            local_path = os.path.join(local_media_root, rel_path)

            # Book bodies are restored from the bookshelf, not by backup sync.
            if asset.id in book_body_asset_ids:
                if os.path.isfile(local_path):
                    expected_rel_paths.add(rel_path)
                else:
                    Book.objects.filter(
                        asset_id=asset.id, is_valid=True
                    ).exclude(local_state='cloud_only').update(local_state='cloud_only')
                continue

            expected_rel_paths.add(rel_path)

            remote_path = self._join_remote_path(self.media_dir, rel_path)

            need_download = not os.path.exists(local_path)
            if not need_download and asset.file_hash:
                try:
                    need_download = self._hash_file(local_path) != asset.file_hash
                except Exception:
                    need_download = True

            if not need_download:
                continue

            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            if not self.client.download_file(remote_path, local_path):
                raise SyncError(f"资源文件下载失败：{rel_path}")
            count += 1

        for avatar_url in UserProfile.objects.exclude(avatar='').values_list('avatar', flat=True):
            rel_path = self._get_media_relative_path(avatar_url)
            if not rel_path:
                continue
            expected_rel_paths.add(rel_path)

            local_path = os.path.join(local_media_root, rel_path)
            if os.path.exists(local_path):
                continue

            remote_path = self._join_remote_path(self.media_dir, rel_path)
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            if not self.client.download_file(remote_path, local_path):
                raise SyncError(f"用户头像下载失败：{rel_path}")
            count += 1

        self._remove_local_extra_files(local_media_root, expected_rel_paths)

        return count

    def get_remote_snapshot_meta(self):
        content = self.client.get_file_content(self.meta_file)
        if not content:
            return None

        try:
            return json.loads(content)
        except json.JSONDecodeError as exc:
            raise SyncError(f"远端快照元数据损坏：{exc}")

    def build_snapshot_meta(self, source='manual', runner_id=''):
        return {
            'snapshot_id': uuid.uuid4().hex,
            'generated_at': datetime.utcnow().isoformat() + 'Z',
            'source': source,
            'runner_id': runner_id,
            'app_version': self.get_current_app_version(),
            'data_file': 'data_index.json',
        }

    def validate_import_snapshot_version(self, remote_meta):
        if not remote_meta or not remote_meta.get('app_version'):
            raise SyncError('备份缺少版本信息，无法导入。')
        remote_version = remote_meta['app_version']
        current_version = self.get_current_app_version()
        if self.is_remote_version_newer(remote_version, current_version):
            raise SyncError(
                f"该备份由更新的系统 v{remote_version} 生成，当前系统为 v{current_version}。"
                "请先升级本机后再导入。"
            )

    def build_snapshot_data(self):
        all_data = []
        for model in self._iter_target_models():
            queryset = self._queryset_for_export(model)
            if queryset.exists():
                all_data.extend(json.loads(serializers.serialize('json', queryset)))
        return all_data

    @staticmethod
    def _safe_extract_zip(archive, dest_dir):
        dest_dir = os.path.realpath(dest_dir)
        for info in archive.infolist():
            target = os.path.realpath(os.path.join(dest_dir, info.filename))
            if target != dest_dir and not target.startswith(dest_dir + os.sep):
                raise SyncError('压缩包包含非法路径，已拒绝导入')
        archive.extractall(dest_dir)

    def _book_body_rel_path_set(self):
        return {
            rel_path for book in self._iter_valid_books()
            if (rel_path := self._book_body_rel_path(book))
        }

    def write_local_backup_zip(self, zip_path, source='local-export', runner_id=''):
        data_list = self.build_snapshot_data()
        meta = self.build_snapshot_meta(source=source, runner_id=runner_id)
        media_paths, _missing = self._collect_media_relative_paths()
        book_bodies = self._book_body_rel_path_set()
        with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
            archive.writestr('data_index.json', json.dumps(data_list, ensure_ascii=False))
            archive.writestr('snapshot_meta.json', json.dumps(meta, ensure_ascii=False))
            for rel_path in media_paths:
                if rel_path in book_bodies:
                    continue
                local_path = os.path.join(str(settings.MEDIA_ROOT), rel_path)
                if os.path.isfile(local_path):
                    archive.write(local_path, arcname=f'media/{rel_path}')
        return meta

    def restore_media_from_directory(self, backup_media_root):
        copied = set()
        if os.path.isdir(backup_media_root):
            for rel_path in self._list_local_files(backup_media_root):
                source_path = os.path.join(backup_media_root, rel_path)
                dest_path = os.path.join(str(settings.MEDIA_ROOT), rel_path)
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                shutil.copy2(source_path, dest_path)
                copied.add(rel_path)

        expected_rel_paths, _missing = self._collect_media_relative_paths()
        keep_book_bodies = {
            rel_path for rel_path in self._book_body_rel_path_set()
            if os.path.isfile(os.path.join(str(settings.MEDIA_ROOT), rel_path))
        }
        self._remove_local_extra_files(
            str(settings.MEDIA_ROOT),
            set(expected_rel_paths) | copied | keep_book_bodies,
        )

        from anthology.models import Book
        for book in self._iter_valid_books():
            rel_path = self._book_body_rel_path(book)
            if not rel_path:
                continue
            local_path = os.path.join(str(settings.MEDIA_ROOT), rel_path)
            if not os.path.isfile(local_path) and book.local_state != 'cloud_only':
                Book.objects.filter(book_id=book.book_id).update(local_state='cloud_only')
        return len(copied)

    def import_local_backup_zip(self, zip_path, should_abort=None):
        extract_dir = tempfile.mkdtemp(prefix='odoc-backup-')
        try:
            self._ensure_not_aborted(should_abort)
            with zipfile.ZipFile(zip_path) as archive:
                self._safe_extract_zip(archive, extract_dir)

            meta_path = os.path.join(extract_dir, 'snapshot_meta.json')
            data_path = os.path.join(extract_dir, 'data_index.json')
            if not os.path.isfile(meta_path) or not os.path.isfile(data_path):
                raise SyncError('压缩包不是有效的小橘文档备份')

            with open(meta_path, 'r', encoding='utf-8') as file_obj:
                meta = json.load(file_obj)
            self.validate_import_snapshot_version(meta)
            with open(data_path, 'r', encoding='utf-8') as file_obj:
                data_list = json.load(file_obj)
            if not isinstance(data_list, list):
                raise SyncError('备份数据格式无效')

            count = self.apply_snapshot_data(
                data_list,
                remote_meta=meta,
                full_overwrite=True,
                should_abort=should_abort,
            )
            self.restore_media_from_directory(os.path.join(extract_dir, 'media'))
            return count, meta
        finally:
            shutil.rmtree(extract_dir, ignore_errors=True)

    # ----- v2 immutable snapshots and three-way merge -----
    @staticmethod
    def _revision_key(model_label, identity):
        return f'{model_label}:{identity}'

    @staticmethod
    def _item_identity(item):
        """跨设备主键可能不同的内置模型使用业务稳定键。"""
        return sync_entity_identity(item.get('model'), item['pk'], item.get('fields') or {})

    @staticmethod
    def _item_map(data_list):
        return {
            SyncManager._revision_key(item['model'], SyncManager._item_identity(item)): item
            for item in data_list
            if item.get('model') and item.get('pk') is not None
        }

    def _write_remote_json(self, payload, remote_path):
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(mode='w+', encoding='utf-8', delete=False, suffix='.json') as tmp:
                json.dump(payload, tmp, ensure_ascii=False, sort_keys=True)
                tmp_path = tmp.name
            if not self.client.upload_file(tmp_path, remote_path):
                raise SyncError(f'写入远端快照失败：{remote_path}')
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)

    @staticmethod
    def _json_payload_size(payload):
        return len(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode('utf-8'))

    def _read_remote_json(self, remote_path, required=False):
        content = self.client.get_file_content(remote_path)
        if not content:
            if required:
                raise SyncError(f'远端快照缺少文件：{remote_path}')
            return None
        try:
            return json.loads(content)
        except json.JSONDecodeError as exc:
            raise SyncError(f'远端快照 JSON 损坏：{remote_path}：{exc}')

    def _snapshot_path(self, snapshot_id, filename):
        return f'{self.v2_snapshots_dir}/{snapshot_id}/{filename}'

    def get_v2_current(self):
        pointer = self._read_remote_json(self.v2_current_file)
        if not pointer or pointer.get('format') != self.SNAPSHOT_FORMAT:
            return None
        snapshot_id = pointer.get('snapshot_id')
        if not snapshot_id:
            return None
        return self.get_v2_snapshot(snapshot_id)

    def _get_legacy_snapshot(self):
        """将 v1 根目录快照作为首次 v2 合并的只读远端输入，不把缺失记录视为删除。"""
        data = self._read_remote_json(self.data_file)
        if not isinstance(data, list):
            return None
        meta = self.get_remote_snapshot_meta() or {}
        self.validate_remote_snapshot_version(meta)
        generated_at = meta.get('generated_at') or timezone.now().isoformat()
        revisions, media = {}, {}
        for key, item in self._item_map(data).items():
            revisions[key] = {
                'hash': canonical_hash(item.get('fields') or {}), 'revision_at': generated_at,
                'origin_device': 'legacy-v1', 'deleted': False,
            }
            if item.get('model') == 'assets.asset':
                fields = item.get('fields') or {}
                rel_path = self._normalize_rel_path(fields.get('file_path') or '')
                if rel_path:
                    media[rel_path] = {'hash': fields.get('file_hash') or '', 'legacy_path': True, 'size': fields.get('file_size') or 0}
            elif item.get('model') == 'user.userprofile':
                rel_path = self._get_media_relative_path((item.get('fields') or {}).get('avatar') or '')
                if rel_path:
                    media[rel_path] = {'hash': '', 'legacy_path': True, 'size': 0}
        return {'meta': {**meta, 'snapshot_id': '', 'format': 1}, 'data': data, 'revisions': revisions, 'media': media, 'legacy': True}

    def get_v2_snapshot(self, snapshot_id):
        meta = self._read_remote_json(self._snapshot_path(snapshot_id, 'snapshot_meta.json'), required=True)
        if meta.get('format') != self.SNAPSHOT_FORMAT:
            raise SyncError('远端快照格式不受支持，请升级客户端')
        self.validate_remote_snapshot_version(meta)
        return {
            'meta': meta,
            'data': self._read_remote_json(self._snapshot_path(snapshot_id, 'data_index.json'), required=True),
            'revisions': self._read_remote_json(self._snapshot_path(snapshot_id, 'revisions.json'), required=True),
            'media': self._read_remote_json(self._snapshot_path(snapshot_id, 'media_manifest.json'), required=True),
        }

    def list_v2_history(self):
        entries = self.client.list_directory(self.v2_snapshots_dir) or []
        history = []
        for snapshot_id in entries:
            try:
                meta = self._read_remote_json(self._snapshot_path(snapshot_id, 'snapshot_meta.json'))
            except SyncError:
                continue
            if meta and meta.get('format') == self.SNAPSHOT_FORMAT:
                history.append(meta)
        return sorted(history, key=lambda item: item.get('generated_at', ''), reverse=True)

    def _build_revision_manifest(self, data_list):
        from system_settings.models import SyncEntityState
        device_id = get_device_id()
        states = {
            self._revision_key(state.model_label, state.object_pk): state
            for state in SyncEntityState.objects.all()
        }
        revisions = {}
        for key, item in self._item_map(data_list).items():
            state = states.get(key)
            item_hash = canonical_hash(item.get('fields') or {})
            if state is None:
                model_label, pk = key.rsplit(':', 1)
                state = SyncEntityState.objects.create(
                    model_label=model_label, object_pk=pk, content_hash=item_hash,
                    # 首次升级时尽量沿用业务记录的更新时间，避免所有旧记录在
                    # 第一次 v2 同步中同时变成“最新修改”。
                    revision_at=self._item_revision_at(item), origin_device=device_id, is_deleted=False,
                )
            elif state.content_hash != item_hash or state.is_deleted:
                state.content_hash = item_hash
                state.is_deleted = False
                state.revision_at = timezone.now()
                state.origin_device = device_id
                state.save(update_fields=['content_hash', 'is_deleted', 'revision_at', 'origin_device', 'updated_at'])
            revisions[key] = {
                'hash': item_hash,
                'revision_at': state.revision_at.isoformat(),
                'origin_device': state.origin_device or device_id,
                'deleted': False,
            }
        for key, state in states.items():
            if state.is_deleted:
                revisions[key] = {
                    'hash': state.content_hash,
                    'revision_at': state.revision_at.isoformat(),
                    'origin_device': state.origin_device or device_id,
                    'deleted': True,
                }
        return revisions

    @staticmethod
    def _item_revision_at(item):
        fields = item.get('fields') or {}
        for field_name in ('updated_at', 'updated_time', 'modified_at', 'modified_time', 'created_at', 'created_time'):
            value = fields.get(field_name)
            if not value:
                continue
            parsed = parse_datetime(str(value))
            if parsed is not None:
                if timezone.is_naive(parsed):
                    parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
                return parsed
        return timezone.now()

    @staticmethod
    def _revision_changed(base, candidate):
        return (base or {}).get('hash') != (candidate or {}).get('hash') or bool((base or {}).get('deleted')) != bool((candidate or {}).get('deleted'))

    @staticmethod
    def _revision_winner(local_revision, remote_revision):
        """删除与编辑冲突保留编辑；其余冲突按时间、设备 ID 稳定决策。"""
        if bool(local_revision.get('deleted')) != bool(remote_revision.get('deleted')):
            return remote_revision if local_revision.get('deleted') else local_revision
        local_at = local_revision.get('revision_at', '')
        remote_at = remote_revision.get('revision_at', '')
        if remote_at > local_at:
            return remote_revision
        if remote_at < local_at:
            return local_revision
        return remote_revision if remote_revision.get('origin_device', '') > local_revision.get('origin_device', '') else local_revision

    def merge_v2_data(self, base, local_data, local_revisions, remote):
        """返回不丢失双方独有记录的合并结果及新修订清单。"""
        base_data = self._item_map((base or {}).get('data') or [])
        base_revisions = (base or {}).get('revisions') or {}
        local_map = self._item_map(local_data)
        remote_map = self._item_map(remote.get('data') or [])
        remote_revisions = remote.get('revisions') or {}
        result, result_revisions = [], {}
        summary = {'created': 0, 'updated': 0, 'deleted': 0, 'conflicts': 0}

        keys = set(base_revisions) | set(local_revisions) | set(remote_revisions) | set(local_map) | set(remote_map)
        for key in sorted(keys):
            base_rev = base_revisions.get(key, {'deleted': True, 'hash': ''})
            local_rev = local_revisions.get(key, {'deleted': True, 'hash': ''})
            remote_rev = remote_revisions.get(key, {'deleted': True, 'hash': ''})
            local_changed = self._revision_changed(base_rev, local_rev)
            remote_changed = self._revision_changed(base_rev, remote_rev)
            if local_changed and remote_changed and local_rev != remote_rev:
                winner = self._revision_winner(local_rev, remote_rev)
                summary['conflicts'] += 1
            elif remote_changed:
                winner = remote_rev
            else:
                winner = local_rev
            result_revisions[key] = winner
            if winner.get('deleted'):
                summary['deleted'] += 1
                continue
            item = remote_map.get(key) if winner is remote_rev else local_map.get(key)
            if item is None:
                # A legacy/v1 manifest has no per-row state; absence is never treated as deletion.
                item = local_map.get(key) or remote_map.get(key)
            if item is not None:
                result.append(item)
                if key not in base_data:
                    summary['created'] += 1
                elif local_changed or remote_changed:
                    summary['updated'] += 1
        return result, result_revisions, summary

    def _build_v2_media_manifest(self, previous_media=None):
        previous_media = previous_media or {}
        media = {}
        paths, missing = self._collect_media_relative_paths()
        if missing:
            raise SyncError('无法创建安全快照，本地存在缺失资源：' + '，'.join(missing[:3]))
        for rel_path in paths:
            local_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            if not os.path.isfile(local_path):
                continue
            digest = self._hash_file(local_path)
            media[rel_path] = {'hash': digest, 'size': os.path.getsize(local_path)}
        # 只有明确释放的 cloud_only 图书正文保留上一个 v2 快照的 blob 引用；
        # 其他资源缺失时不能静默延续旧引用。
        released_book_paths = set(self._released_book_rel_paths())
        for rel_path, entry in previous_media.items():
            if rel_path in released_book_paths and rel_path not in media and entry.get('hash'):
                media[rel_path] = entry
        return media

    @staticmethod
    def _format_size(size):
        size = int(size or 0)
        for unit in ('B', 'KB', 'MB', 'GB'):
            if size < 1024 or unit == 'GB':
                return f'{size:.1f} {unit}' if unit != 'B' else f'{size} B'
            size /= 1024

    def _upload_v2_blobs(self, media_manifest, report=None):
        uploaded = 0
        uploaded_bytes = 0
        total = len(media_manifest)
        for index, (rel_path, entry) in enumerate(media_manifest.items(), start=1):
            digest = entry.get('hash')
            local_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            if not digest or not os.path.isfile(local_path):
                continue
            blob_path = f'{self.v2_blobs_dir}/{digest}'
            if self.client.exists(blob_path):
                continue
            self.client.ensure_directory(self.v2_blobs_dir)
            if not self.client.upload_file(local_path, blob_path):
                raise SyncError(f'上传媒体 blob 失败：{rel_path}')
            uploaded += 1
            uploaded_bytes += int(entry.get('size', 0) or 0)
            if callable(report):
                progress = 80 + int(index / max(total, 1) * 12)
                report(f'媒体上传 {index}/{total}：{rel_path}（{self._format_size(entry.get("size", 0))}）', progress)
        return uploaded, uploaded_bytes

    def publish_v2_snapshot(self, *, source, runner_id='', base_snapshot_id='', previous_media=None, data_list=None, revisions=None, report=None):
        if self.client is None:
            raise SyncError('v2 远端快照需要已配置备份服务')
        snapshot_id = uuid.uuid4().hex
        data_list = data_list if data_list is not None else self.build_snapshot_data()
        revisions = revisions if revisions is not None else self._build_revision_manifest(data_list)
        media = self._build_v2_media_manifest(previous_media)
        if callable(report):
            report(
                f'快照统计：{len(data_list)} 条数据、{len(revisions)} 条修订、{len(media)} 个媒体文件（{self._format_size(sum(item.get("size", 0) for item in media.values()))}）',
                78,
            )
        uploaded, uploaded_bytes = self._upload_v2_blobs(media, report=report)
        if callable(report):
            report(f'媒体上传完成：新增 {uploaded} 个（{self._format_size(uploaded_bytes)}），其余复用远端 blob。', 92)
        snapshot_dir = f'{self.v2_snapshots_dir}/{snapshot_id}'
        self.client.ensure_directory(snapshot_dir)
        meta = {
            **self.build_snapshot_meta(source=source, runner_id=runner_id),
            'snapshot_id': snapshot_id,
            'format': self.SNAPSHOT_FORMAT,
            'base_snapshot_id': base_snapshot_id,
            'device_id': get_device_id(),
            'record_count': len(data_list),
            'media_count': len(media),
            'media_bytes': sum(item.get('size', 0) for item in media.values()),
        }
        # Logical size of a complete restore point. Media blobs are shared across
        # snapshots, so this is not the extra physical space consumed remotely.
        payload_bytes = sum(self._json_payload_size(payload) for payload in (data_list, revisions, media))
        snapshot_bytes = meta['media_bytes'] + payload_bytes
        while meta.get('snapshot_bytes') != snapshot_bytes:
            meta['snapshot_bytes'] = snapshot_bytes
            snapshot_bytes = meta['media_bytes'] + payload_bytes + self._json_payload_size(meta)
        if callable(report):
            report('正在写入数据、修订、媒体清单与快照元数据。', 94)
        self._write_remote_json(data_list, self._snapshot_path(snapshot_id, 'data_index.json'))
        self._write_remote_json(revisions, self._snapshot_path(snapshot_id, 'revisions.json'))
        self._write_remote_json(media, self._snapshot_path(snapshot_id, 'media_manifest.json'))
        self._write_remote_json(meta, self._snapshot_path(snapshot_id, 'snapshot_meta.json'))
        # This pointer is the only mutable v2 file and is written only after all snapshot files exist.
        self.client.ensure_directory(self.v2_dir)
        self._write_remote_json({'format': self.SNAPSHOT_FORMAT, 'snapshot_id': snapshot_id}, self.v2_current_file)
        # v1 客户端只会读取根目录元数据；用新版本标记让它在继续写旧格式前
        # 明确失败，而不是悄悄把 v1 根目录当成当前同步结果。
        self._write_remote_json({
            'format': self.SNAPSHOT_FORMAT,
            'v2_current': self.v2_current_file,
            'snapshot_id': snapshot_id,
            'generated_at': meta['generated_at'],
            'app_version': meta['app_version'],
        }, self.meta_file)
        self._trim_v2_history()
        if callable(report):
            report(f'快照发布完成：{snapshot_id[:12]}（逻辑大小 {self._format_size(snapshot_bytes)}）', 98)
        return {'meta': meta, 'data': data_list, 'revisions': revisions, 'media': media}

    def _trim_v2_history(self):
        history = self.list_v2_history()
        pointer = self._read_remote_json(self.v2_current_file) or {}
        current_id = pointer.get('snapshot_id')
        retained = history[:self.SNAPSHOT_RETENTION]
        retained_ids = {meta.get('snapshot_id') for meta in retained}
        if current_id and current_id not in retained_ids:
            current_meta = next((meta for meta in history if meta.get('snapshot_id') == current_id), None)
            if current_meta:
                retained = retained[:-1] + [current_meta]
                retained_ids = {meta.get('snapshot_id') for meta in retained}
        for meta in history:
            snapshot_id = meta.get('snapshot_id')
            if snapshot_id and snapshot_id not in retained_ids:
                self._delete_remote_tree(f'{self.v2_snapshots_dir}/{snapshot_id}')
        self._collect_unreferenced_v2_blobs()

    def _delete_remote_tree(self, remote_path):
        """协议客户端没有统一的递归删除能力时，安全地限定在指定快照目录内递归。"""
        if self.client.is_directory(remote_path):
            entries = self.client.list_directory(remote_path)
            if entries is not None:
                for name in entries:
                    self._delete_remote_tree(f"{remote_path.rstrip('/')}/{name}")
        return self.client.delete_path(remote_path)

    @contextmanager
    def _remote_sync_lock(self, runner_id='', recover_owned_lock=False):
        """用原子目录创建串行化多个设备对 current.json 的发布。"""
        if self.client is None:
            yield
            return
        lock_dir = f'{self.v2_dir}/.sync-lock'
        self.client.ensure_directory(self.v2_dir)
        create = getattr(self.client, 'try_create_directory', None)
        if not callable(create):
            raise SyncError('当前备份协议不支持安全同步锁，请升级客户端')
        acquired = create(lock_dir)
        if not acquired:
            lock_meta = self._read_remote_json(f'{lock_dir}/lock.json') or {}
            # 仅处理“本机明确终止、随后重启后遗留”的锁：调用方必须显式授权恢复，
            # 且远端 lock.json 的设备标识必须与本机一致，绝不清理其他设备的锁。
            if recover_owned_lock and lock_meta.get('device_id') == get_device_id():
                self._delete_remote_tree(lock_dir)
                acquired = create(lock_dir)
            started_at = parse_datetime(str(lock_meta.get('started_at') or ''))
            if started_at and timezone.is_naive(started_at):
                started_at = timezone.make_aware(started_at, timezone.get_current_timezone())
            now = timezone.now()
            if started_at and timezone.is_aware(started_at) and timezone.is_naive(now):
                now = timezone.make_aware(now, timezone.get_current_timezone())
            if started_at and (now - started_at).total_seconds() > self.REMOTE_LOCK_TTL_SECONDS:
                self._delete_remote_tree(lock_dir)
                acquired = create(lock_dir)
        if not acquired:
            raise SyncError('另一台设备正在同步，请稍后重试')
        try:
            self._write_remote_json({
                'runner_id': runner_id,
                'device_id': get_device_id(),
                'started_at': timezone.now().isoformat(),
            }, f'{lock_dir}/lock.json')
            yield
        finally:
            self._delete_remote_tree(lock_dir)

    def _collect_unreferenced_v2_blobs(self):
        """只回收已不被保留快照引用的 blob，历史恢复始终有完整媒体可用。"""
        referenced = set()
        for meta in self.list_v2_history():
            snapshot_id = meta.get('snapshot_id')
            if not snapshot_id:
                continue
            manifest = self._read_remote_json(self._snapshot_path(snapshot_id, 'media_manifest.json')) or {}
            referenced.update(
                entry.get('hash') for entry in manifest.values()
                if entry.get('hash') and not entry.get('legacy_path')
            )
        for digest in self.client.list_directory(self.v2_blobs_dir) or []:
            if digest not in referenced:
                self.client.delete_path(f'{self.v2_blobs_dir}/{digest}')

    def _restore_v2_media(self, media_manifest, *, skip_paths=None):
        skip_paths = set(skip_paths or ())
        for rel_path, entry in (media_manifest or {}).items():
            if rel_path in skip_paths:
                continue
            digest = entry.get('hash')
            local_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            if digest and os.path.isfile(local_path) and self._hash_file(local_path) == digest:
                continue
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            tmp_path = local_path + '.sync-v2-partial'
            remote_path = self._join_remote_path(self.media_dir, rel_path) if entry.get('legacy_path') else f'{self.v2_blobs_dir}/{digest}'
            if not self.client.download_file(remote_path, tmp_path):
                raise SyncError(f'下载 v2 媒体失败：{rel_path}')
            if digest and self._hash_file(tmp_path) != digest:
                os.remove(tmp_path)
                raise SyncError(f'下载的媒体校验失败：{rel_path}')
            os.replace(tmp_path, local_path)

    @staticmethod
    def _book_body_paths_from_snapshot(data_list):
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

    def restore_v2_media_file(self, rel_path, *, expected_hash=''):
        """按当前 v2 快照恢复一个媒体文件，供图书按需下载使用。"""
        remote = self.get_v2_current() or self._get_legacy_snapshot()
        entry = (remote or {}).get('media', {}).get(self._normalize_rel_path(rel_path))
        if not entry or not entry.get('hash'):
            raise SyncError('云端没有这本图书的可用副本，请选择本地文件补传')
        digest = entry['hash']
        if expected_hash and digest != expected_hash:
            raise SyncError('云端图书副本与当前书架记录不一致，请选择本地文件补传')

        local_path = os.path.join(settings.MEDIA_ROOT, self._normalize_rel_path(rel_path))
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        tmp_path = local_path + '.book-restore-partial'
        remote_path = self._join_remote_path(self.media_dir, rel_path) if entry.get('legacy_path') else f'{self.v2_blobs_dir}/{digest}'
        try:
            if not self.client.download_file(remote_path, tmp_path):
                raise SyncError('云端图书副本不存在或下载失败，请选择本地文件补传')
            if self._hash_file(tmp_path) != digest:
                raise SyncError('云端图书副本校验失败，请选择本地文件补传')
            os.replace(tmp_path, local_path)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def _apply_v2_revisions(self, revisions):
        from system_settings.models import SyncEntityState
        with suspend_tracking():
            for key, revision in revisions.items():
                model_label, object_pk = key.rsplit(':', 1)
                SyncEntityState.objects.update_or_create(
                    model_label=model_label, object_pk=object_pk,
                    defaults={
                        'content_hash': revision.get('hash', ''),
                        'revision_at': revision.get('revision_at') or timezone.now(),
                        'origin_device': revision.get('origin_device', ''),
                        'is_deleted': bool(revision.get('deleted')),
                    },
                )

    def create_local_safety_backup(self, reason):
        root = os.path.join(str(settings.MEDIA_ROOT), '.sync-v2-safety')
        os.makedirs(root, exist_ok=True)
        path = os.path.join(root, f'{datetime.utcnow().strftime("%Y%m%d%H%M%S")}-{reason}-{uuid.uuid4().hex[:8]}.zip')
        data = self.build_snapshot_data()
        with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
            archive.writestr('data_index.json', json.dumps(data, ensure_ascii=False))
            for rel_path in self._list_local_files(str(settings.MEDIA_ROOT)):
                if rel_path.startswith('.sync-v2-safety/'):
                    continue
                archive.write(os.path.join(str(settings.MEDIA_ROOT), rel_path), arcname=f'media/{rel_path}')
        backups = sorted(self._list_local_files(root))
        for rel_path in backups[:-3]:
            os.remove(os.path.join(root, rel_path))
        return path

    def sync_v2(
        self, *, source='manual', runner_id='', base_snapshot_id='', on_progress=None,
        should_abort=None, recover_owned_remote_lock=False,
    ):
        """Merge the current v2 head into local state, then publish one immutable merged snapshot."""
        def report(message, progress=None):
            if callable(on_progress):
                on_progress(message, progress)

        self._ensure_not_aborted(should_abort)
        report('正在创建本机完整安全快照。', 5)
        safety_backup = self.create_local_safety_backup('before-sync')
        report('本机安全快照已完成，正在连接远端并获取同步锁。', 18)
        self._ensure_not_aborted(should_abort)
        # 首次扫描不能直接作废普通媒体：远端快照可能仍有可恢复副本。
        # 在媒体恢复完成（或确认远端不存在）后再执行实际清理。
        self.reconcile_missing_book_media(drop_missing_assets=False)
        with self._remote_sync_lock(runner_id, recover_owned_lock=recover_owned_remote_lock):
            report('已获取远端同步锁，正在读取当前快照。', 28)
            self._ensure_not_aborted(should_abort)
            remote = self.get_v2_current() or self._get_legacy_snapshot()
            report('远端快照读取完成，正在合并本机与云端数据。', 40)
            self._ensure_not_aborted(should_abort)
            local_data = self.build_snapshot_data()
            local_revisions = self._build_revision_manifest(local_data)
            base = None
            if base_snapshot_id:
                try:
                    base = self.get_v2_snapshot(base_snapshot_id)
                except SyncError:
                    base = None
            if remote:
                merged_data, merged_revisions, summary = self.merge_v2_data(base, local_data, local_revisions, remote)
                report('正在校验并恢复非图书媒体资源。', 58)
                # 此后会先覆盖媒体，再提交数据库并发布新指针；这些步骤必须作为一个
                # 不可中断的提交段完成，避免取消后留下媒体与数据库不一致的本地状态。
                self._ensure_not_aborted(should_abort)
                self._restore_v2_media(
                    remote.get('media'),
                    skip_paths=self._book_body_paths_from_snapshot(remote.get('data')),
                )
                with transaction.atomic():
                    with suspend_tracking():
                        self.apply_snapshot_data(merged_data, full_overwrite=True)
                    self._apply_v2_revisions(merged_revisions)
                # 远端新图书的正文被刻意跳过下载；写入数据库后立即将其转为
                # 仅云端状态，确保本次同步完成后书架就能触发按需恢复。
                self.reconcile_missing_book_media()
                merged_data = self.build_snapshot_data()
                merged_revisions = self._build_revision_manifest(merged_data)
                previous_media = remote.get('media') if not remote.get('legacy') else None
            else:
                merged_data, merged_revisions, summary = local_data, local_revisions, {'created': len(local_data), 'updated': 0, 'deleted': 0, 'conflicts': 0}
                previous_media = None
                self.reconcile_missing_book_media(drop_missing_assets=True)
                merged_data = self.build_snapshot_data()
                merged_revisions = self._build_revision_manifest(merged_data)
            report('正在发布新的 v2 合并快照。', 75)
            if not remote:
                self._ensure_not_aborted(should_abort)
            snapshot = self.publish_v2_snapshot(
                source=source, runner_id=runner_id, base_snapshot_id=(remote or {}).get('meta', {}).get('snapshot_id', ''),
                previous_media=previous_media, data_list=merged_data, revisions=merged_revisions,
                report=report,
            )
        return snapshot, summary, safety_backup

    def restore_v2_snapshot(self, snapshot_id, *, runner_id=''):
        safety_backup = self.create_local_safety_backup('before-restore')
        with self._remote_sync_lock(runner_id):
            snapshot = self.get_v2_snapshot(snapshot_id)
            self._restore_v2_media(snapshot.get('media'))
            with transaction.atomic():
                with suspend_tracking():
                    self.apply_snapshot_data(snapshot['data'], full_overwrite=True)
                self._apply_v2_revisions(snapshot['revisions'])
            restored = self.publish_v2_snapshot(
                source='history-restore', runner_id=runner_id, base_snapshot_id=snapshot_id,
                previous_media=snapshot.get('media'), data_list=snapshot['data'], revisions=snapshot['revisions'],
            )
        return restored, safety_backup

    def write_snapshot_meta(self, source='manual', runner_id=''):
        meta = self.build_snapshot_meta(source=source, runner_id=runner_id)
        meta['data_file'] = self.data_file

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(mode='w+', encoding='utf-8', delete=False, suffix='.json') as tmp:
                json.dump(meta, tmp, ensure_ascii=False)
                tmp_path = tmp.name

            if not self.client.upload_file(tmp_path, self.meta_file):
                raise SyncError("快照元数据上传失败")

            return meta
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
