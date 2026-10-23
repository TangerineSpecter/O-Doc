"""Daily activity intentions, sequential resource reservations and bounded cooking."""
import copy
from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from . import test_cooking as fixtures
from .life_budget_choices import BudgetChoices
from .cooking_schedule_plan import (recipe_options, decide_plan, planning_facts, available_pool,
                                    requirements, validate_plan)
from .cooking_materials import material_pool
from .cooking_catalog import DEFAULT_RULES
from .life_models import LifeConfig, LifeItem
from .life_config import DEFAULTS, ensure_profiles
from .life_planner import plan_items
from .life_schedule import execution_key, revise, retry_failed
from .inventory_stock import stock_quantity
from system_settings.models import AgentTask


class BudgetChoiceTests(SimpleTestCase):
    def test_percentages_share_fixed_base_and_respect_existing_reservations(self):
        state = BudgetChoices(Decimal('10000'))
        state.accept(state.options('investment')['goal'])
        state.accept(state.options('investment')['balanced'])
        self.assertEqual(state.selected_percent, 40)
        self.assertEqual(state.base - state.selected_amount, 6000)
        state = BudgetChoices(Decimal('10000'), Decimal('8500'))
        self.assertEqual(set(state.options('investment')), {'conservative', 'balanced'})
        state = BudgetChoices(Decimal('10000'), Decimal('9000'))
        self.assertEqual(set(state.options('investment')), {'conservative'})
        state.accept(state.options('investment')['conservative'])
        self.assertEqual(state.options('investment'), {})

    def test_travel_minimum_zero_balance_and_fractional_cents(self):
        self.assertEqual(BudgetChoices(Decimal(0)).options('travel'), {})
        self.assertEqual(BudgetChoices(Decimal(1500)).options('travel', minimum=Decimal(525)), {})
        state = BudgetChoices(Decimal('2100.01'))
        self.assertEqual(state.options('travel', minimum=Decimal(525))['goal']['amount'], '525.00')
        state = BudgetChoices(Decimal('0.11'))
        for _ in range(4):
            state.accept(state.options('investment')['goal'])
        self.assertEqual(state.options('investment'), {})

    @patch('system_settings.agent_world.life_choices.complete_json')
    @patch('system_settings.agent_world.life_choices.choose_scene')
    def test_single_option_never_calls_a_provider(self, structured, ordinary):
        from .life_choices import choose
        self.assertEqual(choose(None, 'admin', 'life_budget', {}, {'one': '10%'}), 'one')
        structured.assert_not_called()
        ordinary.assert_not_called()


