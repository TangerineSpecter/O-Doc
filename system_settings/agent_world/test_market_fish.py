"""进场统一回收普通鱼：鱼王和托管挂牌保留，鱼不再进入处置队列。"""
from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings

from system_settings.models import (Agent, AIModel, AIProvider, SystemSetting,
                                   WorldActionRuntime)
from .inventory_stock import add_stock, stock_quantity
from .life_config import DEFAULTS
from .life_models import LifeConfig, LifeProfile
from .life_time import SHANGHAI
from .market_batch import build_actions
from .market_disposition import disposable, enqueue
from .market_fish import sellable
from .market_models import MarketSession, MarketTransaction
from .market_plan_models import MarketDisposition, MarketPlan
from .market_sessions import close_session, enter
from .market_shop import current_batch
from .market_tools import call_market_tool

NOW = datetime(2026, 10, 23, 10, tzinfo=SHANGHAI)


@override_settings(USE_TZ=True)
class MarketFishClearingTests(TestCase):
    def setUp(self):
        self.enterContext(patch('django.utils.timezone.now', return_value=NOW))
        provider = AIProvider.objects.create(name='test', type='OpenAi')
        model = AIModel.objects.create(name='test', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='钓鱼居民', model=model, money=0)
        LifeConfig.objects.create(pk='admin', migrated=True,
                                  settings={**DEFAULTS, 'agent_ids': [self.agent.pk]})
        LifeProfile.objects.create(pk=self.agent.pk, owner_id='admin')
        WorldActionRuntime.objects.create(pk='world', enabled=True)
        SystemSetting.objects.create(key='system_mcp_config', value={'enabled': True})
        current_batch('admin', NOW)

    def enter(self, key='entry-fish'):
        return call_market_tool('enter_market', {'request_id': key}, self.agent)

    def test_entry_sells_all_normal_fish_and_keeps_king(self):
        add_stock(self.agent.pk, 'admin', self.agent.name, 'fish.crucian', 2,
                  '鲫鱼', 'fish', Decimal('2'))
        add_stock(self.agent.pk, 'admin', self.agent.name, 'fish.golden_carp', 1,
                  '金鳞鲤王', 'fish_king', Decimal('60'))

        result = self.enter()

        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'fish.crucian'), 0)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'fish.golden_carp'), 1)
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.money, Decimal('4'))
        self.assertEqual(result['fish_sale']['sold'][0]['quantity'], 2)
        self.assertEqual(result['fish_sale']['total'], '4')
        trade = MarketTransaction.objects.get(operation__kind='sell')
        self.assertEqual(trade.result['quantity'], 2)

    def test_second_entry_does_not_sell_again_or_duplicate_money(self):
        add_stock(self.agent.pk, 'admin', self.agent.name, 'fish.crucian', 1,
                  '鲫鱼', 'fish', Decimal('2'))
        first = self.enter('entry-fish-1')
        close_session(MarketSession.objects.get(pk=first['session_id']), 'done', NOW)
        self.agent.refresh_from_db()
        money = self.agent.money

        second = self.enter('entry-fish-2')

        self.assertNotIn('fish_sale', second)
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.money, money)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'fish.crucian'), 0)

    def test_non_market_entry_keeps_fish(self):
        add_stock(self.agent.pk, 'admin', self.agent.name, 'fish.crucian', 1,
                  '鲫鱼', 'fish', Decimal('2'))
        # 战斗补给商店、探索准备与市场共用 enter()，但没有 clear_fish 授权。
        session = enter('admin', self.agent, 'combat-shop-entry', mode='mcp')
        self.assertIsNone(getattr(session, 'fish_sale', None))
        close_session(session, 'done', NOW)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'fish.crucian'), 1)

    def test_fish_is_not_queued_or_disposed_by_policy(self):
        add_stock(self.agent.pk, 'admin', self.agent.name, 'fish.crucian', 2,
                  '鲫鱼', 'fish', Decimal('2'))
        self.assertFalse(disposable('fish.crucian'))
        self.assertIsNone(enqueue('admin', self.agent.pk, 'fish.crucian', 2, source='fishing'))
        self.assertEqual([row.source['sku'] for row in sellable('admin', self.agent.pk)],
                         ['fish.crucian'])
        MarketDisposition.objects.create(
            pk='fish-policy', owner_id='admin', actor_id=self.agent.pk, sku='fish.crucian',
            target_hold=0, sell_ratio=100, list_ratio=0, status='active')
        plan = MarketPlan.objects.create(pk='plan-fish', owner_id='admin',
                                         actor_id=self.agent.pk, plan_date=NOW.date(),
                                         budget=200)

        actions = build_actions('admin', self.agent.pk, plan, NOW)

        self.assertEqual(actions['dispositions'], [])
