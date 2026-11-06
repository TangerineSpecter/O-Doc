"""Bounded per-process queue. Only the worker thread writes diagnostic data."""
import atexit
import json
import logging
import os
import queue
import threading
import time
import uuid

from .metrics import DEFAULT_POLICY

logger = logging.getLogger(__name__)
_policy = {**DEFAULT_POLICY, 'version': 1, 'generation': 1}
_build = None
_queue = queue.Queue(maxsize=2048)
_lock = threading.Lock()
_bytes = 0
_pid = None
_runtime_server = False
_thread = None
_stop = threading.Event()
_wake = threading.Event()
_health = dict(dropped=0, discarded_samples=0, failed_batches=0, last_flush=None, error=None, queue_size=0)
_live = {}


def track(event):
    with _lock:
        if len(_live) < 128:
            _live[event['id']] = event


def untrack(identity):
    with _lock:
        _live.pop(identity, None)


def live_snapshot():
    with _lock:
        return [{key: event.get(key) for key in ('id', 'root_id', 'kind', 'operation', 'started', 'generation', 'sql_count', 'sql_ms')}
                for event in _live.values() if not event.get('finished')]


def policy():
    if _runtime_server and _pid != os.getpid():
        start()
    return dict(_policy)


def build():
    global _build
    if _build is None:
        from .safety import build_identity
        _build = build_identity()
    return _build


def configure(value):
    global _policy
    _policy = {**DEFAULT_POLICY, **value}


def health():
    return {**_health, 'queue_size': _queue.qsize(), 'process_id': os.getpid()}


def submit(event):
    global _bytes
    try:
        raw = json.dumps(event, ensure_ascii=True, allow_nan=False).encode()
        if len(raw) > 65536:
            event = {**event, 'children': [], 'truncated': event.get('truncated', 0) + len(event.get('children', []))}
            raw = json.dumps(event, ensure_ascii=True, allow_nan=False).encode()
        with _lock:
            if _bytes + len(raw) > 8 * 1024 * 1024 or len(raw) > 65536:
                _health['dropped'] += 1
                return
            _queue.put_nowait((raw, len(raw)))
            _bytes += len(raw)
            if _queue.qsize() >= 200:
                _wake.set()
    except (queue.Full, ValueError, TypeError):
        _health['dropped'] += 1


def _take():
    global _bytes
    rows = []
    with _lock:
        for _ in range(200):
            try:
                raw, size = _queue.get_nowait()
            except queue.Empty:
                break
            _bytes -= size
            rows.append(json.loads(raw))
        if _queue.empty():
            _wake.clear()
    return rows


def _record_failure(stage, exc):
    from .failures import error_kind
    kind = error_kind(exc)
    count = _health.get(f'{stage}_errors', 0) + 1
    _health[f'{stage}_errors'] = count
    _health[f'{stage}_error'] = kind
    if count == 1 or count % 12 == 0:
        logger.warning('Performance %s failed (%s)', stage, kind)
    return kind


def _notice():
    labels = {'policy': '采集策略刷新', 'write': '性能批次写入', 'maintenance': '性能数据维护',
              'heartbeat': '在途心跳更新', 'database': '数据库统计采样', 'worker': '采集线程内部操作'}
    for stage, label in labels.items():
        if _health.get(f'{stage}_error'):
            return f"{label}暂未成功（{_health[stage + '_error']}），请查看对应阶段状态"
    if _policy.get('capacity', {}).get('limited'):
        return '性能容量预算不足：已限制新明细，必要时跳过新批次；正在分批清理'
    if _health.get('discarded_samples'):
        return f"本进程曾因容量控制跳过 {_health['discarded_samples']} 条诊断样本；当前统计不代表完整明细"
    return None


def _write_batch(rows, persist, connections):
    from .failures import error_kind, TRANSIENT
    batch_id = uuid.uuid4().hex
    for attempt in range(3):
        try:
            return persist(rows, batch_id) or {}
        except Exception as exc:
            connections.close_all()
            if attempt == 2 or error_kind(exc) not in TRANSIENT | {'connection_unavailable'}:
                raise
            _stop.wait(.1 * (attempt + 1))


