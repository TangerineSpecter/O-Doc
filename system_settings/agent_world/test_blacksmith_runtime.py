"""Focused state-machine regressions; rolls and asset transactions have separate tests."""
import copy
from contextlib import nullcontext
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from . import blacksmith_runner as runner


class BlacksmithRuntimeTests(SimpleTestCase):
    def setUp(self):
        self.agent = SimpleNamespace(pk='resident')
        self.action = SimpleNamespace(pk='opportunity', status='claimed',
            snapshot={'blacksmith': True, 'owner_id': 'owner', 'version': 1,
                      'cursor': 0, 'phase': 'band', 'decisions': [], 'current': {}},
            task=SimpleNamespace(prompt='先看成品再决定'), record=Mock(),
            refresh_from_db=Mock(), save=Mock(), result={})
        self.rule = {'id': '1-9:weapon', 'band_id': '1-9', 'slot': 'weapon',
            'level_min': 1, 'level_max': 9, 'energy_cost': 2,
            'ingredients': [{'sku': 'combat.material.test.1', 'quantity': 1}],
            'types': [{'template_id': 'equip.sword'}]}
        self.template = {'template_id': 'equip.sword', 'level_min': 1, 'level_max': 9}
        self.facts = {'rules': {}, 'catalog': SimpleNamespace(version='combat-test'),
            'profile': SimpleNamespace(progression={'job': 'job.warrior', 'level': 1}),
            'pool': [{'inventory_id': 'material', 'sku': 'combat.material.test.1',
                      'quantity': 10, 'price': '1', 'created_at': '2026-10-22T00:00:00+08:00'}],
            'energy': Decimal(100)}
        self.completed = []
        self.decisions = []
        self.enterContext(patch.object(runner, 'require_ready'))
        self.enterContext(patch('system_settings.agent_world.blacksmith_authorization.authorized', return_value=True))
        self.enterContext(patch.object(runner, 'equipment_summary', return_value={'loadout': {}, 'same_slot_stock': []}))
        self.enterContext(patch.object(runner, 'facts_for', return_value=self.facts))
        self.enterContext(patch.object(runner, 'operations', side_effect=lambda action: self.completed))
        self.enterContext(patch.object(runner, 'progress'))
        self.enterContext(patch.object(runner, 'save_stage', side_effect=self.save_stage))
        self.finish = self.enterContext(patch.object(runner, 'finish', side_effect=self.finish_action))
        self.options = self.enterContext(patch('system_settings.agent_world.blacksmith_candidates.recipe_options',
            return_value={self.rule['id']: self.rule}))
        self.enterContext(patch('system_settings.agent_world.blacksmith_candidates.template_options', return_value=[self.template]))
        self.commit = self.enterContext(patch('system_settings.agent_world.blacksmith_service.commit_piece', side_effect=self.commit_piece))
        self.choose = self.enterContext(patch('system_settings.agent_world.blacksmith_decisions.choose', side_effect=self.choose_next))

    def save_stage(self, action, agent, *, phase, current, decision=None):
        action.snapshot.update(phase=phase, current=copy.deepcopy(current))
        if decision:
            action.snapshot['decisions'].append(decision)

    def finish_action(self, action, scheduler=None, **kwargs):
        action.status = 'success'

    def choose_next(self, action, agent, phase, state, choices):
        self.decisions.append((phase, copy.deepcopy(state)))
        selected = 'continue' if phase == 'continue' else next(iter(choices))
        return {'phase': phase, 'choice': selected, 'reason': '系统选择说明：测试合法选择。'}

    def commit_piece(self, actor, opportunity, index, recipe, snapshot, reason, task, token, world):
        self.assertEqual(index, len(self.completed))
        self.assertEqual(snapshot, self.action.snapshot['current']['snapshot'])
        self.completed.append(SimpleNamespace(result={'equipment_id': f'gear-{index}', 'quality': 'white'}, recipe_id=recipe))
        self.action.snapshot.update(cursor=index + 1, phase='done' if index == 2 else 'continue', current={})

    def test_each_piece_is_observed_before_next_decision_and_three_is_hard_limit(self):
        runner.advance(self.action, self.agent, 'agent-token', 'world-token')
        self.assertEqual(self.commit.call_count, 3)
        self.assertEqual([phase for phase, _ in self.decisions],
                         ['band', 'slot', 'type', 'continue', 'band', 'slot', 'type', 'continue', 'band', 'slot', 'type'])
        continuation = [state for phase, state in self.decisions if phase == 'continue']
        self.assertEqual([len(state['completed']) for state in continuation], [1, 2])
        self.assertEqual(continuation[0]['completed'][0]['result']['equipment_id'], 'gear-0')

    def test_model_can_stop_after_first_actual_piece(self):
        original = self.choose_next
        def choose(action, agent, phase, state, choices):
            value = original(action, agent, phase, state, choices)
            if phase == 'continue':
                value['choice'] = 'finish'
            return value
        self.choose.side_effect = choose
        runner.advance(self.action, self.agent, 'agent-token', 'world-token')
        self.assertEqual(self.commit.call_count, 1)
        self.assertEqual(self.action.snapshot['current'], {})

    def test_resources_are_rechecked_after_first_commit(self):
        self.options.side_effect = lambda *args: {} if self.completed else {self.rule['id']: self.rule}
        runner.advance(self.action, self.agent, 'agent-token', 'world-token')
        self.assertEqual(self.commit.call_count, 1)
        self.assertFalse(any(phase == 'continue' for phase, _ in self.decisions))

    def test_recovery_commits_frozen_piece_without_asking_again(self):
        frozen = {'materials': [{'sku': 'combat.material.test.1', 'quantity': 1}]}
        self.action.snapshot.update(phase='commit', current={'recipe_id': self.rule['id'], 'snapshot': frozen})
        self.options.return_value = {}
        runner.advance(self.action, self.agent, 'agent-token', 'world-token')
        self.assertEqual(self.commit.call_count, 1)
        self.assertEqual(self.commit.call_args.args[4], frozen)
        self.choose.assert_not_called()

    def test_model_outage_keeps_current_piece_reservation_for_retry(self):
        from system_settings.decision.jev import DecisionUnavailable
        self.action.snapshot['current'] = {'reservation': {'ingredients': self.rule['ingredients']}}
        saved = copy.deepcopy(self.action.snapshot['current'])
        self.action.actor_id = 'resident'
        with patch.object(runner.Agent.objects, 'filter') as query, \
             patch.object(runner, 'item_for', return_value=None), \
             patch.object(runner, 'execution_lease', return_value=nullcontext('token')), \
             patch.object(runner, 'advance', side_effect=DecisionUnavailable('offline')):
            query.return_value.first.return_value = self.agent
            runner.resume(self.action, locked='world-token')
        self.assertEqual(self.action.snapshot['current'], saved)
        self.assertEqual(self.action.status, 'claimed')
        self.assertIn('retry_at', self.action.snapshot)
        self.finish.assert_not_called()

    def test_three_failures_on_same_question_end_opportunity(self):
        from system_settings.decision.jev import DecisionUnavailable
        self.action.actor_id = 'resident'
        with patch.object(runner.Agent.objects, 'filter') as query, \
             patch.object(runner, 'item_for', return_value=None), \
             patch.object(runner, 'execution_lease', side_effect=lambda *args, **kwargs: nullcontext('token')), \
             patch.object(runner, 'advance', side_effect=DecisionUnavailable('offline')):
            query.return_value.first.return_value = self.agent
            for _ in range(3):
                runner.resume(self.action, locked='world-token')
        self.finish.assert_called_once()
        self.assertTrue(self.finish.call_args.kwargs['failed'])
        self.assertEqual(self.action.snapshot['decision_failures']['0:band'], 3)


