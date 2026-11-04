"""Index shared-event references used while building battle summaries."""

from importlib import import_module

from django.db import migrations


INDEX_NAME = 'odoc_combat_shared_event_idx'
TABLE_NAME = 'system_settings_combatfact'
KEY = "((payload ->> 'shared_event_id'::text))"
PREDICATE = "(payload ? 'shared_event_id'::text)"


def status(cursor):
    cursor.execute("""
        SELECT ns.nspname, idx.oid, i.indisvalid, i.indisready,
               i.indrelid = tab.oid, i.indisunique, i.indisprimary, i.indisexclusion,
               i.indnkeyatts, i.indnatts, am.amname,
               pg_get_indexdef(i.indexrelid, 1, false),
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
        raise RuntimeError('战斗事实表不存在，无法创建共同事件索引')
    names = ('schema', 'oid', 'valid', 'ready', 'same_table', 'unique', 'primary', 'exclusion',
             'key_count', 'column_count', 'method', 'key', 'predicate', 'constraint')
    return dict(zip(names, row))


def expected(item):
    return (item['same_table'] is True and item['unique'] is False and item['primary'] is False
            and item['exclusion'] is False and not item['constraint'] and item['key_count'] == 1
            and item['column_count'] == 1 and item['method'] == 'btree'
            and item['key'] == KEY and item['predicate'] == PREDICATE)


def drop_index(cursor, schema_editor, item, *, skip_if_now_valid=False):
    helpers = import_module('system_settings.migrations.0100_combat_kill_index')
    if not expected(item):
        raise RuntimeError('共同事件索引同名对象的表或定义不匹配；未删除对象')
    helpers.ensure_no_concurrent_maintenance(cursor)
    current = status(cursor)
    if current['oid'] != item['oid'] or not expected(current):
        raise RuntimeError('共同事件索引在迁移期间发生变化；未删除对象')
    if skip_if_now_valid and current['valid']:
        if current['ready']:
            return False
        raise RuntimeError('共同事件索引状态异常，请稍后重试迁移')
    qualified = f"{schema_editor.quote_name(item['schema'])}.{schema_editor.quote_name(INDEX_NAME)}"
    cursor.execute(f'DROP INDEX CONCURRENTLY {qualified}')
    return True


def create_index(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    helpers = import_module('system_settings.migrations.0100_combat_kill_index')
    with schema_editor.connection.cursor() as cursor:
        with helpers.migration_lock(cursor):
            item = status(cursor)
            if item['oid'] is not None:
                if not expected(item):
                    raise RuntimeError('共同事件索引同名对象的表或定义不匹配；未删除对象')
                if item['valid'] and item['ready']:
                    return
                if item['valid']:
                    raise RuntimeError('共同事件索引状态异常，请稍后重试迁移')
                if not drop_index(cursor, schema_editor, item, skip_if_now_valid=True):
                    return
            table = f"{schema_editor.quote_name(item['schema'])}.{schema_editor.quote_name(TABLE_NAME)}"
            name = schema_editor.quote_name(INDEX_NAME)
            cursor.execute(f"CREATE INDEX CONCURRENTLY {name} ON {table} ((payload->>'shared_event_id')) "
                           "WHERE payload ? 'shared_event_id'")
            item = status(cursor)
            if not (item['valid'] and item['ready'] and expected(item)):
                raise RuntimeError('共同事件索引创建不完整或定义不匹配，请稍后重试迁移')


def remove_index(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    helpers = import_module('system_settings.migrations.0100_combat_kill_index')
    with schema_editor.connection.cursor() as cursor:
        with helpers.migration_lock(cursor):
            item = status(cursor)
            if item['oid'] is not None:
                drop_index(cursor, schema_editor, item)


class Migration(migrations.Migration):
    atomic = False
    dependencies = [('system_settings', '0101_validate_combat_kill_index')]
    operations = [migrations.RunPython(create_index, remove_index, atomic=False)]
