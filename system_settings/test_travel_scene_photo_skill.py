from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase

from .agent_task_scheduler import AgentTaskScheduler
from .builtin_skills import BUILTIN_SKILL_SPECS, TRAVEL_JOURNAL_SKILL_KEY, TRAVEL_SCENE_PHOTO_SKILL_KEY, _sync_builtin_skill
from .models import Agent, Skill


class TravelScenePhotoSkillTests(TestCase):
    def setUp(self):
        self.specs = [spec for spec in BUILTIN_SKILL_SPECS
                      if spec['skill_key'] in {TRAVEL_JOURNAL_SKILL_KEY, TRAVEL_SCENE_PHOTO_SKILL_KEY}]
        for spec in self.specs:
            _sync_builtin_skill(spec)

    def test_both_bound_skills_load_with_persona_and_task(self):
        journal = Skill.objects.get(skill_key=TRAVEL_JOURNAL_SKILL_KEY)
        scene = Skill.objects.get(skill_key=TRAVEL_SCENE_PHOTO_SKILL_KEY)
        agent = Agent.objects.create(name='旅行者', prompt='你性格克制，保持原本二次元形象。', skills=[journal.pk, scene.pk])
        task = SimpleNamespace(agent=agent, name='图文游记', prompt='店铺关门，没买纪念品。写带场景照的草稿。')
        with patch.object(AgentTaskScheduler, '_has_agent_post_markdown_skill', return_value=True), \
                patch.object(AgentTaskScheduler, '_relation_behavior_note', return_value=''):
            prompt = AgentTaskScheduler()._build_prompt(task)
        self.assertIn(agent.prompt, prompt)
        self.assertIn(journal.prompt, prompt)
        self.assertIn(scene.prompt, prompt)
        self.assertIn(task.prompt, prompt)

    def test_resync_preserves_binding_identity_and_disabled_state(self):
        scene = Skill.objects.get(skill_key=TRAVEL_SCENE_PHOTO_SKILL_KEY)
        agent = Agent.objects.create(name='角色', skills=[scene.pk])
        scene.enabled = False
        scene.available_in_chat = True
        scene.save()
        for spec in self.specs:
            _sync_builtin_skill(spec)
        scene.refresh_from_db()
        agent.refresh_from_db()
        self.assertFalse(scene.enabled)
        self.assertTrue(scene.available_in_chat)
        self.assertEqual(agent.skills, [scene.pk])
        self.assertEqual(Skill.objects.filter(skill_key=TRAVEL_SCENE_PHOTO_SKILL_KEY).count(), 1)
        self.assertEqual(AgentTaskScheduler._get_skill_prompts(agent), [])

    def test_registration_does_not_bind_existing_agents(self):
        agent = Agent.objects.create(name='未绑定', skills=[])
        for spec in self.specs:
            _sync_builtin_skill(spec)
        agent.refresh_from_db()
        self.assertEqual(agent.skills, [])
        self.assertEqual(AgentTaskScheduler._get_skill_prompts(agent), [])
