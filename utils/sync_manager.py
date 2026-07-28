import hashlib
import json
import os
import tempfile
import uuid
from collections import defaultdict
from datetime import datetime
from urllib.parse import urlparse

from django.apps import apps
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.conf import settings
from django.core import serializers
from django.db import transaction


class SyncError(Exception):
    """同步过程中的显式失败。"""


class SyncManager:
    TARGET_APPS = [
        'article', 'anthology', 'categories', 'tags',
        'assets', 'stats', 'ai_assistant', 'system_settings', 'user'
    ]

    def __init__(self, webdav_client, remote_base_path):
        self.client = webdav_client
        # 确保远程路径以 / 开头，并不以 / 结尾
        path = remote_base_path.strip('/')
        self.base_path = f"/{path}"

        self.data_file = f"{self.base_path}/data_index.json"
        self.meta_file = f"{self.base_path}/snapshot_meta.json"
        self.media_dir = f"{self.base_path}/media"

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
                yield model

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

    def _collect_asset_relative_paths(self):
        from assets.models import Asset
        from anthology.models import Book

        relative_paths = []
        missing_files = []
        released_asset_ids = set(Book.objects.filter(is_valid=True, local_state='cloud_only').values_list('asset_id', flat=True))
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

    def _sync_tree_upload_stream(self, *, local_root, remote_root, relative_paths, label, preserve_remote_rel_paths=()):
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

    def sync_data_upload_stream(self):
        """
        上传数据库快照。
        """
        self.client.ensure_directory(self.base_path)
        yield json.dumps({"step": "init", "msg": "正在初始化数据库导出..."}) + "\n"

        all_data = []
        total_count = 0

        try:
            for model in self._iter_target_models():
                model_name = model.__name__
                queryset = model.objects.all()
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

    def sync_assets_upload_stream(self):
        """按资产记录同步媒体资源，避免数据库与文件集脱节。"""
        relative_paths, missing_files = self._collect_media_relative_paths()
        if missing_files:
            preview = '，'.join(missing_files[:3])
            if len(missing_files) > 3:
                preview += f' 等 {len(missing_files)} 个文件'
            raise SyncError(f"资源同步前校验失败：以下文件缺失 {preview}")

        from anthology.models import Book
        from assets.models import Asset
        released_paths = [self._normalize_rel_path(asset.file_path) for asset in Asset.objects.filter(
            book_files__is_valid=True, book_files__local_state='cloud_only', is_valid=True
        ).distinct() if asset.file_path]
        yield from self._sync_tree_upload_stream(
            local_root=settings.MEDIA_ROOT,
            remote_root=self.media_dir,
            relative_paths=relative_paths,
            label='媒体文件',
            preserve_remote_rel_paths=released_paths,
        )
        # File upload has completed successfully. Persist a hash-bound remote availability marker
        # before the database snapshot is written by the caller.
        local_books = Book.objects.filter(is_valid=True, local_state='local').select_related('asset')
        for book in local_books:
            path = os.path.join(settings.MEDIA_ROOT, book.asset.file_path)
            if os.path.isfile(path):
                Book.objects.filter(book_id=book.book_id).update(remote_available=True, remote_hash=book.asset.file_hash)

    def sync_data_download(self):
        """下载并恢复数据库快照，同时清理本地多余记录。"""
        content = self.client.get_file_content(self.data_file)
        if not content:
            raise SyncError("云端未找到数据快照 data_index.json")

        data_list = json.loads(content)
        self._reuse_local_builtin_skill_ids(data_list)
        group_id_mapping = self._reuse_local_group_ids(data_list)
        user_id_mapping = self._reuse_local_user_ids(data_list, group_id_mapping)
        self._reuse_local_user_profile_ids(data_list, user_id_mapping)
        remote_pk_map = defaultdict(set)
        model_map = {}
        for model in self._iter_target_models():
            model_label = f"{model._meta.app_label}.{model._meta.model_name}"
            model_map[model_label] = model

        for item in data_list:
            model_label = item.get('model')
            pk = item.get('pk')
            if model_label in model_map:
                remote_pk_map[model_label].add(str(pk))

        with transaction.atomic():
            for obj in serializers.deserialize('json', json.dumps(data_list)):
                obj.save()

            for model in reversed(list(self._iter_target_models())):
                model_label = f"{model._meta.app_label}.{model._meta.model_name}"
                # 兼容旧快照：此前未导出 auth.User，不能在恢复时删除当前登录账号。
                if model in (Group, get_user_model()) and model_label not in remote_pk_map:
                    continue
                remote_pks = remote_pk_map.get(model_label, set())
                local_objects = model.objects.all()

                stale_pks = [
                    str(pk) for pk in local_objects.values_list(model._meta.pk.attname, flat=True)
                    if str(pk) not in remote_pks
                ]
                if stale_pks:
                    local_objects.filter(**{f"{model._meta.pk.attname}__in": stale_pks}).delete()

        return len(data_list)

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

    def sync_assets_download(self):
        """根据数据库快照修复本地媒体资源，并清理多余文件。"""
        from assets.models import Asset
        from user.models import UserProfile

        count = 0
        local_media_root = str(settings.MEDIA_ROOT)
        expected_rel_paths = set()

        from anthology.models import Book
        released_asset_ids = set(Book.objects.filter(is_valid=True, local_state='cloud_only').values_list('asset_id', flat=True))
        assets = Asset.objects.filter(is_valid=True)
        for asset in assets:
            if not asset.file_path:
                continue

            rel_path = self._normalize_rel_path(asset.file_path)
            expected_rel_paths.add(rel_path)

            # The cover is a regular asset and remains local; only the explicitly released
            # original book body is excluded from bulk restore.
            if asset.id in released_asset_ids:
                expected_rel_paths.discard(rel_path)
                continue

            local_path = os.path.join(local_media_root, rel_path)
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

    def write_snapshot_meta(self, source='manual', runner_id=''):
        meta = {
            'snapshot_id': uuid.uuid4().hex,
            'generated_at': datetime.utcnow().isoformat() + 'Z',
            'source': source,
            'runner_id': runner_id,
            'app_version': self.get_current_app_version(),
            'data_file': self.data_file,
        }

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
