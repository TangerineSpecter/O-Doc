"""Fail-open, bounded asynchronous collection and conservative diagnostic sanitization."""
import logging
import os
import queue
import re
import sys
import threading
import time
import traceback
import uuid
from contextvars import ContextVar
from django.conf import settings

request_context = ContextVar('system_log_context', default={})
_lock = threading.Lock()
_queue = None
_pid = None
_thread = None
_dropped = 0
_sensitive = re.compile(r'(?i)(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|cookie)([\s\"\x27:=]+)([^\s,;}]+)')


def sanitize(value, limit=4000):
    text = str(value)
    text = re.sub(r'(?i)\b(Bearer|Token)\s+[^\s,;]+', r'\1 [REDACTED]', text)
    text = re.sub(r'\bsk-[\w-]+', '[REDACTED]', text)
    text = re.sub(r'(https?://)[^/\s:@]+:[^/\s@]+@', r'\1[REDACTED]@', text)
    text = _sensitive.sub(r'\1=[REDACTED]', text)
    text = re.sub(r'(https?://[^\s?]+)\?[^\s]+', r'\1?[REDACTED]', text)
    return text[:limit]


def exception_metadata(exc):
    name = type(exc).__name__
    original = exc
    visited = {id(original)}
    while getattr(original, '__cause__', None) is not None and id(original.__cause__) not in visited:
        original = original.__cause__
        visited.add(id(original))
    status = getattr(original, 'status_code', None) or getattr(exc, 'status_code', None)
    if getattr(original, 'response', None) is not None:
        status = original.response.status_code
    name = type(original).__name__
    body = getattr(original, 'body', None)
    body = body.get('error', body) if isinstance(body, dict) else {}
    code = body.get('code') if isinstance(body, dict) else None
    safe_code = str(code)[:80] if isinstance(code, (str, int)) else ''
    kind = ('timeout' if isinstance(exc, TimeoutError) or 'timeout' in name.lower() else
            'authentication' if status == 401 else 'rate_limit' if status == 429 else
            'connection' if 'connection' in name.lower() else f'http_{status}' if status else name)
    if safe_code.lower() in {'insufficient_balance', 'balance_not_enough', 'insufficient_quota', 'credit_balance_too_low'}:
        kind = 'insufficient_balance' if safe_code.lower() != 'insufficient_quota' else 'insufficient_quota'
    # Do not serialize exception messages: providers can echo prompts, bodies and credentials.
    stack = '\n'.join(f'{frame.filename}:{frame.lineno} in {frame.name}' for frame in traceback.extract_tb(exc.__traceback__))
    return {'error_type': kind, 'exception_class': name, 'http_status': status,
            'provider_http_status': status if getattr(original, 'response', None) is not None else None,
            'provider_code': sanitize(safe_code, 80),
            'reason': {'timeout': '连接、读取或调用时限超时', 'connection': '无法建立模型服务连接',
                       'authentication': '模型服务拒绝认证', 'rate_limit': '模型服务限流',
                       'insufficient_balance': '提供商明确返回余额不足', 'insufficient_quota': '提供商明确返回额度不足'}.get(kind, f'HTTP {status}' if status else name),
            'stack': sanitize(stack, 12000)}


def _fallback():
    try:
        sys.stderr.write('[system logs] diagnostic persistence unavailable; capture interrupted\n')
    except Exception:
        pass  # A broken stderr must not change the business result either.


def _worker(inbox):
    global _dropped
    from . import store
    lost = 0
    while True:
        try:
            event = inbox.get(timeout=60)
        except queue.Empty:
            try:
                store.maintain()
            except Exception:
                if not lost:
                    _fallback()
                lost += 1
            continue
        try:
            store.write(event)
            with _lock:
                lost += _dropped
                _dropped = 0
            if lost:
                store.write({'id': uuid.uuid4().hex, 'created': time.time(), 'module': 'system_logs',
                             'title': '日志采集曾中断，现已恢复', 'error_type': 'capture_interrupted', 'lost_events': lost})
                lost = 0
        except Exception:
            if not lost:
                _fallback()
            lost += 1
        finally:
            inbox.task_done()


