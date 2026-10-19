"""Alchemy planning, reservations, exact execution, retry and WebDAV regression tests."""
import copy
from contextlib import nullcontext
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from system_settings.models import AgentExecutionLease, WorldActionRuntime, WorldAction
from . import test_alchemy as fixtures
from .alchemy_catalog import DEFAULT_RULES, catalog_for
from .alchemy_models import AlchemyOperation
from .alchemy_runner import prepare_decision, run_alchemy_opportunity
from .alchemy_schedule_plan import (available_pool, decide_plan, planning_facts, recipe_options,
                                    requirements, validate_plan)
from .inventory_stock import add_stock, stock_quantity
from .life_config import DEFAULTS, ensure_profiles
from .life_models import LifeConfig, LifeItem
from .life_planner import plan_items
from .life_schedule import execution_key, revise, retry_failed, requeue
from .life_scope import life_scope


class AlchemyScheduleTests(TestCase):
    def setUp(self):
        fixtures.AlchemyScheduleEnergyTests.setUp(self)
        self.config = LifeConfig.objects.create(pk='admin', migrated=True,
            settings={**DEFAULTS, 'agent_ids': [self.agent.pk]})
        ensure_profiles('admin', [self.agent.pk])
        WorldActionRuntime.objects.create(pk='world', enabled=True, token='w',
                                          until=timezone.now() + timedelta(hours=1))
        self.enterContext(patch('system_settings.decision.routing.complete', side_effect=AssertionError('不得请求真实模型')))

    def item(self, key='one', **values):
        at = timezone.now() + timedelta(hours=1)
        return LifeItem.objects.create(pk=key, owner_id='admin', actor_id=self.agent.pk,
            original_at=at, scheduled_at=at, **values)

    def specification(self, quantity=1):
        entries = [{'recipe_id': 'healing', 'quantity': quantity, 'rule': copy.deepcopy(DEFAULT_RULES['healing'])}]
        return {'version': 1, 'entries': entries, 'materials': requirements(entries)}

    def stock(self, quantity=1):
        for ingredient in DEFAULT_RULES['healing']['ingredients']:
            add_stock(self.agent.pk, 'admin', self.agent.name, ingredient['sku'], ingredient['quantity'] * quantity,
                      '素材', 'combat_material', '1', 'fixture')

    def test_daily_preparation_reserves_single_bottle_and_releases_on_cancel(self):
        one, two = self.item('one'), self.item('two')
        def schedule(agent, instruction, context, **kwargs):
            self.assertTrue(all(slot['allowed_activities'] == ['alchemy'] for slot in context['slots']))
            return {'plans': [{'id': slot['id'], 'activity': 'alchemy', 'reason': '制作冒险补给'} for slot in context['slots']]}
        with patch('system_settings.agent_world.life_planner.ask', side_effect=schedule), \
                patch('system_settings.agent_world.life_choices.choose_scene', side_effect=AssertionError('唯一候选不请求模型')):
            plan_items(self.config, self.agent, [one, two])
        one.refresh_from_db(); two.refresh_from_db()
        self.assertEqual((one.activity, two.activity), ('alchemy', 'rest'))
        self.assertEqual(one.context['alchemy_plan']['entries'][0]['quantity'], 1)
        self.assertFalse(recipe_options(DEFAULT_RULES, 1, available_pool('admin', self.agent.pk), 100))
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'combat.material.moss_cave.1'), 2)
        revise(one, '取消', status='cancelled')
        self.assertTrue(recipe_options(DEFAULT_RULES, 1, available_pool('admin', self.agent.pk), 100))

    def test_rounds_recompute_shared_material_and_energy_without_cartesian_choices(self):
        rules = copy.deepcopy(DEFAULT_RULES)
        for rule in rules.values():
            rule['required_level'] = 1
            rule['ingredients'] = [{'sku': 'combat.material.moss_cave.1', 'quantity': 1}]
        facts = {'rules': rules, 'level': 1, 'energy': 3, 'pool': [
            {'inventory_id': 'a', 'sku': 'combat.material.moss_cave.1', 'quantity': 3, 'price': '1', 'created_at': ''}]}
        calls = []
        def choose(scene, state, choices):
            calls.append(scene)
            if scene == 'alchemy_recipe':
                if state['selected']:
                    self.assertNotIn('healing', choices)
                return 'focus' if state['selected'] else 'healing'
            if scene == 'alchemy_quantity':
                self.assertEqual(set(choices), {'1', '2', '3'} if not state['selected'] else {'1'})
                return '1' if state['selected'] else '2'
            return 'continue'
        plan = decide_plan(self.agent, 'admin', facts, decide=choose)
        self.assertEqual([entry['quantity'] for entry in plan['entries']], [2, 1])
        self.assertEqual(calls, ['alchemy_recipe', 'alchemy_quantity', 'alchemy_continue', 'alchemy_recipe', 'alchemy_quantity'])
        self.assertEqual(facts['pool'][0]['quantity'], 3)

    def test_invalid_quantity_and_tampered_plan_are_rejected(self):
        facts = planning_facts('admin', self.agent)
        with self.assertRaises(ValueError):
            decide_plan(self.agent, 'admin', facts, decide=lambda scene, state, choices: 'healing' if scene == 'alchemy_recipe' else '6')
        plan = self.specification()
        plan['materials'][0]['quantity'] += 1
        with self.assertRaises(ValueError):
            validate_plan(plan)

    def test_manual_planning_respects_other_scheduled_reservations(self):
        self.item(activity='alchemy', context={'alchemy_plan': self.specification()})
        choices, _, _ = prepare_decision(self.task, self.agent)
        self.assertEqual(choices, [])

    def test_reservation_query_count_is_constant_and_uses_retry_execution_keys(self):
        self.stock(20)
        items = [self.item(f'reserved-{index}', activity='alchemy', task_id=self.task.pk,
                          context={'alchemy_plan': self.specification(), 'execution_key': f'retry-{index}'})
                 for index in range(20)]
        for executed in (False, True):
            if executed:
                self.assertEqual(self.run_saved(items[0]).status, 'success')
            # 库存、日程和制作计数各查询一次，日程数量不会增加查询次数。
            with self.assertNumQueries(3):
                pool = available_pool('admin', self.agent.pk)
            self.assertEqual(sum(row['quantity'] for row in pool
                                 if row['sku'] == 'combat.material.moss_cave.1'), 2)

    def test_invalid_reservation_identifies_item_and_is_not_silently_released(self):
        invalid = self.specification()
        invalid['materials'][0]['quantity'] += 1
        item = self.item('broken-plan', activity='alchemy', context={'alchemy_plan': invalid})
        with self.assertRaisesRegex(ValueError, 'broken-plan.*取消或重新规划'):
            available_pool('admin', self.agent.pk)
        item.refresh_from_db()
        self.assertEqual(item.context['alchemy_plan'], invalid)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'combat.material.moss_cave.1'), 2)
        self.assertTrue(recipe_options(DEFAULT_RULES, 1, available_pool(
            'admin', self.agent.pk, exclude_ids=[item.pk]), 100))
        item.actor_id = 'another-resident'
        item.save(update_fields=['actor_id'])
        self.assertTrue(recipe_options(DEFAULT_RULES, 1, available_pool('admin', self.agent.pk), 100))

    def run_saved(self, item, *, fail_second=False):
        AgentExecutionLease.objects.update_or_create(agent=self.agent, defaults={
            'token': 'a', 'until': timezone.now() + timedelta(hours=1)})
        from .alchemy_service import commit_bottle
        def commit(*args, **kwargs):
            if fail_second and args[2] == 1:
                raise ValueError('fixture interruption')
            return commit_bottle(*args, **kwargs)
        with life_scope(item, {}), \
                patch('system_settings.agent_world.alchemy_runner.select_agent', return_value=self.agent), \
                patch('system_settings.agent_world.alchemy_runner.execution_lease', return_value=nullcontext('a')), \
                patch('system_settings.agent_world.alchemy_schedule_plan.decide_plan', side_effect=AssertionError('已确认计划不能重选')), \
                patch('system_settings.agent_world.alchemy_runner.commit_bottle', side_effect=commit):
            return run_alchemy_opportunity(self.task, key=execution_key(item), locked='w')

    def test_saved_rule_is_executed_without_reselecting_or_repricing(self):
        item = self.item(activity='alchemy', task_id=self.task.pk, context={'alchemy_plan': self.specification()})
        catalog = catalog_for('admin')
        catalog.rules['healing']['sale_price'] = '99.00'; catalog.save()
        record = self.run_saved(item)
        self.assertEqual(record.status, 'success')
        op = AlchemyOperation.objects.get()
        self.assertEqual(op.snapshot['sale_price'], '12.00')
        self.run_saved(item)
        self.assertEqual(AlchemyOperation.objects.count(), 1)

    def test_partial_failure_retry_only_makes_remaining_bottle(self):
        self.stock()
        item = self.item(activity='alchemy', task_id=self.task.pk, context={'alchemy_plan': self.specification(2)})
        record = self.run_saved(item, fail_second=True)
        self.assertEqual(record.status, 'failed')
        self.assertEqual(AlchemyOperation.objects.count(), 1)
        revise(item, '执行中断', status='failed', record_id=record.pk)
        retry_failed(item, '重试剩余')
        self.assertEqual(item.context['alchemy_plan']['entries'][0]['quantity'], 1)
        self.assertNotEqual(execution_key(item), item.pk)
        self.assertEqual(self.run_saved(item).status, 'success')
        self.assertEqual(AlchemyOperation.objects.count(), 2)

    def test_missing_materials_fail_without_substitution(self):
        item = self.item(activity='alchemy', task_id=self.task.pk, context={'alchemy_plan': self.specification(2)})
        self.assertEqual(self.run_saved(item).status, 'failed')
        self.assertFalse(AlchemyOperation.objects.exists())

    def test_replanning_clears_old_reservation(self):
        item = self.item(activity='alchemy', context={'alchemy_plan': self.specification()})
        requeue(item, '重新规划')
        self.assertNotIn('alchemy_plan', item.context)
        self.assertTrue(recipe_options(DEFAULT_RULES, 1, available_pool('admin', self.agent.pk), 100))

    def test_snapshot_roundtrip_preserves_plan_without_making_stock(self):
        from utils.sync_manager import SyncManager, SyncError
        item = self.item(activity='alchemy', context={'alchemy_plan': self.specification()})
        manager = SyncManager()
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        self.assertEqual((meta['alchemy_schema_version'], meta['alchemy_schedule_plans']), (2, [item.pk]))
        for _ in range(2):
            manager.apply_snapshot_data(copy.deepcopy(data), copy.deepcopy(meta))
        item.refresh_from_db()
        self.assertEqual(item.context['alchemy_plan'], self.specification())
        self.assertFalse(AlchemyOperation.objects.exists())
        self.assertFalse(recipe_options(DEFAULT_RULES, 1, available_pool('admin', self.agent.pk), 100))
        for mutation in ({'alchemy_schedule_plans': []}, {'alchemy_schema_version': 1}):
            with self.assertRaises(SyncError):
                manager.apply_snapshot_data(copy.deepcopy(data), {**meta, **mutation})
        item.refresh_from_db()
        self.assertEqual(item.context['alchemy_plan'], self.specification())
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'combat.material.moss_cave.1'), 2)

    def test_synced_plan_rejects_foreign_owner_and_tampered_materials(self):
        from .alchemy_schedule_sync import validate_source
        from utils.sync_manager import SyncError
        data = [{'model': 'system_settings.lifeprofile', 'pk': self.agent.pk, 'fields': {'owner_id': 'admin'}},
                {'model': 'system_settings.lifeitem', 'pk': 'one', 'fields': {
                    'owner_id': 'admin', 'actor_id': self.agent.pk, 'activity': 'alchemy',
                    'context': {'alchemy_plan': self.specification()}}}]
        validate_source(data, 2, ['one'])
        for manifest in ([1, 'one'], [None], [{}], ['one', 'one'], [], 'one', None):
            with self.subTest(manifest=manifest), self.assertRaisesRegex(SyncError, '清单缺失或不一致'):
                validate_source(data, 2, manifest)
        for change in ('owner', 'materials'):
            invalid = copy.deepcopy(data)
            if change == 'owner':
                invalid[1]['fields']['owner_id'] = 'other'
            else:
                invalid[1]['fields']['context']['alchemy_plan']['materials'][0]['quantity'] += 1
            with self.assertRaises(SyncError):
                validate_source(invalid, 2, ['one'])

    def test_both_snapshot_entrypoints_reject_newer_version(self):
        from utils.sync_manager import SyncManager, SyncError
        manager = SyncManager()
        for validate in (manager.validate_remote_snapshot_version, manager.validate_import_snapshot_version):
            with self.assertRaises(SyncError):
                validate({'alchemy_schema_version': 3})

    def test_schedule_api_exposes_camel_case_alchemy_plan(self):
        from django.contrib.auth.models import User
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(User.objects.create_superuser('admin', 'alchemy@example.invalid', 'test'))
        item = self.item(activity='alchemy', context={'alchemy_plan': self.specification()})
        response = client.get(f'/api/settings/agent-world/life/schedule/{item.pk}/')
        self.assertEqual(response.status_code, 200)
        plan = response.json()['data']['context']['alchemyPlan']
        self.assertEqual((plan['entries'][0]['recipeId'], plan['entries'][0]['quantity']), ('healing', 1))
