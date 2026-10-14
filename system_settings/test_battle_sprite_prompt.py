"""Prompt-only regressions; no database or provider requests."""
import unittest
from types import SimpleNamespace

from system_settings.battle_head_generation import build_battle_head_request


class BattleSpritePromptTests(unittest.TestCase):
    def test_current_agent_appearance_and_supplement_are_included_once(self):
        agent = SimpleNamespace(name='菲伦', prompt='公共补充要求',
                                role_profile={'appearance': '紫色长发', 'personality': '认真'})
        request = build_battle_head_request({}, {}, agent)
        self.assertIn('当前 Agent：菲伦', request['prompt'])
        self.assertIn('紫色长发', request['prompt'])
        self.assertEqual(request['prompt'].count('公共补充要求'), 1)
        self.assertNotIn('认真', request['prompt'])

    def test_transparent_request_has_no_conflicting_flat_background_instruction(self):
        request = build_battle_head_request({'background_mode': 'transparent'}, {})
        self.assertIn('genuinely transparent alpha', request['prompt'])
        self.assertIn('Do not paint a checkerboard', request['prompt'])
        self.assertNotIn('magenta background', request['prompt'])
        self.assertNotIn('background_mode', request)

    def test_default_flat_background_covers_enclosed_gaps(self):
        request = build_battle_head_request({}, {})
        self.assertIn('#FF00FF', request['prompt'])
        self.assertIn('every gap between hair and arms', request['prompt'])

    def test_pose_and_override_keep_their_reference_roles(self):
        request = build_battle_head_request(
            {'pose_reference_image_id': 'pose', 'appearance_reference_image_id': 'override',
             'background_mode': 'transparent'},
            {'supports_reference_images': True, 'max_reference_images': 4,
             'agent_reference_images': {'avatar': 'face', 'full_body': 'configured-body'}},
        )
        self.assertEqual(request['reference_image_ids'], ['pose', 'override', 'face'])
        self.assertIn('IMAGE 1 = battle pose template', request['prompt'])

    def test_unknown_background_mode_is_rejected(self):
        with self.assertRaises(ValueError):
            build_battle_head_request({'background_mode': 'unknown'}, {})