class SequentialPlanningTests(TestCase):
    supply = fixtures.CookingTests.supply
    # Only the isolated fixture is reused; legacy tests stay in their own module.
    def setUp(self):
        fixtures.CookingTests.setUp(self)
        from system_settings.models import AgentExecutionLease
        AgentExecutionLease.objects.filter(agent=self.agent).delete()
        self.agent.money = Decimal('10000')
        self.agent.save()
        self.config = LifeConfig.objects.create(pk='admin', settings={**DEFAULTS, 'agent_ids': [self.agent.pk]}, migrated=True)
        ensure_profiles('admin', [self.agent.pk])
        def text_schedule(agent, instruction, context, **kwargs):
            return {'plans': [{'id': slot['id'], 'activity': 'investment' if 'investment' in slot['allowed_activities']
                               else slot['allowed_activities'][0] if slot['allowed_activities'] else 'rest',
                               'reason': '根据当前资源安排活动'} for slot in context['slots']]}
        self.enterContext(patch('system_settings.agent_world.life_planner.ask', side_effect=text_schedule))

    def item(self, key, activity='unplanned', context=None):
        point = timezone.now() + timedelta(hours=1)
        return LifeItem.objects.create(pk=key, owner_id='admin', actor_id=self.agent.pk,
                                       original_at=point, scheduled_at=point,
                                       activity=activity, context=context or {})

    def confirmed_cooking_item(self, key):
        item = self.item(key, 'cooking')
        plan = decide_plan(self.agent, 'admin', planning_facts('admin', self.agent),
                           key=item.pk, task=self.task,
                           decide=lambda scene, state, choices: next(iter(choices)))
        item.task_id = self.task.pk
        item.context = {'cooking_plan': plan}
        item.save()
        return item

    def test_saved_cooking_plan_reserves_materials_until_cancelled(self):
        self.supply(quantity=2)
        one, two = self.confirmed_cooking_item('first'), self.item('second')
        with patch('system_settings.agent_world.life_choices.choose_scene', side_effect=AssertionError('唯一候选不应请求模型')):
            plan_items(self.config, self.agent, [two])
        one.refresh_from_db(); two.refresh_from_db()
        self.assertEqual(one.activity, 'cooking')
        self.assertEqual(one.context['cooking_plan']['entries'][0]['quantity'], 1)
        self.assertEqual(two.activity, 'rest')
        self.assertNotIn('cooking_plan', two.context)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'crop.potato'), 2)
        self.assertFalse(recipe_options(DEFAULT_RULES, 1, available_pool('admin', self.agent.pk), 100))
        revise(one, '取消计划', status='cancelled')
        self.assertTrue(recipe_options(DEFAULT_RULES, 1, available_pool('admin', self.agent.pk), 100))

    def test_activity_budget_interleave_and_committed_percentages(self):
        self.task.enabled = False; self.task.save()
        AgentTask.objects.create(task_kind='investment', name='投资', enabled=True, agent=self.agent,
                                 investment_config={'owner_id': 'admin'})
        AgentTask.objects.create(task_kind='post_interaction', name='阅读', enabled=True, agent=self.agent,
                                 world_state={'owner_id': 'admin'})
        one, two = self.item('one'), self.item('two')
        monday = timezone.now() + timedelta(days=(7 - timezone.now().weekday()) % 7)
        one.scheduled_at = monday; one.save()
        two.scheduled_at = monday + timedelta(hours=1); two.save()
        calls = []
        def select(owner, agent, scene, state, choices, **kwargs):
            calls.append(scene)
            if scene == 'life_activity': return 'investment'
            return 'goal' if calls.count('life_budget') == 1 else 'balanced'
        with patch('system_settings.agent_world.life_choices.choose_scene', side_effect=select):
            plan_items(self.config, self.agent, [two, one])
        self.assertEqual(calls, ['life_budget', 'life_budget'])
        one.refresh_from_db(); two.refresh_from_db()
        self.assertEqual(one.budget, Decimal('2500'))
        self.assertEqual(two.budget, Decimal('1500'))

    def test_fallback_rejects_filtered_candidates(self):
        from .life_choices import choose
        def ordinary(agent, prompt, validate, **kwargs):
            return validate({'choice': 'unavailable'})
        with patch('system_settings.agent_world.life_choices.choose_scene', return_value=None), \
                patch('system_settings.agent_world.life_choices.complete_json', side_effect=ordinary):
            with self.assertRaises(ValueError):
                choose(self.agent, 'admin', 'life_budget', {}, {'one': '10%', 'two': '15%'})

    def test_replanning_releases_all_replaced_budgets_before_first_choice(self):
        self.task.enabled = False; self.task.save()
        AgentTask.objects.create(task_kind='investment', name='投资', enabled=True, agent=self.agent,
                                 investment_config={'owner_id': 'admin'})
        one = self.item('old-one', 'investment', {'planned_on': '2026-01-01'})
        two = self.item('old-two', 'investment', {'planned_on': '2026-01-01'})
        monday = timezone.now() + timedelta(days=(7 - timezone.now().weekday()) % 7)
        one.budget = 2000; one.scheduled_at = monday; one.save()
        two.budget = 8000; two.scheduled_at = monday + timedelta(hours=1); two.save()
        with patch('system_settings.agent_world.life_choices.choose_scene', return_value='goal'):
            plan_items(self.config, self.agent, [one, two])
        one.refresh_from_db(); two.refresh_from_db()
        self.assertEqual(one.budget, 2500)
        self.assertEqual(two.budget, 2500)

    def test_failed_later_slot_does_not_undo_or_redraw_first(self):
        self.supply(quantity=2)
        one, two = self.item('first'), self.item('second')
        from .life_planner import apply_plan
        def fail_second(owner, agent, items, proposal, **kwargs):
            if items[0].pk == two.pk:
                raise ValueError('模拟提交失败')
            return apply_plan(owner, agent, items, proposal, **kwargs)
        with patch('system_settings.agent_world.life_planner.apply_plan', side_effect=fail_second):
            with self.assertRaisesMessage(ValueError, '模拟提交失败'):
                plan_items(self.config, self.agent, [one, two])
        one.refresh_from_db()
        before = copy.deepcopy(one.context)
        plan_items(self.config, self.agent, [one, two])
        one.refresh_from_db(); two.refresh_from_db()
        self.assertEqual(one.context, before)
        self.assertEqual(two.activity, 'rest')

    def test_existing_budget_preflight_makes_no_model_call(self):
        from .life_budget_recheck import needs_replanning
        item = self.item('investment', 'investment')
        item.budget = Decimal('1000'); item.save()
        with patch('system_settings.agent_world.life_sequential_planner.choose') as choose:
            self.assertFalse(needs_replanning('admin', self.agent, item))
            plan_items(self.config, self.agent, [item], preserve_activities=True)
        choose.assert_not_called()

    def test_saved_plan_executes_without_redrawing_recipe(self):
        self.supply(quantity=2)
        item = self.confirmed_cooking_item('cooking')
        item.context['manual'] = True; item.save()
        from .life_scope import life_scope
        from .cooking_runner import run_cooking_opportunity
        with life_scope(item, {}), patch('system_settings.agent_world.cooking_runner.decide', side_effect=AssertionError('不能重选')):
            record = run_cooking_opportunity(self.task, key=execution_key(item), locked='w')
            self.assertEqual(record.status, 'success')
            again = run_cooking_opportunity(self.task, key=execution_key(item), locked='w')
            self.assertEqual(record.pk, again.pk)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'crop.potato'), 0)
        self.assertEqual(sum(row['quantity'] for row in available_pool('admin', self.agent.pk)), 0)

    def assert_manual_respects_reserved_materials(self, *, stars):
        from .inventory_stock import add_stock
        from .cooking_models import CookingOperation
        from .cooking_runner import run_cooking_opportunity
        from .life_scope import life_scope
        from .travel_models import AgentInventoryItem
        reserved = self.supply(quantity=2)
        item = self.confirmed_cooking_item('reserved')
        add_stock(self.agent.pk, 'admin', self.agent.name, 'crop.potato', 2,
                  '土豆', 'farm_product', 40, stars=stars)
        with patch('system_settings.agent_world.life_choices.choose_scene', side_effect=AssertionError('唯一候选')):
            record = run_cooking_opportunity(self.task, key='manual-free', manual=True, locked='w')
        self.assertEqual(record.status, 'success')
        operation = CookingOperation.objects.get(opportunity_id='manual-free')
        self.assertEqual(Decimal(operation.result['ingredient_value']), 80)
        remaining = AgentInventoryItem.objects.get(pk=reserved.pk)
        self.assertEqual(remaining.quantity, 2)
        self.assertEqual(remaining.source['lots'], [{'quantity': 2, 'price': '18'}])
        item.context['manual'] = True; item.save()
        with life_scope(item, {}):
            record = run_cooking_opportunity(self.task, key=execution_key(item), locked='w')
        self.assertEqual(record.status, 'success')
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'crop.potato'), 0)

    def test_manual_execution_preserves_other_plans_star_allocation(self):
        self.assert_manual_respects_reserved_materials(stars=5)

    def test_manual_execution_preserves_reserved_fifo_price_batches(self):
        self.assert_manual_respects_reserved_materials(stars=1)

    def test_task_preference_is_in_every_cooking_choice(self):
        self.task.prompt = '优先精品制作，每道一份'
        for sku in ('crop.potato', 'crop.cucumber', 'crop.corn'):
            self.supply(sku, 4)
            from .inventory_stock import add_stock
            add_stock(self.agent.pk, 'admin', self.agent.name, sku, 4,
                      '材料', 'farm_product', 40, stars=5)
        scenes = []
        def select(scene, state, choices):
            scenes.append(scene)
            self.assertEqual(state['task_preference'], self.task.prompt)
            return next(iter(choices))
        decide_plan(self.agent, 'admin', planning_facts('admin', self.agent),
                    key='preferences', task=self.task, decide=select)
        self.assertEqual(set(scenes), {'cooking_recipe', 'cooking_quantity',
                                       'cooking_ingredient_strategy', 'cooking_continue'})

    def test_manual_decision_passes_task_preference_to_model(self):
        from .cooking_runner import decide
        self.task.prompt = '只制作一份'
        self.supply(quantity=4)
        seen = []
        def select(owner, agent, scene, state, choices, **kwargs):
            seen.append(scene)
            self.assertEqual(state['task_preference'], self.task.prompt)
            return '1'
        with patch('system_settings.agent_world.life_choices.choose_scene', side_effect=select):
            decision = decide(self.task, self.agent, [])
        self.assertEqual(seen, ['cooking_quantity'])
        self.assertEqual(decision['choices'][0]['quantity'], 1)

    def test_three_rounds_max_ten_each_and_history_reaches_next_decision(self):
        self.supply('crop.potato', 20); self.supply('crop.cucumber', 20); self.supply('crop.corn', 20)
        facts = planning_facts('admin', self.agent)
        facts['energy'] = 100
        calls = []
        def select(scene, state, choices):
            calls.append((scene, copy.deepcopy(state), list(choices)))
            if scene == 'cooking_quantity':
                self.assertNotIn('0', choices)
                return '10'
            if scene == 'cooking_continue':
                self.assertTrue(state['selected'])
                return 'continue'
            return next(iter(choices))
        plan = decide_plan(self.agent, 'admin', facts, key='three', decide=select)
        self.assertEqual(len(plan['entries']), 3)
        self.assertEqual(sum(entry['quantity'] for entry in plan['entries']), 30)
        self.assertEqual(sum(scene == 'cooking_continue' for scene, _, _ in calls), 2)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'crop.potato'), 20)
        from .cooking_plan import build_plan
        from .cooking_service import commit_portion
        from .cooking_models import CookingOperation
        from system_settings.models import WorldAction, AgentExecutionLease
        portions = build_plan('admin', self.agent.pk, plan['entries'],
                              [{**entry['rule'], 'id': entry['recipe_id']} for entry in plan['entries']], 100)
        AgentExecutionLease.objects.update_or_create(agent=self.agent, defaults={'token': 'a', 'until': timezone.now() + timedelta(days=1)})
        WorldAction.objects.create(pk='thirty', task=self.task, actor_id=self.agent.pk, agent=self.agent,
                                   snapshot={'cooking': True, 'owner_id': 'admin', 'plan': portions})
        for index, portion in enumerate(portions):
            commit_portion(self.agent.pk, 'thirty', index, portion['recipe_id'], portion['rule'],
                           '三十份验证', self.task, 'a', 'w')
        self.assertEqual(CookingOperation.objects.filter(opportunity_id='thirty').count(), 30)

    def test_sampling_and_repeated_recipe_exclusion(self):
        facts = planning_facts('admin', self.agent)
        facts['rules'] = {f'recipe{i}': DEFAULT_RULES['baked_potato'] for i in range(15)}
        self.supply(quantity=30); facts['pool'] = material_pool(self.agent.pk, 'admin')
        samples = []
        def select(scene, state, choices):
            if scene == 'cooking_continue': return 'continue'
            if scene == 'cooking_quantity': return '1'
            if scene == 'cooking_recipe':
                self.assertEqual(len(choices), 10)
                self.assertTrue(set(choices).isdisjoint({r['recipe_id'] for r in state['selected']}))
                samples.append(list(choices))
            return next(iter(choices))
        decide_plan(self.agent, 'admin', facts, key='stable', decide=select)
        first = samples[0]; samples.clear()
        decide_plan(self.agent, 'admin', facts, key='stable', decide=select)
        self.assertEqual(samples[0], first)

    def test_plan_validation_and_new_sync_manifest(self):
        self.supply(quantity=2)
        item = self.confirmed_cooking_item('saved')
        from django.core import serializers
        import json
        from .cooking_schedule_sync import validate_source
        from .life_models import LifeProfile
        data = json.loads(serializers.serialize('json', [item, LifeProfile.objects.get(pk=self.agent.pk)]))
        validate_source(data, 3, [item.pk])
        with self.assertRaises(Exception): validate_source(data, 3, [])
        bad = copy.deepcopy(item.context['cooking_plan']); bad['materials'][0]['quantity'] += 1
        with self.assertRaises(ValueError): validate_plan(bad)

    def test_synced_pending_plan_keeps_reservation_without_cooking(self):
        self.supply(quantity=2)
        item = self.confirmed_cooking_item('pending')
        from utils.sync_manager import SyncManager, SyncError
        from .cooking_models import CookingOperation
        manager = SyncManager()
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        self.assertEqual(meta['cooking_schedule_plans'], [item.pk])
        for _ in range(2):
            manager.apply_snapshot_data(copy.deepcopy(data), copy.deepcopy(meta))
        self.assertFalse(CookingOperation.objects.exists())
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'crop.potato'), 2)
        self.assertFalse(recipe_options(DEFAULT_RULES, 1, available_pool('admin', self.agent.pk), 100))
        with self.assertRaises(SyncError):
            manager.apply_snapshot_data(copy.deepcopy(data), {**meta, 'cooking_schedule_plans': []})
        with self.assertRaises(SyncError):
            manager.apply_snapshot_data(copy.deepcopy(data), {**meta, 'cooking_schema_version': 2})

    def test_schedule_detail_exposes_typed_camel_case_cooking_plan(self):
        self.supply(quantity=2)
        item = self.confirmed_cooking_item('detail')
        response = self.client.get(f'/api/settings/agent-world/life/schedule/{item.pk}/')
        self.assertEqual(response.status_code, 200)
        plan = response.json()['data']['context']['cookingPlan']
        self.assertEqual(plan['entries'][0]['recipeId'], 'baked_potato')
        self.assertEqual(plan['entries'][0]['quantity'], 1)

    def test_same_material_result_skips_strategy_choice(self):
        self.supply(quantity=1)
        from .inventory_stock import add_stock
        add_stock(self.agent.pk, 'admin', self.agent.name, 'crop.potato', 1, '土豆', 'farm_product', 40, stars=5)
        calls = []
        def select(scene, state, choices):
            calls.append(scene)
            return next(iter(choices))
        decide_plan(self.agent, 'admin', planning_facts('admin', self.agent), key='same', decide=select)
        self.assertNotIn('cooking_ingredient_strategy', calls)

    def test_user_edit_during_decision_is_not_overwritten(self):
        AgentTask.objects.create(task_kind='investment', name='投资', enabled=True, agent=self.agent,
                                 investment_config={'owner_id': 'admin'})
        item = self.item('edited')
        item.scheduled_at += timedelta(days=(7 - item.scheduled_at.weekday()) % 7)
        item.save()
        def edit_then_choose(agent, instruction, context, **kwargs):
            current = LifeItem.objects.get(pk=item.pk)
            current.intent = '用户刚刚修改'; current.save()
            return {'plans': [{'id': item.pk, 'activity': 'investment', 'reason': '安排投资'}]}
        with patch('system_settings.agent_world.life_planner.ask', side_effect=edit_then_choose):
            with self.assertRaisesMessage(ValueError, '日程在规划期间发生变化'):
                plan_items(self.config, self.agent, [item])
        item.refresh_from_db()
        self.assertEqual(item.intent, '用户刚刚修改')
        self.assertNotIn('daily_choice', item.context)

    def test_empty_candidates_rest_without_any_model_even_with_goals(self):
        from .life_models import LifeGoal
        LifeGoal.objects.create(owner_id='admin', actor_id=self.agent.pk, title='学习烹饪')
        item = self.item('rest')
        with patch('system_settings.agent_world.life_planner.ask', side_effect=AssertionError('空候选不调用模型')), \
                patch('system_settings.agent_world.life_choices.choose_scene', side_effect=AssertionError('空候选不调用模型')):
            plan_items(self.config, self.agent, [item])
        item.refresh_from_db()
        self.assertEqual(item.activity, 'rest')

    def test_partial_cooking_retry_keeps_only_unfinished_portions(self):
        self.supply(quantity=6)
        item = self.item('partial')
        facts = planning_facts('admin', self.agent)
        plan = decide_plan(self.agent, 'admin', facts, key=item.pk,
                           decide=lambda scene, state, choices: '3' if scene == 'cooking_quantity' else next(iter(choices)))
        item.activity = 'cooking'; item.task_id = self.task.pk
        item.context = {'cooking_plan': plan}; item.save()
        from .cooking_plan import build_plan
        from .cooking_service import commit_portion
        from system_settings.models import WorldAction, AgentExecutionLease
        AgentExecutionLease.objects.update_or_create(agent=self.agent, defaults={'token': 'a', 'until': timezone.now() + timedelta(days=1)})
        portions = build_plan('admin', self.agent.pk, plan['entries'],
                              [{**entry['rule'], 'id': entry['recipe_id']} for entry in plan['entries']], 100)
        WorldAction.objects.create(pk=item.pk, task=self.task, actor_id=self.agent.pk, agent=self.agent,
                                   snapshot={'cooking': True, 'owner_id': 'admin', 'plan': portions})
        commit_portion(self.agent.pk, item.pk, 0, portions[0]['recipe_id'], portions[0]['rule'], '测试', self.task, 'a', 'w')
        self.assertEqual(sum(row['quantity'] for row in available_pool('admin', self.agent.pk)), 0)
        item.status = 'failed'; item.save()
        retry_failed(item, '继续剩余制作')
        self.assertEqual(item.context['cooking_plan']['entries'][0]['quantity'], 2)
        self.assertEqual(sum(row['quantity'] for row in available_pool('admin', self.agent.pk)), 0)
