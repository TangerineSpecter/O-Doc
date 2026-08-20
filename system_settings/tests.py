import json
import os
import sys
import tempfile
import zipfile
from datetime import timedelta
from unittest.mock import Mock, patch

from django.core import serializers
from django.contrib.auth.models import Group, User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from anthology.models import Anthology, Book
from article.models import Image
from assets.models import Asset
from memos.models import Memo
from system_settings.agent_memory import (
    get_or_create_im_session,
    purge_expired_short_term_memories,
    recall_short_term_memories,
    start_new_conversation,
    store_short_term_memory,
    promote_short_term_memory,
)
from system_settings.feishu_im import (
    _build_agent_mcp_tool_context,
    _build_context_messages,
    _execute_agent_mcp_tool,
    _process_feishu_record,
    _select_context_records,
    _trim_to_estimated_tokens,
)
from system_settings.models import Agent, AgentIMMessage, AgentIMSession, AgentLongTermMemory, AgentShortTermMemory, MCPServer, Skill, SystemSetting
from system_settings.sync_scheduler import (
    WebDavAutoSyncScheduler,
    cancel_running_sync,
    should_pull_remote_before_push,
    should_start_webdav_scheduler,
)
from system_settings.views import AgentViewSet, SystemConfigViewSet
from utils.ai_service import AIService
from utils.mcp_client import call_mcp_tool, fetch_mcp_tools
from utils.ftp_client import FtpClient
from utils.remote_storage import (
    create_storage_client,
    create_sync_manager,
    destination_signature,
    normalize_sync_config,
    validate_sync_config,
)
from utils.sftp_client import SftpClient
from utils.sync_manager import SyncError, SyncManager
from utils.webdav import WebDavClient
from user.models import UserProfile


class FakeWebDavClient:
    def __init__(self, content=None):
        self.content = content
        self.directories = set()
        self.uploaded = []
        self.downloaded = []
        self.deleted = []

    def ensure_directory(self, remote_dir):
        self.directories.add(remote_dir)

    def try_create_directory(self, remote_dir):
        if remote_dir in self.directories:
            return False
        self.directories.add(remote_dir)
        return True

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


class MemoryStorageClient:
    """用于验证 v2 不可变快照的最小远端文件系统实现。"""
    def __init__(self):
        self.files = {}
        self.directories = set()

    def ensure_directory(self, remote_dir):
        self.directories.add(remote_dir.rstrip('/'))

    def try_create_directory(self, remote_dir):
        remote_dir = remote_dir.rstrip('/')
        if remote_dir in self.directories:
            return False
        self.directories.add(remote_dir)
        return True

    def upload_file(self, local_path, remote_path):
        with open(local_path, 'rb') as file_obj:
            self.files[remote_path] = file_obj.read()
        return True

    def get_file_content(self, remote_path):
        content = self.files.get(remote_path)
        return content.decode('utf-8') if content is not None else None

    def download_file(self, remote_path, local_path):
        content = self.files.get(remote_path)
        if content is None:
            return False
        with open(local_path, 'wb') as file_obj:
            file_obj.write(content)
        return True

    def exists(self, remote_path):
        return remote_path in self.files or remote_path.rstrip('/') in self.directories

    def list_directory(self, remote_dir):
        prefix = remote_dir.rstrip('/') + '/'
        entries = set()
        for path in [*self.files, *self.directories]:
            if not path.startswith(prefix):
                continue
            remainder = path[len(prefix):]
            if remainder:
                entries.add(remainder.split('/', 1)[0])
        return sorted(entries) if entries else ([] if remote_dir.rstrip('/') in self.directories else None)

    def delete_path(self, remote_path):
        remote_path = remote_path.rstrip('/')
        self.files.pop(remote_path, None)
        self.directories.discard(remote_path)
        return True


class FakeMemoryCollection:
    def __init__(self):
        self.upserts = []
        self.deleted = []
        self.query_result = {
            'ids': [[]],
            'documents': [[]],
            'metadatas': [[]],
            'distances': [[]],
        }

    def upsert(self, **kwargs):
        self.upserts.append(kwargs)

    def query(self, **kwargs):
        return self.query_result

    def delete(self, ids=None, **kwargs):
        self.deleted.extend(ids or [])


