"""A small PostgreSQL-only index for the retained kill-receipt query.

The index is intentionally database-only: JSON containment in a partial-index
predicate is PostgreSQL-specific, and the underlying business data is
unchanged. A non-atomic migration allows index creation without blocking normal
writes for the duration of the build.
"""
from django.db import migrations


INDEX_NAME = 'odoc_combat_kill_owner_event'
TABLE_NAME = 'system_settings_combatfact'


def create_index(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS odoc_combat_kill_owner_event
            ON system_settings_combatfact (owner_id, (payload->>'shared_event_id'))
            WHERE kind = 'round' AND payload @> '{"events":[{"kind":"kill"}]}'::jsonb
        """)
        cursor.execute("""
            SELECT i.indisvalid, i.indisready, i.indrelid = to_regclass(%s)
            FROM pg_index i WHERE i.indexrelid = to_regclass(%s)
        """, [TABLE_NAME, INDEX_NAME])
        status = cursor.fetchone()
        if status != (True, True, True):
            raise RuntimeError('战斗击杀索引创建不完整或名称冲突；请检查该索引后重试迁移')


def remove_index(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        with schema_editor.connection.cursor() as cursor:
            cursor.execute('DROP INDEX CONCURRENTLY IF EXISTS odoc_combat_kill_owner_event')


class Migration(migrations.Migration):
    atomic = False
    dependencies = [('system_settings', '0099_fishing_daily')]
    operations = [migrations.RunPython(create_index, remove_index, atomic=False)]
