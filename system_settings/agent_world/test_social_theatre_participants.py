"""固定参与名单、账号候选边界与既有场次JSON保存。"""
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo
from django.test import TestCase
from system_settings.models import WorldActionRuntime
from .life_models import LifeConfig
from .life_config import DEFAULTS as LIFE_DEFAULTS
from .social_models import SocialConfig
from .social_config import DEFAULTS as SOCIAL_DEFAULTS
from .social_theatre_runner import queue_manual_event


class ManualParticipantTests(TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 10, 12, tzinfo=ZoneInfo('Asia/Shanghai'))
        self.owner = 'manual-participant-test'
        WorldActionRuntime.objects.update_or_create(pk='world', defaults={'enabled': True})
        LifeConfig.objects.create(id=self.owner, migrated=True, settings={
            **LIFE_DEFAULTS, 'active_start': '08:00', 'active_end': '22:00'})
        self.config = SocialConfig.objects.create(id=self.owner, settings={
            **SOCIAL_DEFAULTS, 'enabled': True, 'theatre_daily_count': 0,
            'theatre_search_server_id': 'search', 'agent_ids': ['a', 'b']})
        self.enterContext(patch('system_settings.agent_world.social_theatre_runner.configured_residents',
            return_value=[SimpleNamespace(pk='a', name='甲'), SimpleNamespace(pk='b', name='乙')]))

    def test_two_specified_residents_are_saved_and_same_request_reuses_scene(self):
        first = queue_manual_event(self.config, self.now, topic='议题', participant_ids=['b', 'a'])
        first.refresh_from_db()
        self.assertEqual(first.snapshot['manual_participant_ids'], ['b', 'a'])
        self.assertEqual(set(first.snapshot['participant_ids']), {'a', 'b'})
        self.assertEqual(queue_manual_event(self.config, self.now, topic='议题', participant_ids=['a', 'b']).pk, first.pk)
        with self.assertRaisesRegex(ValueError, '参与居民'):
            queue_manual_event(self.config, self.now, topic='另一议题', participant_ids=['a', 'b'])

    def test_api_options_and_invalid_selection(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .social_theatre_views import SocialTheatreTriggerView
        factory = APIRequestFactory()
        with patch('system_settings.agent_world.social_theatre_views.get_current_user_identifier', return_value=self.owner):
            request = factory.get('/')
            force_authenticate(request, SimpleNamespace(is_authenticated=True))
            self.assertEqual([person['id'] for person in SocialTheatreTriggerView.as_view()(request).data['data']['participants']], ['a', 'b'])
            for ids in (['a'], ['a', 'a'], 'a,b', ['a', 'b', 'c', 'd'], [None, 'a']):
                request = factory.post('/', {'participant_ids': ids}, format='json')
                force_authenticate(request, SimpleNamespace(is_authenticated=True))
                self.assertEqual(SocialTheatreTriggerView.as_view()(request).status_code, 400)

    def test_foreign_duplicate_and_paused_residents_are_rejected(self):
        for ids in (['a', 'other-owner'], ['a', 'a'], ['a']):
            with self.subTest(ids=ids), self.assertRaises(ValueError):
                queue_manual_event(self.config, self.now, participant_ids=ids)
        LifeConfig.objects.filter(pk=self.owner).update(paused_agents=['b'])
        with self.assertRaisesRegex(ValueError, '已暂停'):
            queue_manual_event(self.config, self.now, participant_ids=['a', 'b'])

    def test_automatic_mode_keeps_three_resident_minimum(self):
        with self.assertRaisesRegex(ValueError, '至少需要3位'):
            queue_manual_event(self.config, self.now)
