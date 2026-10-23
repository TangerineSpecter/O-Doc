"""小时补饵回归：真实需求/目标/成交，决策供应商始终 mock。"""
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from system_settings.models import Agent, AgentTask, WorldActionRuntime, SystemSetting
from .life_models import LifeConfig, LifeProfile, LifeItem
from .life_config import DEFAULTS
from .life_time import SHANGHAI, local_time, storage_time
from .fishing.service import configure
from .inventory_stock import add_stock, stock_quantity
from .market_bait_refresh import refresh_bait_needs
from .market_plan_models import MarketPlan, MarketGoal, MarketTick
from .market_shop import current_batch
from .market_batch import build_actions, execute
from .market_tick import run


@override_settings(USE_TZ=True)
class HourlyBaitTests(TestCase):
    def setUp(self):
        self.now = storage_time(datetime(2026, 10, 23, 10, 55, tzinfo=SHANGHAI))
        self.enterContext(patch('django.utils.timezone.now', return_value=self.now))
        self.enterContext(patch('system_settings.decision.routing.complete', side_effect=AssertionError('禁止文本回退')))
        self.agent = Agent.objects.create(name='补饵居民', money=1000)
        LifeConfig.objects.create(pk='admin', migrated=True, settings={
            **DEFAULTS, 'agent_ids': [self.agent.pk], 'market_automation_v2': True})
        LifeProfile.objects.create(pk=self.agent.pk, owner_id='admin')
        WorldActionRuntime.objects.create(pk='world', enabled=True)
        AgentTask.objects.create(pk='market-task', task_kind='market', name='市场',
            agent=self.agent, agent_ids=[self.agent.pk], enabled=True, market_config={'owner_id': 'admin'})
        configure('admin', True)
        SystemSetting.objects.create(key='system_mcp_config', value={'enabled': True})
        self.plan = MarketPlan.objects.create(pk='daily-plan', owner_id='admin', actor_id=self.agent.pk,
            plan_date=local_time(self.now).date(), budget=0)
        self.quote(self.now)
        self.choose = self.enterContext(patch('system_settings.agent_world.market_planning.choose_scene',
            side_effect=lambda owner, agent, scene, state, choices, **kw:
                '10-19' if '10-19' in choices else '12' if '12' in choices else next(iter(choices))))

    def quote(self, now):
        batch = current_batch('admin', now)
        batch.supplies = [{'id': 'bait.worm', 'sku': 'bait.worm', 'kind': 'bait',
                           'name': '蚯蚓', 'price': '1', 'version': 1}]
        batch.save(update_fields=['supplies'])
        return batch

    def refresh(self, now=None):
        self.plan.refresh_from_db()
        self.agent.refresh_from_db()
        return refresh_bait_needs('admin', self.agent, self.plan, now or self.now)

    def test_enable_after_daily_plan_creates_goal_and_executes_real_purchase(self):
        self.assertEqual(self.refresh(), 1)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.budget, Decimal(12))
        goal = self.plan.goals.get()
        self.assertEqual((goal.sku, goal.quantity), ('bait.worm', 12))
        self.assertEqual(self.choose.call_count, 2)
        tick = MarketTick.objects.create(pk='test-tick', owner_id='admin', actor_id=self.agent.pk,
            hour=self.now, scheduled_at=self.now)
        outcome = execute('admin', self.agent, self.plan, tick,
                          build_actions('admin', self.agent.pk, self.plan, self.now), self.now)
        self.assertTrue(outcome['ok'], outcome)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'bait.worm'), 12)
        goal.refresh_from_db(); self.plan.refresh_from_db()
        self.assertEqual(goal.status, 'filled')
        self.assertEqual(self.plan.spent, Decimal(12))
        self.assertEqual(self.refresh(), 0)

    def test_repeated_precheck_does_not_duplicate_goal_or_questions(self):
        self.assertEqual(self.refresh(), 1)
        self.assertEqual(self.refresh(), 0)
        self.assertEqual(self.plan.goals.count(), 1)
        self.assertEqual(self.choose.call_count, 2)

    def test_no_buy_cached_this_hour_and_reconsidered_next_hour(self):
        self.choose.side_effect = lambda owner, agent, scene, state, choices, **kw: '0-9' if '0-9' in choices else '0'
        self.assertEqual(self.refresh(), 0)
        self.assertEqual(self.refresh(), 0)
        self.assertEqual(self.choose.call_count, 2)
        later = self.now + timedelta(hours=1)
        self.quote(later)
        self.assertEqual(self.refresh(later), 0)
        self.assertEqual(self.choose.call_count, 4)

    def test_unavailable_does_not_create_goal_or_raise_budget(self):
        self.choose.side_effect = None; self.choose.return_value = None
        self.assertEqual(self.refresh(), 0)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.budget, 0)
        self.assertFalse(self.plan.goals.exists())

    def test_partial_answer_resumes_without_reasking_range(self):
        self.choose.side_effect = ['10-19', None]
        self.assertEqual(self.refresh(), 0)
        self.choose.side_effect = ['12']
        self.assertEqual(self.refresh(), 1)
        self.assertEqual(self.choose.call_count, 3)

    def test_disabled_and_stock_sufficient_skip_models(self):
        configure('admin', False)
        self.assertEqual(self.refresh(), 0)
        configure('admin', True)
        add_stock(self.agent.pk, 'admin', self.agent.name, 'bait.worm', 12, '蚯蚓', 'fishing_bait', 1, 'stock')
        self.assertEqual(self.refresh(), 0)
        self.choose.assert_not_called()

    def test_pending_matching_goal_is_reused(self):
        MarketGoal.objects.create(pk='daily-bait', owner_id='admin', actor_id=self.agent.pk,
            plan=self.plan, kind='shop', sku='bait.worm', quantity=12, max_unit_price=1)
        self.assertEqual(self.refresh(), 0)
        self.choose.assert_not_called()

    def test_live_balance_change_clips_quantity_and_preserves_commitments(self):
        MarketGoal.objects.create(pk='other-goal', owner_id='admin', actor_id=self.agent.pk,
            plan=self.plan, kind='shop', sku='feed', quantity=3, max_unit_price=1)
        def choose(owner, agent, scene, state, choices, **kw):
            if '10-19' in choices:
                return '10-19'
            Agent.objects.filter(pk=agent.pk).update(money=8)
            return '12'
        self.choose.side_effect = choose
        self.assertEqual(self.refresh(), 1)
        self.assertEqual(self.plan.goals.get(sku='bait.worm').quantity, 5)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.budget, 8)

    def test_hourly_runner_adds_goal_before_building_actions(self):
        with patch('system_settings.agent_world.market_tick.execute', return_value={'ok': True, 'done': []}) as execute_mock:
            result = run(self.now, limit=5)
        self.assertEqual(result['entered'], 1)
        actions = execute_mock.call_args.args[4]
        self.assertEqual(actions['goals'][0]['slot_id'], 'bait.worm')

    def test_no_budget_or_no_quote_does_not_ask(self):
        Agent.objects.filter(pk=self.agent.pk).update(money=0)
        self.assertEqual(self.refresh(), 0)
        Agent.objects.filter(pk=self.agent.pk).update(money=1000)
        batch = current_batch('admin', self.now)
        # A nonempty supply list avoids the shop legacy backfill.
        batch.supplies = [{'id': 'fertilizer.yield', 'sku': 'fertilizer.yield', 'kind': 'fertilizer', 'price': '35'}]
        batch.save(update_fields=['supplies'])
        self.assertEqual(self.refresh(), 0)
        self.choose.assert_not_called()

    def test_disabling_fishing_during_decision_does_not_commit(self):
        def choose(owner, agent, scene, state, choices, **kw):
            if '10-19' in choices:
                return '10-19'
            configure('admin', False)
            return '12'
        self.choose.side_effect = choose
        self.assertEqual(self.refresh(), 0)
        self.assertFalse(self.plan.goals.exists())

    def test_life_reservation_is_not_available_for_bait(self):
        LifeItem.objects.create(pk='reserved-trip', owner_id='admin', actor_id=self.agent.pk,
            activity='travel', status='pending', budget=1000, original_at=self.now,
            scheduled_at=self.now + timedelta(hours=2))
        self.assertEqual(self.refresh(), 0)
        self.choose.assert_not_called()


@override_settings(USE_TZ=False)
class HourlyBaitNaiveTimeTests(HourlyBaitTests):
    """同时覆盖项目默认无时区数据库与 aware 测试配置。"""
