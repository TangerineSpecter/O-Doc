"""隔离数据库、模拟模型验证购票/开奖/同步资产不变量。"""
import copy
from datetime import datetime, timedelta
from decimal import Decimal
from itertools import combinations
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient
from system_settings.models import Agent, AgentTask, AIProvider, AIModel, WorldActionRuntime
from .life_models import LifeConfig, LifeProfile, LifeItem
from .life_config import DEFAULTS
from .life_time import SHANGHAI, local_time
from .lottery_models import LotteryConfig, LotteryRound, LotteryTicket
from .lottery_rules import RULES, RULES_V1, known_rules, numbers, price, settlement
from .lottery_service import configure, current_round, purchase, draw, maximum, tick
from .lottery_decision import prepare, pick_numbers, number_state, LotteryDecisionUnavailable, defer
from .lottery_sync import checkpoint_all, database_data, validate_source, validate_conflicts, refresh_merged
from .models import WorldLedger
from utils.sync_manager import SyncError

NOW = datetime(2026, 10, 22, 10, tzinfo=SHANGHAI)


class LotteryRulesTests(SimpleTestCase):
    def test_all_120_combinations_and_probabilities(self):
        choices = list(combinations(range(1, 11), 3))
        self.assertEqual(len(choices), 120)
        self.assertEqual(sum(len(set(c) & {1, 2, 3}) == 3 for c in choices), 1)
        self.assertEqual(sum(len(set(c) & {1, 2, 3}) == 2 for c in choices), 21)
        self.assertEqual(sum(len(set(c) & {1, 2, 3}) == 1 for c in choices), 63)
        for value in ([1, 1, 2], [0, 2, 3], [True, 2, 3], [1, 2], '123'):
            with self.assertRaises(ValueError): numbers(value)

    def test_first_proportions_and_fixed_prize_once_each_with_cross_tiers(self):
        tickets = [{'actor_id': a, 'actor_name': a, 'numbers': ns} for a, ns in [
            ('a', [1, 2, 3]), ('a', [1, 2, 3]), ('b', [1, 2, 3]), ('c', [1, 2, 3]),
            ('a', [1, 2, 4]), ('a', [1, 2, 4]), ('a', [1, 5, 6]), ('a', [1, 5, 6])]]
        result = settlement(tickets, [1, 2, 3], Decimal(860))
        awards = {(a['actor_id'], a['tier']): Decimal(a['amount']) for a in result['awards']}
        self.assertEqual(awards, {('a', 1): 1130, ('b', 1): 565, ('c', 1): 565, ('a', 2): 500, ('a', 3): 200})
        self.assertEqual(Decimal(result['carry_out']), 0)

    def test_empty_no_subsidy_and_no_jackpot_full_carry(self):
        self.assertEqual(Decimal(settlement([], [1, 2, 3], Decimal(123))['carry_out']), 123)
        result = settlement([{'actor_id': 'a', 'actor_name': 'a', 'numbers': [1, 2, 4]}], [1, 2, 3], Decimal(1000))
        self.assertEqual(Decimal(result['carry_out']), 2050)
        self.assertEqual(result['awards'][0]['amount'], '500.00')

    def test_rounding_remainder_is_carried(self):
        result = settlement([{'actor_id': a, 'actor_name': a, 'numbers': [1, 2, 3]} for a in 'abc'], [1, 2, 3], Decimal(0))
        self.assertEqual([a['amount'] for a in result['awards']], ['383.33'] * 3)
        self.assertEqual(Decimal(result['carry_out']), Decimal('.01'))

    def test_frozen_rule_versions_keep_historical_amounts(self):
        self.assertEqual((price(RULES), price(RULES_V1)), (Decimal('50.00'), Decimal('5.00')))
        result = settlement([{'actor_id': 'a', 'actor_name': 'a', 'numbers': [1, 2, 4]}],
                            [1, 2, 3], Decimal(0), RULES_V1)
        self.assertEqual((result['sales'], result['subsidy'], result['awards'][0]['amount']),
                         ('5.00', '100.00', '50.00'))
        self.assertTrue(known_rules(RULES) and known_rules(RULES_V1))
        self.assertFalse(known_rules({**RULES, 'ticket_price': '5.00'}))
        self.assertFalse(known_rules(None))


