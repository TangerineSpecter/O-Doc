from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth.models import User
from rest_framework.test import APIClient, APITestCase

from anthology.models import Anthology
from article.models import Image, ImageReview
from article.photo_observation import observe_photo, overall_score, parse_observation, parse_score, review_summary
from system_settings.builtin_skills import sync_builtin_skills
from system_settings.models import Agent, MCPServer, Skill, SystemSetting
from utils.ai_service import AIService
from system_mcp.views import get_system_mcp_tools_for_scope
from utils.mcp_client import call_mcp_tool, fetch_mcp_tools


OBSERVATION = """画面内容：一座石桥横在河上
构图：主体居中，上下留白
光影：逆光，桥下有阴影
色彩：蓝色为主，偏冷
清晰范围：看不出问题
表达线索：桥面没有人
"""


class PhotoObservationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='photo-owner', password='password')
        self.owner = f'user_{self.user.pk}'
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.anthology = Anthology.objects.create(
            coll_id='photos', title='照片', type='image', user_id=self.owner, permission='private',
        )
        self.hidden = Anthology.objects.create(
            coll_id='hidden-photos', title='别人的照片', type='image', user_id='other', permission='private',
        )
        self.image = Image.objects.create(
            image_id='photo-1', title='黄昏的桥', description='回家的路', image_url='/api/assets/view/bridge',
            coll_id=self.anthology.coll_id, author=self.owner, focal_length='50',
        )
        self.hidden_image = Image.objects.create(
            image_id='photo-hidden', title='秘密', image_url='hidden.png', coll_id=self.hidden.coll_id, author='other',
        )
        self.agent_a = Agent.objects.create(id='agent_qing', name='青子')
        self.agent_b = Agent.objects.create(id='agent_bai', name='白子')
        self.server = MCPServer.objects.create(
            name='照片 MCP', source='system', enabled=True, transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/photo-observation/',
        )
        self.vision_server = MCPServer.objects.create(
            name='识图 MCP', source='system', enabled=True, transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/vision/',
        )

    def test_vision_mcp_stays_a_content_description(self):
        tools, error_msg = fetch_mcp_tools(self.vision_server)
        self.assertIsNone(error_msg)
        self.assertEqual([tool['name'] for tool in tools], ['describe_image'])

    def test_photo_mcp_exposes_observe_and_submit_only(self):
        tools, error_msg = fetch_mcp_tools(self.server)
        self.assertIsNone(error_msg)
        self.assertEqual([tool['name'] for tool in tools], ['observe_photo', 'submit_photo_review'])
        system_names = {tool['name'] for tool in get_system_mcp_tools_for_scope('system')}
        self.assertNotIn('observe_photo', system_names)
        self.assertNotIn('submit_photo_review', system_names)

    def test_parse_observation_keeps_six_sections(self):
        sections = parse_observation(OBSERVATION)
        self.assertEqual(sections['画面内容'], '一座石桥横在河上')
        self.assertEqual(sections['清晰范围'], '看不出问题')
        self.assertEqual(sections['表达线索'], '桥面没有人')
        self.assertEqual(parse_observation('只有一段没有标题')['构图'], '无法判断')

    def test_scores_reject_off_grid_values_and_average_to_half_step(self):
        self.assertEqual(parse_score(7.5, '主题'), Decimal('7.5'))
        self.assertEqual(parse_score(8, '主题'), Decimal('8.0'))
        with self.assertRaises(ValueError):
            parse_score(7.3, '主题')
        self.assertEqual(overall_score([7, 7, 7, 7, 7, 8]), Decimal('7.0'))
        self.assertEqual(overall_score([Decimal('8.0'), Decimal('7.0')]), Decimal('7.5'))

    def test_observe_photo_uses_vision_model_and_author_statement(self):
        SystemSetting.objects.create(key='system_ai_config', value={})
        with patch('article.photo_observation.build_image_data_url', return_value='data:image/jpeg;base64,aa'):
            result, error_msg = call_mcp_tool(self.server, 'observe_photo', {'image_id': self.image.image_id})
        self.assertIsNone(result)
        self.assertIn('默认图像识别模型', error_msg)

        config = {
            'api_key': 'key', 'base_url': 'https://vision.example/v1', 'model_name': 'vision-model',
            'provider_type': 'OpenAi', 'provider_id': 'provider', 'provider_name': 'Vision',
        }
        message = SimpleNamespace(content=OBSERVATION)
        response = SimpleNamespace(choices=[SimpleNamespace(message=message)])
        with patch.object(AIService, 'get_default_image_client_config', return_value=config), \
                patch('article.photo_observation.OpenAI') as openai, \
                patch('article.photo_observation.build_image_data_url', return_value='data:image/jpeg;base64,aa'):
            openai.return_value.chat.completions.create.return_value = response
            observed = observe_photo(self.image.image_id)
        self.assertEqual(openai.return_value.chat.completions.create.call_args.kwargs['model'], 'vision-model')
        self.assertIn('长边不超过 1280', observed['seen_as'])
        self.assertEqual(observed['author']['title'], '黄昏的桥')
        self.assertEqual(observed['author']['focal_length'], '50mm')
        self.assertEqual(observed['author']['description'], '回家的路')
        self.assertEqual(observed['author']['name'], self.owner)
        self.assertIn('创建人自己写的', observed['author']['note'])
        self.assertEqual(observed['sections']['色彩'], '蓝色为主，偏冷')

    def test_submit_requires_agent_and_replaces_the_same_review(self):
        missing, error_msg = call_mcp_tool(self.server, 'submit_photo_review', self._scores('第一次'))
        self.assertIsNone(missing)
        self.assertIn('已绑定的 Agent', error_msg)

        saved, error_msg = call_mcp_tool(self.server, 'submit_photo_review', self._scores('桥面空着'), agent=self.agent_a)
        self.assertIsNone(error_msg)
        self.assertEqual(saved['overall'], 7.5)
        self.assertEqual(ImageReview.objects.count(), 1)

        saved, error_msg = call_mcp_tool(self.server, 'submit_photo_review', self._scores('再看一次'), agent=self.agent_a)
        self.assertIsNone(error_msg)
        self.assertEqual(ImageReview.objects.count(), 1)
        self.assertEqual(ImageReview.objects.get().commentary, '再看一次')
        self.assertEqual(ImageReview.objects.get().agent_name, '青子')

        rejected, error_msg = call_mcp_tool(
            self.server, 'submit_photo_review', {**self._scores('不行'), 'focus': 7.3}, agent=self.agent_a,
        )
        self.assertIsNone(rejected)
        self.assertIn('步进 0.5', error_msg)
        self.assertEqual(ImageReview.objects.get().commentary, '再看一次')

    def test_several_agents_average_into_the_displayed_overall(self):
        call_mcp_tool(self.server, 'submit_photo_review', self._scores('喜欢留白', 8), agent=self.agent_a)
        call_mcp_tool(self.server, 'submit_photo_review', self._scores('光太硬', 7), agent=self.agent_b)
        summary = review_summary(self.image)
        self.assertEqual(summary['overall'], 7.5)
        self.assertEqual(summary['count'], 2)

        response = self.client.get(f'/api/article/image/reviews/{self.image.image_id}')
        self.assertEqual(response.data['data']['overall'], 7.5)
        self.assertEqual({item['agent_name'] for item in response.data['data']['reviews']}, {'青子', '白子'})

        hidden = self.client.get(f'/api/article/image/reviews/{self.hidden_image.image_id}')
        self.assertNotEqual(hidden.data['code'], 200)

        self.image.delete()
        self.assertEqual(ImageReview.objects.count(), 0)

    def test_photo_skill_sync_keeps_the_markdown_skill(self):
        Skill.objects.create(
            id='skill_polish', name='文章润色', skill_key='odoc_agent_post_markdown_guide',
            source='built_in', is_system=True, prompt='旧提示',
        )
        sync_builtin_skills()
        polish = Skill.objects.get(skill_key='odoc_agent_post_markdown_guide')
        photo = Skill.objects.get(skill_key='odoc_photo_review')
        self.assertEqual(polish.name, '文章润色')
        self.assertNotEqual(polish.prompt, '旧提示')
        self.assertEqual(photo.name, '照片评价')
        self.assertFalse(photo.available_in_chat)
        self.assertIn('observe_photo', photo.prompt)
        self.assertIn('submit_photo_review', photo.prompt)

    def test_independent_devices_create_the_same_review_id(self):
        first, error = call_mcp_tool(self.server, 'submit_photo_review', self._scores('设备一'), agent=self.agent_a)
        self.assertIsNone(error)
        first_id = first['review']['review_id']
        ImageReview.objects.all().delete()
        second, error = call_mcp_tool(self.server, 'submit_photo_review', self._scores('设备二'), agent=self.agent_a)
        self.assertIsNone(error)
        self.assertEqual(first_id, second['review']['review_id'])
        other, error = call_mcp_tool(self.server, 'submit_photo_review', self._scores('另一 Agent'), agent=self.agent_b)
        self.assertIsNone(error)
        self.assertNotEqual(first_id, other['review']['review_id'])

    def test_rename_without_duplicate_keeps_binding(self):
        from system_settings.mcp_builtin_compat import rename_photo_mcp

        self.server.name = '照片观察 MCP'
        self.server.save()
        self.agent_a.mcp_servers = [self.server.id]
        self.agent_a.save()
        rename_photo_mcp()
        self.server.refresh_from_db()
        self.agent_a.refresh_from_db()
        self.assertEqual(self.server.name, '照片 MCP')
        self.assertEqual(self.agent_a.mcp_servers, [self.server.id])

    def test_migration_preserves_existing_review(self):
        from importlib import import_module
        from django.apps import apps
        from django.db import connection
        from article.photo_observation import photo_review_id

        result, error = call_mcp_tool(self.server, 'submit_photo_review', self._scores('保留评语'), agent=self.agent_a)
        self.assertIsNone(error)
        stable_id = result['review']['review_id']
        ImageReview.objects.filter(pk=stable_id).update(review_id='irev_legacy')
        migration = import_module('article.migrations.0021_stable_image_review_ids')
        migration.stabilize_ids(apps, SimpleNamespace(connection=connection))
        review = ImageReview.objects.get(pk=photo_review_id(self.image.image_id, self.agent_a.id))
        self.assertEqual(review.commentary, '保留评语')
        self.assertEqual(ImageReview.objects.count(), 1)

    def test_rename_keeps_old_id_and_merges_bindings(self):
        from system_settings.mcp_builtin_compat import rename_photo_mcp

        old = MCPServer.objects.create(name='照片观察 MCP', source='system', tools=[{'name': 'observe_photo', 'enabled': False}])
        self.agent_a.mcp_servers = [old.id, self.server.id, self.vision_server.id]
        self.agent_a.save()
        self.agent_b.mcp_servers = [self.server.id]
        self.agent_b.save()
        rename_photo_mcp()
        rename_photo_mcp()
        old.refresh_from_db()
        self.agent_a.refresh_from_db()
        self.agent_b.refresh_from_db()
        self.assertEqual(old.name, '照片 MCP')
        self.assertEqual(old.tools[0]['enabled'], False)
        self.assertEqual(self.agent_a.mcp_servers, [old.id, self.vision_server.id])
        self.assertEqual(self.agent_b.mcp_servers, [old.id])
        self.assertFalse(MCPServer.objects.filter(pk=self.server.id).exists())

    def _scores(self, commentary, score=7.5):
        return {
            'image_id': self.image.image_id,
            'commentary': commentary,
            'theme': score,
            'composition': score,
            'idea': score,
            'light': score,
            'color': score,
            'focus': score,
        }