def _run():
    from django.db import close_old_connections, connections
    from .instrumentation import MUTED
    from .storage import load_policy, persist, maintain, checkpoint_inflight
    from .database import sample_database
    from .failures import TRANSIENT
    token = MUTED.set(True)
    last_maintenance = last_policy = last_checkpoint = last_database = float('-inf')
    maintenance_retry = 0
    try:
        while not _stop.is_set():
            failed = False
            try:
                close_old_connections()
                now = time.monotonic()
                if now - last_policy >= 5:
                    last_policy = now
                    try:
                        configure(load_policy())
                        _health['policy_error'] = None
                        _health['consecutive_policy_failures'] = 0
                    except Exception as exc:
                        kind = _record_failure('policy', exc)
                        streak = _health.get('consecutive_policy_failures', 0) + 1
                        _health['consecutive_policy_failures'] = streak
                        if streak >= 3 and kind not in TRANSIENT:
                            configure({**_policy, 'enabled': False})
                        failed = True
                rows = _take()
                if rows:
                    try:
                        result = _write_batch(rows, persist, connections)
                        _health['dropped'] += result.get('rejected_events', 0)
                        _health['discarded_samples'] += result.get('discarded_samples', 0)
                        if result.get('capacity'):
                            configure({**_policy, 'capacity': result['capacity']})
                        _health['last_flush'] = time.time()
                        _health['write_error'] = None
                        _health['consecutive_write_failures'] = 0
                    except Exception as exc:
                        kind = _record_failure('write', exc)
                        _health['failed_batches'] += 1
                        _health['dropped'] += len(rows)
                        streak = _health.get('consecutive_write_failures', 0) + 1
                        _health['consecutive_write_failures'] = streak
                        if streak >= 3 and kind not in TRANSIENT:
                            configure({**_policy, 'enabled': False})
                        failed = True
                if now - last_checkpoint >= 5:
                    last_checkpoint = now
                    live = live_snapshot()
                    try:
                        if live:
                            checkpoint_inflight(live)
                        _health['heartbeat_error'] = None
                    except Exception as exc:
                        _record_failure('heartbeat', exc)
                if now >= maintenance_retry and (now - last_maintenance >= 60 or _policy.get('capacity', {}).get('limited')):
                    try:
                        capacity = maintain()
                        configure({**_policy, 'capacity': capacity})
                        last_maintenance = time.monotonic()
                        _health['maintenance_error'] = None
                    except Exception as exc:
                        _record_failure('maintenance', exc)
                        maintenance_retry = time.monotonic() + 5
                if _policy['enabled'] and now - last_database >= 60:
                    last_database = now
                    try:
                        sample_database()
                        _health['database_error'] = None
                    except Exception as exc:
                        _record_failure('database', exc)
                _health['worker_error'] = None
            except Exception as exc:
                _record_failure('worker', exc)
                failed = True
            finally:
                _health['error'] = _notice()
                connections.close_all()
            if failed:
                _stop.wait(5)
            elif _queue.empty():
                _wake.wait(max(0, min(5, last_policy + 5 - time.monotonic())))
        try:
            remaining = _take()
            if remaining:
                _write_batch(remaining, persist, connections)
        except Exception as exc:
            _record_failure('write', exc)
            _health['error'] = '退出时仍有未保存的性能记录'
    finally:
        connections.close_all()
        MUTED.reset(token)


def stop():
    _stop.set()
    _wake.set()
    if _thread is not None and _thread is not threading.current_thread():
        _thread.join(timeout=2)


def start():
    global _pid, _queue, _lock, _stop, _wake, _bytes, _live, _runtime_server, _thread
    if _pid == os.getpid():
        return
    _pid = os.getpid()
    _runtime_server = True
    _queue, _lock, _stop, _bytes = queue.Queue(maxsize=2048), threading.Lock(), threading.Event(), 0
    _wake = threading.Event()
    _live = {}
    _thread = threading.Thread(target=_run, daemon=True, name='performance-writer')
    _thread.start()
    atexit.register(stop)


if hasattr(os, 'register_at_fork'):
    os.register_at_fork(after_in_child=lambda: globals().update(_pid=None))