class BlacksmithDecisionTests(SimpleTestCase):
    def test_single_candidate_is_system_selected_without_model(self):
        from .blacksmith_decisions import choose
        action = SimpleNamespace(snapshot={'cursor': 0, 'owner_id': 'owner'})
        with patch('system_settings.decision.routing.choose_connections') as connection:
            value = choose(action, None, 'band', {}, {'1-9': 'Lv.1-9'})
        connection.assert_not_called()
        self.assertEqual(value['source'], 'system')
        self.assertEqual(value['scene'], 'blacksmith_level_band')

    def test_blacksmith_is_interleaved_and_has_goal_decision_routes(self):
        from .life_activities import MAIN_ACTIVITIES, INTERLEAVED_ACTIVITIES
        from .life_config import KINDS
        from system_settings.decision.routing import SCENES
        self.assertIn('blacksmith', KINDS)
        self.assertIn('blacksmith', INTERLEAVED_ACTIVITIES)
        self.assertNotIn('blacksmith', MAIN_ACTIVITIES)
        self.assertTrue(all(scene in SCENES for scene in
            ('blacksmith_level_band', 'blacksmith_slot', 'blacksmith_type', 'blacksmith_continue',
             'blacksmith_goal_count', 'blacksmith_goal_priority')))

    def test_daily_feed_groups_actual_equipment_by_forge_opportunity(self):
        from .daily_feed import _event
        from .daily_feed_groups import grouped_execution_events
        now = timezone.now()
        rows = []
        for index in range(2):
            row = _event('blacksmith', 'blacksmith', str(index), now, 'resident', '居民',
                         '打造装备', f'装备{index} · Lv.10 蓝装')
            row['_execution_group'] = 'blacksmith:opportunity'
            rows.append(row)
        events = grouped_execution_events(rows, now - timedelta(seconds=1), now + timedelta(seconds=1))
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['category'], 'blacksmith')
        self.assertIn('2 件装备', events[0]['detail'])
        self.assertEqual(len(events[0]['steps']), 2)


