"""每日市场机会与普通生活独立；使用隔离数据库及模拟模型。"""
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.db import transaction
from django.test import TestCase, override_settings

from system_settings.models import Agent, AgentTask, AgentRunRecord, AIModel, AIProvider, SystemSetting, WorldAction, WorldActionRuntime
from .execution import WorldLeaseBusy
from .life_budget import adjust_budget, charge_budget
from .life_config import DEFAULTS, ensure_profiles
from .life_market import ensure_daily_market
from .life_models import LifeConfig, LifeItem
from .life_planner import apply_plan
from .life_runner import execute_item, tick_life
from .life_schedule import ensure_cycle, recover, stable_id, window
from .life_scope import CURRENT
from .life_sync import checkpoint_all, reconcile_life
from .life_time import SHANGHAI, local_time

NOW = datetime(2026, 10, 10, 8, tzinfo=SHANGHAI)


@override_settings(USE_TZ=True)
class DailyMarketScheduleTests(TestCase):
    def setUp(self):
        provider = AIProvider.objects.create(name='test', base_url='http://example.invalid', api_key='fake')
        model = AIModel.objects.create(provider=provider, name='fake', type='chat')
        self.agents = [Agent.objects.create(name=f'buyer {i}', model=model, money=1000) for i in range(4)]
        self.config = LifeConfig.objects.create(pk='owner', migrated=True, settings={
            **DEFAULTS, 'agent_ids': [a.pk for a in self.agents], 'mode': 'random', 'count': 8,
            'active_start': '08:00', 'active_end': '20:00',
        })
        ensure_profiles(self.config.pk, self.config.settings['agent_ids'])
        self.task = AgentTask.objects.create(name='市场', agent=self.agents[0], task_kind='market', enabled=True,
                                            market_config={'owner_id': self.config.pk})
        WorldActionRuntime.objects.create(pk='world', enabled=True)

    def daily_items(self):
        return LifeItem.objects.filter(activity='market_prepare').order_by('scheduled_at')

    def due(self):
        ensure_daily_market(self.config, NOW)
        item = self.daily_items().first()
        agent = next(a for a in self.agents if a.pk == item.actor_id)
        return item, agent, local_time(item.scheduled_at)

    def test_times_are_spread_and_persist_without_model_calls(self):
        with patch('system_settings.agent_world.life_planner.ask') as ask:
            ensure_daily_market(self.config, NOW)
            original = list(self.daily_items().values_list('pk', 'scheduled_at'))
            ensure_daily_market(self.config, NOW + timedelta(hours=2))
            self.assertEqual(original, list(self.daily_items().values_list('pk', 'scheduled_at')))
            ask.assert_not_called()
        self.assertEqual(len(original), 4)
        left, right = window(self.config.settings, NOW.date())
        span = (right - (NOW + timedelta(minutes=5))) / 4
        for index, (_, at) in enumerate(original):
            self.assertGreaterEqual(local_time(at), NOW + timedelta(minutes=5) + index * span)
            self.assertLess(local_time(at), NOW + timedelta(minutes=5) + (index + 1) * span)

    def test_late_start_uses_only_remaining_window(self):
        late = NOW.replace(hour=18)
        ensure_daily_market(self.config, late)
        self.assertEqual(self.daily_items().count(), 4)
        self.assertTrue(all(late + timedelta(minutes=5) <= local_time(i.scheduled_at) < late.replace(hour=20)
                            for i in self.daily_items()))

    def test_daily_opportunity_does_not_reduce_normal_cycle_count(self):
        ensure_daily_market(self.config, NOW)
        cycle = ensure_cycle(self.config, NOW)
        self.assertIsNotNone(cycle)
        self.assertEqual(LifeItem.objects.filter(cycle=cycle).count(), 8)
        self.assertEqual(self.daily_items().count(), 4)

    def test_planning_does_not_run_market_or_rewrite_market_items(self):
        def propose(agent, instruction, context):
            return {'plans': [{'id': slot['id'], 'activity': 'rest', 'budget': '0', 'reason': '休息'}
                              for slot in context['slots']]}
        with patch('django.utils.timezone.now', return_value=NOW), \
             patch('system_settings.agent_world.life_planner.ask', side_effect=propose) as ask, \
             patch('system_settings.agent_world.market_runner.run_market_opportunity') as run:
            tick_life(None)
        self.assertEqual(self.daily_items().count(), 4)
        self.assertTrue(all(item.status == 'pending' for item in self.daily_items()))
        self.assertTrue(ask.called)
        self.assertTrue(all('market_prepare' != slot['current_activity']
                            for call in ask.call_args_list for slot in call.args[2]['slots']))
        run.assert_not_called()

    def test_daily_item_cannot_be_repurposed_by_planner(self):
        item, agent, _ = self.due()
        with self.assertRaisesMessage(ValueError, '独立排程'):
            apply_plan(self.config.pk, agent, [item], {'plans': [
                {'id': item.pk, 'activity': 'rest', 'budget': '0', 'reason': '替换'}]})

    def test_due_market_uses_current_scope_and_shared_budget_once(self):
        item, agent, now = self.due()
        def shop(task, scheduler, *, key):
            self.assertEqual(key, item.pk)
            self.assertEqual(CURRENT.get()['actor_id'], agent.pk)
            self.assertEqual(CURRENT.get()['context']['current']['budget'], '0.00')
            adjust_budget(self.config.pk, agent.pk, [{'id': item.pk, 'budget': '100'}], '买种子')
            with transaction.atomic():
                charge_budget(agent, Decimal('50'))
            record = AgentRunRecord.objects.create(task=task, agent=agent, task_name='市场', status='success', summary='买到种子')
            WorldAction.objects.create(pk=key, task=task, agent=agent, actor_id=agent.pk, record=record, status='success')
            return record
        with patch('django.utils.timezone.now', return_value=now), \
             patch('system_settings.agent_world.life_runner.plan_items') as plan, \
             patch('system_settings.agent_world.market_runner.run_market_opportunity', side_effect=shop) as run:
            tick_life(None)
            tick_life(None)
        item.refresh_from_db()
        self.assertEqual(item.status, 'completed')
        self.assertEqual(item.spent, Decimal('50'))
        self.assertEqual(item.budget, Decimal('100'))
        self.assertEqual(run.call_count, 1)
        self.assertEqual(self.daily_items().count(), 4)
        self.assertTrue(all(all(i.activity != 'market_prepare' for i in call.args[2]) for call in plan.call_args_list))

    def test_skipping_market_consumes_daily_opportunity(self):
        item, agent, now = self.due()
        record = AgentRunRecord.objects.create(task=self.task, agent=agent, task_name='市场', status='success', summary='今天不需要采购')
        WorldAction.objects.create(pk=item.pk, task=self.task, agent=agent, actor_id=agent.pk, record=record, status='skipped')
        with patch('django.utils.timezone.now', return_value=now), \
             patch('system_settings.agent_world.market_runner.run_market_opportunity', return_value=record):
            execute_item(item, None)
        ensure_daily_market(self.config, now)
        item.refresh_from_db()
        self.assertEqual(item.status, 'rest')
        self.assertEqual(self.daily_items().count(), 4)

    def test_daily_market_can_adjust_zero_budget_and_make_real_purchase(self):
        SystemSetting.objects.create(key='system_mcp_config', value={'enabled': True})
        item, agent, now = self.due()
        def shop(messages, tools, execute, **kwargs):
            entered = execute('enter_market', {'request_id': 'enter'})
            self.assertNotIn('error', entered)
            batch = execute('get_market_shop', {})
            self.assertNotIn('error', batch)
            adjusted = execute('adjust_life_budget', {
                'allocations': [{'id': item.pk, 'budget': '100'}], 'reason': '购买当天需要的饲料',
            })
            self.assertNotIn('error', adjusted)
            bought = execute('buy_market_shop', {
                'request_id': 'buy', 'batch_id': batch['id'], 'slot_id': 'feed', 'quantity': 1,
            })
            self.assertNotIn('error', bought)
            execute('leave_market', {'reason': '采购结束'})
        with patch('django.utils.timezone.now', return_value=now), \
             patch('system_settings.agent_world.market_runner.AIService.chat_completion_messages_with_tools', side_effect=shop):
            execute_item(item, None)
        item.refresh_from_db()
        agent.refresh_from_db()
        self.assertEqual(item.status, 'completed')
        self.assertGreater(item.spent, 0)
        self.assertEqual(item.spent, Decimal('1000') - agent.money)
        self.assertEqual(WorldAction.objects.get(pk=item.pk).actor_id, item.actor_id)
        checkpoint_all()
        reconcile_life()

    @override_settings(USE_TZ=False)
    def test_naive_project_time_keeps_persisted_daily_identity(self):
        now = NOW.replace(tzinfo=None)
        ensure_daily_market(self.config, now)
        original = list(self.daily_items().values_list('pk', 'scheduled_at'))
        ensure_daily_market(self.config, now + timedelta(hours=1))
        self.assertEqual(original, list(self.daily_items().values_list('pk', 'scheduled_at')))
        self.assertTrue(all(at.tzinfo is None for _, at in original))

    def test_world_busy_preserves_opportunity_including_claim_race(self):
        item, agent, now = self.due()
        WorldActionRuntime.objects.filter(pk='world').update(token='held', until=now + timedelta(minutes=10))
        with patch('django.utils.timezone.now', return_value=now), \
             patch('system_settings.agent_world.market_runner.run_market_opportunity') as run:
            execute_item(item, None)
            run.assert_not_called()
        WorldActionRuntime.objects.filter(pk='world').update(token='', until=None)
        with patch('django.utils.timezone.now', return_value=now), \
             patch('system_settings.agent_world.market_runner.run_market_opportunity', side_effect=WorldLeaseBusy):
            execute_item(item, None)
        item.refresh_from_db()
        self.assertEqual(item.status, 'pending')
        self.assertNotIn('execution_started', item.context)
        self.assertEqual(self.daily_items().count(), 4)

    def test_paused_and_expired_opportunities_do_not_accumulate(self):
        item, agent, now = self.due()
        self.config.paused_agents = [agent.pk]
        self.config.save()
        recover(self.config, now)
        item.refresh_from_db()
        self.assertEqual(item.status, 'paused')
        self.config.paused_agents = []
        self.config.save()
        tomorrow = NOW + timedelta(days=1)
        recover(self.config, tomorrow, resume_actor=agent.pk)
        item.refresh_from_db()
        self.assertEqual(item.status, 'rest')
        ensure_daily_market(self.config, tomorrow)
        self.assertTrue(LifeItem.objects.filter(pk=stable_id(self.config.pk, agent.pk, tomorrow.date().isoformat(), 'market-prepare')).exists())

    def test_legacy_completed_day_and_disabled_task_are_respected(self):
        item, _, now = self.due()
        item.status = 'completed'
        item.save()
        ensure_daily_market(self.config, now)
        self.assertEqual(self.daily_items().count(), 4)
        self.task.enabled = False
        self.task.save()
        ensure_daily_market(self.config, NOW + timedelta(days=1))
        self.assertEqual(self.daily_items().count(), 4)

    def test_pending_schedule_survives_sync_validation(self):
        ensure_daily_market(self.config, NOW)
        original = list(self.daily_items().values_list('pk', 'scheduled_at'))
        checkpoint_all()
        reconcile_life()
        self.assertFalse(WorldActionRuntime.objects.get(pk='world').enabled)
        ensure_daily_market(self.config, NOW + timedelta(hours=1))
        self.assertEqual(original, list(self.daily_items().values_list('pk', 'scheduled_at')))