@override_settings(USE_TZ=True)
class LotteryTests(TestCase):
    def setUp(self):
        self.enterContext(patch('django.utils.timezone.now', return_value=NOW))
        self.enterContext(patch('system_settings.decision.routing.complete', side_effect=AssertionError('不得请求文本供应商')))
        provider = AIProvider.objects.create(name='test', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='test', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='居民A', model=model, money=200,
            role_profile={'personality': '谨慎', 'appearance': '不得输入的外貌'}, prompt='少花一些')
        LifeConfig.objects.create(pk='admin', migrated=True, settings={**DEFAULTS, 'agent_ids': [self.agent.pk], 'jev_enabled': True})
        LifeProfile.objects.create(pk=self.agent.pk, owner_id='admin')
        WorldActionRuntime.objects.create(pk='world', enabled=True)
        self.config = configure('admin', True)
        self.round = current_round('admin')
        self.task = AgentTask.objects.get(task_kind='lottery')
        self.client = APIClient()
        self.user = User.objects.create_superuser('admin', 'test@example.invalid', 'test')
        self.client.force_authenticate(self.user)

    def item(self, key='plan', quantity=1, selected=None, actor=None):
        agent = actor or self.agent
        return LifeItem.objects.create(pk=key, owner_id='admin', actor_id=agent.pk, activity='lottery',
            task_id=self.task.pk, original_at=NOW, scheduled_at=NOW, budget=quantity * 50,
            context={'lottery_plan': {'round_id': self.round.pk, 'quantity': quantity},
                     'lottery_numbers': selected or [], 'planned_on': NOW.date().isoformat()})

    def settle(self, winning=(1, 2, 3)):
        with patch('django.utils.timezone.now', return_value=self.round.draws_at), \
             patch('system_settings.agent_world.lottery_service.secrets.SystemRandom') as rng:
            rng.return_value.sample.return_value = list(winning)
            return draw(self.round.pk)

    def test_anchor_and_enable_idempotent(self):
        self.assertEqual(local_time(self.config.first_draw_at), datetime(2026, 10, 25, 20, tzinfo=SHANGHAI))
        configure('admin', False); configure('admin', True)
        self.assertEqual(LotteryRound.objects.count(), 1)
        self.assertEqual(LotteryConfig.objects.get(pk='admin').first_draw_at, self.config.first_draw_at)

    def test_purchase_is_atomic_and_idempotent_with_duplicates(self):
        item = self.item(quantity=2)
        purchase(item.pk, [[1, 2, 3]] * 2)
        purchase(item.pk, [[1, 2, 3]] * 2)
        self.agent.refresh_from_db(); item.refresh_from_db()
        self.assertEqual(self.agent.money, 100)
        self.assertEqual(item.spent, 100)
        self.assertEqual(item.status, 'completed')
        self.assertEqual(LotteryTicket.objects.count(), 2)
        self.assertEqual(WorldLedger.objects.filter(kind='lottery').count(), 1)

    def test_ten_limit_includes_other_reservations(self):
        self.item('reserved', 8)
        item = self.item('purchase', 3)
        self.assertEqual(maximum('admin', self.agent.pk, self.round, Decimal(200), item.pk), 2)
        with self.assertRaises(ValueError): purchase(item.pk, [[1, 2, 3]] * 3)
        self.assertFalse(LotteryTicket.objects.exists())
        LifeItem.objects.filter(pk='reserved').update(status='cancelled')
        purchase(item.pk, [[1, 2, 3]] * 3)

    def test_protected_cash_and_rollback(self):
        self.item('reserved', 1)
        item = self.item('purchase', 2)
        other = LifeItem.objects.get(pk='reserved')
        other.activity = 'travel'; other.budget = 195; other.context = {}; other.save()
        with self.assertRaises(ValueError): purchase(item.pk, [[1, 2, 3]] * 2)
        self.assertFalse(LotteryTicket.objects.exists())
        self.assertFalse(WorldLedger.objects.filter(kind='lottery').exists())
        item.refresh_from_db(); self.assertEqual(item.spent, 0)

    def test_budget_adjustments_cannot_change_confirmed_ticket_commitments(self):
        from .life_budget import adjust_budget, future_allocations
        item = self.item(quantity=2, selected=[[1, 2]])
        original_context = copy.deepcopy(item.context)
        market = LifeItem.objects.create(pk='market-budget', owner_id='admin', actor_id=self.agent.pk,
            activity='market_prepare', original_at=NOW, scheduled_at=NOW, budget=50)
        for amount in ('0', '5', '15'):
            allocations = [{'id': market.pk, 'budget': '60'}, {'id': item.pk, 'budget': amount}]
            with self.subTest(amount=amount):
                with self.assertRaisesMessage(ValueError, '大乐透'):
                    adjust_budget('admin', self.agent.pk, allocations, '重新分配采购预留')
                with self.assertRaisesMessage(ValueError, '大乐透'):
                    future_allocations([market, item], allocations, '规划后续预算')
                item.refresh_from_db(); market.refresh_from_db()
                self.assertEqual(item.budget, 100)
                self.assertEqual(item.context, original_context)
                self.assertEqual(market.budget, 50)
        checkpoint_all(); validate_source(database_data())
        purchase(item.pk, [[1, 2, 3], [1, 2, 4]])
        checkpoint_all(); validate_source(database_data())

    def test_budget_adjustments_allow_unchanged_ticket_budget_and_other_spending(self):
        from .life_budget import adjust_budget, future_allocations
        item = self.item(quantity=2)
        market = LifeItem.objects.create(pk='market-budget', owner_id='admin', actor_id=self.agent.pk,
            activity='market_prepare', original_at=NOW, scheduled_at=NOW, budget=50)
        allocations = [{'id': item.pk, 'budget': '100'}, {'id': market.pk, 'budget': '40'}]
        self.assertEqual(future_allocations([item, market], allocations, '减少市场预留'),
                         {item.pk: Decimal(100), market.pk: Decimal(40)})
        adjust_budget('admin', self.agent.pk, allocations, '减少市场预留')
        item.refresh_from_db(); market.refresh_from_db()
        self.assertEqual(item.budget, 100)
        self.assertEqual(market.budget, 40)
        checkpoint_all(); validate_source(database_data())

    def test_stop_sales_boundary(self):
        item = self.item()
        with patch('django.utils.timezone.now', return_value=self.round.closes_at), self.assertRaises(ValueError):
            purchase(item.pk, [[1, 2, 3]])
        self.assertFalse(LotteryTicket.objects.exists())

    def test_draw_replay_and_balance(self):
        purchase(self.item(quantity=2).pk, [[1, 2, 3], [1, 2, 4]])
        result = self.settle()
        self.assertEqual(Decimal(result.result['pool']), 1100)
        self.agent.refresh_from_db(); self.assertEqual(self.agent.money, 1700)
        with patch('django.utils.timezone.now', return_value=self.round.draws_at): draw(self.round.pk)
        self.assertEqual(WorldLedger.objects.filter(kind='lottery').count(), 3)
        self.assertEqual(LotteryRound.objects.count(), 2)

    def test_legacy_round_keeps_frozen_rules_for_price_and_settlement(self):
        LotteryRound.objects.filter(pk=self.round.pk).update(rules=RULES_V1)
        self.round.refresh_from_db()
        item = LifeItem.objects.create(pk='legacy', owner_id='admin', actor_id=self.agent.pk, activity='lottery',
            task_id=self.task.pk, original_at=NOW, scheduled_at=NOW, budget=5,
            context={'lottery_plan': {'round_id': self.round.pk, 'quantity': 1},
                     'lottery_numbers': [], 'planned_on': NOW.date().isoformat()})
        purchase(item.pk, [[1, 2, 3]])
        item.refresh_from_db(); self.agent.refresh_from_db()
        self.assertEqual((item.spent, self.agent.money), (5, 195))
        result = self.settle()
        self.assertEqual((Decimal(result.result['pool']), result.result['awards'][0]['amount']), (105, '105.00'))
        self.agent.refresh_from_db(); self.assertEqual(self.agent.money, 300)
        checkpoint_all(); validate_source(database_data())

    def test_paused_world_does_not_draw_and_disabling_keeps_sold_rights(self):
        purchase(self.item().pk, [[1, 2, 3]])
        configure('admin', False)
        WorldActionRuntime.objects.update(enabled=False)
        with patch('django.utils.timezone.now', return_value=self.round.draws_at): tick()
        self.round.refresh_from_db(); self.assertEqual(self.round.status, 'open')
        WorldActionRuntime.objects.update(enabled=True)
        self.settle(); self.round.refresh_from_db(); self.assertEqual(self.round.status, 'settled')

    def test_failed_round_rolls_back_without_blocking_other_owners_or_expiry(self):
        other = configure('other-owner', True)
        other_round = current_round(other.pk)
        purchase(self.item().pk, [[1, 2, 3]])
        expired = self.item('expired', quantity=2)
        original_draw = draw

        def draw_then_fail(identity):
            if identity != self.round.pk:
                return original_draw(identity)
            # Exercise rollback after award writes, not just an early validation error.
            with patch('system_settings.agent_world.lottery_service.create_round', side_effect=RuntimeError('模拟下一期写入失败')):
                return original_draw(identity)

        with patch('django.utils.timezone.now', return_value=self.round.draws_at), \
             patch('system_settings.agent_world.lottery_service.draw', side_effect=draw_then_fail), \
             patch('system_settings.agent_world.lottery_service.secrets.SystemRandom') as rng, \
             self.assertLogs('system_settings.agent_world.lottery_service', level='ERROR'):
            rng.return_value.sample.return_value = [1, 2, 3]
            tick()
        self.round.refresh_from_db(); other_round.refresh_from_db(); expired.refresh_from_db()
        self.agent.refresh_from_db()
        self.assertEqual(self.round.status, 'open')
        self.assertEqual(other_round.status, 'settled')
        self.assertEqual(expired.status, 'cancelled')
        self.assertEqual(self.agent.money, 150)
        self.assertFalse(WorldLedger.objects.filter(kind='lottery', amount__gt=0).exists())
        self.assertFalse(LotteryRound.objects.filter(owner_id='admin', sequence=2).exists())
        self.assertTrue(LotteryRound.objects.filter(owner_id=other.pk, sequence=2, status='open').exists())
        checkpoint_all(); validate_source(database_data())

    def test_lottery_maintenance_failure_does_not_block_life_execution(self):
        from .life_runner import tick_life
        items = [LifeItem.objects.create(pk=f'rest-{owner}', owner_id=owner, actor_id=self.agent.pk,
            activity='rest', original_at=NOW, scheduled_at=NOW, context={'planned_on': NOW.date().isoformat()})
            for owner in ('admin', 'other-owner')]
        LifeConfig.objects.create(pk='other-owner', migrated=True, settings=dict(DEFAULTS))
        with patch('system_settings.agent_world.lottery_service.tick', side_effect=RuntimeError('模拟彩票维护失败')), \
             patch('system_settings.agent_world.life_runner._plan_cycle'), \
             patch('system_settings.agent_world.life_runner.execute_item') as execute, \
             self.assertLogs('system_settings.agent_world.life_runner', level='ERROR'):
            tick_life(None)
        self.assertEqual({call.args[0].pk for call in execute.call_args_list}, {item.pk for item in items})

    def test_model_questions_10_9_8_and_no_large_choices(self):
        item = self.item(quantity=2)
        with patch('system_settings.agent_world.lottery_decision.enabled', return_value=True), \
             patch('system_settings.agent_world.lottery_decision.choose_scene', side_effect=['1', '2', '3', '1', '2', '3']) as choose:
            self.assertEqual(pick_numbers(item, self.agent), [[1, 2, 3]] * 2)
        self.assertEqual([len(c.args[4]) for c in choose.call_args_list], [10, 9, 8] * 2)
        for call in choose.call_args_list:
            self.assertFalse(call.kwargs['include_role'])
            self.assertNotIn('外貌', str(call.args[3]))
            self.assertNotIn('goals', call.args[3])
            self.assertEqual(call.args[3]['sold_ticket_count'], 0)
            self.assertEqual(call.args[3]['number_bet_counts'], {str(n): 0 for n in range(1, 11)})
            self.assertNotIn('recent_draws', call.args[3])

    def test_number_context_counts_issued_tickets_including_self_only_this_round(self):
        item = self.item(selected=[[8, 9]])
        for index, (actor, picks) in enumerate([
            (self.agent.pk, [1, 2, 3]), ('another-resident', [1, 2, 4]),
        ]):
            LotteryTicket.objects.create(pk=f'issued-{index}', owner_id='admin', round=self.round,
                actor_id=actor, actor_name='居民', life_item_id='issued', purchase_key='issued',
                ordinal=index, numbers=picks)
        foreign = LotteryRound.objects.create(pk='foreign', owner_id='other', sequence=1,
            opens_at=self.round.opens_at, closes_at=self.round.closes_at, draws_at=self.round.draws_at)
        LotteryTicket.objects.create(pk='foreign-ticket', owner_id='other', round=foreign,
            actor_id=self.agent.pk, actor_name='居民', life_item_id='foreign', purchase_key='foreign',
            ordinal=1, numbers=[8, 9, 10])
        context = number_state(item, self.agent, self.round, [[8, 9]])
        self.assertEqual(context['sold_ticket_count'], 2)
        self.assertEqual(context['number_bet_counts'],
            {'1': 2, '2': 2, '3': 1, '4': 1, **{str(n): 0 for n in range(5, 11)}})
        self.assertEqual(context['held_numbers'], [[1, 2, 3]])
        self.assertEqual(context['selected_numbers'], [[8, 9]])

    def test_number_context_recent_draws_omit_missing_and_limit_to_three(self):
        item = self.item()
        self.round.sequence = 6
        self.round.save(update_fields=['sequence'])
        self.assertNotIn('recent_draws', number_state(item, self.agent, self.round, []))
        for sequence in range(1, 6):
            LotteryRound.objects.create(pk=f'history-{sequence}', owner_id='admin', sequence=sequence,
                opens_at=self.round.opens_at - timedelta(days=3 * (6 - sequence)),
                closes_at=self.round.closes_at - timedelta(days=3 * (6 - sequence)),
                draws_at=self.round.draws_at - timedelta(days=3 * (6 - sequence)),
                status='settled', result={'winning_numbers': [sequence, sequence + 1, 10], 'carry_out': '0.00'})
            if sequence == 2:
                self.assertEqual(number_state(item, self.agent, self.round, [])['recent_draws'], [
                    {'sequence': 2, 'winning_numbers': [2, 3, 10]},
                    {'sequence': 1, 'winning_numbers': [1, 2, 10]},
                ])
        for key, owner, sequence, status in [
            ('foreign-history', 'other', 5, 'settled'),
            ('future', 'admin', 7, 'settled'), ('unsettled', 'admin', 0, 'open'),
        ]:
            LotteryRound.objects.create(pk=key, owner_id=owner, sequence=sequence, status=status,
                opens_at=self.round.opens_at, closes_at=self.round.closes_at, draws_at=self.round.draws_at,
                result={'winning_numbers': [7, 8, 9]})
        self.assertEqual(number_state(item, self.agent, self.round, [])['recent_draws'], [
            {'sequence': n, 'winning_numbers': [n, n + 1, 10]} for n in (5, 4, 3)])

    def test_partial_checkpoint_retries_only_remaining_digit(self):
        item = self.item(selected=[[1, 2]])
        with patch('system_settings.agent_world.lottery_decision.enabled', return_value=True), \
             patch('system_settings.agent_world.lottery_decision.choose_scene', return_value=None):
            with self.assertRaises(LotteryDecisionUnavailable): pick_numbers(item, self.agent)
        item.refresh_from_db(); self.assertEqual(item.context['lottery_numbers'], [[1, 2]])
        with patch('system_settings.agent_world.lottery_decision.enabled', return_value=True), \
             patch('system_settings.agent_world.lottery_decision.choose_scene', return_value='3') as choose:
            self.assertEqual(pick_numbers(item, self.agent), [[1, 2, 3]])
        self.assertEqual(choose.call_count, 1)

    def test_quantity_candidates_and_no_zero(self):
        self.agent.money = 2000
        self.agent.save(update_fields=['money'])
        self.item('other', 7)
        item = self.item('quantity'); item.activity = 'unplanned'; item.context = {}; item.save()
        with patch('system_settings.agent_world.lottery_decision.enabled', return_value=True), \
             patch('system_settings.agent_world.lottery_decision.choose_scene', return_value='3') as choose:
            self.assertEqual(prepare(item, self.agent)['quantity'], 3)
        self.assertEqual(set(choose.call_args.args[4]), {'1', '2', '3'})
        for field in ('sold_ticket_count', 'number_bet_counts', 'recent_draws'):
            self.assertNotIn(field, choose.call_args.args[3])

    def test_three_failures_end_and_release(self):
        item = self.item(quantity=10)
        for i in range(3): defer(item, LotteryDecisionUnavailable('不可用'))
        item.refresh_from_db(); self.assertEqual(item.status, 'failed')
        self.assertEqual(maximum('admin', self.agent.pk, self.round, Decimal(200)), 4)

    def test_snapshot_roundtrip_and_missing_ledger_rejected(self):
        purchase(self.item().pk, [[1, 2, 3]])
        self.settle()
        checkpoint_all(); data = database_data(); validate_source(data)
        broken = [r for r in data if not (r['model'] == 'system_settings.worldledger' and r['fields']['kind'] == 'lottery')]
        with self.assertRaises(SyncError): validate_source(broken)
        with self.assertRaises(SyncError): validate_source(broken, check_digest=False)
        validate_source([])

    def test_conflicting_draw_and_over_limit_merge_are_rejected(self):
        purchase(self.item().pk, [[1, 2, 3]])
        self.settle(); checkpoint_all()
        data = database_data(); remote = copy.deepcopy(data)
        row = next(r for r in remote if r['model'] == 'system_settings.lotteryround' and r['fields']['status'] == 'settled')
        row['fields']['result']['winning_numbers'] = [7, 8, 9]
        with self.assertRaises(SyncError): validate_conflicts(data, remote)
        with self.assertRaises(SyncError): refresh_merged(remote, {})

    def test_get_no_creation_permissions_pagination_and_owner_isolation(self):
        self.assertEqual(self.client.get('/api/settings/agent-world/lottery/current/').status_code, 200)
        before = LotteryRound.objects.count()
        self.assertEqual(self.client.get('/api/settings/agent-world/lottery/rounds/?page=0').status_code, 400)
        self.assertEqual(LotteryRound.objects.count(), before)
        other = User.objects.create_user('other', password='test')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f'/api/settings/agent-world/lottery/rounds/{self.round.pk}/').status_code, 404)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get('/api/settings/agent-world/lottery/config/').status_code, (401, 403))

    def test_naive_storage_supported(self):
        with override_settings(USE_TZ=False), patch('django.utils.timezone.now', return_value=NOW.replace(tzinfo=None)):
            config = configure('naive-owner', True)
            self.assertIsNone(config.first_draw_at.tzinfo)
            self.assertEqual(local_time(config.first_draw_at).hour, 20)

    def test_daily_planner_short_summary_quantity_and_execution(self):
        from .life_planner import plan_items
        from .life_runner import execute_item
        item = self.item()
        item.activity, item.context, item.budget = 'unplanned', {}, 0
        item.save()
        def daily(agent, instruction, context, **kwargs):
            self.assertEqual(context['lottery']['held'], 0)
            self.assertNotIn('held_numbers', context['lottery'])
            self.assertLess(len(str(context['lottery'])), 180)
            return {'plans': [{'id': item.pk, 'activity': 'lottery', 'reason': '试试手气'}]}
        with patch('system_settings.agent_world.lottery_decision.enabled', return_value=True), \
             patch('system_settings.agent_world.lottery_decision.choose_scene', return_value='2'), \
             patch('system_settings.agent_world.life_planner.ask', side_effect=daily) as ask:
            plan_items(LifeConfig.objects.get(pk='admin'), self.agent, [item])
        self.assertEqual(ask.call_count, 1)
        item.refresh_from_db()
        self.assertEqual(item.context['lottery_plan']['quantity'], 2)
        self.assertEqual(item.budget, 100)
        with patch('system_settings.agent_world.lottery_decision.enabled', return_value=True), \
             patch('system_settings.agent_world.lottery_decision.choose_scene', side_effect=['1', '2', '3'] * 2):
            execute_item(item, None)
        item.refresh_from_db()
        self.assertEqual(item.status, 'completed')
        self.assertEqual(LotteryTicket.objects.count(), 2)
        checkpoint_all(); validate_source(database_data())

    def test_quantity_failure_does_not_repeat_day_model(self):
        from .life_planner import plan_items
        item = self.item(); item.activity, item.context, item.budget = 'unplanned', {}, 0; item.save()
        response = {'plans': [{'id': item.pk, 'activity': 'lottery', 'reason': '试试手气'}]}
        with patch('system_settings.agent_world.lottery_decision.enabled', return_value=True), \
             patch('system_settings.agent_world.lottery_decision.choose_scene', side_effect=[None, '1']), \
             patch('system_settings.agent_world.life_planner.ask', return_value=response) as ask:
            plan_items(LifeConfig.objects.get(pk='admin'), self.agent, [item])
            item.refresh_from_db(); self.assertEqual(item.status, 'deferred')
            plan_items(LifeConfig.objects.get(pk='admin'), self.agent, [item])
        self.assertEqual(ask.call_count, 1)
        item.refresh_from_db(); self.assertEqual(item.context['lottery_plan']['quantity'], 1)

    def test_merge_over_reserved_tickets_rejected(self):
        self.item('one', 6); self.item('two', 5)
        with self.assertRaises(SyncError): checkpoint_all()

    def test_final_transaction_rollback_if_ledger_write_fails(self):
        item = self.item()
        original_create = WorldLedger.objects.create
        def create(**kwargs):
            if kwargs.get('kind') == 'lottery': raise RuntimeError('模拟磁盘失败')
            return original_create(**kwargs)
        with patch.object(WorldLedger.objects, 'create', side_effect=create), self.assertRaises(RuntimeError):
            purchase(item.pk, [[1, 2, 3]])
        item.refresh_from_db(); self.agent.refresh_from_db()
        self.assertEqual(item.spent, 0); self.assertEqual(self.agent.money, 200)
        self.assertFalse(LotteryTicket.objects.exists())

    def test_full_world_snapshot_export_restore_revokes_runtime(self):
        from tempfile import TemporaryDirectory
        from utils.sync_manager import SyncManager
        purchase(self.item().pk, [[1, 2, 3]])
        self.settle()
        with TemporaryDirectory() as folder, override_settings(MEDIA_ROOT=folder):
            manager = SyncManager()
            data = manager.build_snapshot_data()
            meta = manager.build_snapshot_meta(data_list=data)
            self.assertEqual(meta['lottery_schema_version'], 2)
            validate_source(data, meta)
            manager.apply_snapshot_data(data, meta)
            self.assertFalse(WorldActionRuntime.objects.get(pk='world').enabled)
            self.assertEqual(LotteryTicket.objects.count(), 1)
            self.assertEqual(WorldLedger.objects.filter(kind='lottery').count(), 2)

    def test_auto_retry_keeps_daily_choice_during_overdue_recovery(self):
        from .life_planner import plan_items
        from .life_schedule import recover
        item = self.item(); item.activity, item.context, item.budget = 'unplanned', {}, 0; item.save()
        response = {'plans': [{'id': item.pk, 'activity': 'lottery', 'reason': '试试手气'}]}
        with patch('system_settings.agent_world.lottery_decision.enabled', return_value=True), \
             patch('system_settings.agent_world.lottery_decision.choose_scene', side_effect=[None, '1']), \
             patch('system_settings.agent_world.life_planner.ask', return_value=response) as ask:
            config = LifeConfig.objects.get(pk='admin')
            plan_items(config, self.agent, [item])
            with patch('django.utils.timezone.now', return_value=NOW + timedelta(minutes=6)):
                recover(config, NOW + timedelta(minutes=6))
                item.refresh_from_db()
                plan_items(config, self.agent, [item])
        self.assertEqual(ask.call_count, 1)

    def test_cancel_during_unavailable_model_is_not_revived(self):
        item = self.item(); stale = LifeItem.objects.get(pk=item.pk)
        LifeItem.objects.filter(pk=item.pk).update(status='cancelled')
        defer(stale, LotteryDecisionUnavailable('连接失败'))
        item.refresh_from_db(); self.assertEqual(item.status, 'cancelled')

    def test_expired_quantity_draft_is_not_transferred_to_next_round(self):
        item = self.item(); item.activity = 'unplanned'
        item.context = {'lottery_target': self.round.pk, 'lottery_attempts': 1}
        item.save()
        with patch('django.utils.timezone.now', return_value=self.round.draws_at): tick()
        item.refresh_from_db(); self.assertEqual(item.status, 'cancelled')
        self.assertFalse(LotteryTicket.objects.exists())

    def test_disabling_uninitialized_config_does_not_start_clock(self):
        self.assertIsNone(configure('new-owner', False))
        self.assertFalse(LotteryConfig.objects.filter(pk='new-owner').exists())

    def test_sync_merges_disjoint_residents_purchases_and_rebuilds_integrity(self):
        from tempfile import TemporaryDirectory
        from django.db import transaction
        from utils.sync_manager import SyncManager
        from .lottery_service import ensure_task
        other = Agent.objects.create(name='居民B', model=self.agent.model, money=200)
        config = LifeConfig.objects.get(pk='admin')
        config.settings['agent_ids'].append(other.pk); config.save()
        ensure_task(self.config)
        one = self.item('one'); two = self.item('two', actor=other)
        with TemporaryDirectory() as folder, override_settings(MEDIA_ROOT=folder):
            manager = SyncManager()
            base = manager.build_snapshot_data()
            base_rev = manager._build_revision_manifest(base)
            base_meta = manager.build_snapshot_meta(data_list=base)
            sid = transaction.savepoint()
            purchase(one.pk, [[1, 2, 3]])
            local = manager.build_snapshot_data()
            local_rev = manager._build_revision_manifest(local)
            transaction.savepoint_rollback(sid)
            purchase(two.pk, [[1, 2, 4]])
            remote = manager.build_snapshot_data()
            remote_rev = manager._build_revision_manifest(remote)
            merged, revisions, _ = manager.merge_v2_data(
                {'data': base, 'revisions': base_rev, 'meta': base_meta}, local, local_rev,
                {'data': remote, 'revisions': remote_rev, 'meta': manager.build_snapshot_meta(data_list=remote)})
            validate_source(merged)
            self.assertEqual(sum(r['model'] == 'system_settings.lotteryticket' for r in merged), 2)
