import json
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import SimpleTestCase, override_settings
from django.urls import resolve
from PIL import Image
from rest_framework.test import APIRequestFactory, force_authenticate

from .agent_prompt_generation import (
    SECTIONS, describe_avatar, generate_agent_prompt, render_generated_prompt,
)


def ready_result():
    sections = {key: f'{title}的具体设定' for key, title in SECTIONS}
    sections['personality_type'] = 'ISTJ 倾向：认真细心，通过行动表达关心。'
    return {'status': 'ready', 'sections': sections}


class AgentPromptGenerationTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User(username='isolated')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=self.temp.name, SYSTEM_LOG_DIR=self.temp.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

    def request(self, data, action='generate_prompt', authenticated=True):
        request = self.factory.post('/api/settings/agents/generate-prompt/', data, format='json')
        if authenticated:
            force_authenticate(request, self.user)
        endpoint = 'describe-avatar' if action == 'describe_avatar' else 'generate-prompt'
        return resolve(f'/api/settings/agents/{endpoint}/').func(request)

    def test_existing_and_original_require_their_own_material(self):
        with patch('system_settings.agent_prompt_generation.generate_agent_prompt') as generate:
            for kind in ('existing', 'original'):
                response = self.request({'character_type': kind, 'character_name': '菲伦'})
                self.assertEqual(response.status_code, 400)
            generate.assert_not_called()

    def test_generation_requires_authentication(self):
        response = self.request({'character_type': 'original', 'character_name': '测试', 'description': '魔法使'}, authenticated=False)
        self.assertIn(response.status_code, (401, 403))

    def test_original_output_is_draft_only_and_uses_selected_model(self):
        data = {'character_type': 'original', 'character_name': '测试', 'description': '温和的魔法使', 'model_id': 'chat-test'}
        with patch('system_settings.agent_prompt_generation.AIModel.objects.filter') as models, \
                patch('system_settings.agent_prompt_generation.AIService.get_client_config_for_model', return_value={'model_name': 'test'}) as config, \
                patch('system_settings.agent_prompt_generation.complete', return_value=json.dumps(ready_result(), ensure_ascii=False)) as completion:
            models.return_value.exists.return_value = True
            response = self.request(data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['status'], 'ready')
        self.assertIn('## 人格倾向', response.data['data']['prompt'])
        config.assert_called_once_with('chat-test')
        self.assertIn('温和的魔法使', completion.call_args.args[1])
        # SimpleTestCase 禁止数据库访问，生成过程不能保存 Agent。

    def test_default_model_and_needs_information(self):
        with patch('system_settings.agent_prompt_generation.AIService.get_client_config_for_model', return_value={}) as config, \
                patch('system_settings.agent_prompt_generation.complete', return_value=json.dumps({'status': 'needs_information', 'question': '请补充角色经历'})):
            response = self.request({'character_type': 'existing', 'character_name': '未知角色', 'source': '未知作品'})
        config.assert_called_once_with(None)
        self.assertEqual(response.data['data']['prompt'], '')
        self.assertEqual(response.data['data']['question'], '请补充角色经历')

    def test_camel_case_request_and_response_contract(self):
        with patch('system_settings.agent_prompt_generation.generate_agent_prompt', return_value={'status': 'ready', 'prompt': '角色卡', 'question': ''}) as generate:
            response = self.request({'characterType': 'existing', 'characterName': '菲伦', 'source': '葬送的芙莉莲', 'description': '上一种角色类型的草稿', 'referenceAvatar': False})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(generate.call_args.args[0]['character_name'], '菲伦')
        self.assertEqual(generate.call_args.args[0]['description'], '')
        response.render()
        self.assertIn('avatarUsed', json.loads(response.content)['data'])

    def test_invalid_model_rejected_before_provider_request(self):
        with patch('system_settings.agent_prompt_generation.AIModel.objects.filter') as models, \
                patch('system_settings.agent_prompt_generation.complete') as completion:
            models.return_value.exists.return_value = False
            response = self.request({'character_type': 'original', 'character_name': '测试', 'description': '设定', 'model_id': 'image-model'})
        self.assertEqual(response.status_code, 400)
        completion.assert_not_called()

    def test_template_is_complete_without_shared_rules_or_examples(self):
        result = render_generated_prompt(json.dumps(ready_result(), ensure_ascii=False))
        for _, title in SECTIONS:
            self.assertIn(title, result['prompt'])
        self.assertNotIn('语气参考', result['prompt'])
        self.assertNotIn('角色表达原则', result['prompt'])
        for invalid in ('', '{}', '[]', '{"status":"ready","sections":{}}'):
            with self.assertRaises(ValueError):
                render_generated_prompt(invalid)
        body = ready_result()
        body['sections']['age'] = '## 语气参考\n示例'
        with self.assertRaises(ValueError):
            render_generated_prompt(json.dumps(body))
        body = ready_result()
        body['sections']['personality_type'] = '内向认真'
        with self.assertRaises(ValueError):
            render_generated_prompt(json.dumps(body))

    def test_research_character_uses_configured_tavily_mcp(self):
        server = SimpleNamespace(
            name='tavily搜索',
            url='https://mcp.tavily.com/mcp/',
            description='外部 Tavily 搜索',
            tools=[{'name': 'tavily_search', 'enabled': True}],
        )
        data = {
            'character_type': 'existing',
            'character_name': '菲伦',
            'source': '葬送的芙莉莲',
            'description': '',
            'requirements': '',
            'avatar_description': '',
            'model_id': '',
            'research_character': True,
        }
        with patch('system_settings.agent_prompt_generation.MCPServer.objects.filter') as servers, \
                patch('system_settings.agent_prompt_generation.AIService.get_client_config_for_model', return_value={'model_name': 'test'}), \
                patch('system_settings.agent_prompt_generation.call_mcp_tool', return_value=({'results': [
                    {'title': '菲伦资料', 'url': 'https://example.com/fern', 'content': '沉静可靠的人类魔法使。'},
                ]}, None)) as call_tool, \
                patch('system_settings.agent_prompt_generation.complete', return_value=json.dumps(ready_result(), ensure_ascii=False)) as completion:
            servers.return_value.order_by.return_value = [server]
            result = generate_agent_prompt(data)

        self.assertTrue(result['research_used'])
        self.assertEqual(result['research_warning'], '')
        call_tool.assert_called_once()
        self.assertIn('菲伦资料', completion.call_args.args[1])

    def test_research_without_tavily_falls_back_with_warning(self):
        data = {
            'character_type': 'existing',
            'character_name': '未知角色',
            'source': '未知作品',
            'description': '',
            'requirements': '',
            'avatar_description': '',
            'model_id': '',
            'research_character': True,
        }
        with patch('system_settings.agent_prompt_generation.MCPServer.objects.filter') as servers, \
                patch('system_settings.agent_prompt_generation.AIService.get_client_config_for_model', return_value={'model_name': 'test'}), \
                patch('system_settings.agent_prompt_generation.complete', return_value=json.dumps(ready_result(), ensure_ascii=False)):
            servers.return_value.order_by.return_value = []
            result = generate_agent_prompt(data)

        self.assertFalse(result['research_used'])
        self.assertIn('Tavily', result['research_warning'])

    def test_provider_error_is_safe_and_missing_default_is_actionable(self):
        data = {'character_type': 'original', 'character_name': '测试', 'description': '魔法使'}
        with patch('system_settings.agent_prompt_generation.generate_agent_prompt', side_effect=ValueError('No default model configured')):
            response = self.request(data)
        self.assertEqual(response.status_code, 400)
        self.assertIn('默认对话模型', response.data['msg'])
        with patch('system_settings.agent_prompt_generation.generate_agent_prompt', side_effect=RuntimeError('private-provider-response')), \
                patch('system_settings.agent_views.logger'):
            response = self.request(data)
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('private-provider-response', str(response.data))

    def test_image_model_failure_is_nonfatal(self):
        with patch('system_settings.agent_prompt_generation.Asset.objects.filter') as assets, \
                patch('assets.views.can_read_asset', return_value=True), \
                patch('system_settings.agent_prompt_generation.build_image_data_url', return_value='data:image/jpeg;base64,fixture'), \
                patch('system_settings.agent_prompt_generation.AIService.describe_image_for_agent', side_effect=ValueError('no image model')), \
                patch('system_settings.agent_prompt_generation.logger'):
            assets.return_value.first.return_value = SimpleNamespace(file_path='avatar.png')
            result = describe_avatar(SimpleNamespace(), '/api/resource/view/avatar')
        self.assertFalse(result['avatar_used'])
        self.assertEqual(result['description'], '')
        self.assertIn('未参考头像', result['warning'])

    def test_avatar_reads_uploaded_image_and_calls_vision(self):
        file = Path(self.temp.name) / 'avatar.png'
        Image.new('RGB', (8, 8), 'purple').save(file)
        asset = SimpleNamespace(file_path='avatar.png', mime_type='image/png', original_name='avatar.png')
        request = SimpleNamespace(user=self.user)
        with patch('system_settings.agent_prompt_generation.Asset.objects.filter') as assets, \
                patch('assets.views.can_read_asset', return_value=True), \
                patch('article.image_service.Asset.objects.filter') as image_assets, \
                patch('system_settings.agent_prompt_generation.AIService.describe_image_for_agent', return_value='紫色头发，紫色眼睛。') as vision:
            assets.return_value.first.return_value = asset
            image_assets.return_value.first.return_value = asset
            result = describe_avatar(request, '/api/resource/view/avatar-test')
        self.assertTrue(result['avatar_used'])
        self.assertTrue(vision.call_args.args[0].startswith('data:image/jpeg;base64,'))

    def test_unreadable_remote_or_outside_avatar_never_calls_vision(self):
        with patch('system_settings.agent_prompt_generation.Asset.objects.filter') as assets, \
                patch('assets.views.can_read_asset', return_value=False), \
                patch('system_settings.agent_prompt_generation.AIService.describe_image_for_agent') as vision:
            assets.return_value.first.return_value = SimpleNamespace(file_path='avatar.png')
            for avatar in ('💜', 'https://example.com/a.png', '/api/resource/view/private'):
                self.assertFalse(describe_avatar(SimpleNamespace(), avatar)['avatar_used'])
            vision.assert_not_called()
        with patch('system_settings.agent_prompt_generation.Asset.objects.filter') as assets, \
                patch('assets.views.can_read_asset', return_value=True), \
                patch('system_settings.agent_prompt_generation.build_image_data_url') as read:
            assets.return_value.first.return_value = SimpleNamespace(file_path='../outside.png')
            self.assertFalse(describe_avatar(SimpleNamespace(), '/api/resource/view/outside')['avatar_used'])
            read.assert_not_called()

    def test_avatar_failure_continues_generation_and_warns(self):
        with patch('system_settings.agent_prompt_generation.describe_avatar', return_value={'description': '', 'avatar_used': False, 'warning': '本次未参考头像'}), \
                patch('system_settings.agent_prompt_generation.generate_agent_prompt', return_value={'status': 'ready', 'prompt': '角色卡', 'question': ''}):
            response = self.request({'character_type': 'original', 'character_name': '测试', 'description': '设定', 'reference_avatar': True, 'avatar': '/api/resource/view/avatar'})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['data']['avatar_used'])
        self.assertIn('未参考头像', response.data['data']['warning'])
