"""居民历史查询应跳过其他居民的日期，并保留权限、分页与售出记录。"""
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient, APIRequestFactory

from system_settings.models import Agent, AgentActivity
from .daily_feed import day_events, latest_event_day
from .life_models import LifeProfile
from .life_time import local_time, storage_time
from .market_models import MarketSession, MarketTransaction


class ResidentDailyFeedTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(username='admin', password='test')
        self.owner = self.user.username
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.actor = Agent.objects.create(name='少活动的居民')
        self.other = Agent.objects.create(name='活跃居民')
        for actor in (self.actor, self.other):
            LifeProfile.objects.create(id=actor.pk, owner_id=self.owner)
        self.today = local_time().replace(hour=12, minute=0, second=0, microsecond=0)

    def activity(self, actor, days, owner=None):
        return AgentActivity.objects.create(
            event_key=f'{actor.pk}:{days}:{owner or self.owner}',
            agent=actor, activity_type='publication', action='social_publish',
            title='分享动态', occurred_at=storage_time(self.today - timedelta(days=days)),
            metadata={'owner_id': owner or self.owner},
        )

    def test_sparse_resident_does_not_project_other_residents_history(self):
        expected = self.activity(self.actor, 50)
        for days in range(1, 46):
            self.activity(self.other, days)
        # 复现旧的全居民日期索引，对比返回内容与真正拼装的天数。
        def global_day(request, owner, before, category, actor_id, *, scope=None):
            return latest_event_day(request, owner, before, category, scope=scope)
        with patch('system_settings.agent_world.daily_feed_views.latest_event_day', side_effect=global_day), \
                patch('system_settings.agent_world.daily_feed_views.day_events', wraps=day_events) as legacy:
            old_response = self.client.get('/api/settings/agent-world/daily-feed/', {'actor_id': self.actor.pk})
        self.assertEqual(legacy.call_count, 47)
        with patch('system_settings.agent_world.daily_feed_views.day_events', wraps=day_events) as project:
            response = self.client.get('/api/settings/agent-world/daily-feed/', {'actor_id': self.actor.pk})
        self.assertEqual(response.status_code, 200)
        data = response.data['data']
        self.assertEqual([row['id'] for row in data['items']], [f'activity:{expected.pk}'])
        self.assertFalse(data['hasMore'])
        self.assertLessEqual(project.call_count, 2)
        self.assertEqual(data, old_response.data['data'])

    def test_deleted_resident_snapshot_is_still_indexed(self):
        activity = self.activity(self.actor, 5)
        activity.agent = None
        activity.metadata['agentSnapshot'] = {'id': self.actor.pk, 'name': self.actor.name}
        activity.save()
        response = self.client.get('/api/settings/agent-world/daily-feed/', {'actor_id': self.actor.pk})
        self.assertEqual([row['id'] for row in response.data['data']['items']], [f'activity:{activity.pk}'])

    def test_unfiltered_history_includes_both_residents(self):
        first = self.activity(self.actor, 3)
        second = self.activity(self.other, 5)
        response = self.client.get('/api/settings/agent-world/daily-feed/')
        self.assertEqual([row['id'] for row in response.data['data']['items']],
                         [f'activity:{first.pk}', f'activity:{second.pk}'])

    def test_pagination_and_today_counts_remain_complete(self):
        self.activity(self.other, 0)
        for days in range(1, 33):
            self.activity(self.actor, days)
        first = self.client.get('/api/settings/agent-world/daily-feed/', {'actor_id': self.actor.pk}).data['data']
        self.assertEqual(len(first['items']), 30)
        self.assertTrue(first['hasMore'])
        self.assertEqual(first['allTotal'], 1)
        self.assertEqual(first['actorCounts'], {self.other.pk: 1})
        second = self.client.get('/api/settings/agent-world/daily-feed/', {
            'actor_id': self.actor.pk, 'cursor': first['nextCursor'],
        }).data['data']
        self.assertEqual(len(second['items']), 2)
        self.assertFalse(second['hasMore'])
        self.assertFalse({row['id'] for row in first['items']} & {row['id'] for row in second['items']})

    def test_actor_filter_does_not_grant_access_to_private_activity(self):
        private = self.activity(self.actor, 3, owner='another-owner')
        response = self.client.get('/api/settings/agent-world/daily-feed/', {'actor_id': self.actor.pk})
        self.assertEqual(response.data['data']['items'], [])
        self.assertNotIn(private.pk, str(response.data))

    def test_small_pages_reach_old_history_without_duplicates(self):
        from .daily_feed import _actor_scope
        expected = [f'activity:{self.activity(self.actor, day).pk}' for day in range(1, 33)]
        items, cursor, sizes = [], None, []
        while True:
            params = {'actor_id': self.actor.pk, 'page_size': 10}
            if cursor:
                params['cursor'] = cursor
            with patch('system_settings.agent_world.daily_feed._actor_scope', wraps=_actor_scope) as read_scope:
                response = self.client.get('/api/settings/agent-world/daily-feed/', params)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(read_scope.call_count, 1)
            data = response.data['data']
            sizes.append(len(data['items']))
            items.extend(row['id'] for row in data['items'])
            if not data['hasMore']:
                self.assertIsNone(data['nextCursor'])
                break
            self.assertNotEqual(cursor, data['nextCursor'])
            cursor = data['nextCursor']
            self.assertLess(len(sizes), 5)
        self.assertEqual(sizes, [10, 10, 10, 2])
        self.assertEqual(items, expected)

    def test_permissions_are_rechecked_on_each_request(self):
        from anthology.models import Anthology
        coll = Anthology.objects.create(title='他人的文集', user_id='another-owner', permission='public')
        activity = AgentActivity.objects.create(event_key='visible-post', agent=self.actor,
            activity_type='publication', artifact_coll_id=coll.pk, title='公开作品',
            occurred_at=storage_time(self.today - timedelta(days=3)))
        first = self.client.get('/api/settings/agent-world/daily-feed/', {'actor_id': self.actor.pk})
        self.assertEqual([row['id'] for row in first.data['data']['items']], [f'activity:{activity.pk}'])
        coll.permission = 'private'
        coll.save()
        second = self.client.get('/api/settings/agent-world/daily-feed/', {'actor_id': self.actor.pk})
        self.assertEqual(second.data['data']['items'], [])

    def test_request_validation_and_authentication(self):
        for params in ({'category': 'unknown'}, {'date': 'bad'}, {'cursor': 'bad'},
                       {'page_size': 'bad'}, {'page_size': 0}, {'page_size': 31}, {'page_size': '1.5'}):
            with self.subTest(params=params):
                self.assertEqual(self.client.get('/api/settings/agent-world/daily-feed/', params).status_code, 400)
        self.assertIn(APIClient().get('/api/settings/agent-world/daily-feed/').status_code, (401, 403))

    def test_seller_history_uses_buyer_session_closing_day(self):
        session = MarketSession.objects.create(
            id='buyer-session', owner_id=self.owner, actor_id=self.other.pk,
            actor_name=self.other.name, status='closed',
            created_at=storage_time(self.today - timedelta(days=5)),
            ended_at=storage_time(self.today - timedelta(days=4)),
            expires_at=storage_time(self.today - timedelta(days=4)),
        )
        MarketTransaction.objects.create(
            id='sale', owner_id=self.owner, actor_id=self.other.pk,
            actor_name=self.other.name, session=session,
            operation={'kind': 'buy_listing'}, result={'seller_id': self.actor.pk},
            created_at=storage_time(self.today - timedelta(days=5)),
        )
        request = APIRequestFactory().get('/')
        request.user = self.user
        day = latest_event_day(request, self.owner, storage_time(self.today), 'trade', self.actor.pk)
        self.assertEqual(day, (self.today - timedelta(days=4)).date())
        response = self.client.get('/api/settings/agent-world/daily-feed/', {'actor_id': self.actor.pk})
        self.assertEqual(len(response.data['data']['items']), 1)
        self.assertEqual(response.data['data']['items'][0]['category'], 'trade')
        buyer = self.client.get('/api/settings/agent-world/daily-feed/', {'actor_id': self.other.pk}).data['data']
        self.assertEqual(len(buyer['items']), 1)
        self.assertTrue(buyer['items'][0]['occurredAt'].startswith((self.today - timedelta(days=4)).date().isoformat()))
