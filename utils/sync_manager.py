"""Snapshot orchestration, revision merge and local/remote commit boundaries."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import uuid
import zipfile
from datetime import datetime
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from system_settings.sync_state import LOCAL_ONLY_SYSTEM_SETTING_KEYS, canonical_hash, get_device_id, suspend_tracking
from system_settings.agent_world.farm_gate import guarded as farm_sync_guard
from learning.locking import snapshot_guard as learning_sync_guard
from novel.locking import snapshot_guard as novel_sync_guard
from quant.locking import snapshot_guard as quant_sync_guard
from novel.chapters import enforce_revision_retention as enforce_novel_revision_retention
from system_settings.agent_world import travel_sync
from .sync_merge import item_map, revision_key, merge_records
from .sync_policy import SyncError, OverwriteConfirmationRequired, SyncChoicesRequired, schema_guard, ensure_not_aborted
from .sync_repository import SnapshotRepository
from .sync_media import SnapshotMedia
from .sync_models import SnapshotModels
from .sync_restore import SnapshotRestorer
from .sync_snapshot import SnapshotExporter

def format_sync_result(summary, safety_backup=''):
    if summary.get('unchanged'):
        return '数据与媒体均未变化，已跳过全量合并与上传。'
    backup_name = os.path.basename(safety_backup) if safety_backup else '未创建'
    repairs = summary.get('repairs') or []
    warnings = summary.get('integrity_warnings') or []
    extra = ''
    if repairs:
        extra += f'；已自动整理 {len(repairs)} 处，使农场、生活或记忆可以继续使用'
    if warnings:
        extra += f'；另有 {len(warnings)} 条完整性提示，未中断同步'
    if summary.get('initial_upload'):
        return f"首次上传完成，本机快照已发布；本机安全快照：{backup_name}{extra}"
    if summary.get('force_overwrite') and summary.get('direction') == 'download':
        return (
            f"已用云端快照覆盖本机：写入 {summary.get('updated', 0)} 条；本机安全快照：{backup_name}{extra}"
        )
    if summary.get('force_overwrite'):
        return (
            f"已强制覆盖远端当前快照：新增 {summary.get('created', 0)}、更新 {summary.get('updated', 0)}、"
            f"移除远端独有记录 {summary.get('deleted', 0)}；本机安全快照：{backup_name}{extra}"
        )
    return (
        f"v2 合并完成：新增 {summary.get('created', 0)}、更新 {summary.get('updated', 0)}、"
        f"删除 {summary.get('deleted', 0)}、冲突自动处理 {summary.get('conflicts', 0)}；本机安全快照：{backup_name}{extra}"
    )


class SyncManager:
    SNAPSHOT_FORMAT = 2

    SNAPSHOT_RETENTION = 10

    REMOTE_LOCK_TTL_SECONDS = 2 * 60 * 60

    TARGET_APPS = [
        'article', 'anthology', 'categories', 'tags',
        'assets', 'prompts', 'stats', 'ai_assistant', 'system_settings', 'user', 'book_analysis', 'whiteboard', 'memos', 'message', 'learning', 'novel', 'quant'
    ]

    def __init__(self, storage_client=None, remote_base_path=''):
        self.remote = SnapshotRepository(
            storage_client, remote_base_path, snapshot_format=self.SNAPSHOT_FORMAT,
            retention=self.SNAPSHOT_RETENTION, lock_ttl_seconds=self.REMOTE_LOCK_TTL_SECONDS,
        )
        self.media = SnapshotMedia(self.remote)
        self.models = SnapshotModels(self.TARGET_APPS)
        self.exporter = SnapshotExporter(self.models, lambda: self.get_current_app_version())
        self.restorer = SnapshotRestorer(
            self.models, lambda version: self.is_remote_version_older(version), self._guard_integrity,
        )

    @farm_sync_guard
    @novel_sync_guard
    @learning_sync_guard
    @quant_sync_guard
    def apply_snapshot_data(self, data_list, remote_meta=None, *, full_overwrite=False, should_abort=None, integrity='strict'):
        self._integrity_warnings = []
        return self.restorer.apply_snapshot_data(
            data_list, remote_meta, full_overwrite=full_overwrite,
            should_abort=should_abort, integrity=integrity,
        )

    @farm_sync_guard
    @novel_sync_guard
    @learning_sync_guard
    @quant_sync_guard
    def build_snapshot_data(self, *, compact_travel=False, allow_exploration_review_mismatch=False, relax_integrity=False):
        return self.exporter.build_snapshot_data(
            compact_travel=compact_travel,
            allow_exploration_review_mismatch=allow_exploration_review_mismatch,
            relax_integrity=relax_integrity,
        )

    def build_snapshot_meta(self, source='manual', runner_id='', data_list=None):
        return self.exporter.build_snapshot_meta(source=source, runner_id=runner_id, data_list=data_list)

    def list_v2_history(self):
        return self.remote.list_history()

    def reconcile_missing_book_media(self, *, drop_missing_assets=True):
        return self.media.reconcile_missing_book_media(drop_missing_assets=drop_missing_assets)

    def restore_media_from_directory(self, backup_media_root):
        return self.media.restore_media_from_directory(backup_media_root)

    def restore_v2_media_file(self, rel_path, *, expected_hash=''):
        remote = self.get_v2_current() or self._get_legacy_snapshot()
        return self.media.restore_file(rel_path, remote=remote, expected_hash=expected_hash)

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

        # 远端版本高于当前本机版本时，禁止同步（必须先升级本机）
        if remote_major > current_major:
            return False
        if remote_major == current_major and remote_minor > current_minor:
            return False
        if remote_major == current_major and remote_minor == current_minor and remote_patch > current_patch:
            return False

        # 同步快照只做向后兼容：当前版本可以读取同一主版本下的当前小版本
        # 或上一个小版本快照，但不能读取由更新系统生成的快照。
        if remote_major != current_major:
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
        travel_sync.validate(remote_meta)
        from system_settings.agent_world.blacksmith_sync import validate_version as validate_blacksmith_version
        validate_blacksmith_version(remote_meta)
        if remote_meta and remote_meta.get('quant_schema_version', 0) > 1:
            raise SyncError('量化快照版本过新，请升级所有设备')
        if remote_meta and remote_meta.get('memo_sprout_schema_version', 0) > 1:
            raise SyncError('闪念发芽快照版本过新，请升级所有设备')
        if remote_meta and remote_meta.get('combat_schema_version',0)>14:raise SyncError('战斗快照版本过新，请升级所有设备')
        if remote_meta and remote_meta.get('fishing_schema_version',0)>1:raise SyncError('钓鱼快照版本过新，请升级所有设备')
        if remote_meta and remote_meta.get('tournament_schema_version', 0) > 1:raise SyncError('武道大会快照版本过新，请升级所有设备')
        if remote_meta and remote_meta.get('alchemy_schema_version', 0) > 2:
            raise SyncError('炼金快照版本高于本机，请升级后恢复。')
        if remote_meta and remote_meta.get('novel_schema_version', 0) > 1:
            raise SyncError('小说快照版本高于本机，请升级所有设备。')
        if remote_meta and remote_meta.get('learning_schema_version', 0) > 4:
            raise SyncError('学习快照版本高于本机，请升级后恢复。')
        if remote_meta and remote_meta.get('crop_schema_version', 0) > 1:
            raise SyncError('农作物快照版本过新，请升级所有设备')
        if remote_meta and remote_meta.get('cooking_schema_version', 0) > 4:
            raise SyncError('烹饪快照版本高于本机，请升级后恢复。')
        if remote_meta and remote_meta.get('social_schema_version', 0) > 2:
            raise SyncError('社交快照版本高于本机，请升级后同步。')
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


    def _guard_integrity(self, label, fn, *, relax):
        """严格模式原样抛出。覆盖或对比模式只拦截未来版本，其余完整性问题记成提示。"""
        if not relax:
            return fn()
        try:
            return fn()
        except SyncError as exc:
            if schema_guard(exc):
                raise
            warnings = getattr(self, '_integrity_warnings', None)
            if warnings is None:
                warnings = []
                self._integrity_warnings = warnings
            warnings.append(f'{label}：{exc}')
            return None


    def get_remote_snapshot_meta(self):
        content = self.remote.client.get_file_content(self.remote.meta_file)
        if not content:
            return None

        try:
            return json.loads(content)
        except json.JSONDecodeError as exc:
            raise SyncError(f"远端快照元数据损坏：{exc}")


    def validate_import_snapshot_version(self, remote_meta):
        travel_sync.validate(remote_meta)
        from system_settings.agent_world.blacksmith_sync import validate_version as validate_blacksmith_version
        validate_blacksmith_version(remote_meta)
        if remote_meta and remote_meta.get('quant_schema_version', 0) > 1:
            raise SyncError('量化快照版本过新，请升级所有设备')
        if remote_meta and remote_meta.get('combat_schema_version',0)>14:raise SyncError('战斗快照版本过新，请升级所有设备')
        if remote_meta and remote_meta.get('fishing_schema_version',0)>1:raise SyncError('钓鱼快照版本过新，请升级所有设备')
        if remote_meta and remote_meta.get('tournament_schema_version', 0) > 1:raise SyncError('武道大会快照版本过新，请升级所有设备')
        if remote_meta and remote_meta.get('alchemy_schema_version', 0) > 2:
            raise SyncError('炼金快照版本高于本机，请升级后恢复。')
        if remote_meta and remote_meta.get('novel_schema_version', 0) > 1:
            raise SyncError('小说快照版本高于本机，请升级所有设备。')
        if remote_meta and remote_meta.get('learning_schema_version', 0) > 4:
            raise SyncError('学习快照版本高于本机，请升级后恢复。')
        if remote_meta and remote_meta.get('crop_schema_version', 0) > 1:
            raise SyncError('农作物快照版本过新，请升级所有设备')
        if remote_meta and remote_meta.get('cooking_schema_version', 0) > 4:
            raise SyncError('烹饪快照版本高于本机，请升级后恢复。')
        if remote_meta and remote_meta.get('social_schema_version', 0) > 2:
            raise SyncError('社交快照版本高于本机，请升级后恢复。')
        if not remote_meta or not remote_meta.get('app_version'):
            raise SyncError('备份缺少版本信息，无法导入。')
        remote_version = remote_meta['app_version']
        current_version = self.get_current_app_version()
        if self.is_remote_version_newer(remote_version, current_version):
            raise SyncError(
                f"该备份由更新的系统 v{remote_version} 生成，当前系统为 v{current_version}。"
                "请先升级本机后再导入。"
            )


    @staticmethod
    def _validate_force_overwrite_source(data):
        """Validate the normalized local snapshot before publishing it for strict readers."""
        from system_settings.agent_world.life_snapshot import validate_source as validate_life
        from system_settings.agent_world.farm_quality_sync import validate_source as validate_crops
        from system_settings.agent_world.cooking_quality_sync import (
            validate_source as validate_cooking,
            metadata as cooking_metadata,
        )
        from system_settings.agent_world.combat.sync import validate_source as validate_combat
        from system_settings.agent_world.memory.sync import (
            validate_source as validate_memories,
            metadata as memory_metadata,
        )
        from system_settings.agent_archive_sync import validate_names

        from system_settings.agent_world.lottery_sync import validate_source as validate_lottery
        validate_lottery(data)
        from system_settings.agent_world.tournament_sync import validate_source as validate_tournaments
        validate_tournaments(data)
        from system_settings.agent_world.fishing.sync import validate_source as validate_fishing
        validate_fishing(data)
        from system_settings.agent_world.blacksmith_sync import validate_source as validate_blacksmith
        validate_blacksmith(data)
        validate_life(data)
        validate_crops(data)
        validate_cooking(data, cooking_metadata(data))
        validate_combat(data)
        validate_memories(data, memory_metadata(data))
        validate_names(data)


    @staticmethod
    def _safe_extract_zip(archive, dest_dir):
        dest_dir = os.path.realpath(dest_dir)
        for info in archive.infolist():
            target = os.path.realpath(os.path.join(dest_dir, info.filename))
            if target != dest_dir and not target.startswith(dest_dir + os.sep):
                raise SyncError('压缩包包含非法路径，已拒绝导入')
        archive.extractall(dest_dir)


    @farm_sync_guard
    @novel_sync_guard
    @learning_sync_guard
    @quant_sync_guard
    def write_local_backup_zip(self, zip_path, source='local-export', runner_id=''):
        data_list = self.build_snapshot_data()
        meta = self.build_snapshot_meta(source=source, runner_id=runner_id, data_list=data_list)
        media_paths, _missing = self.media.collect_media_relative_paths()
        book_bodies = self.media.book_body_rel_path_set()
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


    @farm_sync_guard
    @novel_sync_guard
    @learning_sync_guard
    @quant_sync_guard
    def import_local_backup_zip(self, zip_path, should_abort=None):
        extract_dir = tempfile.mkdtemp(prefix='odoc-backup-')
        try:
            ensure_not_aborted(should_abort)
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


    @staticmethod
    def _json_payload_size(payload):
        return len(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode('utf-8'))


    def get_v2_current(self, *, relax_integrity=None):
        if relax_integrity is None:
            relax_integrity = bool(getattr(self, 'relax_integrity', False))
        pointer = self.remote.read_json(self.remote.v2_current_file)
        if not pointer or pointer.get('format') != self.SNAPSHOT_FORMAT:
            return None
        snapshot_id = pointer.get('snapshot_id')
        if not snapshot_id:
            return None
        return self.get_v2_snapshot(snapshot_id, relax_integrity=relax_integrity)


    def _get_remote_overwrite_state(self):
        """Read only the remote metadata needed to replace current, without merging its data."""
        pointer = self.remote.read_json(self.remote.v2_current_file)
        if not isinstance(pointer, dict) or pointer.get('format') != self.SNAPSHOT_FORMAT:
            legacy = self._get_legacy_snapshot()
            released_book_paths = set(self.media.released_book_rel_paths())
            if released_book_paths:
                raise SyncError('远端仍是旧版快照，强制覆盖前请先完成一次普通同步以迁移云端图书正文')
            return legacy

        snapshot_id = pointer.get('snapshot_id')
        if not snapshot_id:
            raise SyncError('远端当前快照指针缺少快照 ID，无法安全覆盖')
        meta = self.remote.read_json(self.remote.snapshot_path(snapshot_id, 'snapshot_meta.json'), required=True)
        if not isinstance(meta, dict):
            raise SyncError('远端快照元数据格式不正确，无法安全覆盖')
        if meta.get('format') != self.SNAPSHOT_FORMAT:
            raise SyncError('远端快照格式不受支持，请升级客户端')
        self.validate_remote_snapshot_version(meta)

        revisions = self.remote.read_json(self.remote.snapshot_path(snapshot_id, 'revisions.json')) or {}
        if not isinstance(revisions, dict) or any(not isinstance(value, dict) for value in revisions.values()):
            revisions = {}
        media = self.remote.read_json(self.remote.snapshot_path(snapshot_id, 'media_manifest.json'))
        released_book_paths = set(self.media.released_book_rel_paths())
        if not isinstance(media, dict) or any(not isinstance(value, dict) for value in media.values()):
            if released_book_paths:
                raise SyncError('远端媒体清单无法读取，不能安全保留云端图书正文')
            media = {}
        if any(not (media.get(path) or {}).get('hash') for path in released_book_paths):
            raise SyncError('远端媒体清单缺少云端图书正文，无法安全强制覆盖')
        return {
            'meta': {**meta, 'snapshot_id': snapshot_id},
            'revisions': revisions,
            'media': media,
        }


    def _get_legacy_snapshot(self):
        """将 v1 根目录快照作为首次 v2 合并的只读远端输入，不把缺失记录视为删除。"""
        data = self.remote.read_json(self.remote.data_file)
        if not isinstance(data, list):
            return None
        meta = self.get_remote_snapshot_meta() or {}
        self.validate_remote_snapshot_version(meta)
        from quant.sync import validate as validate_quant
        validate_quant(data, meta)
        generated_at = meta.get('generated_at') or timezone.now().isoformat()
        revisions, media = {}, {}
        for key, item in item_map(data).items():
            revisions[key] = {
                'hash': canonical_hash(item.get('fields') or {}), 'revision_at': generated_at,
                'origin_device': 'legacy-v1', 'deleted': False,
            }
            if item.get('model') == 'assets.asset':
                fields = item.get('fields') or {}
                rel_path = self.media.normalize_rel_path(fields.get('file_path') or '')
                if rel_path:
                    media[rel_path] = {'hash': fields.get('file_hash') or '', 'legacy_path': True, 'size': fields.get('file_size') or 0}
            elif item.get('model') == 'user.userprofile':
                rel_path = self.media.get_media_relative_path((item.get('fields') or {}).get('avatar') or '')
                if rel_path:
                    media[rel_path] = {'hash': '', 'legacy_path': True, 'size': 0}
        return {
            'meta': {**meta, 'snapshot_id': '', 'format': 1},
            'data': self.models.strip_device_local_user_fields(data),
            'revisions': revisions,
            'media': media,
            'legacy': True,
        }


    def get_v2_snapshot(self, snapshot_id, *, relax_integrity=False):
        meta = self.remote.read_json(self.remote.snapshot_path(snapshot_id, 'snapshot_meta.json'), required=True)
        if meta.get('format') != self.SNAPSHOT_FORMAT:
            raise SyncError('远端快照格式不受支持，请升级客户端')
        self.validate_remote_snapshot_version(meta)
        data = self.remote.read_json(self.remote.snapshot_path(snapshot_id, 'data_index.json'), required=True)
        from learning.sync import validate as validate_learning
        from novel.sync import validate as validate_novel
        from quant.sync import validate as validate_quant
        from system_settings.agent_world.farm_quality_sync import validate_source as validate_crops
        self._integrity_warnings = getattr(self, '_integrity_warnings', [])
        self._guard_integrity('学习', lambda: validate_learning(data, meta), relax=relax_integrity)
        self._guard_integrity('小说', lambda: validate_novel(data, meta), relax=relax_integrity)
        validate_quant(data, meta)
        self._guard_integrity('农场', lambda: validate_crops(data, meta), relax=relax_integrity)
        from system_settings.agent_world.lottery_sync import validate_source as validate_lottery
        validate_lottery(data, meta)
        from system_settings.agent_world.tournament_sync import validate_source as validate_tournaments
        validate_tournaments(data, meta)
        from system_settings.agent_world.fishing.sync import validate_source as validate_fishing
        validate_fishing(data, meta)
        revisions = self.remote.read_json(self.remote.snapshot_path(snapshot_id, 'revisions.json'), required=True)
        self._guard_integrity('旅行目录', lambda: travel_sync.validate_revisions(meta, revisions), relax=relax_integrity)
        return {
            'meta': meta,
            'data': self.models.strip_device_local_user_fields(data),
            'revisions': revisions,
            'media': self.remote.read_json(self.remote.snapshot_path(snapshot_id, 'media_manifest.json'), required=True),
        }


    def _build_revision_manifest(self, data_list):
        from system_settings.models import SyncEntityState
        if travel_sync.enabled():
            data_list, _ = travel_sync.compact(data_list)
            travel_sync.prune_states()
            travel_sync.record_missing()
        device_id = get_device_id()
        states = {
            revision_key(state.model_label, state.object_pk): state
            for state in SyncEntityState.objects.all()
        }
        revisions = {}
        to_create = []
        to_update = []
        now = timezone.now()

        for key, item in item_map(data_list).items():
            state = states.get(key)
            item_hash = canonical_hash(item.get('fields') or {})
            if state is None:
                # 身份本身可以带冒号（username:、skill:），只能从左边拆一次。
                model_label, pk = key.split(':', 1)
                rev_at = self._item_revision_at(item)
                state = SyncEntityState(
                    model_label=model_label, object_pk=pk, content_hash=item_hash,
                    revision_at=rev_at, origin_device=device_id, is_deleted=False,
                )
                to_create.append(state)
                states[key] = state
            elif state.content_hash != item_hash or state.is_deleted:
                state.content_hash = item_hash
                state.is_deleted = False
                state.revision_at = now
                state.origin_device = device_id
                to_update.append(state)
            revisions[key] = {
                'hash': item_hash,
                'revision_at': state.revision_at.isoformat(),
                'origin_device': state.origin_device or device_id,
                'deleted': False,
            }

        if to_create:
            SyncEntityState.objects.bulk_create(to_create, batch_size=1000)
        if to_update:
            SyncEntityState.objects.bulk_update(
                to_update,
                fields=['content_hash', 'is_deleted', 'revision_at', 'origin_device', 'updated_at'],
                batch_size=1000,
            )

        for key, state in states.items():
            if state.is_deleted:
                revisions[key] = {
                    'hash': state.content_hash,
                    'revision_at': state.revision_at.isoformat(),
                    'origin_device': state.origin_device or device_id,
                    'deleted': True,
                }
        return revisions


    def _item_revision_at(self, item):
        fields = item.get('fields') or {}
        for field_name in ('updated_at', 'updated_time', 'modified_at', 'modified_time', 'created_at', 'created_time'):
            value = fields.get(field_name)
            if not value:
                continue
            parsed = parse_datetime(str(value))
            if parsed is not None:
                return self._normalize_revision_time(parsed)
        return timezone.now()


    def merge_v2_data(
        self, base, local_data, local_revisions, remote, *,
        relax_integrity=False, resolutions=None, resolution_default='', conflicts_only=False,
    ):
        """返回不丢失双方独有记录的合并结果及新修订清单。

        relax_integrity 时，农场窗口、生活摘要、居民记忆来源等不再中断合并。
        resolutions 里用户点名的记录优先于自动胜出规则。
        """
        self._integrity_warnings = []
        from copy import deepcopy
        from system_settings.agent_world.stamina_settings import validate_snapshot as validate_stamina
        validate_stamina(local_data)
        validate_stamina(remote.get('data') or [])
        from system_settings.agent_world.combat.history_snapshot import normalize_source, compact_source
        remote = deepcopy(remote)
        if (remote.get('meta') or {}).get('combat_schema_version', 0) < 8:
            remote['data'] = compact_source(normalize_source(remote.get('data') or []))

        def guard(label, fn):
            return self._guard_integrity(label, fn, relax=relax_integrity)

        guard('旅行目录', lambda: travel_sync.validate(remote.get('meta')))
        guard('旅行目录', lambda: travel_sync.validate((base or {}).get('meta')))
        from system_settings.agent_world.lottery_sync import validate_source as validate_lottery, validate_conflicts as lottery_conflicts, refresh_merged as refresh_lottery
        validate_lottery(local_data)
        from system_settings.agent_world.fishing.sync import validate_source as validate_fishing
        validate_fishing(local_data)
        validate_lottery(remote.get('data') or [], remote.get('meta'))
        validate_fishing(remote.get('data') or [], remote.get('meta'))
        lottery_conflicts(local_data, remote.get('data') or [])
        from system_settings.agent_world.tournament_sync import validate_source as validate_tournaments, validate_conflicts as tournament_conflicts
        validate_tournaments(local_data)
        validate_tournaments(remote.get('data') or [], remote.get('meta'))
        tournament_conflicts(local_data, remote.get('data') or [])
        from system_settings.agent_world.blacksmith_sync import validate_source as validate_blacksmith, validate_conflicts as blacksmith_conflicts
        validate_blacksmith(local_data)
        validate_blacksmith(remote.get('data') or [], remote.get('meta'))
        blacksmith_conflicts(local_data, remote.get('data') or [])
        from system_settings.agent_world.fishing.sync import validate_conflicts as fishing_conflicts
        fishing_conflicts(local_data, remote.get('data') or [])
        from system_settings.agent_world.life_snapshot import validate_source, refresh_merged_integrity
        guard('生活', lambda: validate_source(local_data))
        guard('生活', lambda: validate_source(remote.get('data') or []))
        from system_settings.agent_world.farm_quality_sync import validate_source as validate_crop_source
        guard('农场', lambda: validate_crop_source(local_data))
        guard('农场', lambda: validate_crop_source(remote.get('data') or [], remote.get('meta')))
        from system_settings.agent_world.cooking_quality_sync import validate_source as validate_cooking_source, metadata as cooking_metadata
        guard('烹饪', lambda: validate_cooking_source(local_data, cooking_metadata(local_data)))
        guard('烹饪', lambda: validate_cooking_source(remote.get('data') or [], remote.get('meta')))
        from system_settings.agent_world.alchemy_quality_sync import validate_source as validate_alchemy_source, metadata as alchemy_metadata
        guard('炼金', lambda: validate_alchemy_source(local_data, alchemy_metadata(local_data)))
        guard('炼金', lambda: validate_alchemy_source(remote.get('data') or [], remote.get('meta')))
        from system_settings.agent_world.combat.sync import validate_source as validate_combat, validate_catalog_conflicts
        from system_settings.agent_world.food_sync import validate_import as validate_food_import
        validate_food_import(remote.get('data') or [], remote.get('meta'))
        validate_combat(local_data, allow_exploration_review_mismatch=relax_integrity)
        validate_combat(remote.get('data') or [], remote.get('meta'), allow_exploration_review_mismatch=relax_integrity)
        guard('战斗目录', lambda: validate_catalog_conflicts(local_data, remote.get('data') or []))
        # 老全量快照中的原始默认城市只代表共享种子，不代表用户编辑或删除。
        if travel_sync.enabled() or (remote.get('meta') or {}).get(travel_sync.META_KEY):
            local_data, local_revisions = travel_sync.compact(local_data, local_revisions)
            remote_data, remote_revisions = travel_sync.compact(remote.get('data') or [], remote.get('revisions') or {})
            remote = {**remote, 'data': remote_data, 'revisions': remote_revisions}
            if base:
                base_data, base_revisions = travel_sync.compact(base.get('data') or [], base.get('revisions') or {})
                base = {**base, 'data': base_data, 'revisions': base_revisions}
        from system_settings.agent_world.memory.sync import validate_source as validate_memories, metadata as memory_metadata, merge_aggregates
        guard('居民记忆', lambda: validate_memories(local_data, memory_metadata(local_data)))
        guard('居民记忆', lambda: validate_memories(remote.get('data') or [], remote.get('meta')))
        remote_revisions = remote.get('revisions') or {}
        result, result_revisions, summary = merge_records(
            base, local_data, local_revisions, remote,
            resolutions=resolutions, resolution_default=resolution_default,
        )
        if conflicts_only:
            summary['integrity_warnings'] = list(self._integrity_warnings)
            return [], {}, summary
        if relax_integrity:
            try:
                merge_aggregates(result, result_revisions, local_data, remote.get('data') or [], local_revisions, remote_revisions)
            except SyncError as exc:
                if schema_guard(exc):
                    raise
                self._integrity_warnings.append(f'居民记忆合并：{exc}')
        else:
            merge_aggregates(result, result_revisions, local_data, remote.get('data') or [], local_revisions, remote_revisions)
        refresh_lottery(result, result_revisions)
        from system_settings.agent_world.tournament_sync import refresh_merged as refresh_tournaments
        refresh_tournaments(result, result_revisions)
        from system_settings.agent_world.blacksmith_sync import refresh_merged as refresh_blacksmith
        refresh_blacksmith(result, result_revisions)
        from system_settings.agent_world.fishing.sync import refresh_merged as refresh_fishing
        refresh_fishing(result, result_revisions)
        guard('居民记忆', lambda: validate_memories(result, memory_metadata(result)))
        guard('生活摘要', lambda: refresh_merged_integrity(result, result_revisions))
        from system_settings.agent_archive_sync import validate_names
        guard('居民名称', lambda: validate_names(result))
        # 严格合并仍拒绝半份烹饪链。放宽时保留两边已经合并的记录，稍后再整理摘要。
        from system_settings.agent_world.food_sync import validate_source as validate_food
        validate_food(result)
        guard('烹饪', lambda: validate_cooking_source(result, cooking_metadata(result)))
        validate_combat(result, allow_exploration_review_mismatch=relax_integrity)
        summary['integrity_warnings'] = list(self._integrity_warnings)
        return result, result_revisions, summary


    def publish_v2_snapshot(self, *, source, runner_id='', base_snapshot_id='', previous_media=None, data_list=None, revisions=None, report=None):
        if self.remote.client is None:
            raise SyncError('v2 远端快照需要已配置备份服务')
        snapshot_id = uuid.uuid4().hex
        data_list = data_list if data_list is not None else self.build_snapshot_data(compact_travel=True)
        revisions = revisions if revisions is not None else self._build_revision_manifest(data_list)
        sparse_cities = travel_sync.enabled()
        if sparse_cities:
            data_list, revisions = travel_sync.compact(data_list, revisions)
        media = self.media.build_v2_media_manifest(previous_media)
        if callable(report):
            report(
                f'快照统计：{len(data_list)} 条数据、{len(revisions)} 条修订、{len(media)} 个媒体文件（{self.media.format_size(sum(item.get("size", 0) for item in media.values()))}）',
                78,
            )
        uploaded, uploaded_bytes = self.media.upload_v2_blobs(media, report=report)
        if callable(report):
            report(f'媒体上传完成：新增 {uploaded} 个（{self.media.format_size(uploaded_bytes)}），其余复用远端 blob。', 92)
        snapshot_dir = f'{self.remote.v2_snapshots_dir}/{snapshot_id}'
        self.remote.client.ensure_directory(snapshot_dir)
        meta = {
            **self.build_snapshot_meta(source=source, runner_id=runner_id, data_list=data_list),
            'snapshot_id': snapshot_id,
            'format': self.SNAPSHOT_FORMAT,
            **(travel_sync.metadata(revisions) if sparse_cities else {}),
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
        self.remote.write_json(data_list, self.remote.snapshot_path(snapshot_id, 'data_index.json'))
        self.remote.write_json(revisions, self.remote.snapshot_path(snapshot_id, 'revisions.json'))
        self.remote.write_json(media, self.remote.snapshot_path(snapshot_id, 'media_manifest.json'))
        self.remote.write_json(meta, self.remote.snapshot_path(snapshot_id, 'snapshot_meta.json'))
        # This pointer is the only mutable v2 file and is written only after all snapshot files exist.
        self.remote.client.ensure_directory(self.remote.v2_dir)
        self.remote.write_json({'format': self.SNAPSHOT_FORMAT, 'snapshot_id': snapshot_id}, self.remote.v2_current_file)
        # v1 客户端只会读取根目录元数据；用新版本标记让它在继续写旧格式前
        # 明确失败，而不是悄悄把 v1 根目录当成当前同步结果。
        self.remote.write_json({
            'format': self.SNAPSHOT_FORMAT,
            'v2_current': self.remote.v2_current_file,
            'snapshot_id': snapshot_id,
            'generated_at': meta['generated_at'],
            'app_version': meta['app_version'],
        }, self.remote.meta_file)
        self.remote.trim_history()
        if callable(report):
            report(f'快照发布完成：{snapshot_id[:12]}（逻辑大小 {self.media.format_size(snapshot_bytes)}）', 98)
        return {'meta': meta, 'data': data_list, 'revisions': revisions, 'media': media}


    def _apply_v2_revisions(self, revisions):
        from system_settings.models import SyncEntityState
        with suspend_tracking():
            for key, revision in revisions.items():
                model_label, object_pk = key.split(':', 1)
                SyncEntityState.objects.update_or_create(
                    model_label=model_label, object_pk=object_pk,
                    defaults={
                        'content_hash': revision.get('hash', ''),
                        'revision_at': self._normalize_revision_time(revision.get('revision_at')) or timezone.now(),
                        'origin_device': revision.get('origin_device', ''),
                        'is_deleted': bool(revision.get('deleted')),
                    },
                )

        travel_sync.prune_states()


    @farm_sync_guard
    @novel_sync_guard
    @learning_sync_guard
    @quant_sync_guard
    def create_local_safety_backup(self, reason, *, allow_exploration_review_mismatch=False, relax_integrity=False):
        root = os.path.join(str(settings.MEDIA_ROOT), '.sync-v2-safety')
        os.makedirs(root, exist_ok=True)
        path = os.path.join(root, f'{datetime.utcnow().strftime("%Y%m%d%H%M%S")}-{reason}-{uuid.uuid4().hex[:8]}.zip')
        data = self.build_snapshot_data(
            allow_exploration_review_mismatch=allow_exploration_review_mismatch,
            relax_integrity=relax_integrity,
        )
        with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
            archive.writestr('data_index.json', json.dumps(data, ensure_ascii=False))
            for rel_path in self.media.list_local_files(str(settings.MEDIA_ROOT)):
                if rel_path.startswith('.sync-v2-safety/'):
                    continue
                # 图片和压缩包再压一次几乎不减小体积，却会占满 NAS 的 CPU。
                archive.write(
                    os.path.join(str(settings.MEDIA_ROOT), rel_path),
                    arcname=f'media/{rel_path}',
                    compress_type=zipfile.ZIP_STORED,
                )
        # 哈希索引和中断残留的临时文件与快照放在同一目录，不能占用三份备份的名额。
        backups = [path for path in self.media.list_local_files(root) if path.endswith('.zip')]
        for rel_path in backups[:-3]:
            os.remove(os.path.join(root, rel_path))
        return path


    def _normalize_revision_time(self, value):
        if value is None or value == '':
            return None
        parsed = value if not isinstance(value, str) else parse_datetime(value)
        if parsed is None:
            return None
        now_is_aware = timezone.is_aware(timezone.now())
        if now_is_aware and timezone.is_naive(parsed):
            return timezone.make_aware(parsed, timezone.get_current_timezone())
        if not now_is_aware and timezone.is_aware(parsed):
            return timezone.make_naive(parsed, timezone.get_current_timezone())
        return parsed


    def _local_revision_is_newer(self, local_at, remote_at):
        local_parsed = self._normalize_revision_time(local_at)
        remote_parsed = self._normalize_revision_time(remote_at)
        if local_parsed is None or remote_parsed is None:
            return False
        return local_parsed > remote_parsed


    def _read_aligned_head(self, base_snapshot_id):
        """读取当前指针、修订和媒体清单。数据正文留到确认有变更后再下载。"""
        pointer = self.remote.read_json(self.remote.v2_current_file)
        if not pointer or pointer.get('format') != self.SNAPSHOT_FORMAT:
            return None
        snapshot_id = pointer.get('snapshot_id') or ''
        if snapshot_id != base_snapshot_id:
            return None
        meta = self.remote.read_json(self.remote.snapshot_path(snapshot_id, 'snapshot_meta.json'), required=True)
        if meta.get('format') != self.SNAPSHOT_FORMAT:
            return None
        self.validate_remote_snapshot_version(meta)
        revisions = self.remote.read_json(self.remote.snapshot_path(snapshot_id, 'revisions.json'), required=True)
        media = self.remote.read_json(self.remote.snapshot_path(snapshot_id, 'media_manifest.json'), required=True)
        if not isinstance(revisions, dict) or not isinstance(media, dict):
            raise SyncError('远端修订或媒体清单格式不正确')
        travel_sync.validate_revisions(meta, revisions)
        meta.setdefault('snapshot_id', snapshot_id)
        return {'meta': meta, 'revisions': revisions, 'media': media}


    def _repair_miskeyed_revisions(self):
        """把曾经从右边拆开的修订键改回「模型:身份」。"""
        from system_settings.models import SyncEntityState
        corrupt_rows = list(SyncEntityState.objects.filter(model_label__contains=':'))
        for state in corrupt_rows:
            fixed_label, fixed_pk = f'{state.model_label}:{state.object_pk}'.split(':', 1)
            if ':' in fixed_label:
                state.delete()
                continue
            existing = SyncEntityState.objects.filter(
                model_label=fixed_label, object_pk=fixed_pk,
            ).exclude(pk=state.pk).first()
            if existing is None:
                state.model_label = fixed_label
                state.object_pk = fixed_pk
                state.save(update_fields=['model_label', 'object_pk', 'updated_at'])
                continue
            if (
                not existing.content_hash
                and state.content_hash
                and not self._local_revision_is_newer(existing.revision_at, state.revision_at)
            ):
                existing.content_hash = state.content_hash
                existing.is_deleted = state.is_deleted
                existing.revision_at = state.revision_at
                existing.origin_device = state.origin_device or existing.origin_device
                existing.save(update_fields=['content_hash', 'is_deleted', 'revision_at', 'origin_device', 'updated_at'])
            state.delete()


    @staticmethod
    def _revision_key_is_device_local(key):
        prefix = 'system_settings.systemsetting:'
        return key.startswith(prefix) and key[len(prefix):] in LOCAL_ONLY_SYSTEM_SETTING_KEYS


    def _revisions_match_stored_index(self, remote_revisions):
        from system_settings.models import SyncEntityState
        self._repair_miskeyed_revisions()
        remote_revisions = {
            key: revision for key, revision in remote_revisions.items()
            if not self._revision_key_is_device_local(key)
        }
        local = {}
        for state in SyncEntityState.objects.all().iterator(chunk_size=2000):
            if (
                state.model_label == 'system_settings.systemsetting'
                and state.object_pk in LOCAL_ONLY_SYSTEM_SETTING_KEYS
            ):
                continue
            local[revision_key(state.model_label, state.object_pk)] = state
        if set(local) != set(remote_revisions):
            return False
        for key, remote_rev in remote_revisions.items():
            state = local[key]
            if bool(state.is_deleted) != bool(remote_rev.get('deleted')):
                return False
            if (state.content_hash or '') != (remote_rev.get('hash') or ''):
                return False
            if self._local_revision_is_newer(state.revision_at, remote_rev.get('revision_at')):
                return False
        return True


    @staticmethod
    def _revision_content_same(left, right):
        if set(left) != set(right):
            return False
        for key, revision in left.items():
            other = right.get(key) or {}
            if (revision.get('hash') or '') != (other.get('hash') or ''):
                return False
            if bool(revision.get('deleted')) != bool(other.get('deleted')):
                return False
        return True


    @staticmethod
    def _media_manifest_same(left, right):
        left = left or {}
        right = right or {}
        if set(left) != set(right):
            return False
        for key, entry in left.items():
            if (entry or {}).get('hash') != (right.get(key) or {}).get('hash'):
                return False
        return True


    def _local_matches_head(self, head):
        if travel_sync.enabled() and not head['meta'].get(travel_sync.META_KEY):
            return False
        if not self._revisions_match_stored_index(head['revisions']):
            return False
        local_media = self.media.compose_media_manifest(head.get('media'), allow_missing=True)
        if local_media is None:
            return False
        return self._media_manifest_same(local_media, head.get('media'))


    @staticmethod
    def _unchanged_sync_result(head):
        return (
            {'meta': head['meta'], 'revisions': head['revisions'], 'media': head['media']},
            {'created': 0, 'updated': 0, 'deleted': 0, 'conflicts': 0, 'unchanged': True},
            '',
        )


    @staticmethod
    def _revision_change_summary(previous, current):
        summary = {'created': 0, 'updated': 0, 'deleted': 0, 'conflicts': 0, 'unchanged': False}
        for key in set(previous) | set(current):
            before = previous.get(key) or {}
            after = current.get(key) or {}
            if not before and after and not after.get('deleted'):
                summary['created'] += 1
            elif after.get('deleted') and not before.get('deleted'):
                summary['deleted'] += 1
            elif before and after and before.get('hash') != after.get('hash') and not after.get('deleted'):
                summary['updated'] += 1
        return summary


    def _publish_local_delta(
        self, head, *, source, runner_id, base_snapshot_id, report, should_abort, recover_owned_remote_lock,
    ):
        """远端头仍是本机上次对齐的快照时，只导出并发布本机变更，不回写数据库。"""
        from article.version_service import enforce_article_version_retention

        report('本机有变更，正在导出并发布快照。', 20)
        ensure_not_aborted(should_abort)
        with self.remote.lock(runner_id, recover_owned_lock=recover_owned_remote_lock):
            pointer = self.remote.read_json(self.remote.v2_current_file) or {}
            if pointer.get('snapshot_id') != base_snapshot_id:
                safety_backup = self.create_local_safety_backup('before-sync')
                enforce_article_version_retention()
                enforce_novel_revision_retention()
                self.reconcile_missing_book_media(drop_missing_assets=False)
                snapshot, summary = self._merge_while_locked(
                    report, base_snapshot_id=base_snapshot_id, source=source, runner_id=runner_id, should_abort=should_abort,
                )
                return snapshot, summary, safety_backup

            enforce_article_version_retention()
            enforce_novel_revision_retention()
            self.reconcile_missing_book_media(drop_missing_assets=False)
            local_data = self.build_snapshot_data(compact_travel=True)
            local_revisions = self._build_revision_manifest(local_data)
            local_media = self.media.build_v2_media_manifest(head.get('media'))
            if (
                self._revision_content_same(local_revisions, head['revisions'])
                and self._media_manifest_same(local_media, head.get('media'))
            ):
                report('数据与媒体均未变化，已跳过全量合并与上传。', 100)
                return self._unchanged_sync_result(head)

            summary = self._revision_change_summary(head['revisions'], local_revisions)
            report('正在发布新的 v2 合并快照。', 75)
            snapshot = self.publish_v2_snapshot(
                source=source, runner_id=runner_id, base_snapshot_id=base_snapshot_id,
                previous_media=head.get('media'), data_list=local_data, revisions=local_revisions,
                report=report,
            )
        return snapshot, summary, ''


    @farm_sync_guard
    @novel_sync_guard
    @learning_sync_guard
    @quant_sync_guard
    def _merge_while_locked(
        self, report, *, base_snapshot_id, source, runner_id, should_abort,
        relax_integrity=False, resolutions=None, resolution_default='',
    ):
        from article.version_service import enforce_article_version_retention

        report('已获取远端同步锁，正在读取当前快照。', 28)
        ensure_not_aborted(should_abort)
        remote = self.get_v2_current(relax_integrity=relax_integrity) or self._get_legacy_snapshot()
        report('远端快照读取完成，正在合并本机与云端数据。', 40)
        ensure_not_aborted(should_abort)
        local_data = self.build_snapshot_data(
            compact_travel=True,
            relax_integrity=relax_integrity,
            allow_exploration_review_mismatch=relax_integrity,
        )
        local_revisions = self._build_revision_manifest(local_data)
        base = None
        if base_snapshot_id:
            try:
                base = self.get_v2_snapshot(base_snapshot_id, relax_integrity=relax_integrity)
            except SyncError:
                base = None
        if remote:
            merged_data, merged_revisions, summary = self.merge_v2_data(
                base, local_data, local_revisions, remote,
                relax_integrity=relax_integrity,
                resolutions=resolutions,
                resolution_default=resolution_default,
            )
            # Independent deletions and new references can each be valid on their
            # source device but incompatible after a merge. Reject before touching
            # media as well as immediately before the transactional DB restore.
            from quant.sync import validate as validate_quant
            validate_quant(merged_data)
            report('正在校验并恢复非图书媒体资源。', 58)
            # 此后会先覆盖媒体，再提交数据库并发布新指针；这些步骤必须作为一个
            # 不可中断的提交段完成，避免取消后留下媒体与数据库不一致的本地状态。
            ensure_not_aborted(should_abort)
            self.media.restore_v2_media(
                remote.get('media'),
                skip_paths=self.media.book_body_paths_from_snapshot(remote.get('data')),
            )
            with transaction.atomic():
                with suspend_tracking():
                    from system_settings.agent_world.cooking_quality_sync import metadata as cooking_metadata
                    from system_settings.agent_world.memory.sync import metadata as memory_metadata
                    from system_settings.agent_world.combat.sync import metadata as combat_metadata
                    from system_settings.agent_world.blacksmith_sync import metadata as blacksmith_metadata
                    from novel.sync import metadata as novel_metadata
                    from quant.sync import metadata as quant_metadata
                    self.apply_snapshot_data(merged_data, remote_meta={
                        **cooking_metadata(merged_data),
                        **memory_metadata(merged_data),
                        **combat_metadata(merged_data),
                        **blacksmith_metadata(merged_data),
                        **novel_metadata(merged_data),
                        **quant_metadata(merged_data),
                        **(travel_sync.metadata(merged_revisions) if travel_sync.enabled() or
                           (remote.get('meta') or {}).get(travel_sync.META_KEY) else {}),
                    }, full_overwrite=True, integrity='repair' if relax_integrity else 'strict')
                self._apply_v2_revisions(merged_revisions)
                # A three-way merge can combine independently retained histories.
                # Pruning after revision import records tombstones for every device.
                enforce_article_version_retention()
                enforce_novel_revision_retention()
            # 远端新图书的正文被刻意跳过下载；写入数据库后立即将其转为
            # 仅云端状态，确保本次同步完成后书架就能触发按需恢复。
            self.reconcile_missing_book_media()
            if relax_integrity:
                from system_settings.agent_world.sync_heal import heal_after_sync
                summary['repairs'] = heal_after_sync()
                summary['integrity_warnings'] = list(dict.fromkeys(
                    list(summary.get('integrity_warnings') or []) + list(getattr(self, '_integrity_warnings', []))
                ))
            merged_data = self.build_snapshot_data(compact_travel=True, relax_integrity=relax_integrity)
            merged_revisions = self._build_revision_manifest(merged_data)
            previous_media = remote.get('media') if not remote.get('legacy') else None
        else:
            merged_data, merged_revisions, summary = local_data, local_revisions, {
                'created': len(local_data), 'updated': 0, 'deleted': 0, 'conflicts': 0,
            }
            previous_media = None
            self.reconcile_missing_book_media(drop_missing_assets=True)
            merged_data = self.build_snapshot_data(compact_travel=True)
            merged_revisions = self._build_revision_manifest(merged_data)
        report('正在发布新的 v2 合并快照。', 75)
        if not remote:
            ensure_not_aborted(should_abort)
        snapshot = self.publish_v2_snapshot(
            source=source, runner_id=runner_id, base_snapshot_id=(remote or {}).get('meta', {}).get('snapshot_id', ''),
            previous_media=previous_media, data_list=merged_data, revisions=merged_revisions,
            report=report,
        )
        return snapshot, summary


    @farm_sync_guard
    def _raise_if_choices_needed(self, base_snapshot_id):
        remote = self.get_v2_current(relax_integrity=True) or self._get_legacy_snapshot()
        if not remote:
            return
        local_data = self.build_snapshot_data(
            compact_travel=True, relax_integrity=True, allow_exploration_review_mismatch=True,
        )
        local_revisions = self._build_revision_manifest(local_data)
        base = None
        if base_snapshot_id:
            try:
                base = self.get_v2_snapshot(base_snapshot_id, relax_integrity=True)
            except SyncError:
                base = None
        _, _, preview = self.merge_v2_data(
            base, local_data, local_revisions, remote,
            relax_integrity=True, conflicts_only=True,
        )
        if preview.get('choice_total'):
            raise SyncChoicesRequired(preview.get('choice_items') or [], preview['choice_total'])


    def sync_v2(
        self, *, source='manual', runner_id='', base_snapshot_id='', on_progress=None,
        should_abort=None, recover_owned_remote_lock=False, force_overwrite=False,
        manual_upload=False, review_conflicts=False, resolutions=None,
        resolution_default='', choices_confirmed=False,
    ):
        """自动同步默认三方合并；手动上传探测备份并在需要时请求覆盖确认。

        合并不再因农场窗口、生活摘要或居民记忆来源中断。
        review_conflicts 时先把两端都改过的记录交回用户选择。
        """
        def report(message, progress=None):
            if callable(on_progress):
                on_progress(message, progress)

        ensure_not_aborted(should_abort)
        report('正在检查远端是否已有备份。' if manual_upload else '正在比对修订清单与媒体哈希。', 8)
        if force_overwrite or manual_upload:
            if source != 'manual':
                raise SyncError('强制覆盖仅允许用于手动上传')
            return self._force_overwrite_v2(
                runner_id=runner_id,
                report=report,
                should_abort=should_abort,
                recover_owned_remote_lock=recover_owned_remote_lock,
                require_confirmation=manual_upload and not force_overwrite,
            )
        if base_snapshot_id:
            head = self._read_aligned_head(base_snapshot_id)
            if head is not None:
                if self._local_matches_head(head):
                    report('数据与媒体均未变化，已跳过全量合并与上传。', 100)
                    return self._unchanged_sync_result(head)
                return self._publish_local_delta(
                    head, source=source, runner_id=runner_id, base_snapshot_id=base_snapshot_id,
                    report=report, should_abort=should_abort, recover_owned_remote_lock=recover_owned_remote_lock,
                )

        if review_conflicts and not choices_confirmed:
            report('正在逐条对比本机与云端。', 12)
            self._raise_if_choices_needed(base_snapshot_id)

        from article.version_service import enforce_article_version_retention

        report('正在创建本机完整安全快照。', 5)
        safety_backup = self.create_local_safety_backup('before-sync', relax_integrity=True, allow_exploration_review_mismatch=True)
        enforce_article_version_retention()
        enforce_novel_revision_retention()
        report('本机安全快照已完成，正在连接远端并获取同步锁。', 18)
        ensure_not_aborted(should_abort)
        # 首次扫描不能直接作废普通媒体：远端快照可能仍有可恢复副本。
        # 在媒体恢复完成（或确认远端不存在）后再执行实际清理。
        self.reconcile_missing_book_media(drop_missing_assets=False)
        with self.remote.lock(runner_id, recover_owned_lock=recover_owned_remote_lock):
            snapshot, summary = self._merge_while_locked(
                report, base_snapshot_id=base_snapshot_id, source=source, runner_id=runner_id, should_abort=should_abort,
                relax_integrity=True, resolutions=resolutions, resolution_default=resolution_default,
            )
        return snapshot, summary, safety_backup


    def _require_empty_remote(self) -> None:
        # 只探测实际目录中的备份入口；本机上次同步状态不代表此目录有数据。
        # exists() 在部分协议中会把连接错误也返回 False，不能作为空目录的证据。
        def entries(path):
            names = self.remote.client.list_directory(path)
            if names is None:
                raise SyncError('无法读取远端目录，不能确定是否已有备份，请检查连接后重试。')
            return {str(name).rstrip('/').rsplit('/', 1)[-1] for name in names}

        self.remote.client.ensure_directory(self.remote.base_path)
        root = entries(self.remote.base_path)
        if 'data_index.json' in root or ('sync-v2' in root and 'current.json' in entries(self.remote.v2_dir)):
            raise OverwriteConfirmationRequired('当前远端目录已有备份，是否用本机快照覆盖？')


    def _force_overwrite_v2(
        self, *, runner_id, report, should_abort, recover_owned_remote_lock,
        require_confirmation=False,
    ):
        from article.version_service import enforce_article_version_retention

        if require_confirmation:
            self._require_empty_remote()
        report('正在创建本机完整安全快照。', 10)
        safety_backup = self.create_local_safety_backup(
            'before-force-upload',
            allow_exploration_review_mismatch=True,
            relax_integrity=True,
        )
        enforce_article_version_retention()
        enforce_novel_revision_retention()
        report('本机安全快照已完成，正在准备上传。', 18)
        ensure_not_aborted(should_abort)
        self.reconcile_missing_book_media(drop_missing_assets=False)

        with self.remote.lock(runner_id, recover_owned_lock=recover_owned_remote_lock):
            ensure_not_aborted(should_abort)
            if require_confirmation:
                # 安全快照生成期间可能有其他上传；持锁后重新确认，避免未经同意覆盖。
                self._require_empty_remote()
            report('已获取远端同步锁，正在生成本机完整快照。', 28)
            remote = self._get_remote_overwrite_state()
            from system_settings.agent_world.sync_heal import heal_after_sync
            try:
                repairs = heal_after_sync()
            except Exception as exc:
                repairs = [f'自动整理未完成：{exc}']
            self._integrity_warnings = []
            local_data = self.build_snapshot_data(
                compact_travel=True,
                allow_exploration_review_mismatch=True,
                relax_integrity=True,
            )
            from system_settings.agent_world.combat.sync import normalize_exploration_reviews
            try:
                local_data = normalize_exploration_reviews(local_data)
            except SyncError as exc:
                if schema_guard(exc):
                    raise
                self._integrity_warnings.append(f'探索回顾：{exc}')
            local_revisions = self._build_revision_manifest(local_data)
            remote_revisions = (remote or {}).get('revisions') or {}
            summary = self._revision_change_summary(remote_revisions, local_revisions)
            local_keys = set(local_revisions)
            summary['deleted'] += sum(
                1 for key, revision in remote_revisions.items()
                if key not in local_keys and not revision.get('deleted')
            )
            summary['force_overwrite'] = True
            summary['initial_upload'] = remote is None
            summary['unchanged'] = False
            summary['repairs'] = repairs
            summary['integrity_warnings'] = list(getattr(self, '_integrity_warnings', []))
            ensure_not_aborted(should_abort)
            report(
                '远端没有备份，正在首次上传本机快照。' if remote is None
                else '已确认覆盖，正在将本机快照发布为远端当前版本。',
                75,
            )
            snapshot = self.publish_v2_snapshot(
                source='manual-force-overwrite',
                runner_id=runner_id,
                base_snapshot_id=((remote or {}).get('meta') or {}).get('snapshot_id', ''),
                previous_media=(remote or {}).get('media'),
                data_list=local_data,
                revisions=local_revisions,
                report=report,
            )
        return snapshot, summary, safety_backup


    @farm_sync_guard
    @novel_sync_guard
    @learning_sync_guard
    @quant_sync_guard
    def force_download_v2(
        self, *, runner_id='', on_progress=None, should_abort=None, recover_owned_remote_lock=False,
    ):
        """用远端当前快照覆盖本机。领域完整性不拦截恢复，写入后尽力整理。"""

        def report(message, progress=None):
            if callable(on_progress):
                on_progress(message, progress)

        ensure_not_aborted(should_abort)
        report('正在读取云端快照。', 8)
        remote = self.get_v2_current(relax_integrity=True) or self._get_legacy_snapshot()
        if not remote or not isinstance(remote.get('data'), list):
            raise SyncError('远端没有可下载的快照。请先在有数据的设备上传。')
        self.validate_remote_snapshot_version(remote.get('meta') or {})
        report('正在创建本机完整安全快照。', 12)
        safety_backup = self.create_local_safety_backup(
            'before-force-download',
            allow_exploration_review_mismatch=True,
            relax_integrity=True,
        )
        ensure_not_aborted(should_abort)
        with self.remote.lock(runner_id, recover_owned_lock=recover_owned_remote_lock):
            report('正在把云端快照写入本机。', 40)
            ensure_not_aborted(should_abort)
            self.media.restore_v2_media(
                remote.get('media'),
                skip_paths=self.media.book_body_paths_from_snapshot(remote.get('data')),
            )
            with transaction.atomic():
                with suspend_tracking():
                    count = self.apply_snapshot_data(
                        remote.get('data') or [],
                        remote_meta=remote.get('meta'),
                        full_overwrite=True,
                        should_abort=should_abort,
                        integrity='repair',
                    )
                    if remote.get('revisions'):
                        self._apply_v2_revisions(remote['revisions'])
            from system_settings.agent_world.sync_heal import heal_after_sync
            repairs = heal_after_sync()
        summary = {
            'force_overwrite': True,
            'direction': 'download',
            'created': 0,
            'updated': count,
            'deleted': 0,
            'conflicts': 0,
            'unchanged': False,
            'repairs': repairs,
            'integrity_warnings': list(getattr(self, '_integrity_warnings', [])),
        }
        report('云端快照已覆盖本机。', 100)
        return {'meta': remote.get('meta') or {}, 'data': remote.get('data') or []}, summary, safety_backup


    @farm_sync_guard
    @novel_sync_guard
    @learning_sync_guard
    @quant_sync_guard
    def restore_v2_snapshot(self, snapshot_id, *, runner_id=''):
        from article.version_service import enforce_article_version_retention

        safety_backup = self.create_local_safety_backup('before-restore')
        with self.remote.lock(runner_id):
            snapshot = self.get_v2_snapshot(snapshot_id)
            self.media.restore_v2_media(snapshot.get('media'))
            with transaction.atomic():
                with suspend_tracking():
                    self.apply_snapshot_data(snapshot['data'], remote_meta=snapshot['meta'], full_overwrite=True)
                self._apply_v2_revisions(snapshot['revisions'])
                enforce_article_version_retention()
                enforce_novel_revision_retention()
                # Restore may normalize legacy fields, close sessions or prune versions.
                # Publish that resulting state with matching hashes, not the original payload.
                restored_data = self.build_snapshot_data(compact_travel=True)
                restored_revisions = self._build_revision_manifest(restored_data)
            restored = self.publish_v2_snapshot(
                source='history-restore', runner_id=runner_id, base_snapshot_id=snapshot_id,
                previous_media=snapshot.get('media'), data_list=restored_data, revisions=restored_revisions,
            )
        return restored, safety_backup
