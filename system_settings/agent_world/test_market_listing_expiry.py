"""到期挂牌的时间、托管返还、自动处置和同步回归。"""
import hashlib
from datetime import timedelta
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from system_settings.models import WorldAction

from . import market_batch, test_market as fixtures
from .inventory_stock import add_stock, stock_quantity, stock_rows
from .market_expiry import expire_due, expire_listing
from .market_listing_expiry import expires_at
from .market_models import MarketListing, MarketSession, MarketTransaction
from .market_plan_models import MarketDisposition, MarketPlan
from .market_queries import listings, sessions
from .market_service import trade
from .market_sync import reconcile_market
from .travel_models import AgentInventoryItem


class ListingLifetimeTests(SimpleTestCase):
    def test_only_a_real_decrease_renews_two_days(self):
        created = timezone.now()
        history = [
            {'from': '30', 'to': '25', 'at': (created + timedelta(hours=12)).isoformat()},
            {'from': '25', 'to': '27', 'at': (created + timedelta(days=1)).isoformat()},
            {'from': '27', 'to': '27', 'at': (created + timedelta(days=1, hours=1)).isoformat()},
        ]
        self.assertEqual(expires_at(created, history), created + timedelta(days=2, hours=12))
        history.append({'from': '27', 'to': '26', 'at': (created + timedelta(days=1, hours=2)).isoformat()})
        self.assertEqual(expires_at(created, history), created + timedelta(days=3, hours=2))

    def test_invalid_history_does_not_create_a_fake_discount(self):
        created = timezone.now()
        self.assertEqual(expires_at(created, [{'from': 'bad', 'to': '1', 'at': 'invalid'},
                                              {'from': '3', 'to': '0', 'at': created.isoformat()}]),
                         created + timedelta(days=2))


