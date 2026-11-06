"""Safe error categories; never retain exception messages or SQL parameters."""
from django.db import InterfaceError, OperationalError

TRANSIENT = {'lock_contention', 'transaction_retry', 'query_timeout'}


def error_kind(exc):
    seen = set()
    current = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        state = getattr(current, 'sqlstate', None) or getattr(current, 'pgcode', None)
        if state == '55P03':
            return 'lock_contention'
        if state in {'40001', '40P01'}:
            return 'transaction_retry'
        if state == '57014':
            return 'query_timeout'
        if state in {'42P01', '42703'}:
            return 'schema_unavailable'
        if state and str(state).startswith('08'):
            return 'connection_unavailable'
        if state == '42501' or state and str(state).startswith('28'):
            return 'permission_denied'
        current = getattr(current, '__cause__', None) or getattr(current, '__context__', None)
    if isinstance(exc, (InterfaceError, OperationalError, ConnectionError)):
        return 'connection_unavailable'
    return 'internal_error'
