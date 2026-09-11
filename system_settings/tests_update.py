import json
import os
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path
from unittest.mock import Mock, patch

from django.contrib.auth.models import User
from django.db import DatabaseError
from django.test import RequestFactory, SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from o_doc.health import health_check
from system_settings import update_service
from system_settings.update_service import (
    UpdateBusyError,
    UpdateRequestError,
    UpdateUnsupportedError,
    create_update_request,
    get_public_update_status,
    normalize_version,
)
from system_settings.views import SystemConfigViewSet
from updater.worker import UpdateWorker, UpdateWorkerError, atomic_write_json, image_with_tag


CURRENT_COMMIT = 'a' * 40
TARGET_COMMIT = 'b' * 40


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


class UpdateServiceTests(SimpleTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.base_dir = Path(self.temp_dir.name) / 'project'
        self.update_dir = Path(self.temp_dir.name) / 'update'
        frontend_dir = self.base_dir / 'frontend_react'
        frontend_dir.mkdir(parents=True)
        self.update_dir.mkdir()
        (frontend_dir / 'package.json').write_text('{"version":"0.9.5"}', encoding='utf-8')
        (self.update_dir / 'heartbeat.json').write_text('{}', encoding='utf-8')
        self.environment = patch.dict(os.environ, {
            'ODOC_AUTO_UPDATE': 'true',
            'ODOC_UPDATE_DIR': str(self.update_dir),
            'ODOC_BUILD_COMMIT': CURRENT_COMMIT,
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_normalizes_strict_stable_version(self):
        self.assertEqual(normalize_version('v1.2.3'), '1.2.3')
        with self.assertRaises(UpdateRequestError):
            normalize_version('1.2.3-beta')

    @override_settings(BASE_DIR='/unused')
    def test_status_reports_worker_and_build(self):
        with self.settings(BASE_DIR=self.base_dir):
            status = get_public_update_status()
        self.assertTrue(status['auto_update_supported'])
        self.assertEqual(status['current_version'], '0.9.5')
        self.assertEqual(status['current_commit'], CURRENT_COMMIT)

    def test_creates_atomic_update_request(self):
        with self.settings(BASE_DIR=self.base_dir):
            result = create_update_request('0.9.6', TARGET_COMMIT)
        request_value = json.loads((self.update_dir / 'request.json').read_text(encoding='utf-8'))
        self.assertEqual(result['state'], 'queued')
        self.assertEqual(request_value['target_version'], '0.9.6')
        self.assertEqual(request_value['target_commit'], TARGET_COMMIT)
        self.assertTrue((self.update_dir / 'request.lock').exists())

    def test_accepts_same_version_when_tag_points_to_new_commit(self):
        with self.settings(BASE_DIR=self.base_dir):
            result = create_update_request('0.9.5', TARGET_COMMIT)

        self.assertEqual(result['state'], 'queued')
        self.assertEqual(result['target_commit'], TARGET_COMMIT)

    def test_request_lock_is_released_without_deleting_lock_file(self):
        if update_service.fcntl is None:
            self.skipTest('当前平台不支持 fcntl')
        lock_path = self.update_dir / 'request.lock'
        descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
        update_service.fcntl.flock(
            descriptor,
            update_service.fcntl.LOCK_EX | update_service.fcntl.LOCK_NB,
        )
        try:
            with self.settings(BASE_DIR=self.base_dir):
                with self.assertRaises(UpdateBusyError):
                    create_update_request('0.9.6', TARGET_COMMIT)
        finally:
            update_service.fcntl.flock(descriptor, update_service.fcntl.LOCK_UN)
            os.close(descriptor)

        with self.settings(BASE_DIR=self.base_dir):
            result = create_update_request('0.9.6', TARGET_COMMIT)
        self.assertEqual(result['state'], 'queued')

    def test_rejects_lower_equal_and_duplicate_requests(self):
        with self.settings(BASE_DIR=self.base_dir):
            with self.assertRaises(UpdateRequestError):
                create_update_request('0.9.4', TARGET_COMMIT)
            with self.assertRaises(UpdateRequestError):
                create_update_request('0.9.5', CURRENT_COMMIT)
            create_update_request('0.9.6', TARGET_COMMIT)
            with self.assertRaises(UpdateBusyError):
                create_update_request('0.9.7', 'c' * 40)

    def test_rejects_request_when_worker_is_missing(self):
        (self.update_dir / 'heartbeat.json').unlink()
        with self.settings(BASE_DIR=self.base_dir):
            with self.assertRaises(UpdateUnsupportedError):
                create_update_request('0.9.6', TARGET_COMMIT)


class UpdatePermissionTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = SystemConfigViewSet.as_view({'post': 'start_update'})

    def test_regular_user_cannot_start_update(self):
        request = self.factory.post('/api/settings/config/start_update/', {
            'targetVersion': '0.9.6', 'targetCommit': TARGET_COMMIT,
        }, format='json')
        force_authenticate(request, user=User(username='reader'))
        response = self.view(request)
        self.assertEqual(response.status_code, 403)

    @patch('system_settings.views.create_update_request')
    def test_superuser_receives_accepted_response(self, create_request):
        create_request.return_value = {'state': 'queued'}
        request = self.factory.post('/api/settings/config/start_update/', {
            'targetVersion': '0.9.6', 'targetCommit': TARGET_COMMIT,
        }, format='json')
        force_authenticate(request, user=User(username='admin', is_superuser=True))
        response = self.view(request)
        self.assertEqual(response.status_code, 202)
        create_request.assert_called_once_with('0.9.6', TARGET_COMMIT)


class UpdateWorkerTests(SimpleTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        root = Path(self.temp_dir.name)
        self.update_dir = root / 'update'
        self.deploy_dir = root / 'deploy'
        self.update_dir.mkdir()
        self.deploy_dir.mkdir()
        (self.deploy_dir / 'compose.prod.yml').write_text('services: {}\n', encoding='utf-8')
        (self.deploy_dir / '.env').write_text(
            'IMAGE_NAME=ghcr.io/tangerinespecter/o-doc:latest\nCONTAINER_NAME=o-doc\n',
            encoding='utf-8',
        )

    def _write_request(self):
        atomic_write_json(self.update_dir / 'request.json', {
            'request_id': '11111111-1111-4111-8111-111111111111',
            'target_version': '0.9.6',
            'target_commit': TARGET_COMMIT,
        })

    @staticmethod
    def _command_runner(args, **_kwargs):
        if args[:2] == ['docker', 'inspect'] and args[-2] == '{{ index .Config.Labels "com.docker.compose.project" }}':
            return 'odoc'
        if args[:2] == ['docker', 'inspect'] and args[-2] == '{{.Image}}':
            return 'sha256:' + ('d' * 64)
        if args[:3] == ['docker', 'image', 'inspect']:
            return json.dumps({
                'org.opencontainers.image.version': 'v0.9.6',
                'org.opencontainers.image.revision': TARGET_COMMIT,
            })
        return ''

    def test_image_target_does_not_accept_digest_or_whitespace(self):
        self.assertEqual(
            image_with_tag('registry.example.com:5000/o-doc:latest', 'v0.9.6'),
            'registry.example.com:5000/o-doc:v0.9.6',
        )
        with self.assertRaises(UpdateWorkerError):
            image_with_tag('repo/image@sha256:abc', 'v0.9.6')
        with self.assertRaises(UpdateWorkerError):
            image_with_tag('repo/image:latest; bad', 'v0.9.6')

    def test_successful_update_writes_terminal_status(self):
        self._write_request()
        worker = UpdateWorker(self.update_dir, self.deploy_dir, self._command_runner)
        with patch.object(worker, '_create_database_backup', return_value='backup.sql.gz'), \
             patch.object(worker, '_compose_up') as compose_up, \
             patch.object(worker, '_wait_for_health') as wait_for_health:
            worker.process_request()
        status = json.loads(worker.status_path.read_text(encoding='utf-8'))
        self.assertEqual(status['state'], 'succeeded')
        self.assertEqual(status['backup_name'], 'backup.sql.gz')
        compose_up.assert_called_once()
        wait_for_health.assert_called_once_with('0.9.6', TARGET_COMMIT)

    def test_backup_failure_keeps_current_app_running(self):
        self._write_request()
        worker = UpdateWorker(self.update_dir, self.deploy_dir, self._command_runner)
        with patch.object(worker, '_create_database_backup', side_effect=UpdateWorkerError('backup failed')), \
             patch.object(worker, '_compose_up') as compose_up:
            worker.process_request()
        status = json.loads(worker.status_path.read_text(encoding='utf-8'))
        self.assertEqual(status['state'], 'failed')
        compose_up.assert_not_called()

    def test_health_failure_rolls_back_previous_image(self):
        self._write_request()
        worker = UpdateWorker(self.update_dir, self.deploy_dir, self._command_runner)
        with patch.object(worker, '_create_database_backup', return_value='backup.sql.gz'), \
             patch.object(worker, '_compose_up') as compose_up, \
             patch.object(worker, '_wait_for_health', side_effect=[UpdateWorkerError('new app failed'), None]):
            worker.process_request()
        status = json.loads(worker.status_path.read_text(encoding='utf-8'))
        self.assertEqual(status['state'], 'rolledBack')
        self.assertTrue(status['rollback_succeeded'])
        self.assertEqual(compose_up.call_count, 2)
        self.assertEqual(compose_up.call_args_list[1].args[1], 'sha256:' + ('d' * 64))

    def test_image_commit_mismatch_fails_before_restart(self):
        worker = UpdateWorker(self.update_dir, self.deploy_dir, Mock(return_value=json.dumps({
            'org.opencontainers.image.version': 'v0.9.6',
            'org.opencontainers.image.revision': CURRENT_COMMIT,
        })))
        with self.assertRaises(UpdateWorkerError):
            worker._verify_image('repo/image:v0.9.6', '0.9.6', TARGET_COMMIT)

    def test_missing_image_does_not_restart_current_app(self):
        self._write_request()

        def command_runner(args, **kwargs):
            if args[:2] == ['docker', 'pull']:
                raise UpdateWorkerError('manifest unknown')
            return self._command_runner(args, **kwargs)

        worker = UpdateWorker(self.update_dir, self.deploy_dir, command_runner)
        with patch.object(worker, '_compose_up') as compose_up:
            worker.process_request()
        status = json.loads(worker.status_path.read_text(encoding='utf-8'))
        self.assertEqual(status['state'], 'failed')
        compose_up.assert_not_called()

    def test_rollback_failure_is_reported(self):
        self._write_request()
        worker = UpdateWorker(self.update_dir, self.deploy_dir, self._command_runner)
        with patch.object(worker, '_create_database_backup', return_value='backup.sql.gz'), \
             patch.object(worker, '_compose_up', side_effect=[None, UpdateWorkerError('rollback failed')]), \
             patch.object(worker, '_wait_for_health', side_effect=UpdateWorkerError('new app failed')):
            worker.process_request()
        status = json.loads(worker.status_path.read_text(encoding='utf-8'))
        self.assertEqual(status['state'], 'failed')
        self.assertFalse(status['rollback_succeeded'])
        self.assertIn('回退失败', status['message'])

    def test_request_fields_cannot_inject_commands_or_paths(self):
        atomic_write_json(self.update_dir / 'request.json', {
            'request_id': '11111111-1111-4111-8111-111111111111',
            'target_version': '0.9.6; touch /tmp/injected',
            'target_commit': TARGET_COMMIT,
        })
        worker = UpdateWorker(self.update_dir, self.deploy_dir, self._command_runner)
        with self.assertRaises(UpdateWorkerError):
            worker._load_request()

        atomic_write_json(self.update_dir / 'request.json', {
            'request_id': '11111111-1111-4111-8111-111111111111',
            'target_version': '0.9.6',
            'target_commit': TARGET_COMMIT,
            'image': 'attacker.example/image:latest',
        })
        with self.assertRaises(UpdateWorkerError):
            worker._load_request()

    def test_backup_retention_keeps_latest_three(self):
        worker = UpdateWorker(self.update_dir, self.deploy_dir, self._command_runner)
        worker.backup_dir.mkdir()
        for index in range(5):
            backup = worker.backup_dir / f'postgres-before-v0.9.{index}-20260912.sql.gz'
            backup.write_bytes(b'backup')
            os.utime(backup, (index + 1, index + 1))

        worker._prune_backups()

        remaining = sorted(path.name for path in worker.backup_dir.iterdir())
        self.assertEqual(remaining, [
            'postgres-before-v0.9.2-20260912.sql.gz',
            'postgres-before-v0.9.3-20260912.sql.gz',
            'postgres-before-v0.9.4-20260912.sql.gz',
        ])

    @patch('updater.worker.subprocess.Popen')
    def test_backup_timeout_kills_process_and_removes_partial_file(self, popen):
        process = popen.return_value
        process.stdout = BytesIO(b'partial backup')
        process.wait.side_effect = [subprocess.TimeoutExpired('pg_dump', 300), 0]
        worker = UpdateWorker(self.update_dir, self.deploy_dir, self._command_runner)
        worker.backup_dir.mkdir()

        with self.assertRaisesRegex(UpdateWorkerError, '超过 300 秒'):
            worker._create_database_backup('odoc', {}, '0.9.6')

        process.kill.assert_called_once()
        self.assertEqual(list(worker.backup_dir.iterdir()), [])

    def test_interrupted_restart_recovers_previous_image(self):
        previous_image = 'sha256:' + ('d' * 64)
        atomic_write_json(self.update_dir / 'active.json', {
            'request_id': '11111111-1111-4111-8111-111111111111',
            'target_version': '0.9.6',
            'target_commit': TARGET_COMMIT,
            'previous_image': previous_image,
            'phase': 'restarting',
            'backup_name': 'postgres-before-v0.9.6-20260912-010203.sql.gz',
        })
        worker = UpdateWorker(self.update_dir, self.deploy_dir, self._command_runner)
        with patch.object(worker, '_compose_up') as compose_up, \
             patch.object(worker, '_wait_for_health') as wait_for_health:
            worker._recover_interrupted_request()

        status = json.loads(worker.status_path.read_text(encoding='utf-8'))
        self.assertEqual(status['state'], 'rolledBack')
        self.assertEqual(status['backup_name'], 'postgres-before-v0.9.6-20260912-010203.sql.gz')
        compose_up.assert_called_once_with('odoc', previous_image)
        wait_for_health.assert_called_once_with()

    def test_interrupted_after_health_check_keeps_successful_update(self):
        previous_image = 'sha256:' + ('d' * 64)
        atomic_write_json(self.update_dir / 'active.json', {
            'request_id': '11111111-1111-4111-8111-111111111111',
            'target_version': '0.9.6',
            'target_commit': TARGET_COMMIT,
            'previous_image': previous_image,
            'phase': 'healthy',
            'backup_name': 'backup.sql.gz',
        })
        worker = UpdateWorker(self.update_dir, self.deploy_dir, self._command_runner)
        with patch.object(worker, '_compose_up') as compose_up, \
             patch.object(worker, '_wait_for_health') as wait_for_health:
            worker._recover_interrupted_request()

        status = json.loads(worker.status_path.read_text(encoding='utf-8'))
        self.assertEqual(status['state'], 'succeeded')
        compose_up.assert_not_called()
        wait_for_health.assert_called_once_with('0.9.6', TARGET_COMMIT)
