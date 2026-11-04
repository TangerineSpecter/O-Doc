"""Use a consistent view when combining daily contributions and raw facts."""
from contextlib import contextmanager

from django.db import connection, transaction


@contextmanager
def analytics_snapshot():
    # An enclosing transaction may already have executed queries, so its
    # isolation level cannot safely be changed. Keep the local cleanup gate
    # across the raw/archive read so a committed cleanup cannot split it.
    if connection.vendor != 'postgresql' or connection.in_atomic_block or not connection.get_autocommit():
        from ..farm_gate import farm_gate
        with farm_gate():
            yield False
        return
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        yield True
