import hashlib
import json
import os
import tempfile
import uuid
from collections import defaultdict
from datetime import datetime

from django.apps import apps
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

        if remote_version != current_version:
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
        for app_label in self.TARGET_APPS:
            app_config = apps.get_app_config(app_label)
            for model in app_config.get_models():
                yield model

    def _collect_asset_relative_paths(self):
        from assets.models import Asset

        relative_paths = []
        missing_files = []
        for asset in Asset.objects.filter(is_valid=True):
            if not asset.file_path:
                continue

            rel_path = self._normalize_rel_path(asset.file_path)
            local_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            if not os.path.isfile(local_path):
                missing_files.append(rel_path)
                continue

            relative_paths.append(rel_path)

        return sorted(set(relative_paths)), missing_files

    def validate_upload_state(self):
        _, missing_assets = self._collect_asset_relative_paths()
        if not missing_assets:
            return []

        preview = '，'.join(missing_assets[:3])
        if len(missing_assets) > 3:
            preview += f' 等 {len(missing_assets)} 个文件'

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

    def _sync_tree_upload_stream(self, *, local_root, remote_root, relative_paths, label):
        local_root = str(local_root)
        self.client.ensure_directory(remote_root)

        total_files = len(relative_paths)
        yield json.dumps({
            "step": "scan",
            "total": total_files,
            "msg": f"{label}：扫描到 {total_files} 个文件"
        }) + "\n"

        remote_existing_files = self._list_remote_files(remote_root) or set()
        expected_remote_files = set()

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

        for app_label in self.TARGET_APPS:
            try:
                app_config = apps.get_app_config(app_label)
                for model in app_config.get_models():
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
                raise SyncError(f"导出 {app_label} 失败: {str(e)}")

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
        relative_paths, missing_files = self._collect_asset_relative_paths()
        if missing_files:
            preview = '，'.join(missing_files[:3])
            if len(missing_files) > 3:
                preview += f' 等 {len(missing_files)} 个文件'
            raise SyncError(f"资源同步前校验失败：以下文件缺失 {preview}")

        yield from self._sync_tree_upload_stream(
            local_root=settings.MEDIA_ROOT,
            remote_root=self.media_dir,
            relative_paths=relative_paths,
            label='资源文件'
        )

    def sync_data_download(self):
        """下载并恢复数据库快照，同时清理本地多余记录。"""
        content = self.client.get_file_content(self.data_file)
        if not content:
            raise SyncError("云端未找到数据快照 data_index.json")

        data_list = json.loads(content)
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
                remote_pks = remote_pk_map.get(model_label, set())
                local_objects = model.objects.all()

                stale_pks = [
                    str(pk) for pk in local_objects.values_list(model._meta.pk.attname, flat=True)
                    if str(pk) not in remote_pks
                ]
                if stale_pks:
                    local_objects.filter(**{f"{model._meta.pk.attname}__in": stale_pks}).delete()

        return len(data_list)

    def sync_assets_download(self):
        """根据数据库快照修复本地媒体资源，并清理多余文件。"""
        from assets.models import Asset

        count = 0
        local_media_root = str(settings.MEDIA_ROOT)
        expected_rel_paths = set()

        assets = Asset.objects.filter(is_valid=True)
        for asset in assets:
            if not asset.file_path:
                continue

            rel_path = self._normalize_rel_path(asset.file_path)
            expected_rel_paths.add(rel_path)

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
