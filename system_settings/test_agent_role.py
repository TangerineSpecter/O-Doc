"""Character compatibility, organization, scene projection and atomic serialization."""
import json
from types import SimpleNamespace
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from .agent_role import role_text, validate_profile, profile_version, FIELDS
from .agent_role_organizer import organize_role
from .models import Agent
from .serializers import AgentSerializer


class RoleProjectionTests(SimpleTestCase):
    def setUp(self):
        self.agent = SimpleNamespace(name='菲伦', prompt='公共补充', model_id='m',
            role_profile={'age': '18岁', 'identity': '魔法使', 'personality': '先了解再判断',
                'preferences': '甜点', 'expression': '轻声提醒', 'appearance': '紫发紫瞳', 'mbti': 'ISTJ'})

    def test_decision_excludes_appearance_and_expression(self):
        value = role_text(self.agent, 'decision')
        for content in ('菲伦', '魔法使', '先了解再判断', '甜点', '公共补充'):
            self.assertIn(content, value)
        for content in ('紫发紫瞳', '轻声提醒', '18岁'):
            self.assertNotIn(content, value)
        self.assertEqual(value.count('公共补充'), 1)

    def test_legacy_and_structured_only(self):
        self.agent.role_profile = {}
        self.assertIn('公共补充', role_text(self.agent))
        self.agent.prompt = ''
        self.agent.role_profile = {'personality': '认真'}
        self.assertIn('认真', role_text(self.agent))
        self.assertIn('菲伦', role_text(self.agent))

    def test_image_and_memory_are_distinct_and_source_unchanged(self):
        before = json.dumps(self.agent.role_profile)
        self.assertIn('紫发紫瞳', role_text(self.agent, 'image'))
        self.assertNotIn('紫发紫瞳', role_text(self.agent, 'memory'))
        self.assertEqual(before, json.dumps(self.agent.role_profile))
        old = profile_version(self.agent)
        self.agent.role_profile['personality'] = '新判断'
        self.assertNotEqual(old, profile_version(self.agent))

    def test_invalid_profile(self):
        for value in ([], {'unknown': ''}, {'mbti': 'abcd'}, {'identity': 3}):
            with self.assertRaises(ValueError):
                validate_profile(value)

    @patch('system_settings.agent_role_organizer.complete')
    @patch('system_settings.agent_role_organizer.AIService.get_client_config_for_model', return_value={})
    def test_organizer_returns_preview_without_persistence(self, config, completion):
        draft = {'role_profile': {key: '' for key in FIELDS}, 'prompt': '未分类要求', 'warnings': ['重复姓名已移除']}
        draft['role_profile']['identity'] = '魔法使'
        completion.return_value = json.dumps(draft)
        result = organize_role({'name': '菲伦', 'prompt': '原文', 'role_profile': {}, 'model_id': ''})
        self.assertEqual(result, draft)
        self.assertIn('不创作', completion.call_args.args[1])


class RolePersistenceTests(TestCase):
    def test_patch_omission_preserves_and_partial_profile_merges(self):
        agent = Agent.objects.create(name='角色', prompt='旧设定', role_profile={'identity': '魔法使'})
        serializer = AgentSerializer(agent, data={'prompt': ''}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        agent.refresh_from_db()
        self.assertEqual(agent.role_profile, {'identity': '魔法使'})
        serializer = AgentSerializer(agent, data={'role_profile': {'personality': '认真'}}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        self.assertEqual(agent.role_profile, {'identity': '魔法使', 'personality': '认真'})
        self.assertEqual(AgentSerializer(agent).data['role_profile'], agent.role_profile)

    def test_sync_roundtrip_and_legacy_missing_fields(self):
        from django.core import serializers
        from .agent_archive_sync import prepare_restore
        agent = Agent.objects.create(name='同步角色', role_profile={'identity':'魔法使','personality':'认真'})
        data = json.loads(serializers.serialize('json', [agent]))
        self.assertEqual(data[0]['fields']['role_profile'], agent.role_profile)
        legacy = json.loads(json.dumps(data))
        del legacy[0]['fields']['role_profile']
        prepare_restore(legacy, full_overwrite=False, retain_extra=True)
        self.assertEqual(legacy[0]['fields']['role_profile'], agent.role_profile)
        restored = next(serializers.deserialize('json', json.dumps(data)))
        restored.save()
        agent.refresh_from_db()
        self.assertEqual(agent.role_profile['personality'], '认真')
