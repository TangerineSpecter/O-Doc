from unittest.mock import MagicMock, Mock, patch

from django.db import OperationalError
from django.test import SimpleTestCase

from .apps import configure_sqlite_pragmas


class SQLitePragmaTests(SimpleTestCase):
    def test_timeout_precedes_wal_and_normal(self):
        connection = MagicMock(vendor='sqlite')
        cursor = connection.cursor.return_value.__enter__.return_value
        configure_sqlite_pragmas(None, connection)
        self.assertEqual([call.args[0] for call in cursor.execute.call_args_list], [
            'PRAGMA busy_timeout = 5000;', 'PRAGMA journal_mode = WAL;', 'PRAGMA synchronous = NORMAL;',
        ])

    def test_wal_lock_error_is_logged_and_connection_configuration_continues(self):
        connection = MagicMock(vendor='sqlite')
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.execute.side_effect = [None, OperationalError('database is locked'), None]
        with patch('system_settings.apps.logger.warning') as warning:
            configure_sqlite_pragmas(None, connection)
        warning.assert_called_once()
        self.assertEqual(cursor.execute.call_args.args[0], 'PRAGMA synchronous = NORMAL;')

    def test_other_configuration_failures_are_not_silenced(self):
        connection = MagicMock(vendor='sqlite')
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.execute.side_effect = OperationalError('unavailable')
        with self.assertRaises(OperationalError):
            configure_sqlite_pragmas(None, connection)

    def test_postgres_is_unchanged(self):
        connection = Mock(vendor='postgresql')
        configure_sqlite_pragmas(None, connection)
        connection.cursor.assert_not_called()