class SyncManagerTests(TestCase):
    def test_v2_three_way_merge_keeps_each_device_new_record(self):
        manager = SyncManager(FakeWebDavClient(), '/o-doc-sync/')
        base_item = {'model': 'anthology.anthology', 'pk': 'A', 'fields': {'title': 'A'}}
        local_item = {'model': 'anthology.anthology', 'pk': 'B', 'fields': {'title': 'B'}}
        remote_item = {'model': 'anthology.anthology', 'pk': 'C', 'fields': {'title': 'C'}}
        base = {'data': [base_item], 'revisions': {
            'anthology.anthology:A': {'hash': 'a', 'revision_at': '2026-01-01T00:00:00+00:00', 'origin_device': 'base', 'deleted': False},
        }}
        local_revisions = {
            'anthology.anthology:A': base['revisions']['anthology.anthology:A'],
            'anthology.anthology:B': {'hash': 'b', 'revision_at': '2026-01-02T00:00:00+00:00', 'origin_device': 'local', 'deleted': False},
        }
        remote = {'data': [base_item, remote_item], 'revisions': {
            **base['revisions'],
            'anthology.anthology:C': {'hash': 'c', 'revision_at': '2026-01-03T00:00:00+00:00', 'origin_device': 'remote', 'deleted': False},
        }}
        merged, _revisions, summary = manager.merge_v2_data(base, [base_item, local_item], local_revisions, remote)
        self.assertEqual({item['pk'] for item in merged}, {'A', 'B', 'C'})
        self.assertEqual(summary['conflicts'], 0)

    def test_v2_delete_edit_conflict_keeps_edit(self):
        manager = SyncManager(FakeWebDavClient(), '/o-doc-sync/')
        item = {'model': 'anthology.anthology', 'pk': 'B', 'fields': {'title': 'old'}}
        edited = {'model': 'anthology.anthology', 'pk': 'B', 'fields': {'title': 'edited'}}
        base_revision = {'hash': 'old', 'revision_at': '2026-01-01T00:00:00+00:00', 'origin_device': 'base', 'deleted': False}
        local_revision = {'hash': 'edited', 'revision_at': '2026-01-02T00:00:00+00:00', 'origin_device': 'local', 'deleted': False}
        remote_revision = {'hash': 'old', 'revision_at': '2026-01-03T00:00:00+00:00', 'origin_device': 'remote', 'deleted': True}
        merged, revisions, _summary = manager.merge_v2_data(
            {'data': [item], 'revisions': {'anthology.anthology:B': base_revision}},
            [edited], {'anthology.anthology:B': local_revision},
            {'data': [], 'revisions': {'anthology.anthology:B': remote_revision}},
        )
        self.assertEqual(merged, [edited])
        self.assertFalse(revisions['anthology.anthology:B']['deleted'])

    def test_v2_delete_unchanged_writes_tombstone(self):
        manager = SyncManager(FakeWebDavClient(), '/o-doc-sync/')
        item = {'model': 'anthology.anthology', 'pk': 'B', 'fields': {'title': 'old'}}
        base_revision = {'hash': 'old', 'revision_at': '2026-01-01T00:00:00+00:00', 'origin_device': 'base', 'deleted': False}
        tombstone = {'hash': 'old', 'revision_at': '2026-01-02T00:00:00+00:00', 'origin_device': 'remote', 'deleted': True}
        merged, revisions, summary = manager.merge_v2_data(
            {'data': [item], 'revisions': {'anthology.anthology:B': base_revision}},
            [item], {'anthology.anthology:B': base_revision},
            {'data': [], 'revisions': {'anthology.anthology:B': tombstone}},
        )
        self.assertEqual(merged, [])
        self.assertTrue(revisions['anthology.anthology:B']['deleted'])
        self.assertEqual(summary['deleted'], 1)

    def test_v2_same_timestamp_uses_device_id_as_stable_tiebreaker(self):
        manager = SyncManager(FakeWebDavClient(), '/o-doc-sync/')
        local = {'hash': 'local', 'revision_at': '2026-01-02T00:00:00+00:00', 'origin_device': 'device-a', 'deleted': False}
        remote = {'hash': 'remote', 'revision_at': '2026-01-02T00:00:00+00:00', 'origin_device': 'device-z', 'deleted': False}
        self.assertEqual(manager._revision_winner(local, remote), remote)

    def test_v2_uses_username_as_cross_device_user_identity(self):
        manager = SyncManager(FakeWebDavClient(), '/o-doc-sync/')
        local = {'model': 'auth.user', 'pk': 1, 'fields': {'username': 'alice'}}
        remote = {'model': 'auth.user', 'pk': 9, 'fields': {'username': 'alice'}}
        base_revision = {'hash': 'old', 'revision_at': '2026-01-01T00:00:00+00:00', 'origin_device': 'base', 'deleted': False}
        local_revision = {'hash': 'local', 'revision_at': '2026-01-02T00:00:00+00:00', 'origin_device': 'local', 'deleted': False}
        remote_revision = {'hash': 'remote', 'revision_at': '2026-01-03T00:00:00+00:00', 'origin_device': 'remote', 'deleted': False}
        key = 'auth.user:username:alice'
        merged, _revisions, summary = manager.merge_v2_data(
            {'data': [local], 'revisions': {key: base_revision}}, [local], {key: local_revision},
            {'data': [remote], 'revisions': {key: remote_revision}},
        )
        self.assertEqual(merged, [remote])
        self.assertEqual(summary['conflicts'], 1)

    def test_v2_remote_lock_excludes_another_device(self):
        client = MemoryStorageClient()
        first = SyncManager(client, '/o-doc-sync/')
        second = SyncManager(client, '/o-doc-sync/')
        with first._remote_sync_lock('first'):
            with self.assertRaises(SyncError):
                with second._remote_sync_lock('second'):
                    pass

    def test_v2_history_retains_only_ten_complete_snapshots(self):
        client = MemoryStorageClient()
        manager = SyncManager(client, '/o-doc-sync/')
        for _ in range(11):
            manager.publish_v2_snapshot(source='test', data_list=[], revisions={})
        history = manager.list_v2_history()
        self.assertEqual(len(history), 10)
        pointer = json.loads(client.get_file_content(manager.v2_current_file))
        self.assertIn(pointer['snapshot_id'], {item['snapshot_id'] for item in history})

    def test_v2_snapshot_uploads_images_attachments_archives_and_avatars_as_blobs(self):
        client = MemoryStorageClient()
        manager = SyncManager(client, '/o-doc-sync/')
        files = {
            'image/photo.png': b'photo-bytes',
            'document/attachment.pdf': b'attachment-bytes',
            'archive/export.zip': b'archive-bytes',
            'avatars/admin.png': b'avatar-bytes',
        }

        with tempfile.TemporaryDirectory() as media_root:
            with self.settings(MEDIA_ROOT=media_root):
                for rel_path, content in files.items():
                    abs_path = os.path.join(media_root, rel_path)
                    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
                    with open(abs_path, 'wb') as file_obj:
                        file_obj.write(content)

                for index, rel_path in enumerate(list(files)[:3]):
                    Asset.objects.create(
                        id=f'asset_v2_{index}', name=os.path.basename(rel_path),
                        original_name=os.path.basename(rel_path), file_type='other',
                        file_size=len(files[rel_path]), file_path=rel_path,
                        file_extension=os.path.splitext(rel_path)[1],
                        mime_type='application/octet-stream', file_hash=f'asset-v2-{index}',
                        source_type=('image' if rel_path.startswith('image/') else 'attachment'),
                    )
                user = User.objects.create_user(username='v2-avatar-user', password='password')
                UserProfile.objects.create(user=user, userid='v2-avatar-user', avatar='/media/avatars/admin.png')

                snapshot = manager.publish_v2_snapshot(source='test', data_list=[], revisions={})

        self.assertEqual(snapshot['meta']['media_count'], len(files))
        self.assertGreater(snapshot['meta']['snapshot_bytes'], snapshot['meta']['media_bytes'])
        self.assertEqual(set(snapshot['media']), set(files))
        for rel_path, content in files.items():
            digest = snapshot['media'][rel_path]['hash']
            self.assertEqual(client.files[f'{manager.v2_blobs_dir}/{digest}'], content)

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

    def test_sync_data_download_reuses_local_builtin_skill(self):
        now = timezone.now()
        local_skill = Skill.objects.create(
            id='skill_local_builtin',
            name='文章润色',
            skill_key='odoc_agent_post_markdown_guide',
            source='built_in',
            is_system=True,
        )
        remote_skill = Skill(
            id='skill_remote_builtin',
            name='文章润色',
            skill_key='odoc_agent_post_markdown_guide',
            source='built_in',
            is_system=True,
        )
        remote_skill.created_at = now
        remote_skill.updated_at = now
        remote_agent = Agent(id='agent_remote', name='远端 Agent', skills=['skill_remote_builtin'])
        remote_agent.created_at = now
        remote_agent.updated_at = now
        snapshot = serializers.serialize('json', [remote_agent, remote_skill])
        manager = SyncManager(FakeWebDavClient(content=snapshot), '/o-doc-sync/')

        manager.sync_data_download()

        self.assertEqual(Skill.objects.count(), 1)
        local_skill.refresh_from_db()
        self.assertEqual(local_skill.name, '文章润色')
        self.assertEqual(Agent.objects.get(pk='agent_remote').skills, ['skill_local_builtin'])

    def test_sync_data_download_reuses_local_user_profile(self):
        now = timezone.now()
        local_user = User.objects.create_user(username='admin', password='local-password')
        local_profile = UserProfile.objects.create(
            user=local_user,
            userid='admin',
            nickname='本地管理员',
        )
        remote_profile = UserProfile(
            pk=99,
            user_id=2,
            userid='admin',
            nickname='远端管理员',
        )
        remote_profile.created_at = now
        remote_profile.updated_at = now
        snapshot = serializers.serialize('json', [remote_profile])
        manager = SyncManager(FakeWebDavClient(content=snapshot), '/o-doc-sync/')

        manager.sync_data_download()

        self.assertEqual(UserProfile.objects.count(), 1)
        local_profile.refresh_from_db()
        self.assertEqual(local_profile.user_id, local_user.id)
        self.assertEqual(local_profile.nickname, '远端管理员')

    def test_sync_data_download_restores_users_without_replacing_local_admin_password(self):
        now = timezone.now()
        local_admin = User.objects.create_superuser(username='admin', password='local-password')
        local_admin_password = local_admin.password
        UserProfile.objects.create(user=local_admin, userid='admin')
        remote_group = Group(id=3, name='编辑')
        remote_user = User(id=1, username='alice', password='remote-alice-password', is_staff=True)
        remote_admin = User(id=2, username='admin', password='remote-admin-password', is_superuser=True, is_staff=True)
        remote_alice_profile = UserProfile(pk=99, user_id=1, userid='alice', nickname='Alice')
        remote_admin_profile = UserProfile(pk=100, user_id=2, userid='admin', nickname='远端管理员')
        for profile in (remote_alice_profile, remote_admin_profile):
            profile.created_at = now
            profile.updated_at = now
        snapshot_data = json.loads(serializers.serialize(
            'json',
            [remote_group, remote_user, remote_admin, remote_alice_profile, remote_admin_profile],
        ))
        for item in snapshot_data:
            if item['model'] == 'auth.user' and item['fields']['username'] == 'alice':
                item['fields']['groups'] = [3]
        manager = SyncManager(FakeWebDavClient(content=json.dumps(snapshot_data)), '/o-doc-sync/')

        manager.sync_data_download()

        local_admin.refresh_from_db()
        self.assertEqual(local_admin.password, local_admin_password)
        alice = User.objects.get(username='alice')
        self.assertTrue(alice.is_staff)
        self.assertEqual(list(alice.groups.values_list('name', flat=True)), ['编辑'])
        self.assertEqual(UserProfile.objects.get(userid='alice').user_id, alice.id)
        self.assertEqual(UserProfile.objects.get(userid='admin').user_id, local_admin.id)

    def _create_book_asset(self, asset_id, rel_path, media_root, content=b'book-bytes'):
        os.makedirs(os.path.join(media_root, os.path.dirname(rel_path)), exist_ok=True)
        abs_path = os.path.join(media_root, rel_path)
        with open(abs_path, 'wb') as file_obj:
            file_obj.write(content)
        return Asset.objects.create(
            id=asset_id,
            name=os.path.basename(rel_path),
            original_name=os.path.basename(rel_path),
            file_type='document',
            file_size=len(content),
            file_path=rel_path,
            file_extension=os.path.splitext(rel_path)[1],
            mime_type='application/pdf',
            file_hash=asset_id,
            source_type='other',
        )

    def test_sync_assets_upload_skips_already_backed_up_book(self):
        anthology = Anthology.objects.create(coll_id='coll_books', title='书架', type='book')
        client = FakeWebDavClient()
        manager = SyncManager(client, '/o-doc-sync/')
        with tempfile.TemporaryDirectory() as media_root:
            with self.settings(MEDIA_ROOT=media_root):
                backed = self._create_book_asset('asset_backed', 'books/backed.pdf', media_root)
                fresh = self._create_book_asset('asset_fresh', 'books/fresh.pdf', media_root)
                Book.objects.create(
                    book_id='book_backed', anthology=anthology, asset=backed,
                    title='已备份', book_format='pdf',
                    remote_available=True, remote_hash='asset_backed',
                )
                Book.objects.create(
                    book_id='book_fresh', anthology=anthology, asset=fresh,
                    title='新书', book_format='pdf',
                )
                list(manager.sync_assets_upload_stream())

        uploaded_remotes = [remote for _local, remote in client.uploaded]
        self.assertTrue(any(path.endswith('books/fresh.pdf') for path in uploaded_remotes))
        self.assertFalse(any(path.endswith('books/backed.pdf') for path in uploaded_remotes))

    def test_sync_assets_download_does_not_restore_released_book_body(self):
        anthology = Anthology.objects.create(coll_id='coll_books', title='书架', type='book')
        asset = Asset.objects.create(
            id='asset_released',
            name='released.pdf',
            original_name='released.pdf',
            file_type='document',
            file_size=4,
            file_path='books/released.pdf',
            file_extension='.pdf',
            mime_type='application/pdf',
            file_hash='asset_released',
            source_type='other',
        )
        Book.objects.create(
            book_id='book_released', anthology=anthology, asset=asset,
            title='已释放', book_format='pdf',
            local_state='local', remote_available=True, remote_hash='asset_released',
        )
        client = FakeWebDavClient()
        manager = SyncManager(client, '/o-doc-sync/')
        with tempfile.TemporaryDirectory() as media_root:
            with self.settings(MEDIA_ROOT=media_root):
                downloaded = manager.sync_assets_download()

        self.assertEqual(downloaded, 0)
        self.assertEqual(client.downloaded, [])
        self.assertEqual(Book.objects.get(book_id='book_released').local_state, 'cloud_only')

    def test_sync_assets_download_includes_user_avatar(self):
        user = User.objects.create_user(username='admin', password='password')
        UserProfile.objects.create(user=user, userid='admin', avatar='/media/avatars/admin.png')
        client = FakeWebDavClient()
        manager = SyncManager(client, '/o-doc-sync/')

        with tempfile.TemporaryDirectory() as media_root:
            with self.settings(MEDIA_ROOT=media_root):
                downloaded_count = manager.sync_assets_download()

        self.assertEqual(downloaded_count, 1)
        self.assertEqual(client.downloaded, [('/o-doc-sync/media/avatars/admin.png', f'{media_root}/avatars/admin.png')])

    def test_media_relative_path_rejects_parent_directory(self):
        manager = SyncManager(FakeWebDavClient(), '/o-doc-sync/')
        with tempfile.TemporaryDirectory() as media_root:
            with self.settings(MEDIA_ROOT=media_root):
                path = manager._get_media_relative_path('/media/avatars/../../outside.png')

        self.assertEqual(path, '')

    def test_write_snapshot_meta_includes_current_app_version(self):
        client = FakeWebDavClient()
        manager = SyncManager(client, '/o-doc-sync/')

        with patch.object(SyncManager, 'get_current_app_version', return_value='0.7.0'):
            meta = manager.write_snapshot_meta(source='manual', runner_id='test-runner')

        self.assertEqual(meta['app_version'], '0.7.0')

    def test_validate_remote_snapshot_version_allows_previous_minor_snapshot(self):
        manager = SyncManager(FakeWebDavClient(), '/o-doc-sync/')

        with patch.object(SyncManager, 'get_current_app_version', return_value='0.8.1'):
            manager.validate_remote_snapshot_version({'snapshot_id': 'remote', 'app_version': '0.7.1'})

    def test_validate_remote_snapshot_version_rejects_newer_remote_snapshot(self):
        manager = SyncManager(FakeWebDavClient(), '/o-doc-sync/')

        with patch.object(SyncManager, 'get_current_app_version', return_value='0.8.1'):
            with self.assertRaisesMessage(SyncError, '请先升级本机后再同步'):
                manager.validate_remote_snapshot_version({'snapshot_id': 'remote', 'app_version': '0.9.0'})

    def test_validate_remote_snapshot_version_rejects_newer_patch_snapshot(self):
        manager = SyncManager(FakeWebDavClient(), '/o-doc-sync/')

        with patch.object(SyncManager, 'get_current_app_version', return_value='0.8.1'):
            with self.assertRaisesMessage(SyncError, '请先升级本机后再同步'):
                manager.validate_remote_snapshot_version({'snapshot_id': 'remote', 'app_version': '0.8.2'})

    def test_validate_remote_snapshot_version_rejects_missing_version(self):
        manager = SyncManager(FakeWebDavClient(), '/o-doc-sync/')

        with self.assertRaisesMessage(SyncError, '远端快照缺少版本信息'):
            manager.validate_remote_snapshot_version({'snapshot_id': 'remote'})

    def test_stale_cleanup_deletes_book_before_protected_asset(self):
        manager = SyncManager(FakeWebDavClient(), '/o-doc-sync/')
        cleanup_models = manager._models_for_stale_cleanup()

        self.assertLess(cleanup_models.index(Book), cleanup_models.index(Asset))

    def test_sync_data_download_removes_stale_book_and_asset(self):
        anthology = Anthology.objects.create(coll_id='coll_keep', title='书架', type='book')
        stale_asset = Asset.objects.create(
            id='asset_stale_book',
            name='old.pdf',
            original_name='old.pdf',
            file_type='document',
            file_size=1,
            file_path='books/old.pdf',
            file_extension='.pdf',
            mime_type='application/pdf',
            file_hash='hash-old',
            source_type='other',
        )
        Book.objects.create(
            book_id='book_stale',
            anthology=anthology,
            asset=stale_asset,
            title='旧书',
            book_format='pdf',
            is_valid=False,
        )
        manager = SyncManager(
            FakeWebDavClient(content=serializers.serialize('json', [anthology])),
            '/o-doc-sync/',
        )

        manager.sync_data_download()

        self.assertFalse(Book.objects.filter(book_id='book_stale').exists())
        self.assertFalse(Asset.objects.filter(id='asset_stale_book').exists())
        self.assertTrue(Anthology.objects.filter(coll_id='coll_keep').exists())

    def test_sync_data_download_keeps_local_fields_missing_from_old_snapshot(self):
        anthology = Anthology.objects.create(coll_id='coll_photos', title='相册', type='image')
        image = Image.objects.create(
            image_id='img_grouped',
            title='组图',
            image_url='/api/resource/view/asset_1',
            coll_id=anthology.coll_id,
            photo_group_id='group_keep',
            group_index=2,
        )
        snapshot_item = json.loads(serializers.serialize('json', [image]))[0]
        snapshot_item['fields'].pop('photo_group_id', None)
        snapshot_item['fields'].pop('group_index', None)
        snapshot_item['fields']['title'] = '远端旧标题'
        manager = SyncManager(
            FakeWebDavClient(content=json.dumps([snapshot_item])),
            '/o-doc-sync/',
        )

        manager.sync_data_download()

        image.refresh_from_db()
        self.assertEqual(image.title, '远端旧标题')
        self.assertEqual(image.photo_group_id, 'group_keep')
        self.assertEqual(image.group_index, 2)

    def test_older_snapshot_does_not_delete_new_local_book(self):
        anthology = Anthology.objects.create(coll_id='coll_keep', title='书架', type='book')
        new_anthology = Anthology.objects.create(coll_id='coll_new_books', title='新书架', type='book')
        asset = Asset.objects.create(
            id='asset_new_book',
            name='new.pdf',
            original_name='new.pdf',
            file_type='document',
            file_size=1,
            file_path='books/new.pdf',
            file_extension='.pdf',
            mime_type='application/pdf',
            file_hash='hash-new',
            source_type='other',
        )
        Book.objects.create(
            book_id='book_new',
            anthology=new_anthology,
            asset=asset,
            title='新书',
            book_format='pdf',
        )
        manager = SyncManager(
            FakeWebDavClient(content=serializers.serialize('json', [anthology])),
            '/o-doc-sync/',
        )

        with patch.object(SyncManager, 'get_current_app_version', return_value='0.9.2'):
            manager.sync_data_download(remote_meta={'app_version': '0.8.1'})

        self.assertTrue(Book.objects.filter(book_id='book_new').exists())
        self.assertTrue(Anthology.objects.filter(coll_id='coll_new_books').exists())

    def test_local_backup_zip_excludes_book_bodies(self):
        anthology = Anthology.objects.create(coll_id='coll_books', title='书架', type='book')
        manager = SyncManager()
        with tempfile.TemporaryDirectory() as media_root:
            with self.settings(MEDIA_ROOT=media_root):
                asset = self._create_book_asset('asset_zip_book', 'books/huge.pdf', media_root, content=b'x' * 1024)
                Book.objects.create(
                    book_id='book_zip', anthology=anthology, asset=asset,
                    title='大书', book_format='pdf',
                )
                zip_path = os.path.join(media_root, 'backup.zip')
                manager.write_local_backup_zip(zip_path)
                with zipfile.ZipFile(zip_path) as archive:
                    names = archive.namelist()
        self.assertIn('data_index.json', names)
        self.assertFalse(any(name.endswith('books/huge.pdf') for name in names))

    def test_local_backup_zip_round_trip_overwrites_and_rejects_newer(self):
        anthology = Anthology.objects.create(coll_id='coll_keep', title='旧文集', type='article')
        Image.objects.create(
            image_id='img_backup',
            title='旧图',
            image_url='/api/resource/view/a',
            coll_id=anthology.coll_id,
            photo_group_id='group_local',
            group_index=3,
        )
        manager = SyncManager()
        with tempfile.TemporaryDirectory() as temp_dir:
            zip_path = os.path.join(temp_dir, 'backup.zip')
            with patch.object(SyncManager, 'get_current_app_version', return_value='0.8.0'):
                manager.write_local_backup_zip(zip_path)
            with zipfile.ZipFile(zip_path) as archive:
                names = set(archive.namelist())
                data_list = json.loads(archive.read('data_index.json'))
                meta = json.loads(archive.read('snapshot_meta.json'))
            self.assertIn('data_index.json', names)
            self.assertIn('snapshot_meta.json', names)
            for item in data_list:
                if item.get('model') == 'article.image':
                    item['fields'].pop('photo_group_id', None)
                    item['fields'].pop('group_index', None)
            with zipfile.ZipFile(zip_path, 'w') as archive:
                archive.writestr('data_index.json', json.dumps(data_list))
                archive.writestr('snapshot_meta.json', json.dumps(meta))

            extra = Anthology.objects.create(coll_id='coll_new', title='新文集', type='book')
            image = Image.objects.get(image_id='img_backup')
            image.photo_group_id = 'group_after'
            image.save(update_fields=['photo_group_id'])

            with patch.object(SyncManager, 'get_current_app_version', return_value='0.9.2'):
                manager.import_local_backup_zip(zip_path)

            self.assertFalse(Anthology.objects.filter(coll_id='coll_new').exists())
            restored = Image.objects.get(image_id='img_backup')
            self.assertEqual(restored.title, '旧图')
            self.assertEqual(restored.photo_group_id, '')

            newer = os.path.join(temp_dir, 'newer.zip')
            with zipfile.ZipFile(newer, 'w') as archive:
                archive.writestr('data_index.json', '[]')
                archive.writestr('snapshot_meta.json', json.dumps({
                    'snapshot_id': 'n',
                    'app_version': '1.0.0',
                }))
            with patch.object(SyncManager, 'get_current_app_version', return_value='0.9.2'):
                with self.assertRaisesMessage(SyncError, '请先升级本机后再导入'):
                    manager.import_local_backup_zip(newer)

    def test_sync_skips_backup_settings(self):
        from system_settings.models import SystemSetting

        SystemSetting.objects.create(
            key='system_webdav_config',
            value={'protocol': 'sftp', 'host': 'sftp.example.com'},
        )
        SystemSetting.objects.create(
            key='system_memos_push_config',
            value={'enabled': True},
        )
        class CapturingClient(FakeWebDavClient):
            def __init__(self):
                super().__init__()
                self.exported = []

            def upload_file(self, local_path, remote_path):
                if remote_path.endswith('data_index.json'):
                    with open(local_path, 'r', encoding='utf-8') as file_obj:
                        self.exported.append(json.load(file_obj))
                return super().upload_file(local_path, remote_path)

        client = CapturingClient()
        manager = SyncManager(client, '/o-doc-sync/')
        list(manager.sync_data_upload_stream())
        exported = client.exported[-1]
        exported_keys = {
            item['pk'] for item in exported
            if item['model'] == 'system_settings.systemsetting'
        }
        self.assertNotIn('system_webdav_config', exported_keys)
        self.assertNotIn('system_webdav_sync_runtime', exported_keys)
        self.assertIn('system_memos_push_config', exported_keys)

        snapshot = [{
            'model': 'system_settings.systemsetting',
            'pk': 'system_webdav_config',
            'fields': {
                'value': {'protocol': 'webdav', 'url': 'https://old.example.com'},
                'description': 'old',
            },
        }]
        restore_manager = SyncManager(FakeWebDavClient(content=json.dumps(snapshot)), '/o-doc-sync/')
        restore_manager.sync_data_download()

        saved = SystemSetting.objects.get(key='system_webdav_config').value
        self.assertEqual(saved.get('protocol'), 'sftp')
        self.assertEqual(saved.get('host'), 'sftp.example.com')


