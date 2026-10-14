"""Composed image contracts; no database, filesystem or provider calls."""
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from system_mcp.image_generation import validate_generation_arguments
from system_mcp.image_generation_tools import IMAGE_GENERATION_TOOLS
from system_settings.battle_head_generation import build_battle_head_request
from system_settings.image_prompt_limits import MAX_IMAGE_PROMPT_LENGTH
from system_settings.agent_world.publish_image_prompt import build_prompt
from system_settings.agent_world.social_image_prompt import SCENE_PREFIX
from system_settings.agent_world.social_media import prepare_image


class ImageRoleRequestTests(SimpleTestCase):
    def agent(self):
        return SimpleNamespace(name='菲伦', prompt='公共要求。' * 8000,
                               role_profile={'identity': '魔法使。' * 1500,
                                             'appearance': '紫长发。' * 1500})

    def test_post_and_battle_keep_full_role_and_pass_request_validation(self):
        agent = self.agent()
        article = SimpleNamespace(title='热茶', content='窗边的热茶。' * 1000)
        for subject in ('scene', 'agent'):
            prompt, refs = build_prompt(article, {'image_subject': subject}, {}, agent)
            self.assertEqual(validate_generation_arguments({'prompt': prompt})['prompt'], prompt)
            self.assertEqual(prompt.count(agent.prompt), 1)
            self.assertEqual(agent.role_profile['appearance'] in prompt, subject == 'agent')
        request = build_battle_head_request({'prompt': '调整外衣。' * 1600}, {}, agent)
        self.assertEqual(validate_generation_arguments(request)['prompt'], request['prompt'])
        self.assertEqual(request['prompt'].count(agent.prompt), 1)
        self.assertIn(agent.role_profile['appearance'], request['prompt'])

    def test_social_persists_a_valid_full_role_request(self):
        moment = Mock(owner_id='owner', actor_id='agent-id:test', pk='moment')
        options = {'configured': True, 'model_id': 'image', 'supports_reference_images': False}
        agent = self.agent()
        cfg = {'daily_images': 1, 'image_model_id': 'image', 'image_aspect_ratio': '1:1', 'image_size': '1K'}
        with patch('system_settings.agent_world.social_media.Moment.objects') as moments, \
             patch('system_mcp.image_generation.image_generation_options', return_value=options), \
             patch('system_mcp.image_generation.resolve_image_model'), \
             patch('system_settings.image_generation_options.resolve_image_generation_request'):
            moments.filter.return_value.exclude.return_value.count.return_value = 0
            prepare_image(moment, agent, cfg, SCENE_PREFIX + '窗边的一杯茶')
        self.assertEqual(moment.image_state['status'], 'pending')
        request = moment.image_state['request']
        self.assertEqual(validate_generation_arguments(request)['prompt'], request['prompt'])
        self.assertEqual(request['prompt'].count(agent.prompt), 1)
        self.assertNotIn(agent.role_profile['appearance'], request['prompt'])

    def test_final_limit_is_bounded_and_matches_tool_schema(self):
        prompt = '字' * MAX_IMAGE_PROMPT_LENGTH
        self.assertEqual(validate_generation_arguments({'prompt': prompt})['prompt'], prompt)
        with self.assertRaises(ValueError):
            validate_generation_arguments({'prompt': prompt + '字'})
        tool = next(tool for tool in IMAGE_GENERATION_TOOLS if tool['name'] == 'generate_image')
        self.assertEqual(tool['inputSchema']['properties']['prompt']['maxLength'], MAX_IMAGE_PROMPT_LENGTH)
