"""Resident activity exposes only saved decisions for the current owner."""
from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from system_settings.models import Agent
from .combat.models import CombatCatalog, CombatFact
from .life_models import LifeItem, LifeProfile, LifeRevision
from .life_time import local_time, storage_time
from .resident_decisions import decision_events, latest_decision_day


class ResidentDecisionFeedTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(username='admin', password='test')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.actor = Agent.objects.create(name='星河')
        LifeProfile.objects.create(id=self.actor.pk, owner_id=self.user.username)
        self.now = local_time().replace(hour=12, minute=0, second=0, microsecond=0)

    def plan(self, *, days=1, reason='想通过探索熟悉新区域', owner=None, actor=None):
        actor = actor or self.actor
        owner = owner or self.user.username
        moment = storage_time(self.now - timedelta(days=days))
        item = LifeItem.objects.create(id=f'item-{days}-{actor.pk}', owner_id=owner, actor_id=actor.pk,
                                       original_at=moment, scheduled_at=moment)
        return LifeRevision.objects.create(item=item,
            before={'activity': 'unplanned', 'intent': '', 'status': 'pending'},
            after={'activity': 'exploration', 'intent': reason, 'status': 'pending',
                   'scheduled_at': local_time(moment).isoformat()},
            reason=reason, created_at=moment)

    def test_model_plan_and_promotion_reason_are_visible_only_in_resident_view(self):
        revision = self.plan()
        CombatCatalog.objects.create(id='decision-catalog', digest='test',
                                     tables={'professions': [{'id': 'job.ranger', 'name': '游侠'}]})
        fact = CombatFact.objects.create(id='promote-decision', owner_id=self.user.username,
            actor_id=self.actor.pk, sequence=1, kind='promote', digest='test',
            payload={'arguments': 'job.ranger', 'catalog_id': 'decision-catalog',
                     'reason': '偏好远程探索，现有装备也适合游侠', 'progression_after': {'level': 10}},
            created_at=storage_time(self.now - timedelta(days=2)))
        self.assertEqual(len(decision_events(self.user.username, self.actor.pk,
                                             (self.now - timedelta(days=1)).date(), {self.actor.pk: self.actor.name})), 1)
        self.assertEqual(latest_decision_day(self.user.username, self.actor.pk,
                                             storage_time(self.now.replace(hour=0))),
                         (self.now - timedelta(days=1)).date())
        params = {'actor_id': self.actor.pk, 'include_decisions': '1', 'page_size': 1}
        first_response = self.client.get('/api/settings/agent-world/daily-feed/', params)
        self.assertEqual(first_response.status_code, 200, first_response.data)
        first = first_response.data['data']
        self.assertTrue(first['nextCursor'], first)
        second = self.client.get('/api/settings/agent-world/daily-feed/',
                                 {**params, 'cursor': first['nextCursor']}).data['data']
        self.assertEqual([row['id'] for row in first['items'] + second['items']],
                         [f'life-decision:{revision.pk}', f'combat-promotion:{fact.pk}'])
        self.assertEqual(first['items'][0]['detail'], '想通过探索熟悉新区域')
        self.assertEqual(second['items'][0]['title'], 'Lv.10 转职为游侠')
        self.assertEqual(second['items'][0]['detail'], '偏好远程探索，现有装备也适合游侠')
        self.assertFalse(second['hasMore'])
        ordinary = self.client.get('/api/settings/agent-world/daily-feed/',
                                   {'actor_id': self.actor.pk}).data['data']
        self.assertEqual(ordinary['items'], [])
        self.assertEqual(ordinary['allTotal'], 0)

    def test_choice_without_model_reason_and_owner_scope(self):
        self.plan(reason='系统选择说明：为该时段选择exploration，这是计划，尚未执行。')
        response = self.client.get('/api/settings/agent-world/daily-feed/',
                                   {'actor_id': self.actor.pk, 'include_decisions': '1'}).data['data']
        self.assertEqual(response['items'][0]['decisionBasis'], 'choice_only')
        self.assertEqual(response['items'][0]['detail'], '')
        other = Agent.objects.create(name='别人的居民')
        LifeProfile.objects.create(id=other.pk, owner_id='another-owner')
        self.plan(actor=other, owner='another-owner')
        hidden = self.client.get('/api/settings/agent-world/daily-feed/',
                                 {'actor_id': other.pk, 'include_decisions': '1'}).data['data']
        self.assertEqual(hidden['items'], [])
        self.assertEqual(self.client.get('/api/settings/agent-world/daily-feed/',
            {'include_decisions': '1'}).status_code, 400)
