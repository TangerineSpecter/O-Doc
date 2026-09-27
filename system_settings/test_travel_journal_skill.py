from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from .agent_task_scheduler import AgentTaskScheduler
from .builtin_skills import (
    BUILTIN_SKILL_SPECS,
    TRAVEL_JOURNAL_SKILL_KEY,
    _sync_builtin_skill,
    parse_markdown_skill_document,
)


class TravelJournalSkillTests(SimpleTestCase):
    def setUp(self):
        self.spec = next(spec for spec in BUILTIN_SKILL_SPECS
                         if spec['skill_key'] == TRAVEL_JOURNAL_SKILL_KEY)
        self.meta, self.prompt = parse_markdown_skill_document(
            self.spec['path'].read_text(encoding='utf-8'), self.spec['fallback_meta'],
        )

    def test_registration_creates_bindable_system_skill_from_document(self):
        with patch('system_settings.builtin_skills.Skill.objects') as manager:
            manager.filter.return_value.first.return_value = None
            _sync_builtin_skill(self.spec)
        created = manager.create.call_args.kwargs
        self.assertEqual(created['skill_key'], 'odoc_travel_journal')
        self.assertEqual(created['name'], '旅行游记')
        self.assertEqual(created['version'], '1.0.0')
        self.assertEqual(created['source'], 'built_in')
        self.assertTrue(created['enabled'])
        self.assertTrue(created['is_system'])
        self.assertFalse(created['available_in_chat'])
        self.assertEqual(created['prompt'], self.prompt)
        self.assertNotIn('description:', created['prompt'])
        self.assertEqual(created['manifest']['kind'], 'travel_journal')

    def test_resync_preserves_identity_and_user_enablement(self):
        existing = SimpleNamespace(
            id='existing-travel-skill', skill_key=TRAVEL_JOURNAL_SKILL_KEY,
            enabled=False, available_in_chat=True,
        )
        with patch('system_settings.builtin_skills.Skill.objects') as manager:
            manager.filter.return_value.first.return_value = None
            _sync_builtin_skill(self.spec)
            for field, value in manager.create.call_args.kwargs.items():
                if field not in {'enabled', 'available_in_chat'}:
                    setattr(existing, field, value)
            manager.reset_mock()
            manager.filter.return_value.first.return_value = existing
            _sync_builtin_skill(self.spec)
        manager.create.assert_not_called()
        self.assertEqual(existing.id, 'existing-travel-skill')
        self.assertFalse(existing.enabled)
        self.assertTrue(existing.available_in_chat)

    def test_bound_skill_is_loaded_with_persona_and_task(self):
        agent = SimpleNamespace(
            name='旅行者', prompt='你性格粗犷，表达直接。', skills=['travel-skill'],
        )
        task = SimpleNamespace(agent=agent, name='旅行心得', prompt='下雨，鞋湿了，没买纪念品。只写草稿。')
        skill = SimpleNamespace(name=self.meta['name'], prompt=self.prompt)
        with patch('system_settings.agent_task_scheduler.Skill.objects.filter', return_value=[skill]) as query, \
                patch.object(AgentTaskScheduler, '_has_agent_post_markdown_skill', return_value=True), \
                patch.object(AgentTaskScheduler, '_relation_behavior_note', return_value=''):
            prompt = AgentTaskScheduler()._build_prompt(task)
        query.assert_called_once_with(id__in=['travel-skill'], enabled=True)
        self.assertIn(agent.prompt, prompt)
        self.assertIn('### 旅行游记\n' + self.prompt, prompt)
        self.assertIn(task.prompt, prompt)

    def test_unbound_agent_does_not_load_skill(self):
        with patch('system_settings.agent_task_scheduler.Skill.objects.filter') as query:
            self.assertEqual(AgentTaskScheduler._get_skill_prompts(
                SimpleNamespace(skills=[]),
            ), [])
        query.assert_not_called()