class WebDavClientTests(TestCase):
    def test_normalize_base_url_adds_http_scheme_for_lan_address(self):
        self.assertEqual(
            WebDavClient.normalize_base_url('192.168.5.4:5005/'),
            'http://192.168.5.4:5005'
        )

    def test_normalize_base_url_preserves_explicit_https_scheme(self):
        self.assertEqual(
            WebDavClient.normalize_base_url('https://dav.example.com/dav/'),
            'https://dav.example.com/dav'
        )

    def test_exists_uses_real_info_lookup_when_library_check_is_disabled(self):
        client = WebDavClient('https://dav.example.com', 'user', 'password')
        client.client = Mock()
        client.client.check.return_value = True
        client.client.info.side_effect = RuntimeError('404 not found')

        self.assertFalse(client.exists('/backup/sync-v2/blobs/missing'))
        client.client.info.assert_called_once_with('/backup/sync-v2/blobs/missing')
        client.client.check.assert_not_called()

    def test_exists_returns_true_when_remote_info_is_available(self):
        client = WebDavClient('https://dav.example.com', 'user', 'password')
        client.client = Mock()
        client.client.info.return_value = {'name': 'blob'}

        self.assertTrue(client.exists('/backup/sync-v2/blobs/existing'))


class RemoteStorageFactoryTests(TestCase):
    def test_defaults_to_webdav(self):
        with patch('utils.webdav.WebDavClient') as mock_cls:
            mock_cls.normalize_base_url.side_effect = WebDavClient.normalize_base_url
            create_storage_client({
                'url': 'https://dav.example.com',
                'username': 'demo',
                'password': 'secret',
            })
        mock_cls.assert_called_once_with('https://dav.example.com', 'demo', 'secret')

    def test_creates_ftp_client_with_default_port(self):
        with patch('utils.ftp_client.FtpClient') as mock_cls:
            create_storage_client({
                'protocol': 'ftp',
                'host': '192.168.1.8',
                'username': 'demo',
                'password': 'secret',
            })
        kwargs = mock_cls.call_args.kwargs
        self.assertEqual(kwargs['host'], '192.168.1.8')
        self.assertEqual(kwargs['port'], 21)
        self.assertFalse(kwargs['use_tls'])

    def test_parses_ftp_host_and_port_from_url(self):
        with patch('utils.ftp_client.FtpClient') as mock_cls:
            create_storage_client({
                'protocol': 'ftp',
                'url': 'ftp://nas.local:2121',
                'username': 'demo',
                'password': 'secret',
            })
        kwargs = mock_cls.call_args.kwargs
        self.assertEqual(kwargs['host'], 'nas.local')
        self.assertEqual(kwargs['port'], 2121)

    def test_creates_sftp_client(self):
        with patch('utils.sftp_client.SftpClient') as mock_cls:
            create_storage_client({
                'protocol': 'sftp',
                'host': 'sftp.example.com',
                'username': 'demo',
                'private_key': '-----BEGIN OPENSSH PRIVATE KEY-----',
            })
        kwargs = mock_cls.call_args.kwargs
        self.assertEqual(kwargs['host'], 'sftp.example.com')
        self.assertEqual(kwargs['port'], 22)
        self.assertIn('BEGIN OPENSSH PRIVATE KEY', kwargs['private_key'])

    def test_sftp_requires_password_or_private_key(self):
        with self.assertRaises(ValueError):
            validate_sync_config(normalize_sync_config({
                'protocol': 'sftp',
                'host': 'sftp.example.com',
                'username': 'demo',
                'remote_path': '/backup/',
            }))

    def test_empty_remote_path_is_rejected(self):
        with self.assertRaisesMessage(ValueError, '请填写远程路径'):
            validate_sync_config(normalize_sync_config({
                'url': 'https://dav.example.com',
                'username': 'demo',
                'password': 'secret',
                'remote_path': '',
            }))
        with self.assertRaisesMessage(ValueError, '请填写远程路径'):
            create_sync_manager({
                'protocol': 'ftp',
                'host': '192.168.1.8',
                'username': 'demo',
                'password': 'secret',
                'remote_path': '',
            })

    def test_public_sync_config_exposes_camel_case_aliases(self):
        from utils.remote_storage import public_sync_config
        payload = public_sync_config({
            'remote_path': '/custom/',
            'use_tls': True,
            'private_key': 'KEY',
            'host_key': 'ssh-ed25519 AAAA',
        })
        self.assertEqual(payload['remotePath'], '/custom/')
        self.assertTrue(payload['useTls'])
        self.assertEqual(payload['privateKey'], 'KEY')
        self.assertEqual(payload['hostKey'], 'ssh-ed25519 AAAA')

    def test_destination_signature_ignores_password_changes(self):
        old = {
            'protocol': 'ftp',
            'host': '192.168.1.8',
            'port': 21,
            'username': 'demo',
            'password': 'old',
            'remote_path': '/o-doc-backup/',
        }
        new = {**old, 'password': 'new'}
        self.assertEqual(destination_signature(old), destination_signature(new))

    def test_create_sync_manager_uses_remote_path(self):
        with patch('utils.ftp_client.FtpClient'):
            manager = create_sync_manager({
                'protocol': 'ftp',
                'host': '192.168.1.8',
                'username': 'demo',
                'password': 'secret',
                'remotePath': '/custom-path/',
            })
        self.assertEqual(manager.base_path, '/custom-path')


