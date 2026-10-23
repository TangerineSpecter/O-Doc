"""Batch feed authorization must match execution checks without per-trip queries."""
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from unittest.mock import patch

from system_settings.models import Agent, WorldActionRuntime
from ..life_models import LifeConfig, LifeItem
from ..life_time import local_time
from .models import FishingCatalog, FishingConfig, FishingRuntime, FishingTrip
from .service import authorized, authorized_trip_ids


@override_settings(USE_TZ=True)
class FishingAuthorizationTests(TestCase):
    def setUp(self):
        self.now = local_time()
        catalog = FishingCatalog.objects.create(pk='auth-catalog')
        FishingConfig.objects.create(pk='auth-owner', catalog=catalog, enabled=True)
        WorldActionRuntime.objects.create(pk='world', enabled=True)
        LifeConfig.objects.create(pk='auth-owner')

    def trip(self, index):
        agent = Agent.objects.create(name=f'批量鉴权居民{index}')
        item = LifeItem.objects.create(
            pk=f'auth-life-{index}', owner_id='auth-owner', actor_id=agent.pk,
            activity='fishing', status='running', original_at=self.now, scheduled_at=self.now,
        )
        trip = FishingTrip.objects.create(
            pk=f'auth-trip-{index}', owner_id='auth-owner', actor_id=agent.pk,
            actor_name=agent.name, life_item_id=item.pk, status='active',
        )
        FishingRuntime.objects.create(pk=trip.pk, authorized=True)
        return trip

    def assert_equivalent(self, trips):
        expected = {trip.pk for trip in trips if authorized(trip)}
        self.assertEqual(authorized_trip_ids(trips, 'auth-owner'), expected)
        return expected

    def test_batch_matches_individual_checks_and_account_boundary(self):
        trips = [self.trip(i) for i in range(7)]
        FishingRuntime.objects.filter(pk=trips[1].pk).update(authorized=False)
        Agent.objects.filter(pk=trips[2].actor_id).update(archived_at=self.now)
        LifeItem.objects.filter(pk=trips[3].life_item_id).update(status='failed')
        LifeConfig.objects.filter(pk='auth-owner').update(paused_agents=[trips[4].actor_id])
        FishingRuntime.objects.filter(pk=trips[5].pk).delete()
        LifeItem.objects.filter(pk=trips[6].life_item_id).delete()
        self.assertEqual(self.assert_equivalent(trips), {trips[0].pk})
        self.assertEqual(authorized_trip_ids(trips, 'another-owner'), set())
        FishingConfig.objects.filter(pk='auth-owner').update(enabled=False)
        self.assertEqual(self.assert_equivalent(trips), set())
        FishingConfig.objects.filter(pk='auth-owner').update(enabled=True)
        WorldActionRuntime.objects.filter(pk='world').update(enabled=False)
        self.assertEqual(self.assert_equivalent(trips), set())

    def test_query_count_is_constant_for_one_or_twenty_open_trips(self):
        trips = [self.trip(i) for i in range(20)]
        for sample in (trips[:1], trips):
            with self.subTest(count=len(sample)), self.assertNumQueries(6):
                self.assertEqual(authorized_trip_ids(sample, 'auth-owner'), {trip.pk for trip in sample})
        with self.assertNumQueries(0):
            self.assertEqual(authorized_trip_ids([], 'auth-owner'), set())

    def test_feed_batches_open_trips_and_preserves_paused_and_finished_states(self):
        from ..daily_feed import day_events
        trips = [self.trip(i) for i in range(5)]
        FishingTrip.objects.filter(pk=trips[1].pk).update(status='paused')
        FishingRuntime.objects.filter(pk=trips[2].pk).update(authorized=False)
        FishingTrip.objects.filter(pk=trips[3].pk).update(ended_at=self.now, status='finished')
        FishingTrip.objects.filter(pk=trips[4].pk).update(state={'error': '临时断网'})
        request = Request(APIRequestFactory().get('/'))
        with patch('system_settings.agent_world.fishing.service.authorized', side_effect=AssertionError('日报禁止逐条查库')), \
             patch('system_settings.agent_world.fishing.service.authorized_trip_ids', wraps=authorized_trip_ids) as batch, \
             CaptureQueriesContext(connection) as queries:
            _, events, _, _, _ = day_events(request, 'auth-owner', self.now.date())
        self.assertEqual(batch.call_count, 1)
        self.assertEqual({trip.pk for trip in batch.call_args.args[0]}, {trips[i].pk for i in (0, 2, 4)})
        fishing = {event['target']['id']: event for event in events if event['category'] == 'fishing'}
        self.assertEqual([fishing[trip.pk]['status'] for trip in trips], ['running', 'paused', 'paused', 'success', 'paused'])
        trip_queries = [query for query in queries if 'from "system_settings_fishingtrip"' in query['sql'].lower()]
        self.assertEqual(len(trip_queries), 1)
