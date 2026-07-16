import json
import os
import sys
import tempfile
from datetime import timedelta
from unittest.mock import patch

from django.core import serializers
from django.contrib.auth.models import Group, User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

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
from system_settings.sync_scheduler import should_start_webdav_scheduler
from system_settings.views import AgentViewSet, SystemConfigViewSet
from utils.ai_service import AIService
from utils.mcp_client import call_mcp_tool, fetch_mcp_tools
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
            with self.assertRaisesMessage(SyncError, '请先将两端系统升级到同一版本'):
                manager.validate_remote_snapshot_version({'snapshot_id': 'remote', 'app_version': '0.9.0'})

    def test_validate_remote_snapshot_version_rejects_newer_patch_snapshot(self):
        manager = SyncManager(FakeWebDavClient(), '/o-doc-sync/')

        with patch.object(SyncManager, 'get_current_app_version', return_value='0.8.1'):
            with self.assertRaisesMessage(SyncError, '请先将两端系统升级到同一版本'):
                manager.validate_remote_snapshot_version({'snapshot_id': 'remote', 'app_version': '0.8.2'})

    def test_validate_remote_snapshot_version_rejects_missing_version(self):
        manager = SyncManager(FakeWebDavClient(), '/o-doc-sync/')

        with self.assertRaisesMessage(SyncError, '远端快照缺少版本信息'):
            manager.validate_remote_snapshot_version({'snapshot_id': 'remote'})


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
            'get_remote_snapshot_meta': lambda self: {'snapshot_id': 'snapshot-remote', 'app_version': '0.7.0'},
            'validate_remote_snapshot_version': lambda self, remote_meta: None,
            'sync_data_download': lambda self: 3,
            'sync_assets_download': lambda self: 2,
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
                return {'snapshot_id': 'snapshot-new', 'app_version': '0.7.0'}

            def validate_remote_snapshot_version(self, remote_meta):
                return None

            def sync_data_download(self):
                call_order.append('pull-data')
                return 3

            def sync_assets_download(self):
                call_order.append('pull-assets')
                return 2

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
            ['pull-data', 'pull-assets', 'push-assets', 'push-data', 'write-meta']
        )
        self.assertTrue(any('先拉取远端数据再继续同步' in event['msg'] for event in events))
        runtime = SystemSetting.objects.get(key='system_webdav_sync_runtime').value
        self.assertEqual(runtime['last_synced_snapshot_id'], 'snapshot-after-push')

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
