import json

from django.core import serializers
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from anthology.models import Anthology
from article.models import Article
from article.annotation_service import get_agent_identity
from system_settings.models import Agent, MCPServer
from utils.mcp_client import call_mcp_tool
from utils.sync_manager import SyncManager


class AgentPostReadingTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='reader', password='test')
        self.client.force_authenticate(self.user)
        self.collection = Anthology.objects.create(coll_id='posts', title='帖子', type='agent', permission='public', user_id='admin')
        self.agent = Agent.objects.create(id='writer', name='作者')
        self.server = MCPServer.objects.create(name='Agent 帖子 MCP', source='system', enabled=True,
            transport='streamableHttp', url='http://unreachable.example.invalid/api/system-mcp/agent-posts/')
        self.posts = [Article.objects.create(article_id=f'post-{i}', title=f'帖子{i}', content='正文',
            coll_id='posts', author='admin', agent_post_creator_id=get_agent_identity(self.agent)['creator_id']) for i in range(5)]

    def check(self, count, **arguments):
        result, error = call_mcp_tool(self.server, 'check_agent_post_publish', {'count': count, **arguments}, agent=self.agent)
        self.assertIsNone(error)
        return result

    def test_count_and_real_read_marker(self):
        for post in self.posts:
            post.read_count = 99
            post.save()
        self.assertFalse(self.check(3)['can_publish'])
        self.assertFalse(self.check(5)['can_publish'])
        self.assertTrue(self.check(6)['can_publish'])
        # 普通详情查询不会改变独立标记。
        self.client.get('/api/article/detail/post-4')
        self.posts[4].refresh_from_db()
        self.assertFalse(self.posts[4].agent_post_has_been_read)
        self.assertEqual(self.client.post('/api/article/agent-posts/post-4/read').status_code, 200)
        self.assertTrue(self.check(3)['can_publish'])
        self.posts[4].refresh_from_db()
        changed = self.posts[4].updated_at
        self.client.post('/api/article/agent-posts/post-4/read')
        self.posts[4].refresh_from_db()
        self.assertEqual(changed, self.posts[4].updated_at)

    def test_only_latest_own_valid_posts(self):
        self.posts[0].agent_post_has_been_read = True
        self.posts[0].save()
        self.assertFalse(self.check(3)['can_publish'])
        self.assertTrue(self.check(5)['can_publish'])
        self.posts[4].agent_post_creator_id = 'agent:别人'
        self.posts[4].save()
        self.posts[3].is_valid = False
        self.posts[3].save()
        self.assertEqual(self.check(5)['checked_count'], 3)
        self.assertFalse(self.check(2)['can_publish'])

    def test_read_permissions_and_invalid_count(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.post('/api/article/agent-posts/post-4/read').status_code, [401, 403])
        self.client.force_authenticate(self.user)
        self.collection.permission = 'private'
        self.collection.save()
        self.assertEqual(self.client.post('/api/article/agent-posts/post-4/read').status_code, 404)
        for count in [0, -1, True, '3', 1.5]:
            result, error = call_mcp_tool(self.server, 'check_agent_post_publish', {'count': count}, agent=self.agent)
            self.assertIsNone(result)
            self.assertTrue(error)
        result, error = call_mcp_tool(self.server, 'check_agent_post_publish', {'count': 3})
        self.assertIsNone(result)
        self.assertIn('已绑定', error)
        self.assertEqual(self.check(3, coll_id='posts')['checked_count'], 3)

    def test_webdav_snapshot_preserves_read_marker(self):
        self.client.post('/api/article/agent-posts/post-4/read')
        snapshot = SyncManager().build_snapshot_data()
        posts = {row['pk']: row for row in snapshot if row['model'] == 'article.article'}
        self.assertTrue(posts['post-4']['fields']['agent_post_has_been_read'])
        self.assertFalse(posts['post-3']['fields']['agent_post_has_been_read'])
        # 同步导入所用 Django 反序列化仍保留该业务字段。
        restored = list(serializers.deserialize('json', json.dumps([posts['post-4']])))[0]
        self.assertTrue(restored.object.agent_post_has_been_read)

    def test_two_device_merge_keeps_read_marker_and_newer_content(self):
        from copy import deepcopy
        from system_settings.sync_state import canonical_hash
        key = 'article.article:post-4'
        def item(read, title):
            return {'model': 'article.article', 'pk': 'post-4', 'fields': {
                'agent_post_has_been_read': read, 'title': title,
            }}
        def revision(record, day):
            return {'hash': canonical_hash(record['fields']), 'revision_at': f'2026-09-{day}T00:00:00+00:00',
                    'origin_device': 'device', 'deleted': False}
        original, read, edited = item(False, '原题'), item(True, '原题'), item(False, '新题')
        base = {'data': [original], 'revisions': {key: revision(original, '25')}}
        remote = {'data': [read], 'revisions': {key: revision(read, '26')}}
        manager = SyncManager()
        before = deepcopy(edited)
        merged, revisions, _ = manager.merge_v2_data(base, [edited], {key: revision(edited, '27')}, remote)
        self.assertTrue(merged[0]['fields']['agent_post_has_been_read'])
        self.assertEqual(merged[0]['fields']['title'], '新题')
        self.assertEqual(revisions[key]['hash'], canonical_hash(merged[0]['fields']))
        self.assertEqual(edited, before)
        # 两端交换方向仍得到相同结果。
        reverse, _, _ = manager.merge_v2_data(base, [read], remote['revisions'],
            {'data': [edited], 'revisions': {key: revision(edited, '27')}})
        self.assertEqual(reverse, merged)
        # 已读只在 base 中存在时同样保留；彻底删除仍以墓碑为准。
        read_base = {'data': [read], 'revisions': {key: revision(read, '26')}}
        retained, _, _ = manager.merge_v2_data(read_base, [edited], {key: revision(edited, '27')},
            {'data': [], 'revisions': {}})
        self.assertTrue(retained[0]['fields']['agent_post_has_been_read'])
        # 使用项目实际的彻底删除前缀。
        from system_settings.sync_state import PERMANENT_DELETE_HASH_PREFIX
        purged = {'hash': PERMANENT_DELETE_HASH_PREFIX + 'post-4', 'deleted': True,
                  'revision_at': '2026-09-28T00:00:00+00:00', 'origin_device': 'device'}
        deleted, _, _ = manager.merge_v2_data(base, [edited], {key: revision(edited, '27')},
            {'data': [], 'revisions': {key: purged}})
        self.assertEqual(deleted, [])
