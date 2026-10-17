"""Daily text planning and travel/occupancy regressions; isolated DB, media and models."""
import copy
from datetime import datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.core import serializers
from django.test import SimpleTestCase, TestCase, override_settings

from system_settings.models import AgentExecutionLease, AgentTask
from . import test_cooking as cooking_fixtures
from .life_models import LifeConfig, LifeItem
from .life_config import DEFAULTS, ensure_profiles
from .life_planner import plan_items
from .life_time import SHANGHAI, local_time
from .life_daily_travel import covering_tier, budget_options, selected_plan, recheck

NOW = datetime(2026, 10, 19, 8, tzinfo=SHANGHAI)


class TravelTierTests(SimpleTestCase):
    def test_minimum_covering_tiers_and_cash_tail(self):
        self.assertEqual([covering_tier(Decimal(n)) for n in (100, 500, 501, 1200, 1500, 5501)],
                         [500, 500, 1500, 1500, 1500, 6500])
        options = budget_options(Decimal(1200), Decimal(1200))
        self.assertEqual({row['budget'] for row in options.values()}, {'0', '500', '1200'})
        self.assertEqual(budget_options(Decimal(1200), Decimal(0)), {'skip': {'label': '不去', 'budget': '0'}})


@override_settings(USE_TZ=True)
class DailyPlanningTests(TestCase):
    supply = cooking_fixtures.CookingTests.supply

    def setUp(self):
        cooking_fixtures.CookingTests.setUp(self)
        self.enterContext(patch('system_settings.decision.routing.complete', side_effect=AssertionError('测试不得请求供应商')))
        AgentExecutionLease.objects.filter(agent=self.agent).delete()
        self.enterContext(patch('django.utils.timezone.now', return_value=NOW))
        self.agent.money = Decimal(10000)
        self.agent.prompt = '公共补充要求'
        self.agent.role_profile = {'identity': '身份背景不应输入', 'personality': '认真细心',
                                   'preferences': '喜欢安静', 'appearance': '紫色头发', 'mbti': 'ISTJ'}
        self.agent.save()
        self.config = LifeConfig.objects.create(pk='admin', migrated=True,
            settings={**DEFAULTS, 'agent_ids': [self.agent.pk], 'jev_enabled': True})
        ensure_profiles('admin', [self.agent.pk])

    def item(self, key, hours=2):
        at = NOW + timedelta(hours=hours)
        return LifeItem.objects.create(pk=key, owner_id='admin', actor_id=self.agent.pk,
                                       original_at=at, scheduled_at=at)

    def investment(self):
        self.task.enabled = False; self.task.save()
        return AgentTask.objects.create(name='投资', task_kind='investment', agent=self.agent,
                                       investment_config={'owner_id': 'admin'}, enabled=True)

    def response(self, kind='investment'):
        def select(agent, instruction, context, **kwargs):
            return {'plans': [{'id': slot['id'], 'activity': kind, 'reason': '结合当前资源安排'}
                              for slot in context['slots']]}
        return select

    def test_all_day_one_text_request_independent_of_structured_switch(self):
        self.investment()
        one, two = self.item('one'), self.item('two', 6)
        for enabled in (True, False):
            self.config.settings['jev_enabled'] = enabled; self.config.save()
            with patch('system_settings.agent_world.life_planner.ask', side_effect=self.response()) as ask, \
                 patch('system_settings.agent_world.life_choices.choose_scene', return_value='goal'), \
                 patch('system_settings.agent_world.life_activity_decision.choose_scene', side_effect=AssertionError('不能走活动决策')):
                plan_items(self.config, self.agent, [one])
            self.assertEqual(ask.call_count, 1)
            context = ask.call_args.args[2]
            self.assertEqual([row['id'] for row in context['slots']], ['one', 'two'])
            self.assertEqual(context['balance'], '10000.00')
            for item in (one, two):
                item.refresh_from_db()
                self.assertEqual(item.activity, 'investment')
                from .life_schedule import requeue
                requeue(item, '再次测试')

    def test_role_projection_and_no_memory_request(self):
        self.investment()
        item = self.item('persona')
        def completion(agent, prompt, validate, **kwargs):
            self.assertIn('认真细心', prompt)
            self.assertIn('喜欢安静', prompt)
            self.assertEqual(prompt.count('公共补充要求'), 1)
            for forbidden in ('身份背景不应输入', '紫色头发', 'ISTJ'):
                self.assertNotIn(forbidden, prompt)
            return validate({'plans': [{'id': item.pk, 'activity': 'investment', 'reason': '安排投资'}]})
        with patch('system_settings.decision.routing.complete_json', side_effect=completion), \
             patch('system_settings.agent_world.life_choices.choose_scene', return_value='goal'), \
             patch('system_settings.agent_world.memory.recall.memory_context') as memory:
            plan_items(self.config, self.agent, [item])
        memory.assert_not_called()

    def test_partial_detail_failure_keeps_whole_day_choices(self):
        self.investment()
        one, two = self.item('one'), self.item('two', 6)
        with patch('system_settings.agent_world.life_planner.ask', side_effect=self.response()) as ask, \
             patch('system_settings.agent_world.life_choices.choose_scene', side_effect=['goal', ValueError('模型暂时失败')]):
            with self.assertRaisesMessage(ValueError, '模型暂时失败'):
                plan_items(self.config, self.agent, [one, two])
        self.assertEqual(ask.call_count, 1)
        one.refresh_from_db(); two.refresh_from_db()
        before = copy.deepcopy(one.context)
        with patch('system_settings.agent_world.life_planner.ask', side_effect=AssertionError('不能重抽活动')), \
             patch('system_settings.agent_world.life_choices.choose_scene', return_value='balanced'):
            plan_items(self.config, self.agent, [one, two])
        one.refresh_from_db(); two.refresh_from_db()
        self.assertEqual(one.context, before)
        self.assertEqual(two.activity, 'investment')

    def test_no_available_tasks_and_weekend_investment_need_no_model(self):
        self.investment()
        item = self.item('weekend', 24 * 5 + 2)
        with patch('system_settings.agent_world.life_planner.ask', side_effect=AssertionError('周末无候选')):
            plan_items(self.config, self.agent, [item])
        item.refresh_from_db()
        self.assertEqual(item.activity, 'rest')

    def test_model_wait_schedule_change_rejects_checkpoint(self):
        self.investment()
        item = self.item('version')
        def changed(agent, instruction, context, **kwargs):
            from .life_schedule import revise
            row = LifeItem.objects.get(pk=item.pk)
            revise(row, '用户调整', scheduled_at=row.scheduled_at + timedelta(hours=1))
            return self.response()(agent, instruction, context)
        with patch('system_settings.agent_world.life_planner.ask', side_effect=changed):
            with self.assertRaisesMessage(ValueError, '日程在规划期间发生变化'):
                plan_items(self.config, self.agent, [item])
        item.refresh_from_db()
        self.assertNotIn('daily_choice', item.context)

    def test_target_dates_are_grouped_in_shanghai_and_not_redrawn_on_retry(self):
        self.investment()
        one, two = self.item('day-one'), self.item('day-two', 26)
        with patch('system_settings.agent_world.life_planner.ask', side_effect=self.response()) as ask, \
             patch('system_settings.agent_world.life_choices.choose_scene', return_value='conservative'):
            plan_items(self.config, self.agent, [two, one])
            self.assertEqual([call.args[2]['target_date'] for call in ask.call_args_list], ['2026-10-19', '2026-10-20'])
            self.assertTrue(all(len(call.args[2]['slots']) == 1 for call in ask.call_args_list))
            plan_items(self.config, self.agent, [one, two])
            self.assertEqual(ask.call_count, 2)
        two.refresh_from_db()
        self.assertEqual(two.context['planned_on'], '2026-10-20')

    def quotes(self, budget=None):
        from .travel_models import TravelDestination
        city = TravelDestination.objects.create(pk='city', country_code='CN', country='中国', city='测试城市', price=1200)
        return {'candidates': [{'id': city.pk, 'country_code': 'CN', 'country': '中国', 'region': '',
                                'city': city.city, 'price': '1200'}], 'budget': budget,
                'available': '10000', 'quoted_at': NOW.isoformat()}

    def travel(self):
        self.task.enabled = False; self.task.save()
        return AgentTask.objects.create(name='旅行', task_kind='travel', agent=self.agent,
                                       travel_config={'owner_id': 'admin'}, enabled=True)

    def test_travel_structured_skip_and_unavailable_random_quotes(self):
        from .life_daily_travel import prepare
        self.quotes()
        for result in ('skip', None, 'cap_1500', 'invalid'):
            with patch('system_settings.decision.routing.choose_scene', return_value=result) as choose, \
                 patch('system_settings.agent_world.travel_candidates.candidates', return_value=[{'id': 'city'}]) as sample:
                quotes = prepare('admin', self.agent, Decimal(10000), '喜欢旅行')
                self.assertEqual(choose.call_args.args[2], 'life_budget')
                if result == 'skip':
                    sample.assert_not_called(); self.assertEqual(quotes['candidates'], [])
                else:
                    self.assertEqual(sample.call_args.kwargs['limit'], 3)
                    self.assertEqual(quotes['budget'], '1500' if result == 'cap_1500' else None)

    def test_selected_trip_budget_persists_sync_and_requires_replan_when_price_changes(self):
        from .life_sync import checkpoint_all, reconcile_life
        from .travel_models import TravelDestination
        self.travel(); quotes = self.quotes()
        item = self.item('trip')
        def select(agent, instruction, context, **kwargs):
            return {'plans': [{'id': item.pk, 'activity': 'travel', 'reason': '去测试城市看看', 'destination_id': 'city'}]}
        with patch('system_settings.agent_world.travel_config.bound_skill', return_value=True), \
             patch('system_settings.agent_world.life_daily_planner.prepare', return_value=quotes), \
             patch('system_settings.agent_world.life_planner.ask', side_effect=select):
            plan_items(self.config, self.agent, [item])
        item.refresh_from_db()
        self.assertEqual(item.budget, 1500)
        self.assertEqual(item.context['travel_plan']['destination']['id'], 'city')
        response = self.client.get(f'/api/settings/agent-world/life/schedule/{item.pk}/')
        self.assertEqual(response.status_code, 200)
        public = response.json()['data']['context']
        self.assertEqual(public['travelPlan']['budgetSource'], 'price_tier')
        self.assertEqual(public['dailyChoice']['plan']['travelPlan']['destination']['countryCode'], 'CN')
        checkpoint_all(); reconcile_life()
        serialized = serializers.serialize('json', [item])
        restored = next(serializers.deserialize('json', serialized)).object
        self.assertEqual(restored.context, item.context)
        from utils.sync_manager import SyncManager
        manager = SyncManager()
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        manager.apply_snapshot_data(copy.deepcopy(data), copy.deepcopy(meta))
        self.assertEqual(LifeItem.objects.get(pk=item.pk).context, item.context)
        TravelDestination.objects.filter(pk='city').update(price=1300)
        with self.assertRaisesMessage(ValueError, '请重新规划日程'):
            recheck(restored.context['travel_plan'], Decimal(10000))

    def test_money_changed_during_model_wait_cannot_install_unaffordable_trip(self):
        self.travel(); quotes = self.quotes()
        item = self.item('changed-cash')
        def select(agent, instruction, context, **kwargs):
            agent.money = 1000; agent.save(update_fields=['money'])
            return {'plans': [{'id': item.pk, 'activity': 'travel', 'destination_id': 'city', 'reason': '想出游'}]}
        with patch('system_settings.agent_world.travel_config.bound_skill', return_value=True), \
             patch('system_settings.agent_world.life_daily_planner.prepare', return_value=quotes), \
             patch('system_settings.agent_world.life_planner.ask', side_effect=select):
            with self.assertRaisesMessage(ValueError, '请重新规划日程'):
                plan_items(self.config, self.agent, [item])
        item.refresh_from_db()
        self.assertEqual(item.budget, 0)
        self.assertEqual(item.spent, 0)
        self.assertNotIn('travel_plan', item.context)

    def test_interaction_without_posts_is_filtered_before_text_request(self):
        self.task.enabled = False; self.task.save()
        AgentTask.objects.create(name='互动', task_kind='post_interaction', agent=self.agent,
                                 world_state={'owner_id': 'admin'}, enabled=True)
        item = self.item('no-posts')
        with patch('system_settings.agent_world.life_planner.ask', side_effect=AssertionError('没有帖子不应请求规划')):
            plan_items(self.config, self.agent, [item])
        item.refresh_from_db()
        self.assertEqual(item.activity, 'rest')

    def test_inventory_removed_during_selection_prevents_cooking_commit(self):
        stock = self.supply(quantity=2)
        item = self.item('cooking')
        def select(agent, instruction, context, **kwargs):
            stock.delete()
            return self.response('cooking')(agent, instruction, context)
        with patch('system_settings.agent_world.life_planner.ask', side_effect=select):
            plan_items(self.config, self.agent, [item])
        item.refresh_from_db()
        self.assertEqual(item.activity, 'rest')
        self.assertNotIn('cooking_plan', item.context)

    def test_busy_does_not_exhaust_attempts_and_respects_next_day_gaps(self):
        from .life_occupancy import defer_busy
        item = self.item('busy')
        item.attempts = 3; item.activity = 'cooking'; item.save()
        following = self.item('following', 24 + 2)
        self.config.settings.update(active_start='10:00', active_end='11:00')
        self.config.save()
        with patch('django.utils.timezone.now', return_value=NOW.replace(hour=23)):
            defer_busy(item, self.config)
        item.refresh_from_db()
        self.assertEqual(item.status, 'deferred')
        self.assertEqual(item.attempts, 3)
        self.assertEqual(local_time(item.scheduled_at).date(), local_time(following.scheduled_at).date())
        self.assertEqual(local_time(item.scheduled_at).minute, 15)

    def test_pinned_travel_does_not_ask_decision_model_again(self):
        from .travel_steps import decide
        journey = SimpleNamespace(phase='choose', snapshot={'scheduled_destination_id': 'city'})
        node = SimpleNamespace(result={}, save=Mock())
        with patch('system_settings.agent_world.travel_decision.selection_for', side_effect=AssertionError('不能重选')), \
             patch('system_settings.agent_world.travel_steps.ask', return_value={'destination_id': 'city', 'reason': '按计划出行'}):
            result = decide(journey, node, '选择目的地', {}, lambda value: value)
        self.assertEqual(result['destination_id'], 'city')

    def test_replanned_trip_execution_key_keeps_budget_and_debit_idempotence(self):
        from .travel_models import TravelJourney
        from .travel_shopping import available_funds
        from .travel_settlement import depart
        from .life_scope import life_scope
        from .life_schedule import requeue
        task = self.travel(); quotes = self.quotes()
        item = self.item('original')
        plan = selected_plan(quotes, 'city')
        item.activity = 'travel'; item.task_id = task.pk; item.status = 'running'; item.budget = 1500
        item.context = {'execution_key': 'retry-trip', 'travel_plan': plan, 'manual': True}; item.save()
        journey = TravelJourney.objects.create(pk='retry-trip', agent=self.agent, actor_id=self.agent.pk,
            owner_id='admin', task=task, snapshot={'config': {'energy_cost': 20},
            'selected': plan['destination'], 'scheduled_travel_plan': plan})
        self.assertEqual(Decimal(available_funds(journey)['available']), 1500)
        with life_scope(item, {}):
            depart(journey); depart(journey)
        item.refresh_from_db(); self.agent.refresh_from_db()
        self.assertEqual(item.spent, 1200)
        self.assertEqual(self.agent.money, 8800)
        self.assertEqual(Decimal(available_funds(journey)['available']), 300)
        item.status = 'failed'; item.save()
        with self.assertRaisesMessage(ValueError, '旅行面板'):
            requeue(item, '不能重新执行已有旅行')

    def test_queue_forecast_shares_real_inventory_and_does_not_assume_procurement(self):
        from .life_daily_facts import queue_forecast
        from .farm_catalog import DEFAULT_RULES
        state = {'plots': [{'crop': None} for _ in range(4)], 'animals': [], 'planting_plans': {
            'p': {'status': 'pending', 'starts_at': NOW.timestamp(), 'cutoff': (NOW + timedelta(hours=5)).timestamp(),
                  'entries': [{'id': key, 'sku': 'seed.radish', 'quantity': 5, 'fertilizer_mode': 'none'} for key in ('a', 'b')],
                  'progress': {'a': 0, 'b': 0}}}}
        original = copy.deepcopy(state)
        result = queue_forecast(state, DEFAULT_RULES, 'seed', NOW.timestamp(), {'seed.radish': 2})
        self.assertEqual(sum(row['plots'] for row in result), 2)
        self.assertEqual(state, original)

    def test_only_farm_can_be_assigned_later_with_other_slots_automatic_rest(self):
        self.task.enabled = False; self.task.save()
        AgentTask.objects.create(name='农场', task_kind='farm', agent=self.agent,
                                 farm_config={'owner_id': 'admin'}, enabled=True)
        one, two = self.item('early'), self.item('later', 6)
        response = {'plans': [{'id': one.pk, 'activity': 'rest', 'reason': '农场安排在稍后'},
                              {'id': two.pk, 'activity': 'farm', 'reason': '下午开工'}]}
        with patch('system_settings.agent_world.life_planner.ask', return_value=response), \
             patch('system_settings.agent_world.farm_queue_decision.decide_plan', return_value={'entries': [], 'procurement_limit': '0'}):
            plan_items(self.config, self.agent, [one, two])
        one.refresh_from_db(); two.refresh_from_db()
        self.assertEqual(one.activity, 'rest')
        self.assertEqual(two.activity, 'farm')
        self.assertIn('farm_plan_id', two.context)

    def test_expanded_day_failure_obeys_backoff_and_retry_limit_after_fifty_commits(self):
        from .life_runner import _plan_cycle
        self.investment()
        items = [self.item(f'large-day-{index:02}', 2 + index / 4) for index in range(51)]
        failed = items[-1]

        def prepare(config, agent, item, choice, budget_state):
            if item.pk == failed.pk:
                raise ValueError('第51项领域准备失败')
            return {**choice, 'budget': '0', 'needs_market': False, '_daily_plan': True}

        with patch('system_settings.agent_world.life_runner.ensure_cycle'), \
             patch('system_settings.agent_world.life_runner.ensure_daily_market'), \
             patch('system_settings.agent_world.life_planner.ask', side_effect=self.response()) as ask, \
             patch('system_settings.agent_world.life_daily_planner.prepare_detail', side_effect=prepare) as detail:
            _plan_cycle(self.config, None, NOW)
            failed.refresh_from_db()
            self.assertEqual(failed.attempts, 1)
            self.assertEqual(failed.status, 'deferred')
            self.assertEqual(local_time(datetime.fromisoformat(failed.context['planning_retry_at'])), NOW + timedelta(minutes=5))
            committed = list(LifeItem.objects.filter(pk__in=[item.pk for item in items[:-1]])
                             .order_by('pk').values('id', 'context', 'attempts', 'updated_at'))
            self.assertEqual(detail.call_count, 51)

            # Other dates can advance without pulling this date past its backoff.
            tomorrow = self.item('other-day', 26)
            with patch('django.utils.timezone.now', return_value=NOW + timedelta(minutes=1)):
                _plan_cycle(self.config, None, NOW + timedelta(minutes=1))
            tomorrow.refresh_from_db()
            self.assertEqual(tomorrow.activity, 'investment')
            failed.refresh_from_db()
            self.assertEqual(failed.attempts, 1)
            self.assertEqual(detail.call_count, 52)

            for attempt in (2, 3):
                at = NOW + timedelta(minutes=5 * (attempt - 1))
                with patch('django.utils.timezone.now', return_value=at):
                    _plan_cycle(self.config, None, at)
                failed.refresh_from_db()
                self.assertEqual(failed.attempts, attempt)
                self.assertEqual(failed.status, 'failed' if attempt == 3 else 'deferred')
            with patch('django.utils.timezone.now', return_value=NOW + timedelta(minutes=15)):
                _plan_cycle(self.config, None, NOW + timedelta(minutes=15))
            self.assertEqual(detail.call_count, 54)
            self.assertEqual(ask.call_count, 2)  # Failed detail resumes its saved daily intent.
            self.assertEqual(committed, list(LifeItem.objects.filter(pk__in=[item.pk for item in items[:-1]])
                                            .order_by('pk').values('id', 'context', 'attempts', 'updated_at')))

    def test_new_slot_cannot_pull_a_backoff_day_into_another_dates_batch(self):
        from .life_runner import _plan_cycle
        waiting = self.item('waiting')
        waiting.context = {'planning_retry_at': (NOW + timedelta(minutes=5)).isoformat()}
        waiting.save()
        self.item('new-same-day', 3)
        tomorrow = self.item('ready-tomorrow', 26)
        with patch('system_settings.agent_world.life_runner.ensure_cycle'), \
             patch('system_settings.agent_world.life_runner.ensure_daily_market'), \
             patch('system_settings.agent_world.life_runner.plan_items') as plan:
            _plan_cycle(self.config, None, NOW)
        plan.assert_called_once()
        self.assertEqual([item.pk for item in plan.call_args.args[2]], [tomorrow.pk])
        waiting.refresh_from_db()
        self.assertEqual(waiting.attempts, 0)

    def test_failure_handler_does_not_revive_an_item_cancelled_during_planning(self):
        from .life_runner import _plan_cycle
        cancelled, failed = self.item('cancelled'), self.item('failed', 3)
        def fail(*args, **kwargs):
            LifeItem.objects.filter(pk=cancelled.pk).update(status='cancelled')
            raise ValueError('规划失败')
        with patch('system_settings.agent_world.life_runner.ensure_cycle'), \
             patch('system_settings.agent_world.life_runner.ensure_daily_market'), \
             patch('system_settings.agent_world.life_runner.plan_items', side_effect=fail):
            _plan_cycle(self.config, None, NOW)
        cancelled.refresh_from_db(); failed.refresh_from_db()
        self.assertEqual(cancelled.status, 'cancelled')
        self.assertEqual(cancelled.attempts, 0)
        self.assertEqual(failed.status, 'deferred')
        self.assertEqual(failed.attempts, 1)
