"""A small PostgreSQL-only index for the retained kill-receipt query.

The index is intentionally database-only: JSON containment in a partial-index
predicate is PostgreSQL-specific, and the underlying business data is
unchanged. A non-atomic migration allows index creation without blocking normal
writes for the duration of the build.
"""
import logging
from contextlib import contextmanager

from django.db import migrations


INDEX_NAME = 'odoc_combat_kill_owner_event'
TABLE_NAME = 'system_settings_combatfact'
LOCK_NAMESPACE = 0x4F444F43
LOCK_KEY = 100
KEYS = ('owner_id', "((payload ->> 'shared_event_id'::text))")
PREDICATE = "(((kind)::text = 'round'::text) AND (payload @> '{\"events\": [{\"kind\": \"kill\"}]}'::jsonb))"

logger = logging.getLogger(__name__)


@contextmanager
def migration_lock(cursor):
    # A session lock works with CONCURRENTLY, which cannot run in a transaction.
    cursor.execute('SELECT pg_try_advisory_lock(%s, %s)', [LOCK_NAMESPACE, LOCK_KEY])
    if not cursor.fetchone()[0]:
        raise RuntimeError('战斗击杀索引迁移正在另一个进程中执行，请稍后重试')
    try:
        yield
    finally:
        try:
            cursor.execute('SELECT pg_advisory_unlock(%s, %s)', [LOCK_NAMESPACE, LOCK_KEY])
        except Exception:
            # If the connection was lost, PostgreSQL releases the session lock.
            # Do not replace an index creation error with an unlock error.
            logger.exception('释放战斗击杀索引迁移锁失败')


def index_status(cursor):
    cursor.execute("""
        SELECT ns.nspname, idx.oid, i.indisvalid, i.indisready,
               i.indrelid = tab.oid, i.indisunique, i.indisprimary, i.indisexclusion,
               i.indnkeyatts, i.indnatts, am.amname,
               pg_get_indexdef(i.indexrelid, 1, false), pg_get_indexdef(i.indexrelid, 2, false),
               pg_get_expr(i.indpred, i.indrelid, false),
               EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = idx.oid)
        FROM pg_class tab
        JOIN pg_namespace ns ON ns.oid = tab.relnamespace
        LEFT JOIN pg_class idx ON idx.relnamespace = ns.oid AND idx.relname = %s
        LEFT JOIN pg_index i ON i.indexrelid = idx.oid
        LEFT JOIN pg_am am ON am.oid = idx.relam
        WHERE tab.oid = to_regclass(%s)
    """, [INDEX_NAME, TABLE_NAME])
    row = cursor.fetchone()
    if row is None:
        raise RuntimeError('战斗事实表不存在，无法创建击杀索引')
    names = ('schema', 'oid', 'valid', 'ready', 'same_table', 'unique', 'primary', 'exclusion',
             'key_count', 'column_count', 'method', 'key1', 'key2', 'predicate', 'constraint')
    return dict(zip(names, row))


def expected_index(status):
    return (status['same_table'] is True and status['unique'] is False and status['primary'] is False
            and status['exclusion'] is False and not status['constraint'] and status['key_count'] == 2
            and status['column_count'] == 2 and status['method'] == 'btree'
            and (status['key1'], status['key2']) == KEYS and status['predicate'] == PREDICATE)


def ensure_no_concurrent_maintenance(cursor):
    # Existing builds hold this table lock until completion. This also fails
    # closed for VACUUM/ANALYZE rather than guessing an invalid index is stale.
    cursor.execute("""
        SELECT EXISTS (
            SELECT 1 FROM pg_locks
            WHERE locktype = 'relation' AND relation = to_regclass(%s)
              AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
              AND mode = 'ShareUpdateExclusiveLock' AND granted AND pid <> pg_backend_pid()
        )
    """, [TABLE_NAME])
    if cursor.fetchone()[0]:
        raise RuntimeError('战斗事实表正在进行并发索引或维护操作，请稍后重试迁移')


def drop_expected_index(cursor, schema_editor, status, *, skip_if_now_valid=False):
    if not expected_index(status):
        raise RuntimeError('战斗击杀索引同名对象的表或定义不匹配，请检查后处理；未删除对象')
    ensure_no_concurrent_maintenance(cursor)
    current = index_status(cursor)
    if current['oid'] != status['oid'] or not expected_index(current):
        raise RuntimeError('战斗击杀索引在迁移期间发生变化，请检查后重试；未删除对象')
    if skip_if_now_valid and current['valid']:
        if current['ready']:
            return False
        raise RuntimeError('战斗击杀索引状态异常，请检查后重试迁移')
    qualified = f"{schema_editor.quote_name(status['schema'])}.{schema_editor.quote_name(INDEX_NAME)}"
    cursor.execute(f'DROP INDEX CONCURRENTLY {qualified}')
    return True


def create_index(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        with migration_lock(cursor):
            status = index_status(cursor)
            if status['oid'] is not None:
                if not expected_index(status):
                    raise RuntimeError('战斗击杀索引同名对象的表或定义不匹配，请检查后处理；未删除对象')
                if status['valid'] and status['ready']:
                    return
                if status['valid']:
                    raise RuntimeError('战斗击杀索引状态异常，请检查后重试迁移')
                if not drop_expected_index(cursor, schema_editor, status, skip_if_now_valid=True):
                    return
            table = f"{schema_editor.quote_name(status['schema'])}.{schema_editor.quote_name(TABLE_NAME)}"
            name = schema_editor.quote_name(INDEX_NAME)
            cursor.execute(f"""
                CREATE INDEX CONCURRENTLY {name}
                ON {table} (owner_id, (payload->>'shared_event_id'))
                WHERE kind = 'round' AND payload @> '{{"events":[{{"kind":"kill"}}]}}'::jsonb
            """)
            status = index_status(cursor)
            if not (status['valid'] and status['ready'] and expected_index(status)):
                raise RuntimeError('战斗击杀索引创建不完整或定义不匹配，请检查后重试迁移')


def remove_index(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        with schema_editor.connection.cursor() as cursor:
            with migration_lock(cursor):
                status = index_status(cursor)
                if status['oid'] is not None:
                    drop_expected_index(cursor, schema_editor, status)


class Migration(migrations.Migration):
    atomic = False
    dependencies = [('system_settings', '0099_fishing_daily')]
    operations = [migrations.RunPython(create_index, remove_index, atomic=False)]