class FtpClientTests(TestCase):
    @patch('utils.ftp_client.ftplib.FTP')
    def test_check_connection_logs_in_and_sends_noop(self, mock_ftp_cls):
        ftp = mock_ftp_cls.return_value
        client = FtpClient('ftp.example.com', 21, 'demo', 'secret')
        self.assertTrue(client.check_connection())
        ftp.connect.assert_called_once_with('ftp.example.com', 21, timeout=300)
        ftp.login.assert_called_once_with('demo', 'secret')
        ftp.set_pasv.assert_called_once_with(True)
        ftp.voidcmd.assert_called()

    @patch('utils.ftp_client.ftplib.FTP_TLS')
    def test_uses_tls_when_enabled(self, mock_ftp_tls_cls):
        ftp = mock_ftp_tls_cls.return_value
        client = FtpClient('ftp.example.com', 21, 'demo', 'secret', use_tls=True)
        self.assertTrue(client.check_connection())
        ftp.prot_p.assert_called_once()

    @patch('utils.ftp_client.ftplib.FTP')
    def test_list_directory_returns_child_names(self, mock_ftp_cls):
        ftp = mock_ftp_cls.return_value
        ftp.mlsd.return_value = [('.', {}), ('..', {}), ('data_index.json', {})]
        client = FtpClient('ftp.example.com', 21, 'demo', 'secret')
        self.assertEqual(client.list_directory('/o-doc-backup'), ['data_index.json'])

    @patch('utils.ftp_client.ftplib.FTP')
    def test_upload_and_download_use_binary_transfer(self, mock_ftp_cls):
        ftp = mock_ftp_cls.return_value
        client = FtpClient('ftp.example.com', 21, 'demo', 'secret')
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(b'hello')
            tmp_path = tmp.name
        try:
            self.assertTrue(client.upload_file(tmp_path, '/o-doc-backup/data_index.json'))
            self.assertTrue(client.download_file('/o-doc-backup/data_index.json', tmp_path))
        finally:
            os.remove(tmp_path)
        ftp.storbinary.assert_called_once()
        ftp.retrbinary.assert_called_once()