class MarketListingExpiryTests(TestCase):
    setUp = fixtures.MarketTests.setUp
    operation = fixtures.MarketTests.operation
    add = fixtures.MarketTests.add

    def listed(self, quantity=3):
        item = self.add(self.a, count=quantity)
        self.operation(self.a, self.sa, 'listing', 'list', item_id=item.pk,
                       quantity=quantity, unit_price='30')
        return MarketListing.objects.get(pk='listing')

    def test_expiration_returns_only_unsold_stock_and_syncs_without_energy(self):
        listing = self.listed()
        started = self.now
        self.now = started + timedelta(days=1)
        with patch('system_settings.agent_world.market_service.check_session'):
            self.operation(self.b, self.sb, 'partial', 'buy_listing', listing_id=listing.pk,
                           version=listing.version, quantity=1)
        self.assertEqual(expire_due(started + timedelta(days=2) - timedelta(seconds=1)), 0)
        self.assertEqual(expire_due(started + timedelta(days=2)), 1)
        listing.refresh_from_db()
        self.assertEqual((listing.status, listing.remaining_quantity), ('withdrawn', 0))
        self.assertEqual(stock_quantity(self.a.pk, 'admin', 'crop.radish'), 2)
        self.assertEqual(stock_quantity(self.b.pk, 'admin', 'crop.radish'), 1)
        returned = AgentInventoryItem.objects.get(actor_id=self.a.pk, source__sku='crop.radish')
        self.assertEqual(returned.source['lots'], [{'price': '18', 'quantity': 2}])
        tx = MarketTransaction.objects.get(operation__reason='listing_expired')
        self.assertEqual((tx.result['quantity'], tx.result['deltas']), (2, []))
        self.assertEqual(returned.source['market_trade_id'], tx.pk)
        self.assertEqual(tx.session.mode, 'archive')
        self.assertEqual(expire_due(started + timedelta(days=3)), 0)
        self.assertEqual(MarketTransaction.objects.filter(operation__reason='listing_expired').count(), 1)
        reconcile_market()
        energy_id = hashlib.sha256(('market-energy:' + tx.session_id).encode()).hexdigest()
        self.assertFalse(WorldAction.objects.filter(pk=energy_id).exists())
        management = next(row for row in sessions('admin', {'page': 1})['items'] if row['id'] == tx.session_id)
        self.assertEqual(management['transactions'][0]['operation']['reason'], 'listing_expired')

    def test_drop_extends_deadline_but_increase_and_partial_sale_do_not(self):
        listing = self.listed()
        started = self.now
        with patch('system_settings.agent_world.market_service.check_session'):
            self.now = started + timedelta(hours=20)
            self.operation(self.a, self.sa, 'lower', 'reprice', listing_id=listing.pk,
                           version=listing.version, unit_price='20')
            listing.refresh_from_db()
            self.now = started + timedelta(days=1)
            self.operation(self.a, self.sa, 'higher', 'reprice', listing_id=listing.pk,
                           version=listing.version, unit_price='25')
            listing.refresh_from_db()
            self.operation(self.b, self.sb, 'partial', 'buy_listing', listing_id=listing.pk,
                           version=listing.version, quantity=1)
        listing.refresh_from_db()
        deadline = started + timedelta(days=2, hours=20)
        self.assertEqual(expires_at(listing.created_at, listing.history), deadline)
        self.assertEqual(expire_due(deadline - timedelta(seconds=1)), 0)
        self.assertEqual(expire_due(deadline), 1)

    def test_expired_quote_is_not_visible_or_tradable_before_sweep(self):
        listing = self.listed()
        deadline = self.now + timedelta(days=2)
        with patch('django.utils.timezone.now', return_value=deadline):
            self.assertEqual(listings('admin', {})['total'], 0)
            self.assertEqual(listings('admin', {'status': 'all'})['total'], 1)
        with patch('system_settings.agent_world.market_service.check_session'):
            with self.assertRaisesRegex(ValueError, '已到期'):
                trade(self.sb, self.b, 'late-buy', {'kind': 'buy_listing', 'listing_id': listing.pk,
                      'version': listing.version, 'quantity': 1}, deadline)
            with self.assertRaisesRegex(ValueError, '已到期'):
                trade(self.sa, self.a, 'late-discount', {'kind': 'reprice', 'listing_id': listing.pk,
                      'version': listing.version, 'unit_price': '10'}, deadline)
        self.assertEqual(stock_quantity(self.a.pk, 'admin', 'crop.radish'), 0)

    def test_pagination_counts_only_unexpired_listings(self):
        created = self.now
        MarketListing.objects.bulk_create([
            MarketListing(pk=f'page-{index:02d}', owner_id='admin', seller_id=self.a.pk,
                          seller_name=self.a.name, item={'name': '萝卜'}, initial_quantity=1,
                          remaining_quantity=1, unit_price=1,
                          created_at=created + timedelta(seconds=index))
            for index in range(30)
        ])
        MarketListing.objects.create(
            pk='page-renewed', owner_id='admin', seller_id=self.a.pk, seller_name=self.a.name,
            item={'name': '萝卜'}, initial_quantity=1, remaining_quantity=1, unit_price=2,
            created_at=created - timedelta(days=1),
            history=[{'from': '3', 'to': '2', 'at': (created + timedelta(days=1)).isoformat()}])
        with patch('django.utils.timezone.now', return_value=created + timedelta(days=2, seconds=5)):
            first = listings('admin', {'page': 1})
            second = listings('admin', {'page': 2})
        self.assertEqual((first['total'], second['total']), (25, 25))
        self.assertEqual([row['id'] for row in first['items']], [f'page-{index:02d}' for index in range(29, 9, -1)])
        self.assertEqual([row['id'] for row in second['items']],
                         [f'page-{index:02d}' for index in range(9, 5, -1)] + ['page-renewed'])

    def test_returned_lots_are_not_relisted_by_the_old_policy(self):
        self.listed()
        MarketDisposition.objects.create(owner_id='admin', actor_id=self.a.pk, sku='crop.radish',
                                         target_hold=0, strategy={'version': 1, 'targets': {'cooking': 0}, 'retain_order': 'high', 'reviewed_date': self.now.date().isoformat()}, sell_ratio=0, list_ratio=100)
        plan = MarketPlan.objects.create(pk='expiry-plan', owner_id='admin', actor_id=self.a.pk,
                                         plan_date=self.now.date())
        self.assertEqual(expire_due(self.now + timedelta(days=2)), 1)
        self.assertEqual(market_batch.build_actions('admin', self.a.pk, plan, self.now)['dispositions'], [])
        returned = AgentInventoryItem.objects.get(actor_id=self.a.pk, source__sku='crop.radish')
        fresh = add_stock(self.a.pk, 'admin', self.a.name, 'crop.radish', 2, '萝卜', 'farm_crop', 18)
        self.assertNotEqual(fresh.pk, returned.pk)
        actions = market_batch.build_actions('admin', self.a.pk, plan, self.now)['dispositions']
        self.assertEqual([(op['item_id'], op['quantity']) for op in actions[0]['operations']], [(fresh.pk, 2)])
        with patch('system_settings.agent_world.market_service.check_session'):
            self.operation(self.a, self.sa, 'manual-relist', 'list', item_id=returned.pk,
                           quantity=1, unit_price='15')
        self.assertEqual(MarketListing.objects.get(pk='manual-relist').remaining_quantity, 1)

    def test_new_stock_preserves_fifo_after_an_expired_return(self):
        self.listed()
        old = add_stock(self.a.pk, 'admin', self.a.name, 'crop.radish', 2, '萝卜', 'farm_crop', 18)
        self.assertEqual(expire_due(self.now + timedelta(days=2)), 1)
        returned = stock_rows(self.a.pk, 'admin', 'crop.radish').exclude(pk=old.pk).get()
        AgentInventoryItem.objects.filter(pk=old.pk).update(created_at=self.now - timedelta(days=2))
        AgentInventoryItem.objects.filter(pk=returned.pk).update(created_at=self.now - timedelta(days=1))
        fresh = add_stock(self.a.pk, 'admin', self.a.name, 'crop.radish', 1, '萝卜', 'farm_crop', 18)
        old.refresh_from_db()
        self.assertEqual(old.quantity, 2)
        self.assertEqual(list(stock_rows(self.a.pk, 'admin', 'crop.radish').values_list('pk', flat=True)),
                         [old.pk, returned.pk, fresh.pk])

    def test_failure_rolls_back_and_retry_succeeds(self):
        listing = self.listed()
        deadline = self.now + timedelta(days=2)
        count = MarketSession.objects.count()
        with patch('system_settings.agent_world.market_expiry.withdraw_listing', side_effect=ValueError('坏批次')):
            with self.assertRaisesRegex(ValueError, '坏批次'):
                expire_listing(listing.pk, deadline)
        listing.refresh_from_db()
        self.assertEqual(listing.status, 'active')
        self.assertEqual(MarketSession.objects.count(), count)
        self.assertFalse(MarketTransaction.objects.filter(operation__reason='listing_expired').exists())
        self.assertTrue(expire_listing(listing.pk, deadline))
        self.assertFalse(expire_listing(listing.pk, deadline))

    def test_snapshot_restores_return_once_without_charging_energy(self):
        from utils.sync_manager import SyncManager
        self.listed()
        self.assertEqual(expire_due(self.now + timedelta(days=2)), 1)
        tx = MarketTransaction.objects.get(operation__reason='listing_expired')
        energy_id = hashlib.sha256(('market-energy:' + tx.session_id).encode()).hexdigest()
        manager = SyncManager()
        snapshot = manager.build_snapshot_data()
        manager.apply_snapshot_data(snapshot)
        manager.apply_snapshot_data(snapshot)
        self.assertEqual(stock_quantity(self.a.pk, 'admin', 'crop.radish'), 3)
        self.assertEqual(MarketTransaction.objects.filter(operation__reason='listing_expired').count(), 1)
        self.assertFalse(WorldAction.objects.filter(pk=energy_id).exists())

    def test_one_failed_return_does_not_block_other_listings(self):
        self.listed()
        second = self.add(self.a, sku='crop.corn', count=2)
        self.operation(self.a, self.sa, 'listing-two', 'list', item_id=second.pk,
                       quantity=2, unit_price='30')
        def process(identity, at):
            if identity == 'listing':
                raise ValueError('缺少托管依据')
            return expire_listing(identity, at)
        with patch('system_settings.agent_world.market_expiry.expire_listing', side_effect=process), \
             self.assertLogs('system_settings.agent_world.market_expiry', level='ERROR'):
            self.assertEqual(expire_due(self.now + timedelta(days=2), limit=1), 1)
        self.assertEqual(MarketListing.objects.get(pk='listing').status, 'active')
        self.assertEqual(MarketListing.objects.get(pk='listing-two').status, 'withdrawn')

    def test_daily_feed_labels_expiration_without_a_market_entry(self):
        from .daily_feed import day_events, FeedScope
        from .life_time import local_time
        self.listed()
        second = self.add(self.a, sku='crop.corn', count=2)
        self.operation(self.a, self.sa, 'listing-two', 'list', item_id=second.pk,
                       quantity=2, unit_price='30')
        at = self.now + timedelta(days=2)
        self.assertEqual(expire_due(at), 2)
        scope = FeedScope(actors={self.a.pk, self.b.pk},
                          names={self.a.pk: self.a.name, self.b.pk: self.b.name}, visible_colls=())
        events = day_events(None, 'admin', local_time(at).date(), scope=scope)[0]
        expired = list(MarketTransaction.objects.filter(operation__reason='listing_expired'))
        self.assertEqual(len({tx.session_id for tx in expired}), 1)
        tx = expired[0]
        group = next(row for row in events if row['id'] == f'execution:market-expiry:{tx.session_id}:{self.a.pk}')
        self.assertEqual(group['title'], '挂牌到期下架')
        self.assertEqual([step['title'] for step in group['steps']], ['到期下架', '到期下架'])
        self.assertFalse(any(row['id'] == 'market-enter:' + tx.session_id for row in events))
