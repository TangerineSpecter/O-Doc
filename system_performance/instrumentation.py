"""Context-local operations; no business arguments or response bodies retained."""
import time
import uuid
from contextlib import ExitStack, contextmanager
from contextvars import ContextVar
from functools import wraps

from . import collector
from .safety import location, sql_identity

CURRENT = ContextVar('performance_operation', default=None)
MUTED = ContextVar('performance_muted', default=False)


def append(parent: dict, event: dict) -> None:
    if len(parent['children']) < 100:
        parent['children'].append(event)
    else:
        parent['truncated'] += 1
    if event['slow'] or event['status'] in {'failed', 'timeout'} or event.get('interesting'):
        parent['interesting'] = True


def sql_wrapper(execute, sql, params, many, context):
    parent = CURRENT.get()
    if parent is None or MUTED.get():
        return execute(sql, params, many, context)
    started, status = time.monotonic(), 'success'
    try:
        return execute(sql, params, many, context)
    except BaseException:
        status = 'failed'
        raise
    finally:
        elapsed = (time.monotonic() - started) * 1000
        config = collector.policy()
        identity = sql_identity(sql)
        seen = parent.setdefault('_sql_sources', set())
        capture_source = elapsed >= config['sql_ms'] or identity['fingerprint'] not in seen and len(seen) < 16
        if len(seen) < 16:
            seen.add(identity['fingerprint'])
        event = dict(id=uuid.uuid4().hex, root_id=parent['root_id'], parent_id=parent['id'],
                     started=time.time() - elapsed / 1000, duration_ms=elapsed, kind='sql',
                     operation=f"{identity['statement']} {identity['fingerprint'][:16]}", status=status,
                     slow=elapsed >= config['sql_ms'], sql_count=0, sql_ms=0,
                     policy_version=config['version'], generation=parent['generation'],
                     build=parent['build'], sql=identity, many=bool(many), source=location() if capture_source else [])
        for key in ('request_id', 'model_call_id', 'model_request_id'):
            if parent.get(key):
                event[key] = parent[key]
        node = parent
        while node:
            node['sql_count'] += 1
            node['sql_ms'] += elapsed
            node = node.get('_parent')
        append(parent, event)
        collector.submit(event)


def open_operation(kind: str, name: str, **safe_fields) -> dict | None:
    if MUTED.get() or not collector.policy()['enabled']:
        return None
    parent = CURRENT.get()
    config = collector.policy()
    identity = uuid.uuid4().hex
    from system_logs.capture import request_context
    diagnostic = request_context.get()
    for key in ('request_id', 'model_call_id', 'model_request_id'):
        if diagnostic.get(key) and key not in safe_fields:
            safe_fields[key] = diagnostic[key]
    for key in ('model_name', 'provider_name'):
        value = diagnostic.get(key)
        if isinstance(value, str) and 0 < len(value) <= 100 and '://' not in value and '\n' not in value:
            safe_fields[key] = value
    event = dict(id=identity, root_id=parent['root_id'] if parent else identity,
                 parent_id=parent['id'] if parent else None, started=time.time(),
                 kind=kind, operation=name[:240], status='success', duration_ms=0,
                 sql_count=0, sql_ms=0, children=[], truncated=0, interesting=False,
                 generation=config['generation'], policy_version=config['version'],
                 build=collector.build(), source=location(), **safe_fields)
    event['_parent'] = parent
    event['_clock'] = time.monotonic()
    if kind in {'request', 'task', 'ai'}:
        collector.track(event)
    return event


def finish(event: dict | None, status='success') -> None:
    if event is None or event.get('finished'):
        return
    event['finished'] = True
    collector.untrack(event['id'])
    elapsed = (time.monotonic() - event['_clock']) * 1000
    config = collector.policy()
    event.update(duration_ms=elapsed, status=status, ended=time.time())
    if status == 'success' and event.get('http_status', 0) >= 500:
        event['status'] = 'failed'
    # All results are classified using the recorded, cached policy snapshot at completion.
    event['policy_version'] = config['version']
    threshold = config.get(f"{event['kind']}_ms", config['task_ms'])
    event['slow'] = elapsed >= threshold or (event.get('first_output_ms') or 0) >= config['first_output_ms']
    event['slow'] |= (event.get('first_chunk_ms') or 0) >= config['first_chunk_ms']
    if event['kind'] in {'request', 'stream', 'task'}:
        event['slow'] |= event['sql_count'] >= config['sql_count'] or event['sql_ms'] >= config['sql_total_ms']
    parent = event.pop('_parent')
    event.pop('_clock')
    event.pop('_sql_sources', None)
    if parent:
        append(parent, {key: value for key, value in event.items() if key != 'children'})
        for child in event.get('children', []):
            append(parent, child)
    collector.submit(event)


@contextmanager
def active(event):
    if event is None:
        yield
        return
    from django.db import connections
    parent = CURRENT.get()
    token = CURRENT.set(event)
    try:
        with ExitStack() as stack:
            if parent is None:
                for alias in connections:
                    stack.enter_context(connections[alias].execute_wrapper(sql_wrapper))
            yield
    finally:
        CURRENT.reset(token)


@contextmanager
def operation(kind: str, name: str, **safe_fields):
    event = open_operation(kind, name, **safe_fields)
    status = 'success'
    try:
        with active(event):
            yield event
    except BaseException as exc:
        status = outcome(exc)
        if event is not None and getattr(exc, '_system_log_fault_key', None):
            event['fault_key'] = exc._system_log_fault_key
        raise
    finally:
        finish(event, status)


def outcome(exc) -> str:
    if getattr(exc, 'expected_tool_stop', False):
        return 'success'
    if isinstance(exc, GeneratorExit) or type(exc).__name__ in {'CancelledError', 'CanceledError'} or getattr(exc, 'status', None) == 499:
        return 'cancelled'
    return 'timeout' if isinstance(exc, TimeoutError) or 'Timeout' in type(exc).__name__ else 'failed'


def monitored_task(name):
    def decorate(function):
        @wraps(function)
        def call(*args, **kwargs):
            with operation('task', name):
                return function(*args, **kwargs)
        return call
    return decorate
