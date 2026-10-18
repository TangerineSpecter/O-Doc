import json
from unittest.mock import patch

from django.db import DatabaseError
from django.test import RequestFactory, SimpleTestCase

from o_doc.health import health_check


CURRENT_COMMIT = 'a' * 40


class HealthCheckTests(SimpleTestCase):
    def test_database_failure_returns_only_safe_health_fields(self):
        with patch('o_doc.health.connection') as database_connection, \
             patch('o_doc.health.get_current_app_version', return_value='0.9.5'), \
             patch('o_doc.health.get_current_build_commit', return_value=CURRENT_COMMIT):
            database_connection.cursor.side_effect = DatabaseError('database unavailable')
            response = health_check(RequestFactory().get('/api/health/'))
        payload = json.loads(response.content)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(payload, {'ok': False, 'version': '0.9.5', 'commit': CURRENT_COMMIT})

