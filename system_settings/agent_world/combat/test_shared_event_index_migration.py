"""Check interrupted index builds without touching the business table."""

import importlib
import threading
import time
from unittest.mock import patch

from django.db import connection, connections, transaction
from django.test import TransactionTestCase


class CombatSharedEventIndexMigrationTests(TransactionTestCase):
    def setUp(self):
        if connection.vendor != 'postgresql':
            self.skipTest('并发索引迁移仅适用于 PostgreSQL')
        self.migration = importlib.import_module('system_settings.migrations.0102_combat_shared_event_index')
        self.helpers = importlib.import_module('system_settings.migrations.0100_combat_kill_index')
        self.table = 'odoc_test_shared_event_source'
        self.index = 'odoc_test_shared_event_idx'
        self.enterContext(patch.object(self.migration, 'TABLE_NAME', self.table))
        self.enterContext(patch.object(self.migration, 'INDEX_NAME', self.index))
        self.enterContext(patch.object(self.helpers, 'TABLE_NAME', self.table))
        with connection.cursor() as cursor:
            cursor.execute(f'CREATE TABLE {self.table} (payload jsonb)')
        self.addCleanup(self.drop_table)

    def drop_table(self):
        with connection.cursor() as cursor:
            cursor.execute(f'DROP TABLE IF EXISTS {self.table}')

    def migrate_index(self):
        with connection.schema_editor(atomic=False) as editor:
            self.migration.create_index(None, editor)

    def status(self):
        with connection.cursor() as cursor:
            return self.migration.status(cursor)

    def test_valid_index_is_idempotent_and_collision_is_preserved(self):
        with connection.cursor() as cursor:
            cursor.execute(f'CREATE INDEX CONCURRENTLY {self.index} ON {self.table} ((payload::text))')
        original = self.status()['oid']
        with self.assertRaisesMessage(RuntimeError, '定义不匹配'):
            self.migrate_index()
        self.assertEqual(self.status()['oid'], original)
        with connection.cursor() as cursor:
            cursor.execute(f'DROP INDEX CONCURRENTLY {self.index}')
        self.migrate_index()
        first = self.status()
        self.migrate_index()
        self.assertTrue(first['valid'] and first['ready'] and self.migration.expected(first))
        self.assertEqual(first['oid'], self.status()['oid'])

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
                    cursor.execute(f"CREATE INDEX CONCURRENTLY {self.index} ON {self.table} "
                                   "((payload->>'shared_event_id')) WHERE payload ? 'shared_event_id'")
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
                self.assertTrue(ready.wait(10))
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    item = self.status()
                    if item['oid'] is not None:
                        break
                    time.sleep(0.05)
                self.assertIsNotNone(item['oid'])
                self.assertFalse(item['valid'])
                with self.assertRaisesMessage(RuntimeError, '正在进行并发索引或维护操作'):
                    self.migrate_index()
                self.assertEqual(self.status()['oid'], item['oid'])
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_cancel_backend(%s)', [state['pid']])
                    self.assertTrue(cursor.fetchone()[0])
                thread.join(timeout=10)
                self.assertFalse(thread.is_alive())
            self.assertIn('error', state)
            self.assertFalse(self.status()['valid'])
            self.migrate_index()
            result = self.status()
            self.assertTrue(result['valid'] and result['ready'] and self.migration.expected(result))
        finally:
            if thread.is_alive() and state.get('pid'):
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_cancel_backend(%s)', [state['pid']])
                thread.join(timeout=10)
