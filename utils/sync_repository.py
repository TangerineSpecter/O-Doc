"""Remote storage operations without ORM or database restore side effects."""

from __future__ import annotations

import json
import os
import tempfile
from contextlib import contextmanager
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from system_settings.sync_state import get_device_id
from .sync_policy import SyncError

class SnapshotRepository:
    """Remote immutable files, history retention and atomic directory leases."""

    def __init__(self, storage_client=None, remote_base_path='', *, snapshot_format=2, retention=10, lock_ttl_seconds=7200):
        self.snapshot_format = snapshot_format
        self.retention = retention
        self.lock_ttl_seconds = lock_ttl_seconds
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


    def write_json(self, payload, remote_path):
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


    def read_json(self, remote_path, required=False):
        content = self.client.get_file_content(remote_path)
        if not content:
            if required:
                raise SyncError(f'远端快照缺少文件：{remote_path}')
            return None
        try:
            return json.loads(content)
        except json.JSONDecodeError as exc:
            raise SyncError(f'远端快照 JSON 损坏：{remote_path}：{exc}')


    def snapshot_path(self, snapshot_id, filename):
        return f'{self.v2_snapshots_dir}/{snapshot_id}/{filename}'


    def list_history(self):
        entries = self.client.list_directory(self.v2_snapshots_dir) or []
        history = []
        for snapshot_id in entries:
            try:
                meta = self.read_json(self.snapshot_path(snapshot_id, 'snapshot_meta.json'))
            except SyncError:
                continue
            if meta and meta.get('format') == self.snapshot_format:
                history.append(meta)
        return sorted(history, key=lambda item: item.get('generated_at', ''), reverse=True)


    def trim_history(self):
        history = self.list_history()
        pointer = self.read_json(self.v2_current_file) or {}
        current_id = pointer.get('snapshot_id')
        retained = history[:self.retention]
        retained_ids = {meta.get('snapshot_id') for meta in retained}
        if current_id and current_id not in retained_ids:
            current_meta = next((meta for meta in history if meta.get('snapshot_id') == current_id), None)
            if current_meta:
                retained = retained[:-1] + [current_meta]
                retained_ids = {meta.get('snapshot_id') for meta in retained}
        for meta in history:
            snapshot_id = meta.get('snapshot_id')
            if snapshot_id and snapshot_id not in retained_ids:
                self.delete_tree(f'{self.v2_snapshots_dir}/{snapshot_id}')
        self.collect_unreferenced_blobs()


    def delete_tree(self, remote_path):
        """协议客户端没有统一的递归删除能力时，安全地限定在指定快照目录内递归。"""
        if self.client.is_directory(remote_path):
            entries = self.client.list_directory(remote_path)
            if entries is not None:
                for name in entries:
                    self.delete_tree(f"{remote_path.rstrip('/')}/{name}")
        return self.client.delete_path(remote_path)


    @contextmanager
    def lock(self, runner_id='', recover_owned_lock=False):
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
            lock_meta = self.read_json(f'{lock_dir}/lock.json') or {}
            # 仅处理“本机明确终止、随后重启后遗留”的锁：调用方必须显式授权恢复，
            # 且远端 lock.json 的设备标识必须与本机一致，绝不清理其他设备的锁。
            matching_runner = (
                recover_owned_lock is True
                or (isinstance(recover_owned_lock, str) and lock_meta.get('runner_id') == recover_owned_lock)
            )
            if recover_owned_lock and matching_runner and lock_meta.get('device_id') == get_device_id():
                self.delete_tree(lock_dir)
                acquired = create(lock_dir)
            started_at = parse_datetime(str(lock_meta.get('started_at') or ''))
            if started_at and timezone.is_naive(started_at):
                started_at = timezone.make_aware(started_at, timezone.get_current_timezone())
            now = timezone.now()
            if started_at and timezone.is_aware(started_at) and timezone.is_naive(now):
                now = timezone.make_aware(now, timezone.get_current_timezone())
            if not acquired and started_at and (now - started_at).total_seconds() > self.lock_ttl_seconds:
                self.delete_tree(lock_dir)
                acquired = create(lock_dir)
        if not acquired:
            raise SyncError('另一台设备正在同步，请稍后重试')
        try:
            self.write_json({
                'runner_id': runner_id,
                'device_id': get_device_id(),
                'started_at': timezone.now().isoformat(),
            }, f'{lock_dir}/lock.json')
            yield
        finally:
            self.delete_tree(lock_dir)


    def collect_unreferenced_blobs(self):
        """只回收已不被保留快照引用的 blob，历史恢复始终有完整媒体可用。"""
        referenced = set()
        for meta in self.list_history():
            snapshot_id = meta.get('snapshot_id')
            if not snapshot_id:
                continue
            manifest = self.read_json(self.snapshot_path(snapshot_id, 'media_manifest.json')) or {}
            referenced.update(
                entry.get('hash') for entry in manifest.values()
                if entry.get('hash') and not entry.get('legacy_path')
            )
        for digest in self.client.list_directory(self.v2_blobs_dir) or []:
            if digest not in referenced:
                self.client.delete_path(f'{self.v2_blobs_dir}/{digest}')
