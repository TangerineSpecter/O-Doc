"""PostgreSQL lookup for the unarchived settlements used by combat retention."""
from django.db import migrations, transaction


TABLE = 'system_settings_combatpartysettlement'
INDEX = 'combat_party_unarchived_id_idx'
PREDICATE = "NOT (content ? 'archive')"


def inspect_index(cursor):
    cursor.execute("""
        SELECT ns.nspname, obj.oid, i.indisvalid AND i.indisready,
               i.indrelid = tbl.oid AND NOT i.indisunique AND am.amname = 'btree'
               AND i.indnatts = 1 AND i.indnkeyatts = 1
               AND pg_get_indexdef(i.indexrelid, 1, false) = 'id'
               AND pg_get_expr(i.indpred, i.indrelid) = %s
        FROM pg_class tbl JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
        LEFT JOIN pg_class obj ON obj.relnamespace = ns.oid AND obj.relname = %s
        LEFT JOIN pg_index i ON i.indexrelid = obj.oid
        LEFT JOIN pg_am am ON am.oid = obj.relam
        WHERE tbl.oid = to_regclass(%s)
    """, ["(NOT (content ? 'archive'::text))", INDEX, TABLE])
    schema, oid, valid, expected = cursor.fetchone()
    if oid is not None and not expected:
        raise RuntimeError(f'{INDEX} 同名对象的表或定义不匹配')
    return schema, oid, valid


def create_index(apps, editor):
    if editor.connection.vendor != 'postgresql':
        return
    quote = editor.quote_name
    with editor.connection.cursor() as cursor:
        schema, oid, valid = inspect_index(cursor)
        table = f'{quote(schema)}.{quote(TABLE)}'
        if valid:
            return
        if oid is not None:
            # A cancelled concurrent build can leave an invalid index. Only remove
            # it after excluding an active builder and checking its identity again.
            with transaction.atomic(using=editor.connection.alias):
                cursor.execute("SET LOCAL lock_timeout = '1s'")
                cursor.execute(f'LOCK TABLE {table} IN SHARE UPDATE EXCLUSIVE MODE NOWAIT')
                _, current_oid, valid = inspect_index(cursor)
                if valid:
                    return
                if current_oid == oid:
                    cursor.execute(f'DROP INDEX {quote(schema)}.{quote(INDEX)}')
        cursor.execute(f'CREATE INDEX CONCURRENTLY IF NOT EXISTS {quote(INDEX)} '
                       f'ON {table} (id) WHERE {PREDICATE}')
        if not inspect_index(cursor)[2]:
            raise RuntimeError(f'{INDEX} 尚未就绪，请重试迁移')


def remove_index(apps, editor):
    if editor.connection.vendor == 'postgresql':
        with editor.connection.cursor() as cursor:
            schema, oid, _ = inspect_index(cursor)
            if oid is not None:
                cursor.execute(f'DROP INDEX CONCURRENTLY {editor.quote_name(schema)}.{editor.quote_name(INDEX)}')


class Migration(migrations.Migration):
    atomic = False
    dependencies = [('system_settings', '0111_resident_work_owner_day')]
    operations = [migrations.RunPython(create_index, remove_index)]