def start():
    global _queue, _pid, _thread, _dropped
    with _lock:
        if _pid != os.getpid() or _thread is None or not _thread.is_alive():
            _dropped = 0
            _queue = queue.Queue(maxsize=512)
            _pid = os.getpid()
            _thread = threading.Thread(target=_worker, args=(_queue,), name='system-log-writer', daemon=True)
            _thread.start()
    return _queue


def capture(title, module='backend', exc=None, **metadata):
    if not getattr(settings, 'SYSTEM_LOG_ENABLED', True):
        return
    if exc is not None and (getattr(exc, 'status', None) == 499 or type(exc).__name__ in {'CancelledError', 'CanceledError'}):
        return
    try:
        context = {key: value for key, value in request_context.get().items() if key != 'exclude'}
        event = {**context, **metadata, 'id': uuid.uuid4().hex, 'created': time.time(),
                 'title': sanitize(title, 200), 'module': sanitize(module, 100), 'source': metadata.get('source', 'backend'), 'error_type': 'system_error'}
        if exc is not None:
            event.update(exception_metadata(exc))
        else:
            event['error_type'] = sanitize(metadata.get('error_type', 'system_error'), 100)
        if event['module'] == 'ai' or event.get('model_name'):
            event['title'] = sanitize(f"大模型调用失败 · {event.get('model_name') or event.get('provider_name') or '模型'} · {event['error_type']}", 200)
        elif event.get('path'):
            event['title'] = sanitize(f"{title} · {event.get('operation', '')} {event['path']}", 200)
        # All metadata must come from explicit diagnostic fields, never request payloads.
        event = {k: sanitize(v, 12000 if k == 'stack' else 1000) if isinstance(v, str) else v for k, v in event.items()}
        origin = exc
        seen = set()
        while origin is not None and id(origin) not in seen:
            seen.add(id(origin))
            known = getattr(origin, '_system_log_fault_key', None)
            if known and not metadata.get('attempt'):
                event['fault_key'] = known
                break
            origin = getattr(origin, '__cause__', None) or getattr(origin, '__context__', None)
        if not event.get('fault_key'):
            request_id = event.get('request_id')
            if event.get('model_request_id'):
                event['fault_key'] = f"model-request:{event['model_request_id']}"
            elif event.get('model_call_id'):
                event['fault_key'] = f"model-call:{event['model_call_id']}:{event.get('attempt', 0)}"
            else:
                event['fault_key'] = f"{request_id}:{event.get('attempt', 0)}" if request_id else event['id']
        if exc is not None:
            try:
                exc._system_log_fault_key = event['fault_key']
            except Exception:
                pass  # Some foreign exception classes do not allow attributes.
        start().put_nowait(event)
    except queue.Full:
        global _dropped
        with _lock:
            _dropped += 1
            first_drop = _dropped == 1
        if first_drop:
            _fallback()
    except Exception:
        _fallback()


def flush():
    if _queue is not None:
        _queue.join()


class DiagnosticHandler(logging.Handler):
    def emit(self, record):
        if record.name.startswith('system_logs') or request_context.get().get('exclude'):
            return
        exc = record.exc_info[1] if record.exc_info else None
        # A caught exception may be logged without exc_info. Obtain it before formatting loses it.
        exc = exc or sys.exc_info()[1]
        title = f'{record.name}：异常' if exc else f'{record.name}：错误'
        capture(title, module=request_context.get().get('module') or record.name.split('.')[0], exc=exc,
                logger=record.name, operation=request_context.get().get('operation', record.funcName))


def _after_fork():
    global _lock, _queue, _pid, _thread, _dropped
    _lock = threading.Lock()
    _queue = None
    _pid = None
    _thread = None
    _dropped = 0


if hasattr(os, 'register_at_fork'):
    os.register_at_fork(after_in_child=_after_fork)