class SftpClientTests(TestCase):
    @patch('utils.sftp_client.paramiko.SSHClient')
    def test_check_connection_opens_sftp(self, mock_ssh_cls):
        ssh = mock_ssh_cls.return_value
        sftp = ssh.open_sftp.return_value
        sftp.listdir.return_value = []
        client = SftpClient('sftp.example.com', 22, 'demo', password='secret')
        self.assertTrue(client.check_connection())
        ssh.set_missing_host_key_policy.assert_called()
        connect_kwargs = ssh.connect.call_args.kwargs
        self.assertEqual(connect_kwargs['hostname'], 'sftp.example.com')
        self.assertEqual(connect_kwargs['port'], 22)
        self.assertEqual(connect_kwargs['username'], 'demo')
        self.assertEqual(connect_kwargs['password'], 'secret')
        sftp.listdir.assert_called()

    @patch('utils.sftp_client.paramiko.SSHClient')
    def test_list_directory_skips_dot_entries(self, mock_ssh_cls):
        ssh = mock_ssh_cls.return_value
        sftp = ssh.open_sftp.return_value
        sftp.listdir.return_value = ['.', '..', 'media']
        client = SftpClient('sftp.example.com', 22, 'demo', password='secret')
        self.assertEqual(client.list_directory('/o-doc-backup'), ['media'])


class SftpHostKeyTests(TestCase):
    @patch('utils.sftp_client.paramiko.SSHClient')
    def test_rejects_unknown_host_when_key_is_pinned(self, mock_ssh_cls):
        ssh = mock_ssh_cls.return_value
        ssh.connect.side_effect = Exception('Unknown host key')
        client = SftpClient(
            'sftp.example.com',
            22,
            'demo',
            password='secret',
            known_host_key='ssh-ed25519 AAAAPINNED',
        )
        with patch.object(client, '_load_known_host_key', return_value=type('K', (), {'get_name': lambda self: 'ssh-ed25519'})()):
            self.assertFalse(client.check_connection())
        ssh.set_missing_host_key_policy.assert_called()


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


class FeishuIMContextTests(TestCase):
    def setUp(self):
        self.agent = Agent.objects.create(name='Feishu Agent', prompt='你是飞书助手。')

    def _create_replied_message(self, index, content='用户消息', response='助手回复'):
        record = AgentIMMessage.objects.create(
            agent=self.agent,
            platform=AgentIMMessage.PLATFORM_FEISHU,
            message_id=f'msg-{index}',
            chat_id='chat-ctx',
            sender_id='user-open-id',
            message_type='text',
            content=f'{content}-{index}',
            response=f'{response}-{index}',
            status=AgentIMMessage.STATUS_REPLIED,
        )
        created_at = timezone.now() + timedelta(seconds=index)
        AgentIMMessage.objects.filter(id=record.id).update(created_at=created_at)
        record.created_at = created_at
        return record

    def _create_current_message(self, index=99):
        record = AgentIMMessage.objects.create(
            agent=self.agent,
            platform=AgentIMMessage.PLATFORM_FEISHU,
            message_id=f'current-{index}',
            chat_id='chat-ctx',
            sender_id='user-open-id',
            message_type='text',
            content='当前问题',
            status=AgentIMMessage.STATUS_RECEIVED,
        )
        created_at = timezone.now() + timedelta(seconds=index)
        AgentIMMessage.objects.filter(id=record.id).update(created_at=created_at)
        record.created_at = created_at
        return record

    def test_context_keeps_recent_complete_turns_within_budget(self):
        self._create_replied_message(1, content='旧问题' + '甲' * 40, response='旧回答' + '乙' * 40)
        second = self._create_replied_message(2, content='新问题', response='新回答')

        selected, omitted = _select_context_records(
            '系统提示',
            '',
            '当前问题',
            list(AgentIMMessage.objects.filter(agent=self.agent).order_by('created_at')),
            max_context_tokens=1275,
        )

        self.assertEqual(selected, [second])
        self.assertEqual(len(omitted), 1)

    def test_context_compresses_omitted_turns_and_keeps_latest_turns(self):
        first = self._create_replied_message(1, content='旧问题' + '甲' * 40, response='旧回答' + '乙' * 40)
        second = self._create_replied_message(2, content='新问题', response='新回答')
        current = self._create_current_message()

        with patch('system_settings.feishu_im.AIService.chat_completion_messages', return_value='长期摘要：用户喜欢中文短回答。') as mock_summary:
            messages = _build_context_messages(
                self.agent,
                current,
                '系统提示',
                '当前问题',
                max_context_tokens=1275,
            )

        session = AgentIMSession.objects.get(agent=self.agent, chat_id='chat-ctx')
        self.assertEqual(session.summary, '长期摘要：用户喜欢中文短回答。')
        self.assertEqual(session.summary_until, first.created_at)
        self.assertEqual(mock_summary.call_count, 1)
        self.assertTrue(any(message['role'] == 'system' and '长期摘要' in message['content'] for message in messages))
        self.assertNotIn({'role': 'user', 'content': first.content}, messages)
        self.assertNotIn({'role': 'assistant', 'content': first.response}, messages)
        self.assertIn({'role': 'user', 'content': second.content}, messages)
        self.assertIn({'role': 'assistant', 'content': second.response}, messages)

    def test_summary_is_trimmed_to_estimated_token_limit(self):
        summary = _trim_to_estimated_tokens('甲' * 200, 60)

        self.assertLessEqual(len(summary), 60)


class AgentMemoryTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.agent = Agent.objects.create(name='Memory Agent', prompt='你是记忆助手。')
        self.record = AgentIMMessage.objects.create(
            agent=self.agent,
            platform=AgentIMMessage.PLATFORM_FEISHU,
            message_id='msg-memory-1',
            chat_id='chat-memory',
            sender_id='user-memory',
            conversation_id='conv-1',
            message_type='text',
            content='我喜欢简洁回答',
            response='好的，我会尽量简洁。',
            status=AgentIMMessage.STATUS_REPLIED,
        )

    def test_store_short_term_memory_writes_metadata_and_vector(self):
        collection = FakeMemoryCollection()
        with patch('system_settings.agent_memory.RagClient.create_embeddings', return_value=[[0.1, 0.2]]), \
                patch('system_settings.agent_memory.get_agent_memory_collection', return_value=collection):
            memory = store_short_term_memory(self.agent, self.record)

        self.assertIsNotNone(memory)
        self.assertEqual(AgentShortTermMemory.objects.count(), 1)
        self.assertEqual(collection.upserts[0]['ids'], [memory.id])
        self.assertIn('用户：我喜欢简洁回答', collection.upserts[0]['documents'][0])

    def test_recall_short_term_memory_updates_recall_metadata(self):
        memory = AgentShortTermMemory.objects.create(
            agent=self.agent,
            chat_id=self.record.chat_id,
            sender_id=self.record.sender_id,
            conversation_id=self.record.conversation_id,
            source_message=self.record,
            content='用户：我喜欢简洁回答\nAgent：好的',
            expires_at=timezone.now() + timedelta(days=1),
        )
        collection = FakeMemoryCollection()
        collection.query_result = {
            'ids': [[memory.id]],
            'documents': [[memory.content]],
            'metadatas': [[{
                'agent_id': self.agent.id,
                'chat_id': self.record.chat_id,
                'sender_id': self.record.sender_id,
            }]],
            'distances': [[0.12]],
        }

        with patch('system_settings.agent_memory.RagClient.create_embeddings', return_value=[[0.2, 0.3]]), \
                patch('system_settings.agent_memory.get_agent_memory_collection', return_value=collection):
            recalled = recall_short_term_memories(self.agent, self.record, '你还记得我的偏好吗')

        memory.refresh_from_db()
        self.assertEqual(len(recalled), 1)
        self.assertEqual(memory.recall_count, 1)
        self.assertGreater(memory.best_score, 0.8)
        self.assertEqual(len(memory.query_sources), 1)

    def test_promote_short_term_memory_creates_long_term_memory(self):
        memory = AgentShortTermMemory.objects.create(
            agent=self.agent,
            chat_id=self.record.chat_id,
            sender_id=self.record.sender_id,
            conversation_id=self.record.conversation_id,
            source_message=self.record,
            content='用户：我喜欢简洁回答\nAgent：好的',
            expires_at=timezone.now() + timedelta(days=1),
            recall_count=3,
            best_score=0.9,
            query_sources=['q1', 'q2', 'q3'],
        )
        response = json.dumps({
            'should_save': True,
            'memory_type': 'preference',
            'title': '回答风格',
            'content': '用户偏好简洁回答。',
            'confidence': 0.9,
        }, ensure_ascii=False)

        with patch('system_settings.agent_memory.AIService.chat_completion_messages', return_value=response):
            long_memory = promote_short_term_memory(memory)

        memory.refresh_from_db()
        self.assertIsNotNone(long_memory)
        self.assertIsNotNone(memory.promoted_at)
        self.assertEqual(AgentLongTermMemory.objects.get().content, '用户偏好简洁回答。')

    def test_purge_expired_short_term_memory_deletes_vector_and_metadata(self):
        expired = AgentShortTermMemory.objects.create(
            agent=self.agent,
            chat_id=self.record.chat_id,
            sender_id=self.record.sender_id,
            content='过期记忆',
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        collection = FakeMemoryCollection()

        with patch('system_settings.agent_memory.get_agent_memory_collection', return_value=collection):
            count = purge_expired_short_term_memories()

        self.assertEqual(count, 1)
        self.assertEqual(collection.deleted, [expired.id])
        self.assertFalse(AgentShortTermMemory.objects.filter(id=expired.id).exists())

    def test_new_conversation_resets_session_boundary(self):
        session = AgentIMSession.objects.create(
            agent=self.agent,
            platform=AgentIMMessage.PLATFORM_FEISHU,
            chat_id=self.record.chat_id,
            sender_id=self.record.sender_id,
            conversation_id='conv-old',
            summary='旧摘要',
            summary_until=timezone.now(),
            summary_token_estimate=12,
        )

        new_id = start_new_conversation(self.agent, self.record)

        session.refresh_from_db()
        self.record.refresh_from_db()
        self.assertEqual(session.conversation_id, new_id)
        self.assertNotEqual(session.conversation_id, 'conv-old')
        self.assertEqual(session.summary, '')
        self.assertIsNone(session.summary_until)
        self.assertEqual(self.record.conversation_id, 'conv-old')

    def test_agent_memory_api_lifecycle(self):
        create_view = AgentViewSet.as_view({'post': 'memories'})
        request = self.factory.post(
            f'/api/settings/agents/{self.agent.id}/memories/',
            {
                'memory_type': 'preference',
                'title': '回答风格',
                'content': '用户喜欢短回答。',
                'status': 'active',
                'confidence': 0.85,
            },
            format='json',
        )
        response = create_view(request, pk=self.agent.id)
        self.assertEqual(response.status_code, 200)
        memory_id = response.data['data']['id']

        update_view = AgentViewSet.as_view({'put': 'memory_detail'})
        request = self.factory.put(
            f'/api/settings/agents/{self.agent.id}/memories/{memory_id}/',
            {'content': '用户喜欢短而直接的回答。'},
            format='json',
        )
        response = update_view(request, pk=self.agent.id, memory_id=memory_id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['content'], '用户喜欢短而直接的回答。')

        delete_view = AgentViewSet.as_view({'delete': 'memory_detail'})
        request = self.factory.delete(f'/api/settings/agents/{self.agent.id}/memories/{memory_id}/')
        response = delete_view(request, pk=self.agent.id, memory_id=memory_id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AgentLongTermMemory.objects.get(id=memory_id).status, AgentLongTermMemory.STATUS_ARCHIVED)

    def test_im_session_is_isolated_by_sender_in_same_chat(self):
        first_record = AgentIMMessage.objects.create(
            agent=self.agent,
            platform=AgentIMMessage.PLATFORM_FEISHU,
            message_id='msg-sender-1',
            chat_id='chat-memory',
            sender_id='sender-a',
            message_type='text',
            content='A 的问题',
        )
        second_record = AgentIMMessage.objects.create(
            agent=self.agent,
            platform=AgentIMMessage.PLATFORM_FEISHU,
            message_id='msg-sender-2',
            chat_id='chat-memory',
            sender_id='sender-b',
            message_type='text',
            content='B 的问题',
        )

        first_session = get_or_create_im_session(self.agent, first_record)
        second_session = get_or_create_im_session(self.agent, second_record)

        self.assertNotEqual(first_session.id, second_session.id)
        self.assertNotEqual(first_session.conversation_id, second_session.conversation_id)

    def test_reaction_failure_does_not_block_feishu_reply(self):
        self.agent.feishu_im_enabled = True
        self.agent.feishu_app_id = 'cli_test'
        self.agent.feishu_app_secret = 'secret_test'
        self.agent.save(update_fields=['feishu_im_enabled', 'feishu_app_id', 'feishu_app_secret', 'updated_at'])
        record = AgentIMMessage.objects.create(
            agent=self.agent,
            platform=AgentIMMessage.PLATFORM_FEISHU,
            event_id='event-reaction-failure',
            message_id='msg-reaction-failure',
            chat_id='chat-memory',
            sender_id='user-memory',
            message_type='text',
            content='你好',
            status=AgentIMMessage.STATUS_RECEIVED,
        )

        with patch('system_settings.feishu_im.add_feishu_message_reaction', side_effect=RuntimeError('reaction denied')), \
                patch('system_settings.feishu_im.AIService.chat_completion_messages', return_value='你好呀'), \
                patch('system_settings.feishu_im.send_feishu_reply', return_value={}), \
                patch('system_settings.feishu_im.store_short_term_memory'):
            _process_feishu_record(record.id)

        record.refresh_from_db()
        self.assertEqual(record.status, AgentIMMessage.STATUS_REPLIED)
        self.assertEqual(record.response, '你好呀')

    def test_feishu_reply_loads_agent_bound_mcp_tools(self):
        server = MCPServer.objects.create(
            name='闪念 MCP',
            transport='streamableHttp',
            url='http://testserver/api/system-mcp/memos/',
            headers={'Authorization': 'Bearer test-key'},
            enabled=True,
            source='system',
            tools=[],
        )
        self.agent.feishu_im_enabled = True
        self.agent.feishu_app_id = 'cli_test'
        self.agent.feishu_app_secret = 'secret_test'
        self.agent.mcp_servers = [server.id]
        self.agent.save(update_fields=[
            'feishu_im_enabled',
            'feishu_app_id',
            'feishu_app_secret',
            'mcp_servers',
            'updated_at',
        ])
        record = AgentIMMessage.objects.create(
            agent=self.agent,
            platform=AgentIMMessage.PLATFORM_FEISHU,
            event_id='event-mcp',
            message_id='msg-mcp',
            chat_id='chat-memory',
            sender_id='user-memory',
            message_type='text',
            content='帮我查询最近的闪念',
            status=AgentIMMessage.STATUS_RECEIVED,
        )
        tools = [{
            'name': 'list_memos',
            'description': '查询闪念 Memo 列表。',
            'inputSchema': {
                'type': 'object',
                'properties': {
                    'limit': {'type': 'integer'},
                },
            },
        }]

        def fake_tools_chat(*args, **kwargs):
            kwargs['on_tool_call']('list_memos', {'limit': 5})
            return '最近有 5 条闪念'

        with patch('system_settings.feishu_im.fetch_mcp_tools', return_value=(tools, None)) as mock_fetch, \
                patch('system_settings.feishu_im.AIService.chat_completion_messages_with_tools', side_effect=fake_tools_chat) as mock_tools_chat, \
                patch('system_settings.feishu_im.AIService.chat_completion_messages') as mock_plain_chat, \
                patch('system_settings.feishu_im.send_feishu_reply', return_value={}) as mock_reply, \
                patch('system_settings.feishu_im.store_short_term_memory'), \
                patch('system_settings.feishu_im._try_add_feishu_message_reaction', return_value=''), \
                patch('system_settings.feishu_im._try_delete_feishu_message_reaction'):
            _process_feishu_record(record.id)

        record.refresh_from_db()
        self.assertEqual(record.status, AgentIMMessage.STATUS_REPLIED)
        self.assertEqual(record.response, '最近有 5 条闪念')
        mock_fetch.assert_called_once()
        mock_plain_chat.assert_not_called()
        mock_tools_chat.assert_called_once()
        self.assertEqual(mock_reply.call_args_list[0].args[2], '🔧 正在使用闪念 MCP...')
        self.assertEqual(mock_reply.call_args_list[1].args[2], '最近有 5 条闪念')
        _, tools_arg, _, = mock_tools_chat.call_args.args[:3]
        self.assertEqual(tools_arg[0]['function']['name'], 'list_memos')

    def test_feishu_memo_create_request_uses_bound_mcp_directly(self):
        server = MCPServer.objects.create(
            name='闪念 MCP',
            transport='streamableHttp',
            url='http://testserver/api/system-mcp/memos/',
            headers={'Authorization': 'Bearer test-key'},
            enabled=True,
            source='system',
            tools=[],
        )
        self.agent.feishu_im_enabled = True
        self.agent.feishu_app_id = 'cli_test'
        self.agent.feishu_app_secret = 'secret_test'
        self.agent.mcp_servers = [server.id]
        self.agent.save(update_fields=[
            'feishu_im_enabled',
            'feishu_app_id',
            'feishu_app_secret',
            'mcp_servers',
            'updated_at',
        ])
        record = AgentIMMessage.objects.create(
            agent=self.agent,
            platform=AgentIMMessage.PLATFORM_FEISHU,
            event_id='event-mcp-fallback',
            message_id='msg-mcp-fallback',
            chat_id='chat-memory',
            sender_id='user-memory',
            message_type='text',
            content='帮我记录闪念：今天天气不错',
            status=AgentIMMessage.STATUS_RECEIVED,
        )
        tools = [{
            'name': 'create_memo',
            'description': '创建一条闪念 Memo。',
            'inputSchema': {
                'type': 'object',
                'properties': {
                    'content': {'type': 'string'},
                },
                'required': ['content'],
            },
        }]

        with patch('system_settings.feishu_im.fetch_mcp_tools', return_value=(tools, None)), \
                patch('system_settings.feishu_im.AIService.chat_completion_messages_with_tools') as mock_tools_chat, \
                patch('system_settings.feishu_im.call_mcp_tool', return_value=({'memo_id': 'memo_test'}, None)) as mock_call_tool, \
                patch('system_settings.feishu_im.send_feishu_reply', return_value={}) as mock_reply, \
                patch('system_settings.feishu_im.store_short_term_memory'), \
                patch('system_settings.feishu_im._try_add_feishu_message_reaction', return_value=''), \
                patch('system_settings.feishu_im._try_delete_feishu_message_reaction'):
            _process_feishu_record(record.id)

        record.refresh_from_db()
        self.assertEqual(record.status, AgentIMMessage.STATUS_REPLIED)
        self.assertEqual(record.response, '已记录闪念：今天天气不错')
        mock_tools_chat.assert_not_called()
        self.assertEqual(mock_reply.call_args_list[0].args[2], '🔧 正在使用闪念 MCP...')
        self.assertEqual(mock_reply.call_args_list[1].args[2], '已记录闪念：今天天气不错')
        self.assertEqual(mock_call_tool.call_args.args[1], 'create_memo')
        self.assertEqual(mock_call_tool.call_args.args[2]['content'], '今天天气不错')

    def test_builtin_memo_mcp_uses_internal_tools_without_http(self):
        server = MCPServer.objects.create(
            name='闪念 MCP',
            transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/memos/',
            headers={'Authorization': 'Bearer test-key'},
            enabled=True,
            source='system',
            tools=[],
        )

        with patch('utils.mcp_client.fetch_sse_tools') as mock_fetch_http:
            tools, error_msg = fetch_mcp_tools(server)

        self.assertIsNone(error_msg)
        self.assertIn('create_memo', [tool['name'] for tool in tools])
        mock_fetch_http.assert_not_called()

        with patch('utils.mcp_client.call_streamable_http_tool') as mock_call_http:
            result, error_msg = call_mcp_tool(server, 'create_memo', {'content': '内部 MCP 测试'})

        self.assertIsNone(error_msg)
        self.assertEqual(result['memo']['content'], '内部 MCP 测试')
        self.assertTrue(Memo.objects.filter(content='内部 MCP 测试', user_id='admin').exists())
        mock_call_http.assert_not_called()

    def test_agent_mcp_tool_identity_is_injected_by_code(self):
        self.agent.name = '哈哈'
        self.agent.avatar = 'https://example.com/haha.png'
        server = MCPServer.objects.create(
            name='评论 MCP',
            transport='streamableHttp',
            url='http://testserver/api/system-mcp/comments/',
            headers={'Authorization': 'Bearer test-key'},
            enabled=True,
            source='system',
            tools=[],
        )
        self.agent.mcp_servers = [server.id]
        self.agent.save(update_fields=['name', 'avatar', 'mcp_servers', 'updated_at'])
        tools = [{
            'name': 'create_article_annotation',
            'description': '创建文章批注',
            'inputSchema': {
                'type': 'object',
                'properties': {
                    'article_id': {'type': 'string'},
                    'selected_text': {'type': 'string'},
                    'comment': {'type': 'string'},
                    'agent_name': {'type': 'string'},
                    'agent_avatar': {'type': 'string'},
                },
                'required': ['article_id', 'selected_text', 'comment'],
            },
        }]

        with patch('system_settings.feishu_im.fetch_mcp_tools', return_value=(tools, None)):
            tool_context = _build_agent_mcp_tool_context(self.agent)

        parameters = tool_context['tools'][0]['function']['parameters']
        self.assertNotIn('agent_name', parameters['properties'])
        self.assertNotIn('agent_avatar', parameters['properties'])

        with patch('system_settings.feishu_im.call_mcp_tool', return_value=({'ok': True}, None)) as mock_call_tool:
            _execute_agent_mcp_tool(tool_context, 'create_article_annotation', {
                'article_id': 'art_test',
                'selected_text': '原文',
                'comment': '评论',
            })

        arguments = mock_call_tool.call_args.args[2]
        self.assertNotIn('agent_name', arguments)
        self.assertNotIn('agent_avatar', arguments)
        self.assertEqual(mock_call_tool.call_args.kwargs['agent'], self.agent)

    def test_feishu_book_emoji_memo_request_uses_bound_mcp_directly(self):
        server = MCPServer.objects.create(
            name='闪念 MCP',
            transport='streamableHttp',
            url='http://testserver/api/system-mcp/memos/',
            headers={'Authorization': 'Bearer test-key'},
            enabled=True,
            source='system',
            tools=[],
        )
        self.agent.feishu_im_enabled = True
        self.agent.feishu_app_id = 'cli_test'
        self.agent.feishu_app_secret = 'secret_test'
        self.agent.mcp_servers = [server.id]
        self.agent.save(update_fields=[
            'feishu_im_enabled',
            'feishu_app_id',
            'feishu_app_secret',
            'mcp_servers',
            'updated_at',
        ])
        record = AgentIMMessage.objects.create(
            agent=self.agent,
            platform=AgentIMMessage.PLATFORM_FEISHU,
            event_id='event-mcp-book-fallback',
            message_id='msg-mcp-book-fallback',
            chat_id='chat-memory',
            sender_id='user-memory',
            message_type='text',
            content='📚今天天气不错',
            status=AgentIMMessage.STATUS_RECEIVED,
        )
        tools = [{
            'name': 'create_memo',
            'description': '创建一条闪念 Memo。',
            'inputSchema': {
                'type': 'object',
                'properties': {
                    'content': {'type': 'string'},
                },
                'required': ['content'],
            },
        }]

        with patch('system_settings.feishu_im.fetch_mcp_tools', return_value=(tools, None)), \
                patch('system_settings.feishu_im.AIService.chat_completion_messages_with_tools') as mock_tools_chat, \
                patch('system_settings.feishu_im.call_mcp_tool', return_value=({'memo_id': 'memo_test'}, None)) as mock_call_tool, \
                patch('system_settings.feishu_im.send_feishu_reply', return_value={}), \
                patch('system_settings.feishu_im.store_short_term_memory'), \
                patch('system_settings.feishu_im._try_add_feishu_message_reaction', return_value=''), \
                patch('system_settings.feishu_im._try_delete_feishu_message_reaction'):
            _process_feishu_record(record.id)

        record.refresh_from_db()
        self.assertEqual(record.status, AgentIMMessage.STATUS_REPLIED)
        self.assertEqual(record.response, '已记录闪念：今天天气不错')
        mock_tools_chat.assert_not_called()
        self.assertEqual(mock_call_tool.call_args.args[1], 'create_memo')
        self.assertEqual(mock_call_tool.call_args.args[2]['content'], '今天天气不错')


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
        with patch('utils.webdav.WebDavClient'):
            manager = viewset._get_sync_manager()

        self.assertIsNotNone(manager)
        self.assertEqual(manager.base_path, '/custom-path')

    def test_get_sync_manager_uses_ftp_protocol(self):
        SystemSetting.objects.create(
            key='system_webdav_config',
            value={
                'enabled': True,
                'protocol': 'ftp',
                'host': '192.168.1.8',
                'username': 'demo',
                'password': 'secret',
                'remotePath': '/custom-path/',
            }
        )

        viewset = SystemConfigViewSet()
        with patch('utils.ftp_client.FtpClient'):
            manager = viewset._get_sync_manager()

        self.assertIsNotNone(manager)
        self.assertEqual(manager.base_path, '/custom-path')

    def test_save_webdav_config_resets_snapshot_when_destination_changes(self):
        SystemSetting.objects.create(
            key='system_webdav_config',
            value={
                'enabled': True,
                'protocol': 'webdav',
                'url': 'https://old.example.com',
                'username': 'demo',
                'password': 'secret',
                'remote_path': '/o-doc-backup/',
            }
        )
        SystemSetting.objects.create(
            key='system_webdav_sync_runtime',
            value={'last_synced_snapshot_id': 'keep-me'}
        )

        request = self.factory.post('/api/settings/config/save_webdav_config/', {
            'enabled': True,
            'protocol': 'ftp',
            'host': '192.168.1.8',
            'username': 'demo',
            'password': 'secret',
            'remote_path': '/o-doc-backup/',
        }, format='json')
        view = SystemConfigViewSet.as_view({'post': 'save_webdav_config'})
        with patch('system_settings.views.create_storage_client') as mock_factory:
            mock_factory.return_value.check_connection.return_value = True
            response = view(request)

        self.assertEqual(response.status_code, 200)
        runtime = SystemSetting.objects.get(key='system_webdav_sync_runtime').value
        self.assertEqual(runtime.get('last_synced_snapshot_id'), '')
        saved = SystemSetting.objects.get(key='system_webdav_config').value
        self.assertEqual(saved.get('protocol'), 'ftp')
        self.assertEqual(saved.get('host'), '192.168.1.8')

    def test_save_webdav_config_clears_book_remote_flags_on_destination_change(self):
        anthology = Anthology.objects.create(coll_id='coll_books', title='书架', type='book')
        asset = Asset.objects.create(
            id='asset_switch',
            name='book.pdf',
            original_name='book.pdf',
            file_type='document',
            file_size=1,
            file_path='books/book.pdf',
            file_extension='.pdf',
            mime_type='application/pdf',
            file_hash='hash-switch',
            source_type='other',
        )
        Book.objects.create(
            book_id='book_switch',
            anthology=anthology,
            asset=asset,
            title='已备份书',
            book_format='pdf',
            remote_available=True,
            remote_hash='hash-switch',
        )
        SystemSetting.objects.create(
            key='system_webdav_config',
            value={
                'enabled': True,
                'protocol': 'webdav',
                'url': 'https://old.example.com',
                'username': 'demo',
                'password': 'secret',
                'remote_path': '/old-path/',
            }
        )
        request = self.factory.post('/api/settings/config/save_webdav_config/', {
            'enabled': True,
            'protocol': 'sftp',
            'host': 'sftp.example.com',
            'username': 'demo',
            'password': 'secret',
            'remote_path': '/new-path/',
        }, format='json')
        view = SystemConfigViewSet.as_view({'post': 'save_webdav_config'})
        with patch('system_settings.views.create_storage_client') as mock_factory:
            mock_factory.return_value.check_connection.return_value = True
            mock_factory.return_value.last_host_key = 'ssh-ed25519 AAAANEW'
            response = view(request)

        self.assertEqual(response.status_code, 200)
        book = Book.objects.get(book_id='book_switch')
        self.assertFalse(book.remote_available)
        self.assertEqual(book.remote_hash, '')
        saved = SystemSetting.objects.get(key='system_webdav_config').value
        self.assertEqual(saved.get('host_key'), 'ssh-ed25519 AAAANEW')

    def test_cancel_webdav_sync_unlocks_running_state(self):
        SystemSetting.objects.create(
            key='system_webdav_sync_runtime',
            value={
                'status': 'running',
                'runner_id': 'scheduler:host:1',
                'trigger': 'scheduler',
                'last_started_at': timezone.now().isoformat(),
            }
        )
        request = self.factory.post('/api/settings/config/cancel_webdav_sync/')
        view = SystemConfigViewSet.as_view({'post': 'cancel_webdav_sync'})
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['status'], 'error')
        runtime = SystemSetting.objects.get(key='system_webdav_sync_runtime').value
        self.assertEqual(runtime.get('status'), 'error')
        self.assertEqual(runtime.get('runner_id'), '')

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
            'get_remote_snapshot_meta': lambda self: {'snapshot_id': 'snapshot-remote', 'app_version': '0.7.0'},
            'validate_remote_snapshot_version': lambda self, remote_meta: None,
            'sync_data_download': lambda self, remote_meta=None, should_abort=None: 3,
            'sync_assets_download': lambda self, should_abort=None: 2,
        })()

        with patch.object(SystemConfigViewSet, '_get_sync_manager', return_value=fake_manager):
            response = view(request)

        events = [
            json.loads(chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk)
            for chunk in response.streaming_content
        ]
        self.assertEqual(events[-1]['step'], 'done')
        self.assertFalse(any('staticfiles' in event['msg'] for event in events))

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
                return {
                    'snapshot_id': 'snapshot-new',
                    'app_version': SyncManager.get_current_app_version(),
                    'generated_at': (timezone.now() + timedelta(hours=1)).isoformat(),
                }

            def validate_remote_snapshot_version(self, remote_meta):
                return None

            def sync_data_download(self, remote_meta=None, should_abort=None):
                call_order.append('pull-data')
                return 3

            def sync_assets_download(self, should_abort=None):
                call_order.append('pull-assets')
                return 2

            def sync_assets_upload_stream(self, should_abort=None):
                call_order.append('push-assets')
                yield json.dumps({"step": "summary", "msg": "资源文件同步完成"})

            def sync_data_upload_stream(self, should_abort=None):
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
            ['pull-data', 'pull-assets', 'push-assets', 'push-data', 'write-meta']
        )
        self.assertTrue(any('先拉取远端数据再继续同步' in event['msg'] for event in events))
        runtime = SystemSetting.objects.get(key='system_webdav_sync_runtime').value
        self.assertEqual(runtime['last_synced_snapshot_id'], 'snapshot-after-push')

    def test_sync_to_webdav_rejects_newer_remote_version_without_pushing(self):
        request = self.factory.post('/api/settings/config/sync_to_webdav/')
        view = SystemConfigViewSet.as_view({'post': 'sync_to_webdav'})
        call_order = []

        class FakeManager:
            def validate_upload_state(self):
                return []

            def get_remote_snapshot_meta(self):
                return {
                    'snapshot_id': 'snapshot-new-version',
                    'app_version': '0.9.3',
                    'generated_at': '2026-08-17T12:00:00Z',
                }

            def validate_remote_snapshot_version(self, remote_meta):
                SyncManager(FakeWebDavClient(), '/o-doc-sync/').validate_remote_snapshot_version(remote_meta)

            def sync_data_download(self, remote_meta=None, should_abort=None):
                call_order.append('pull-data')
                return 3

            def sync_assets_download(self, should_abort=None):
                call_order.append('pull-assets')
                return 2

            def sync_assets_upload_stream(self, should_abort=None):
                call_order.append('push-assets')
                yield json.dumps({"step": "summary", "msg": "资源文件同步完成"})

            def sync_data_upload_stream(self, should_abort=None):
                call_order.append('push-data')
                yield json.dumps({"step": "data_done", "msg": "数据库备份完成"})

        with patch.object(SyncManager, 'get_current_app_version', return_value='0.8.1'):
            with patch.object(SystemConfigViewSet, '_get_sync_manager', return_value=FakeManager()):
                response = view(request)
                events = [
                    json.loads(chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk)
                    for chunk in response.streaming_content
                ]

        self.assertEqual(call_order, [])
        self.assertEqual(events[0]['step'], 'error')
        self.assertIn('请先升级本机后再同步', events[0]['msg'])

    def test_sync_to_webdav_skips_stale_remote_preflight_pull(self):
        request = self.factory.post('/api/settings/config/sync_to_webdav/')
        view = SystemConfigViewSet.as_view({'post': 'sync_to_webdav'})

        SystemSetting.objects.create(
            key='system_webdav_sync_runtime',
            value={
                'last_synced_snapshot_id': '',
                'last_push_at': '2026-08-17T15:00:00+00:00',
            }
        )

        call_order = []

        class FakeManager:
            def validate_upload_state(self):
                return []

            def get_remote_snapshot_meta(self):
                return {
                    'snapshot_id': 'snapshot-old-remote',
                    'app_version': '0.7.0',
                    'generated_at': '2026-07-01T00:00:00Z',
                }

            def validate_remote_snapshot_version(self, remote_meta):
                return None

            def sync_data_download(self, remote_meta=None, should_abort=None):
                call_order.append('pull-data')
                return 3

            def sync_assets_download(self, should_abort=None):
                call_order.append('pull-assets')
                return 2

            def sync_assets_upload_stream(self, should_abort=None):
                call_order.append('push-assets')
                yield json.dumps({"step": "summary", "msg": "资源文件同步完成"})

            def sync_data_upload_stream(self, should_abort=None):
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
        self.assertEqual(call_order, ['push-assets', 'push-data', 'write-meta'])
        self.assertTrue(any('以本地数据为准' in event['msg'] for event in events))

    def test_sync_to_webdav_rejects_when_another_sync_is_running(self):
        request = self.factory.post('/api/settings/config/sync_to_webdav/')
        view = SystemConfigViewSet.as_view({'post': 'sync_to_webdav'})

        SystemSetting.objects.create(
            key='system_webdav_sync_runtime',
            value={
                'status': 'running',
                'last_started_at': timezone.now().isoformat(),
                'last_summary': ['自动同步开始'],
            }
        )

        class FakeManager:
            def validate_upload_state(self):
                raise AssertionError('validate_upload_state should not run while locked')

        with patch.object(SystemConfigViewSet, '_get_sync_manager', return_value=FakeManager()):
            response = view(request)

        events = [
            json.loads(chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk)
            for chunk in response.streaming_content
        ]
        self.assertEqual(events[0]['step'], 'error')
        self.assertIn('已有同步任务正在运行', events[0]['msg'])


