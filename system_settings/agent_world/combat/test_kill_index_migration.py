"""Exercise interrupted concurrent-index builds in an isolated PostgreSQL test database."""
import importlib
import threading
import time
from unittest.mock import patch

from django.db import connection, connections, transaction
from django.test import TransactionTestCase


class CombatKillIndexMigrationTests(TransactionTestCase):
    def setUp(self):
        if connection.vendor != 'postgresql':
            self.skipTest('并发索引迁移仅适用于 PostgreSQL')
        self.migration = importlib.import_module('system_settings.migrations.0100_combat_kill_index')
        self.table = 'odoc_test_combat_index_source'
        self.index = 'odoc_test_combat_index'
        self.enterContext(patch.object(self.migration, 'TABLE_NAME', self.table))
        self.enterContext(patch.object(self.migration, 'INDEX_NAME', self.index))
        with connection.cursor() as cursor:
            cursor.execute(f'CREATE TABLE {self.table} (owner_id varchar(40), kind varchar(24), payload jsonb)')
        self.addCleanup(self.drop_table)

    def drop_table(self):
        with connection.cursor() as cursor:
            cursor.execute(f'DROP TABLE IF EXISTS {self.table}')

    def migrate_index(self):
        with connection.schema_editor(atomic=False) as editor:
            self.migration.create_index(None, editor)

    def status(self):
        with connection.cursor() as cursor:
            return self.migration.index_status(cursor)

    def test_existing_valid_index_is_idempotent(self):
        self.migrate_index()
        first = self.status()
        self.migrate_index()
        with connection.schema_editor(atomic=False) as editor:
            importlib.import_module('system_settings.migrations.0101_validate_combat_kill_index').validate_index(None, editor)
        second = self.status()
        self.assertTrue(first['valid'] and first['ready'] and self.migration.expected_index(first))
        self.assertEqual(first['oid'], second['oid'])

    def test_name_collision_on_same_or_other_table_is_not_deleted(self):
        with connection.cursor() as cursor:
            cursor.execute(f'CREATE TABLE {self.table}_other (owner_id varchar(40))')
        self.addCleanup(self.drop_other_table)
        for target in (self.table, self.table + '_other'):
            with self.subTest(target=target), connection.cursor() as cursor:
                cursor.execute(f'CREATE INDEX CONCURRENTLY {self.index} ON {target} (owner_id)')
                before = self.status()['oid']
                with self.assertRaisesMessage(RuntimeError, '定义不匹配'):
                    self.migrate_index()
                with connection.schema_editor(atomic=False) as editor, self.assertRaisesMessage(RuntimeError, '定义不匹配'):
                    importlib.import_module('system_settings.migrations.0101_validate_combat_kill_index').validate_index(None, editor)
                self.assertEqual(self.status()['oid'], before)
                cursor.execute(f'DROP INDEX CONCURRENTLY {self.index}')

    def drop_other_table(self):
        with connection.cursor() as cursor:
            cursor.execute(f'DROP TABLE IF EXISTS {self.table}_other')

    def test_interrupted_build_is_retried_but_active_build_is_not_dropped(self):
        ready = threading.Event()
        state = {}

        def build():
            local = connections['default']
            try:
                with local.cursor() as cursor:
                    cursor.execute('SELECT pg_backend_pid()')
                    state['pid'] = cursor.fetchone()[0]
                    ready.set()
                    cursor.execute(f"""
                        CREATE INDEX CONCURRENTLY {self.index} ON {self.table}
                        (owner_id, (payload->>'shared_event_id'))
                        WHERE kind = 'round' AND payload @> '{{"events":[{{"kind":"kill"}}]}}'::jsonb
                    """)
            except Exception as exc:
                state['error'] = exc
            finally:
                local.close()

        thread = threading.Thread(target=build, daemon=True)
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(f'LOCK TABLE {self.table} IN ROW EXCLUSIVE MODE')
                thread.start()
                self.assertTrue(ready.wait(10), '并发索引连接未及时建立')
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    status = self.status()
                    if status['oid'] is not None:
                        break
                    time.sleep(0.05)
                self.assertIsNotNone(status['oid'], '并发索引未进入构建状态')
                self.assertFalse(status['valid'])
                with self.assertRaisesMessage(RuntimeError, '正在进行并发索引或维护操作'):
                    self.migrate_index()
                self.assertEqual(self.status()['oid'], status['oid'])
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_cancel_backend(%s)', [state['pid']])
                    self.assertTrue(cursor.fetchone()[0])
                thread.join(timeout=10)
                self.assertFalse(thread.is_alive(), '索引构建线程未停止')
            self.assertIn('error', state)
            self.assertFalse(self.status()['valid'])
            self.migrate_index()
            result = self.status()
            self.assertTrue(result['valid'] and result['ready'] and self.migration.expected_index(result))
        finally:
            if thread.is_alive() and state.get('pid'):
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_cancel_backend(%s)', [state['pid']])
                thread.join(timeout=10)
