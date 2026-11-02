from datetime import timedelta

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from utils.sync_policy import SyncError
from .market_models import MarketSession, MarketTransaction
from .market_sync import _validate_inventory_transfers
from .travel_models import AgentInventoryItem


class MarketInventoryReconciliationTests(TestCase):
    def setUp(self):
        self.sessions = {}
        for owner, actor in (('first', 'actor-a'), ('second', 'actor-b')):
            self.sessions[owner] = MarketSession.objects.create(pk=f'session-{owner}', owner_id=owner,
                actor_id=actor, actor_name=actor, expires_at=timezone.now() + timedelta(hours=1))

    def item(self, key, owner, actor, source):
        return AgentInventoryItem.objects.create(pk=key, owner_id=owner, actor_id=actor, name='测试物品',
                                                 quantity=1, source=source)

    def test_reconciles_multiple_owners_in_bounded_batches(self):
        for index in range(5):
            owner, actor = ('first', 'actor-a') if index % 2 == 0 else ('second', 'actor-b')
            trade_id = f'trade-{index}'
            MarketTransaction.objects.create(pk=trade_id, owner_id=owner, actor_id=actor, actor_name=actor,
                                             session=self.sessions[owner])
            self.item(f'item-{index}', owner, actor, {'market_trade_id': trade_id})
        self.item('without-trade', 'first', 'actor-a', {'sku': 'fish.example'})
        with CaptureQueriesContext(connection) as queries:
            _validate_inventory_transfers(batch_size=2)
        transfer_queries = [query['sql'] for query in queries if 'FROM "system_settings_markettransaction"' in query['sql']]
        self.assertEqual(len(transfer_queries), 3)
        self.assertEqual(AgentInventoryItem.objects.count(), 6)

    def test_rejects_trade_from_wrong_owner_or_resident(self):
        MarketTransaction.objects.create(pk='trade', owner_id='first', actor_id='actor-a', actor_name='A',
                                         session=self.sessions['first'])
        item = self.item('item', 'first', 'actor-a', {'market_trade_id': 'trade'})
        for owner, actor in (('second', 'actor-a'), ('first', 'actor-b')):
            with self.subTest(owner=owner, actor=actor):
                AgentInventoryItem.objects.filter(pk=item.pk).update(owner_id=owner, actor_id=actor)
                with self.assertRaises(SyncError):
                    _validate_inventory_transfers(batch_size=2)
