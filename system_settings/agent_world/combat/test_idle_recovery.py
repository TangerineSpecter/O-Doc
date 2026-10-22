from datetime import timedelta
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase

from .idle_recovery import project
from ..life_time import local_time, storage_time


class IdleRecoveryProjectionTests(SimpleTestCase):
    def setUp(self):
        self.base = local_time().replace(microsecond=0)

    def projection(self, seconds, hp=47, mp=0, rest=None):
        return project(hp, mp, 238, 156, self.base, rest,
                       now=self.base + timedelta(seconds=seconds))

    def test_whole_blocks_integer_rounding_and_full_time(self):
        before = self.projection(299)
        self.assertEqual((before['hp'], before['mp']), (47, 0))
        at = self.projection(300)
        self.assertEqual((at['hp'], at['mp']), (58, 15))
        self.assertEqual(at['recovery']['next_at'], (self.base + timedelta(minutes=10)).isoformat())
        self.assertEqual(at['recovery']['hp']['full_at'], (self.base + timedelta(minutes=90)).isoformat())
        self.assertEqual(at['recovery']['mp']['full_at'], (self.base + timedelta(minutes=55)).isoformat())

    def test_rest_blocks_hp_but_not_mp(self):
        rest = self.base + timedelta(minutes=30)
        before = self.projection(1799, hp=0, rest=rest)
        self.assertEqual((before['hp'], before['mp']), (0, 75))
        self.assertEqual(before['recovery']['hp']['next_at'], rest.isoformat())
        at = self.projection(1800, hp=0, rest=rest)
        self.assertEqual((at['hp'], at['mp']), (47, 90))
        self.assertEqual(at['recovery']['hp']['full_at'], (rest + timedelta(minutes=90)).isoformat())
        self.assertEqual(self.projection(2100, hp=0, rest=rest)['hp'], 58)

    def test_long_absence_caps_resources_and_stops_refresh(self):
        result = self.projection(86400)
        self.assertEqual((result['hp'], result['mp']), (238, 156))
        self.assertIsNone(result['recovery']['next_at'])
        self.assertIsNone(result['recovery']['hp']['full_at'])
        self.assertIsNone(result['recovery']['mp']['full_at'])

    def test_independent_resources_and_minimum_one_point(self):
        result = self.projection(300, hp=238)
        self.assertIsNone(result['recovery']['hp']['next_at'])
        self.assertIsNotNone(result['recovery']['next_at'])
        tiny = project(1, 0, 3, 2, self.base, now=self.base + timedelta(minutes=5))
        self.assertEqual((tiny['hp'], tiny['mp']), (2, 1))


class IdleRecoveryProfileTests(TestCase):
    def setUp(self):
        from system_settings.models import Agent, AIProvider, AIModel
        from .store import install
        from .profiles import ensure
        provider = AIProvider.objects.create(name='test', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='test', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='恢复测试', model=model)
        self.base = storage_time(local_time())
        install()
        self.profile = ensure('admin', self.agent, self.base)
        self.profile.hp = 1
        self.profile.mp = 0
        self.profile.save()

    def test_profile_read_projects_without_writing_or_restarting_clock(self):
        from .queries import profile_view
        from .profiles import stats, recover
        derived = stats(self.profile)
        baseline = self.profile.recovered_at
        point = self.base + timedelta(minutes=12)
        with patch('system_settings.agent_world.life_time.timezone.now', return_value=point):
            first = profile_view('admin', self.agent)
            second = profile_view('admin', self.agent)
        self.assertEqual(first['hp'], min(derived['hp_max'], 1 + max(1, int(derived['hp_max'] * .05)) * 2))
        self.assertEqual(first, second)
        self.profile.refresh_from_db()
        self.assertEqual((self.profile.hp, self.profile.mp, self.profile.recovered_at), (1, 0, baseline))
        recover(self.profile, point)
        self.assertEqual((first['hp'], first['mp']), (self.profile.hp, self.profile.mp))

    def test_open_exploration_disables_idle_projection(self):
        from . import explorations
        from .queries import profile_view
        explorations.request('admin', self.agent, 'recovery-trip', {}, now=self.base)
        with patch('system_settings.agent_world.life_time.timezone.now', return_value=self.base + timedelta(hours=2)):
            view = profile_view('admin', self.agent)
        self.assertEqual((view['hp'], view['mp']), (1, 0))
        self.assertIsNone(view['recovery'])

    def test_profile_api_returns_recovery_times_without_persisting_preview(self):
        from django.contrib.auth.models import User
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(User.objects.create_superuser('admin', password='test-password'))
        with patch('system_settings.agent_world.life_time.timezone.now', return_value=self.base + timedelta(minutes=5)):
            response = client.get(f'/api/settings/agent-world/combat/agents/{self.agent.pk}/')
        self.assertEqual(response.status_code, 200)
        view = response.json()['data']
        self.assertGreater(view['hp'], 1)
        self.assertIn('serverNow', view['recovery'])
        self.assertIn('nextAt', view['recovery']['hp'])
        self.assertIn('fullAt', view['recovery']['mp'])
        self.profile.refresh_from_db()
        self.assertEqual((self.profile.hp, self.profile.mp), (1, 0))
