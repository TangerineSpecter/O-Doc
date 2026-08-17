import hashlib
import json
import os
import shutil
import tempfile
import uuid
import zipfile
from collections import defaultdict
from datetime import datetime
from urllib.parse import urlparse

from django.apps import apps
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.conf import settings
from django.core import serializers
from django.db import transaction
from django.db.models import PROTECT


class SyncError(Exception):
    """同步过程中的显式失败。"""


class SyncManager:
    TARGET_APPS = [
        'article', 'anthology', 'categories', 'tags',
        'assets', 'stats', 'ai_assistant', 'system_settings', 'user'
    ]
    LOCAL_ONLY_SYSTEM_SETTING_KEYS = frozenset({
        'system_webdav_config',
        'system_webdav_sync_runtime',
    })

    def __init__(self, storage_client=None, remote_base_path=''):
        self.client = storage_client
        if storage_client is None:
            self.base_path = ''
            self.data_file = 'data_index.json'
            self.meta_file = 'snapshot_meta.json'
            self.media_dir = 'media'
            return

        path = (remote_base_path or '').strip().strip('/')
        if not path:
            raise ValueError('请填写远程路径，不要留空，以免写到错误的备份目录')
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