class BlacksmithEntryTests(TestCase):
    def setUp(self):
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from system_settings.models import Agent, AgentTask, AgentRunRecord, WorldActionRuntime
        from .life_config import DEFAULTS
        from .life_models import LifeConfig, LifeItem
        from .combat.profiles import ensure
        from .blacksmith_catalog import DEFAULT_RULES
        from .inventory_stock import add_stock
        temporary = TemporaryDirectory(prefix='odoc-blacksmith-runtime-')
        self.addCleanup(temporary.cleanup)
        self.enterContext(self.settings(MEDIA_ROOT=temporary.name,
            ODOC_WORLD_LOCK_PATH=str(Path(temporary.name) / 'world.lock')))
        self.agent = Agent.objects.create(name='逐件打造入口测试')
        ensure('owner', self.agent)
        self.config = LifeConfig.objects.create(pk='owner', migrated=True,
            settings={**DEFAULTS, 'agent_ids': [self.agent.pk], 'interleaving_enabled': True})
        self.task = AgentTask.objects.create(name='铁匠铺打造', task_kind='blacksmith', enabled=True,
            blacksmith_config={'owner_id': 'owner'}, agent=self.agent, agent_ids=[self.agent.pk])
        WorldActionRuntime.objects.create(pk='world', enabled=True)
        self.record = AgentRunRecord.objects.create(agent=self.agent, agent_name=self.agent.name,
            task_name='空档穿插决策', status='running')
        now = timezone.now()
        self.item = LifeItem.objects.create(pk='smith-opportunity', owner_id='owner', actor_id=self.agent.pk,
            activity='blacksmith', task_id=self.task.pk, status='running', original_at=now, scheduled_at=now,
            context={'execution_started': now.isoformat(), 'interleaving': {'version': 1,
                'opportunity_id': 'smith-opportunity', 'selection_record_id': self.record.pk, 'choices': [],
                'expires_at': (now + timedelta(hours=1)).isoformat()}})
        self.rule = DEFAULT_RULES['1-10:weapon']
        for index, row in enumerate(self.rule['ingredients']):
            add_stock(self.agent.pk, 'owner', self.agent.name, row['sku'], row['quantity'] * 3,
                      row['name'], 'combat_material', row['price'], f'test-material-{index}')
        self.enterContext(patch('system_settings.agent_world.life_interleaving_candidates.available_window', return_value=3600))
        self.calls = []
        def connection(owner, state, choices, **kwargs):
            self.calls.append((kwargs['scene'], copy.deepcopy(state)))
            if kwargs['scene'] == 'blacksmith_goal_count':
                return ('1' if sum(scene == 'blacksmith_goal_count' for scene, _ in self.calls) == 1 else '0'), .9
            return next(iter(choices)), .9
        self.enterContext(patch('system_settings.decision.routing.choose_connections', side_effect=connection))

    def test_automatic_entry_reuses_selection_record_and_same_key_never_debits_again(self):
        from system_settings.models import WorldAction, AgentRunRecord
        from .life_scope import life_scope
        from .blacksmith_models import BlacksmithOperation
        from .life_runner import finish_running
        from .travel_models import AgentInventoryItem
        with life_scope(self.item, {}):
            record = runner.run_blacksmith_opportunity(self.task, key=self.item.pk)
        self.assertEqual(record.pk, self.record.pk)
        self.assertEqual(AgentRunRecord.objects.count(), 1)
        operation = BlacksmithOperation.objects.get(opportunity_id=self.item.pk)
        self.assertEqual(operation.piece_index, 0)
        self.assertEqual(sum(scene == 'blacksmith_goal_count' for scene, _ in self.calls), 2)
        balance = list(AgentInventoryItem.objects.filter(actor_id=self.agent.pk).values_list('pk', 'quantity'))
        self.assertEqual(WorldAction.objects.get(pk=self.item.pk).status, 'success')
        with life_scope(self.item, {}):
            runner.run_blacksmith_opportunity(self.task, key=self.item.pk)
        self.assertEqual(BlacksmithOperation.objects.count(), 1)
        self.assertEqual(balance, list(AgentInventoryItem.objects.filter(actor_id=self.agent.pk).values_list('pk', 'quantity')))
        finish_running(self.config, timezone.now())
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, 'completed')

    def test_interleaving_admission_exposes_real_forge_candidate(self):
        from .life_interleaving_candidates import build
        with patch('system_settings.agent_world.life_interleaving_candidates.capacity',
                   return_value={'energy': Decimal(100), 'projection': {'safe': True}}):
            candidates, _, _ = build(self.config, self.agent, item=self.item)
        self.assertIn('blacksmith', candidates)
        self.assertEqual(candidates['blacksmith']['max_pieces'], 3)
        self.assertEqual(set(candidates['blacksmith']), {
            'free_goal_slots', 'ready_goals', 'goal_progress', 'legal_goal_recipes',
            'energy_allowance', 'max_pieces', 'registerable_goals',
            'craftable_equipment_now', 'opportunity',
        })

    def test_accessory_decision_context_includes_existing_ring_stock(self):
        from random import Random
        from .combat.catalog import bundled
        from .combat.equipment import generate
        from .combat.models import CombatProfile, EquipmentInstance
        catalog = bundled()[0]
        template = next(row for row in catalog.tables['equipment_templates']
                        if row.get('equipment_type') == 'ring' and row['enabled'] == '1'
                        and row['boss_only'] == '0')
        item = generate(catalog, template['id'], int(template['level_min']), 'blue', Random(9))
        gear = EquipmentInstance.objects.create(pk='existing-ring', owner_id='owner', actor_id=self.agent.pk,
            catalog_id=catalog.version, template_id=template['id'], snapshot=item, value=item['value'])
        profile = CombatProfile.objects.get(pk=self.agent.pk)
        summary = runner.equipment_summary(profile, slot='accessory')
        self.assertIn(gear.pk, {row['id'] for row in summary['same_slot_stock']})
        ring = next(row for row in summary['same_slot_stock'] if row['id'] == gear.pk)
        self.assertEqual(ring['equipment_type'], 'ring')
        self.assertEqual(ring['quality'], 'blue')

    def test_material_purchase_can_complete_forge_recipe_without_any_alchemy_use(self):
        from .market_plan_candidates import craftable_after_purchase
        from .travel_models import AgentInventoryItem
        ingredient = self.rule['ingredients'][0]
        row = AgentInventoryItem.objects.get(actor_id=self.agent.pk, source__sku=ingredient['sku'])
        row.quantity = ingredient['quantity'] - 1
        row.save(update_fields=['quantity'])
        with patch('system_settings.agent_world.market_plan_candidates._crafting_facts',
                   return_value={'rules': {}, 'level': 1, 'pool': []}):
            self.assertTrue(craftable_after_purchase('owner', self.agent, ingredient['sku'], 1))
        other = self.rule['ingredients'][1]
        AgentInventoryItem.objects.filter(actor_id=self.agent.pk, source__sku=other['sku']).delete()
        with patch('system_settings.agent_world.market_plan_candidates._crafting_facts',
                   return_value={'rules': {}, 'level': 1, 'pool': []}):
            self.assertFalse(craftable_after_purchase('owner', self.agent, ingredient['sku'], 1))

    def test_task_save_derives_owner_and_keeps_single_disabled_builtin(self):
        from django.contrib.auth.models import User
        from rest_framework.test import APIClient
        from system_settings.models import Agent, AgentTask
        target = Agent.objects.create(name='打造能力配置测试')
        client = APIClient()
        client.force_authenticate(User.objects.create_superuser('admin', password='test'))
        payload = {'taskKind': 'blacksmith', 'name': '自行修改的任务名', 'agent': target.pk,
                   'agents': [target.pk], 'blacksmithConfig': {'ownerId': 'forged-owner'}}
        response = client.post('/api/settings/agent-tasks/', payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsInstance(response.data.get('data'), dict, response.data)
        task = AgentTask.objects.get(task_kind='blacksmith', blacksmith_config__owner_id='admin')
        self.assertEqual(task.blacksmith_config, {'owner_id': 'admin'})
        self.assertFalse(task.enabled)
        self.assertEqual(task.name, '铁匠铺打造')
        self.assertEqual(client.post('/api/settings/agent-tasks/', payload, format='json').status_code, 200)
        self.assertEqual(AgentTask.objects.filter(task_kind='blacksmith', blacksmith_config__owner_id='admin').count(), 1)

    def test_cancel_during_model_backoff_releases_current_piece_without_consuming(self):
        from system_settings.models import WorldAction, WorldActionRuntime
        from .blacksmith_catalog import catalog_for
        from .blacksmith_models import BlacksmithOperation
        from .crafting_materials import available_pool
        catalog_for('owner')
        action = WorldAction.objects.create(pk=self.item.pk, task=self.task, agent=self.agent,
            actor_id=self.agent.pk, record=self.record,
            snapshot={'blacksmith': True, 'owner_id': 'owner', 'version': 1, 'phase': 'type',
                'cursor': 0, 'decisions': [], 'life_item_id': self.item.pk, 'manual': False,
                'retry_at': (timezone.now() + timedelta(minutes=5)).isoformat(),
                'current': {'recipe_id': self.rule['id'], 'rule': self.rule,
                    'reservation': {'ingredients': [{'sku': row['sku'], 'quantity': row['quantity']}
                                                   for row in self.rule['ingredients']]}}})
        before = sum(row['quantity'] for row in available_pool('owner', self.agent.pk))
        self.item.status = 'cancelled'
        self.item.save(update_fields=['status', 'updated_at'])
        WorldActionRuntime.objects.filter(pk='world').update(enabled=False)
        runner.tick_blacksmith()
        action.refresh_from_db()
        self.assertNotEqual(action.status, 'claimed')
        self.assertEqual(action.snapshot['current'], {})
        self.assertEqual(sum(row['quantity'] for row in available_pool('owner', self.agent.pk)),
                         before + sum(row['quantity'] for row in self.rule['ingredients']))
        self.assertFalse(BlacksmithOperation.objects.exists())

    def test_automatic_entry_never_grants_authority_from_restored_manual_item_marker(self):
        from system_settings.models import WorldAction, WorldActionRuntime
        from .blacksmith_authorization import authorized
        from .life_scope import life_scope
        WorldActionRuntime.objects.filter(pk='world').update(enabled=False)
        self.item.context = {**self.item.context, 'manual': True}
        self.item.save(update_fields=['context', 'updated_at'])
        with life_scope(self.item, {}), patch.object(runner, 'resume') as resume:
            runner.run_blacksmith_opportunity(self.task, key=self.item.pk, manual=False, locked='world-token')
        resume.assert_not_called()
        self.assertFalse(authorized(self.item.pk, manual=True))
        action = WorldAction.objects.get(pk=self.item.pk)
        self.assertTrue(action.snapshot['manual'])
        self.assertEqual((action.status, action.snapshot['cursor']), ('claimed', 0))


class BlacksmithAuthorizationTests(TestCase):
    def test_local_manual_grant_never_grants_automatic_execution(self):
        from system_settings.models import WorldActionRuntime
        from .blacksmith_authorization import authorize, authorized, require_authorized, BlacksmithAuthorizationRequired
        WorldActionRuntime.objects.create(pk='world', enabled=False)
        self.assertFalse(authorized('manual-action', manual=True))
        authorize('manual-action')
        self.assertTrue(authorized('manual-action', manual=True))
        self.assertFalse(authorized('manual-action', manual=False))
        self.assertFalse(authorized('another-action', manual=True))
        with self.assertRaises(BlacksmithAuthorizationRequired):
            require_authorized('manual-action', manual=False)

    def test_reset_clears_only_local_forge_grants_and_world_enable_authorizes_resume(self):
        from system_settings.models import WorldActionRuntime
        from .blacksmith_authorization import authorize, authorized, authorization_key, reset_authorizations
        WorldActionRuntime.objects.create(pk='world', enabled=False)
        authorize('manual-action')
        WorldActionRuntime.objects.filter(pk=authorization_key('manual-action')).update(
            token='local-token', until=timezone.now() + timedelta(minutes=10))
        reset_authorizations()
        grant = WorldActionRuntime.objects.get(pk=authorization_key('manual-action'))
        self.assertEqual((grant.enabled, grant.token, grant.until), (False, '', None))
        self.assertFalse(authorized('manual-action', manual=True))
        WorldActionRuntime.objects.filter(pk='world').update(enabled=True)
        self.assertTrue(authorized('manual-action', manual=True))
        self.assertTrue(authorized('auto-action', manual=False))

    def test_unauthorized_resume_and_tick_preserve_checkpoint_before_acquiring_lease(self):
        from system_settings.models import Agent, AgentTask, WorldAction, WorldActionRuntime
        WorldActionRuntime.objects.create(pk='world', enabled=False)
        actor = Agent.objects.create(name='未授权接续测试')
        task = AgentTask.objects.create(name='打造', agent=actor, enabled=True,
            task_kind='blacksmith', blacksmith_config={'owner_id': 'owner'})
        frozen = {'blacksmith': True, 'owner_id': 'owner', 'manual': True, 'version': 1,
                  'cursor': 0, 'phase': 'commit', 'current': {'snapshot': {'frozen': 'piece'}}}
        action = WorldAction.objects.create(pk='manual-action', agent=actor, actor_id=actor.pk, task=task, snapshot=frozen)
        with patch.object(runner, 'execution_lease') as lease, patch.object(runner, 'advance') as advance:
            runner.resume(action)
            runner.tick_blacksmith()
        lease.assert_not_called()
        advance.assert_not_called()
        action.refresh_from_db()
        self.assertEqual(action.status, 'claimed')
        self.assertEqual(action.snapshot, frozen)
        from .blacksmith_authorization import authorized
        with patch.object(runner, 'resume') as resume:
            runner.run_blacksmith_opportunity(task, key=action.pk, manual=False, locked='world-token')
        resume.assert_not_called()
        self.assertFalse(authorized(action.pk, manual=True))

    def test_disabled_task_releases_reservation_even_without_execution_permission(self):
        from system_settings.models import Agent, AgentTask, WorldAction, WorldActionRuntime
        WorldActionRuntime.objects.create(pk='world', enabled=False)
        actor = Agent.objects.create(name='无授权取消测试')
        task = AgentTask.objects.create(name='打造', agent=actor, enabled=False,
            task_kind='blacksmith', blacksmith_config={'owner_id': 'owner'})
        action = WorldAction.objects.create(pk='manual-action', agent=actor, actor_id=actor.pk, task=task,
            snapshot={'blacksmith': True, 'owner_id': 'owner', 'manual': True, 'version': 1,
                'cursor': 0, 'phase': 'type', 'current': {'reservation': {'ingredients': []}}})
        with patch.object(runner, 'execution_lease') as lease:
            runner.tick_blacksmith()
        lease.assert_not_called()
        action.refresh_from_db()
        self.assertEqual(action.status, 'skipped')
        self.assertEqual(action.snapshot['phase'], 'done')
        self.assertEqual(action.snapshot['current'], {})

    def test_explicit_same_key_manual_entry_grants_device_permission(self):
        from system_settings.models import WorldAction, WorldActionRuntime
        from .blacksmith_authorization import authorized
        WorldActionRuntime.objects.create(pk='world', enabled=False)
        action = WorldAction.objects.create(pk='manual-action', actor_id='resident',
            snapshot={'blacksmith': True, 'owner_id': 'owner', 'manual': True})
        with patch.object(runner, 'resume', return_value='continued') as resume:
            result = runner.run_blacksmith_opportunity(None, key=action.pk, manual=True, locked='world-token')
        self.assertEqual(result, 'continued')
        resume.assert_called_once()
        self.assertTrue(authorized(action.pk, manual=True))
