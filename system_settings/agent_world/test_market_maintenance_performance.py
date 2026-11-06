"""Bound query growth, complete pagination and retryable local maintenance."""
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from system_settings.models import Agent
from .life_time import local_time
from .market_expiry import expire_due
from .market_expiry_index import _deadlines, active_deadlines
from .market_listing_expiry import expires_at
from .market_models import MarketConfig, MarketListing, MarketSession, MarketTransaction
from .market_plan_models import MarketDisposition
from .market_policy_queries import policies_payload
from .market_queries import listings
from .market_review_schedule import enqueue_due_review
from .travel_models import AgentInventoryItem


class MarketMaintenancePerformanceTests(TestCase):
    def setUp(self):
        cache.clear()
        _deadlines.clear()
        self.now = timezone.now()
        self.owner = 'maintenance-test'
        self.agent = Agent.objects.create(name='维护验证')
        MarketConfig.objects.create(pk=self.owner, seed='test')

    def listing(self, identity, **kwargs):
        defaults = dict(owner_id=self.owner, seller_id=self.agent.pk, seller_name=self.agent.name,
                        item={'name': '萝卜', 'quantity': 1}, initial_quantity=1,
                        remaining_quantity=1, unit_price=2, created_at=self.now)
        return MarketListing.objects.create(pk=identity, **{**defaults, **kwargs})

    def test_policy_queries_do_not_grow_with_inventory_rows_or_skus(self):
        AgentInventoryItem.objects.create(pk='stock-one', owner_id=self.owner, actor_id=self.agent.pk,
            name='萝卜', quantity=1, source={'sku': 'crop.radish'})
        with CaptureQueriesContext(connection) as small:
            policies_payload(self.owner, self.agent.pk)
        AgentInventoryItem.objects.bulk_create([
            AgentInventoryItem(pk=f'stock-{index}', owner_id=self.owner, actor_id=self.agent.pk,
                name='物品', quantity=1, source={'sku': 'crop.radish' if index < 50 else f'dish.test{index}'})
            for index in range(100)
        ])
        with CaptureQueriesContext(connection) as large:
            result = policies_payload(self.owner, self.agent.pk)
        self.assertEqual(len(small), len(large))
        radish = next(row for row in result if row['sku'] == 'crop.radish')
        self.assertEqual(radish['protection']['total'], 51)
        self.assertEqual(radish['protection']['disposable'], 0)

    def test_projection_blocks_expired_returns_and_handles_bad_commitments_once(self):
        session = MarketSession.objects.create(pk='return-session', owner_id=self.owner,
            actor_id=self.agent.pk, actor_name=self.agent.name, expires_at=self.now)
        MarketTransaction.objects.create(pk='expired-return', owner_id=self.owner, session=session,
            actor_id=self.agent.pk, actor_name=self.agent.name,
            operation={'kind': 'withdraw', 'reason': 'listing_expired'})
        AgentInventoryItem.objects.create(pk='returned', owner_id=self.owner, actor_id=self.agent.pk,
            name='萝卜', quantity=3, source={'sku': 'crop.radish', 'market_trade_id': 'expired-return'})
        MarketDisposition.objects.create(pk='policy', owner_id=self.owner, actor_id=self.agent.pk, sku='crop.radish',
            strategy={'version': 1, 'targets': {'cooking': 0}, 'retain_order': 'high',
                      'reviewed_date': local_time(self.now).date().isoformat()}, sell_ratio=0, list_ratio=100)
        self.assertEqual(policies_payload(self.owner, self.agent.pk)[0]['protection']['blocked_listing'], 3)
        with patch('system_settings.agent_world.inventory_protection.commitments', side_effect=ValueError('坏预留')) as read:
            with self.assertLogs('system_settings.agent_world.market_policy_queries', level='ERROR'):
                result = policies_payload(self.owner, self.agent.pk)
        self.assertEqual(read.call_count, 1)
        self.assertEqual(result[0]['protection']['disposable'], 0)

    def test_fallback_scan_is_throttled_and_new_arrivals_still_enqueue(self):
        with patch('system_settings.agent_world.market_disposition_worker.enqueue_review', return_value=1) as scan:
            self.assertEqual(enqueue_due_review(self.owner, self.agent.pk), 1)
            self.assertEqual(enqueue_due_review(self.owner, self.agent.pk), 0)
            scan.assert_called_once()
        from .market_disposition import enqueue
        task = enqueue(self.owner, self.agent.pk, 'dish.new', 1)
        self.assertEqual(task.status, 'pending')
        cache.clear()  # Simulate TTL expiry or process restart after a restore.
        with patch('system_settings.agent_world.market_disposition_worker.enqueue_review', return_value=2) as scan:
            self.assertEqual(enqueue_due_review(self.owner, self.agent.pk), 2)
            scan.assert_called_once()

    def test_failed_scan_and_next_day_are_not_suppressed(self):
        with patch('system_settings.agent_world.market_disposition_worker.enqueue_review', side_effect=ValueError('重试')):
            with self.assertRaises(ValueError):
                enqueue_due_review(self.owner, self.agent.pk)
        with patch('system_settings.agent_world.market_disposition_worker.enqueue_review', return_value=1) as scan:
            enqueue_due_review(self.owner, self.agent.pk)
            with patch('system_settings.agent_world.market_review_schedule.local_time', return_value=local_time(self.now) + timedelta(days=1)):
                enqueue_due_review(self.owner, self.agent.pk)
            self.assertEqual(scan.call_count, 2)

    def test_deadline_cache_reuses_history_and_rechecks_clock_and_listing_writes(self):
        row = self.listing('old', created_at=self.now - timedelta(days=3),
            history=[{'from': '3', 'to': '2', 'at': self.now.isoformat()}])
        with patch('system_settings.agent_world.market_expiry_index.expires_at', wraps=expires_at) as calculate:
            active_deadlines(self.owner)
            active_deadlines(self.owner)
            self.assertEqual(calculate.call_count, 1)
            row.history = []
            row.version += 1
            row.save()
            active_deadlines(self.owner)
            self.assertEqual(calculate.call_count, 2)
        with patch('django.utils.timezone.now', return_value=self.now):
            self.assertEqual(listings(self.owner, {})['total'], 0)
        row.created_at, row.history, row.version = self.now, [], row.version + 1
        row.save()
        with patch('django.utils.timezone.now', return_value=self.now + timedelta(days=2) - timedelta(seconds=1)):
            self.assertEqual(listings(self.owner, {})['total'], 1)
        with patch('django.utils.timezone.now', return_value=self.now + timedelta(days=2)):
            self.assertEqual(listings(self.owner, {})['total'], 0)

    def test_pages_reuse_index_and_keep_full_counts_filters_and_order(self):
        for index in range(25):
            self.listing(f'visible-{index:02}', created_at=self.now + timedelta(seconds=index))
        self.listing('expired', created_at=self.now - timedelta(days=3))
        with patch('django.utils.timezone.now', return_value=self.now), patch(
            'system_settings.agent_world.market_expiry_index.expires_at', wraps=expires_at) as calculate:
            first = listings(self.owner, {})
            count = calculate.call_count
            second = listings(self.owner, {'page': 2})
            self.assertEqual(calculate.call_count, count)
            self.assertEqual((first['total'], second['total']), (25, 25))
            self.assertEqual(len(second['items']), 5)
            self.assertEqual(second['items'][0]['id'], 'visible-04')
            self.assertEqual(listings(self.owner, {'search': '不存在'})['total'], 0)
            self.assertEqual(listings(self.owner, {'seller_id': 'other'})['total'], 0)
            self.assertEqual(listings(self.owner, {'status': 'all'})['total'], 26)

    def test_failed_expiry_backs_off_without_blocking_later_items(self):
        self.listing('a-bad', created_at=self.now - timedelta(days=3))
        self.listing('b-good', created_at=self.now - timedelta(days=3))
        def attempt(identity, now):
            if identity == 'a-bad':
                raise ValueError('坏托管')
            return True
        with patch('system_settings.agent_world.market_expiry.expire_listing', side_effect=attempt) as expire:
            with self.assertLogs('system_settings.agent_world.market_expiry', level='ERROR'):
                self.assertEqual(expire_due(self.now, limit=1), 1)
            expire.reset_mock()
            self.assertEqual(expire_due(self.now, limit=1), 1)
            expire.assert_called_once_with('b-good', self.now)
            bad = MarketListing.objects.get(pk='a-bad')
            bad.version += 1
            bad.save()
            with self.assertLogs('system_settings.agent_world.market_expiry', level='ERROR'):
                expire_due(self.now, limit=1)
            self.assertIn('a-bad', [call.args[0] for call in expire.call_args_list])

    def test_expiry_attempt_budget_does_not_starve_later_rows(self):
        for index in range(6):
            self.listing(f'bad-{index}', created_at=self.now - timedelta(days=3))
        with patch('system_settings.agent_world.market_expiry.expire_listing', side_effect=ValueError('坏托管')) as expire:
            with self.assertLogs('system_settings.agent_world.market_expiry', level='ERROR'):
                expire_due(self.now, limit=1)
                self.assertEqual(expire.call_count, 4)
                expire_due(self.now, limit=1)
                self.assertEqual(expire.call_count, 6)