class PullBeforePushDecisionTests(TestCase):
    def test_skips_when_this_destination_has_not_been_synced(self):
        self.assertFalse(should_pull_remote_before_push(
            {'last_synced_snapshot_id': ''},
            {'snapshot_id': 'remote-old', 'generated_at': '2026-07-01T00:00:00Z'},
        ))

    def test_skips_when_remote_snapshot_is_older_than_last_push(self):
        self.assertFalse(should_pull_remote_before_push(
            {
                'last_synced_snapshot_id': 'local-snapshot',
                'last_push_at': '2026-08-17T15:00:00+00:00',
            },
            {'snapshot_id': 'remote-old', 'generated_at': '2026-07-01T00:00:00Z'},
        ))

    def test_pulls_when_another_instance_updated_remote(self):
        self.assertTrue(should_pull_remote_before_push(
            {
                'last_synced_snapshot_id': 'local-snapshot',
                'last_push_at': '2026-08-01T00:00:00+00:00',
            },
            {'snapshot_id': 'remote-new', 'generated_at': '2026-08-17T12:00:00Z'},
        ))

    def test_skips_when_remote_app_version_is_older(self):
        with patch.object(SyncManager, 'get_current_app_version', return_value='0.9.2'):
            self.assertFalse(should_pull_remote_before_push(
                {
                    'last_synced_snapshot_id': 'local-snapshot',
                    'last_push_at': '2026-08-01T00:00:00+00:00',
                },
                {
                    'snapshot_id': 'remote-new',
                    'generated_at': '2026-08-17T12:00:00Z',
                    'app_version': '0.8.1',
                },
            ))


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

    def test_auto_sync_skips_when_remote_path_missing(self):
        SystemSetting.objects.create(
            key='system_webdav_config',
            value={'enabled': True, 'protocol': 'webdav', 'url': 'https://dav.example.com', 'remote_path': ''},
        )
        scheduler = WebDavAutoSyncScheduler()
        scheduler._boot_at = timezone.now() - timedelta(hours=1)
        with patch.object(scheduler, '_run_sync') as run_sync:
            scheduler._maybe_run_sync()
        run_sync.assert_not_called()

    def test_auto_sync_is_not_due_immediately_after_boot(self):
        scheduler = WebDavAutoSyncScheduler()
        scheduler._boot_at = timezone.now()
        self.assertFalse(scheduler._is_due({}, 30))
        self.assertFalse(scheduler._is_due({
            'last_success_at': (timezone.now() - timedelta(hours=2)).isoformat(),
        }, 30))

    def test_auto_sync_becomes_due_after_boot_grace(self):
        scheduler = WebDavAutoSyncScheduler()
        scheduler._boot_at = timezone.now() - timedelta(minutes=6)
        self.assertTrue(scheduler._is_due({}, 30))

    def test_cancel_running_sync_releases_lock(self):
        SystemSetting.objects.create(
            key='system_webdav_sync_runtime',
            value={
                'status': 'running',
                'runner_id': 'scheduler:host:1',
                'last_started_at': timezone.now().isoformat(),
            }
        )
        cancelled, runtime = cancel_running_sync()
        self.assertTrue(cancelled)
        self.assertEqual(runtime.get('status'), 'error')
        self.assertEqual(runtime.get('runner_id'), '')
        self.assertIn('同步已取消', runtime.get('last_error'))
