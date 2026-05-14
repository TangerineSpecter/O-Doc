import json
import os
import sys
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from system_settings.models import SystemSetting
from system_settings.sync_scheduler import should_start_webdav_scheduler
from system_settings.views import SystemConfigViewSet
from utils.ai_service import AIService
from utils.sync_manager import SyncError, SyncManager


class FakeWebDavClient:
    def __init__(self, content=None):
        self.content = content
        self.directories = set()
        self.uploaded = []
        self.downloaded = []
        self.deleted = []

    def ensure_directory(self, remote_dir):
        self.directories.add(remote_dir)

    def upload_file(self, local_path, remote_path):
        self.uploaded.append((local_path, remote_path))
        return True

    def download_file(self, remote_path, local_path):
        self.downloaded.append((remote_path, local_path))
        return True

    def get_file_content(self, remote_path):
        return self.content

    def list_directory(self, remote_dir):
        return []

    def is_directory(self, remote_path):
        return False

    def delete_path(self, remote_path):
        self.deleted.append(remote_path)
        return True


class SyncManagerTests(TestCase):
    def test_validate_upload_state_reports_missing_asset_file(self):
        manager = SyncManager(FakeWebDavClient(), '/o-doc-sync/')
        with patch.object(
            SyncManager,
            '_collect_asset_relative_paths',
            return_value=(['image/ok.png'], ['image/missing.png'])
        ):
            issues = manager.validate_upload_state()

        self.assertEqual(len(issues), 1)
        self.assertIn('image/missing.png', issues[0])

    def test_sync_data_download_raises_when_snapshot_missing(self):
        manager = SyncManager(FakeWebDavClient(content=None), '/o-doc-sync/')

        with self.assertRaises(SyncError):
            manager.sync_data_download()


class AIServiceTests(TestCase):
    def test_normalize_base_url_preserves_volcengine_ark_v3_endpoint(self):
        self.assertEqual(
            AIService._normalize_base_url('https://ark.cn-beijing.volces.com/api/v3'),
            'https://ark.cn-beijing.volces.com/api/v3'
        )

    def test_normalize_base_url_preserves_google_openai_compatible_endpoint(self):
        self.assertEqual(
            AIService._normalize_base_url('https://generativelanguage.googleapis.com/v1beta/openai/'),
            'https://generativelanguage.googleapis.com/v1beta/openai'
        )

    def test_normalize_base_url_appends_v1_for_host_only_endpoint(self):
        self.assertEqual(
            AIService._normalize_base_url('https://api.openai.com'),
            'https://api.openai.com/v1'
        )

    def test_normalize_base_url_strips_chat_completions_suffix(self):
        self.assertEqual(
            AIService._normalize_base_url('https://ark.cn-beijing.volces.com/api/v3/chat/completions'),
            'https://ark.cn-beijing.volces.com/api/v3'
        )


class SystemConfigViewSetTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def test_get_sync_manager_accepts_camel_case_remote_path(self):
        SystemSetting.objects.create(
            key='system_webdav_config',
            value={
                'enabled': True,
                'url': 'https://dav.example.com',
                'username': 'demo',
                'password': 'secret',
                'remotePath': '/custom-path/'
            }
        )

        viewset = SystemConfigViewSet()
        with patch('system_settings.views.WebDavClient'):
            manager = viewset._get_sync_manager()

        self.assertIsNotNone(manager)
        self.assertEqual(manager.base_path, '/custom-path')

    def test_get_webdav_status_returns_runtime_state(self):
        SystemSetting.objects.create(
            key='system_webdav_sync_runtime',
            value={
                'status': 'success',
                'last_success_at': '2026-04-20T12:00:00',
                'last_error': '',
                'last_summary': ['自动同步完成'],
            }
        )

        request = self.factory.get('/api/settings/config/get_webdav_status/')
        view = SystemConfigViewSet.as_view({'get': 'get_webdav_status'})
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['status'], 'success')
        self.assertEqual(response.data['data']['last_summary'], ['自动同步完成'])

    def test_sync_from_webdav_uses_streaming_protocol_with_done_event(self):
        request = self.factory.post('/api/settings/config/sync_from_webdav/')
        view = SystemConfigViewSet.as_view({'post': 'sync_from_webdav'})

        fake_manager = type('FakeManager', (), {
            'get_remote_snapshot_meta': lambda self: {'snapshot_id': 'snapshot-remote'},
            'sync_data_download': lambda self: 3,
            'sync_assets_download': lambda self: 2,
            'sync_static_download': lambda self: 1,
        })()

        with patch.object(SystemConfigViewSet, '_get_sync_manager', return_value=fake_manager):
            response = view(request)

        events = [
            json.loads(chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk)
            for chunk in response.streaming_content
        ]
        self.assertEqual(events[-1]['step'], 'done')
        self.assertTrue(any('静态资源已对齐' in event['msg'] for event in events))

    def test_sync_to_webdav_pulls_remote_first_when_snapshot_changed(self):
        request = self.factory.post('/api/settings/config/sync_to_webdav/')
        view = SystemConfigViewSet.as_view({'post': 'sync_to_webdav'})

        SystemSetting.objects.create(
            key='system_webdav_sync_runtime',
            value={'last_synced_snapshot_id': 'snapshot-old'}
        )

        call_order = []

        class FakeManager:
            def validate_upload_state(self):
                return []

            def get_remote_snapshot_meta(self):
                return {'snapshot_id': 'snapshot-new'}

            def sync_data_download(self):
                call_order.append('pull-data')
                return 3

            def sync_assets_download(self):
                call_order.append('pull-assets')
                return 2

            def sync_static_download(self):
                call_order.append('pull-static')
                return 1

            def sync_static_upload_stream(self):
                call_order.append('push-static')
                yield json.dumps({"step": "summary", "msg": "静态资源同步完成"})

            def sync_assets_upload_stream(self):
                call_order.append('push-assets')
                yield json.dumps({"step": "summary", "msg": "资源文件同步完成"})

            def sync_data_upload_stream(self):
                call_order.append('push-data')
                yield json.dumps({"step": "data_done", "msg": "数据库备份完成"})

            def write_snapshot_meta(self, source='manual', runner_id=''):
                call_order.append('write-meta')
                return {'snapshot_id': 'snapshot-after-push'}

        with patch.object(SystemConfigViewSet, '_get_sync_manager', return_value=FakeManager()):
            response = view(request)

        events = [
            json.loads(chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk)
            for chunk in response.streaming_content
        ]
        self.assertEqual(
            call_order,
            ['pull-data', 'pull-assets', 'pull-static', 'push-static', 'push-assets', 'push-data', 'write-meta']
        )
        self.assertTrue(any('先拉取远端数据再继续同步' in event['msg'] for event in events))
        runtime = SystemSetting.objects.get(key='system_webdav_sync_runtime').value
        self.assertEqual(runtime['last_synced_snapshot_id'], 'snapshot-after-push')


class WebDavSchedulerTests(TestCase):
    def test_scheduler_does_not_start_for_tests_by_default(self):
        with patch.object(sys, 'argv', ['manage.py', 'test']):
            with patch.dict(os.environ, {}, clear=False):
                self.assertFalse(should_start_webdav_scheduler())

    def test_scheduler_starts_for_runserver_child_process(self):
        with patch.object(sys, 'argv', ['manage.py', 'runserver']):
            with patch.dict(os.environ, {'RUN_MAIN': 'true'}, clear=False):
                self.assertTrue(should_start_webdav_scheduler())

    def test_scheduler_starts_for_gunicorn_process(self):
        with patch.object(sys, 'argv', ['/usr/local/bin/gunicorn']):
            with patch.dict(os.environ, {}, clear=False):
                self.assertTrue(should_start_webdav_scheduler())
