"""Real isolated stock/energy transactions and complete cross-domain forge snapshots."""
import copy
import json
from collections import Counter
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.apps import apps
from django.core import serializers
from django.db import connection
from django.test import SimpleTestCase, TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from system_settings.models import Agent, AgentTask, AIModel, AIProvider, AgentExecutionLease, SystemSetting, WorldAction, WorldActionRuntime
from .alchemy_materials import allocate, material_pool
from .blacksmith_catalog import DEFAULT_RULES, catalog_for
from .blacksmith_candidates import template_options
from .blacksmith_integrity import fingerprints_source
from .blacksmith_models import BlacksmithOperation, BlacksmithGoal, BlacksmithCatalog
from .blacksmith_queries import history
from .blacksmith_rolls import QUALITY_RULES, outcome, quality_for_roll
from .blacksmith_service import commit_piece
from .blacksmith_sync import validate_source, metadata, validate_conflicts
from .combat.catalog import bundled
from .combat.facts import append
from .combat.models import CombatFact, EquipmentInstance
from .combat.profiles import ensure
from .crafting_materials import available_pool
from .execution import stamina
from .inventory_stock import add_stock, stock_quantity
from .life_config import DEFAULTS
from .life_models import LifeConfig, LifeItem


class BlacksmithProbabilityTests(SimpleTestCase):
    def test_quality_boundaries_cover_exact_seventy_twenty_five_five_grid(self):
        self.assertEqual(Counter(quality_for_roll(value) for value in range(100)),
                         {'white': 70, 'blue': 25, 'gold': 5})
        for value in (-1, 100, True, 1.5):
            with self.assertRaises(ValueError):
                quality_for_roll(value)
        self.assertEqual([quality_for_roll(value) for value in (0, 69, 70, 94, 95, 99)],
                         ['white', 'white', 'blue', 'blue', 'gold', 'gold'])

    def test_seeded_production_rolls_have_the_declared_distribution_and_replay(self):
        catalog = bundled()[0]
        rule = copy.deepcopy(DEFAULT_RULES['1-10:weapon'])
        frozen = {'version': 1, 'rule': rule, 'catalog_id': catalog.version,
            'template_id': 'equip.training_sword', 'level_min': 1, 'level_max': 10,
            'job': 'job.novice', 'quality_rules': QUALITY_RULES,
            'materials': [{'inventory_id': f'fixture-{index}', 'sku': row['sku'],
                           'quantity': row['quantity'], 'price': row['price']}
                          for index, row in enumerate(rule['ingredients'])]}
        histogram = Counter(outcome(f'probability-fixture:{index}', frozen, catalog)['quality'] for index in range(5000))
        for quality, expected in [('white', .70), ('blue', .25), ('gold', .05)]:
            self.assertLess(abs(histogram[quality] / 5000 - expected), .025)
        self.assertEqual(outcome('replayed', frozen, catalog), outcome('replayed', frozen, catalog))


class BlacksmithServiceTests(TestCase):
    def setUp(self):
        temporary = TemporaryDirectory(prefix='odoc-forge-service-')
        self.addCleanup(temporary.cleanup)
        self.enterContext(self.settings(MEDIA_ROOT=temporary.name,
            SYSTEM_LOG_DIR=str(Path(temporary.name) / 'logs'),
            ODOC_WORLD_LOCK_PATH=str(Path(temporary.name) / 'world.lock')))
        self.enterContext(patch('system_settings.decision.routing.complete', side_effect=AssertionError('不得请求真实模型')))
        provider = AIProvider.objects.create(name='isolated', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='isolated', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='隔离铁匠', model=model)
        self.task = AgentTask.objects.create(name='隔离打造', task_kind='blacksmith', enabled=True,
            agent=self.agent, agent_ids=[self.agent.pk], blacksmith_config={'owner_id': 'admin'})
        self.config = LifeConfig.objects.create(pk='admin', migrated=True,
            settings={**DEFAULTS, 'agent_ids': [self.agent.pk]})
        self.profile = ensure('admin', self.agent)
        self.catalog = bundled()[0]
        catalog_for('admin')
        self.now = timezone.now()
        AgentExecutionLease.objects.create(agent=self.agent, token='agent-token', until=self.now + timedelta(hours=1))
        WorldActionRuntime.objects.create(pk='world', enabled=True, token='world-token', until=self.now + timedelta(hours=1))
        self.rule = copy.deepcopy(DEFAULT_RULES['1-10:weapon'])
        self.grant(1)

    def grant(self, count, key=None):
        key = key or f'fixture-drop-{CombatFact.objects.count()}'
        rewards = []
        for row in self.rule['ingredients']:
            material = self.catalog.row('materials', row['sku'][len('combat.'):])
            quantity = row['quantity'] * count
            add_stock(self.agent.pk, 'admin', self.agent.name, row['sku'], quantity,
                      material['name'], 'combat_material', material['sale_price'], key)
            rewards.append({'kind': 'material', 'item': material, 'quantity': quantity})
        append(self.profile, key, 'round', {'events': [{'kind': 'kill', 'rewards': rewards}]})

    def confirmed_action(self, identity='forge-unit'):
        template = template_options(self.catalog, self.profile, self.rule)[0]
        snapshot = {'version': 1, 'rule': copy.deepcopy(self.rule), 'catalog_id': self.catalog.version,
            'template_id': template['template_id'], 'level_min': template['level_min'],
            'level_max': template['level_max'], 'job': self.profile.progression['job'],
            'materials': allocate(copy.deepcopy(material_pool(self.agent.pk, 'admin')), self.rule['ingredients']),
            'quality_rules': copy.deepcopy(QUALITY_RULES)}
        decisions = [{'piece_index': 0, 'phase': phase, 'scene': scene, 'choice': choice,
                      'source': 'system', 'reason': '系统选择说明：隔离的已确认合法选项。'}
                     for phase, scene, choice in [('band', 'blacksmith_level_band', self.rule['band_id']),
                         ('slot', 'blacksmith_slot', self.rule['id']),
                         ('type', 'blacksmith_type', template['template_id'])]]
        current = {'band_id': self.rule['band_id'], 'recipe_id': self.rule['id'], 'rule': copy.deepcopy(self.rule),
            'template_id': template['template_id'], 'snapshot': snapshot,
            'reservation': {'ingredients': [{'sku': row['sku'], 'quantity': row['quantity']} for row in self.rule['ingredients']]}}
        action = WorldAction.objects.create(pk=identity, task=self.task, agent=self.agent, actor_id=self.agent.pk,
            snapshot={'blacksmith': True, 'owner_id': 'admin', 'version': 1, 'cursor': 0,
                'phase': 'commit', 'current': current, 'decisions': decisions, 'manual': True, 'life_item_id': ''})
        from .blacksmith_authorization import authorize
        authorize(action.pk)
        return action, snapshot

    def commit(self, action, snapshot):
        return commit_piece(self.agent.pk, action.pk, 0, self.rule['id'], snapshot, '隔离测试打造',
                            self.task, 'agent-token', 'world-token', now=self.now)

    def data(self):
        return json.loads(serializers.serialize('json', [row
            for model in apps.get_app_config('system_settings').get_models()
            if model.__name__ not in ('CombatRuntime', 'MarketRuntime') for row in model.objects.all()]))

    def rehash(self, data):
        for row in data:
            if row['model'] == 'system_settings.blacksmithintegrity':
                row['fields']['hashes'] = fingerprints_source(data, str(row['pk']))
        return data

    def run_one(self):
        from .blacksmith_runner import run_blacksmith_opportunity
        self.grant(2)
        AgentExecutionLease.objects.update(token='', until=None)
        WorldActionRuntime.objects.update(token='', until=None)
        scenes = []
        def choose(owner, state, choices, **kwargs):
            scene = kwargs['scene']
            scenes.append((scene, copy.deepcopy(state)))
            selected = {'blacksmith_goal_count': '1' if not any(row[0] == 'blacksmith_goal_count' for row in scenes[:-1]) else '0',
                        'blacksmith_level_band': '1-10', 'blacksmith_slot': '1-10:weapon',
                        'blacksmith_type': 'equip.training_sword'}[scene]
            self.assertIn(selected, choices)
            return selected, {}
        with patch('system_settings.decision.routing.choose_connections', side_effect=choose):
            record = run_blacksmith_opportunity(self.task, key='forge-run', manual=True)
        self.assertEqual(record.status, 'success', record.summary)
        operation = BlacksmithOperation.objects.get(opportunity_id='forge-run')
        return operation, scenes

    def post_manual(self, client, task, actor_id):
        from types import SimpleNamespace
        pending = []
        def queue(*, target, **_kwargs):
            pending.append(target)
            return SimpleNamespace(start=lambda: None)
        # Run the accepted HTTP callback after restoring the real Thread so
        # lease heartbeat threads keep their own lifecycle.
        with patch('system_settings.agent_views.threading.Thread', side_effect=queue):
            response = client.post(f'/api/settings/agent-tasks/{task.pk}/run_now/',
                                   {'actorId': actor_id}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(pending), 1)
        with patch('django.db.close_old_connections'):
            pending[0]()

    def test_atomic_single_piece_debits_exact_stock_energy_and_provenance(self):
        action, frozen = self.confirmed_action()
        money = self.agent.money
        operation = self.commit(action, frozen)
        action.refresh_from_db()
        self.assertEqual((action.snapshot['cursor'], action.snapshot['phase'], action.snapshot['current']), (1, 'continue', {}))
        self.assertEqual(stamina(self.agent, self.now), Decimal(98))
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.money, money)
        self.assertTrue(all(stock_quantity(self.agent.pk, 'admin', row['sku']) == 0 for row in self.rule['ingredients']))
        gear = EquipmentInstance.objects.get(pk=operation.result['equipment_id'])
        self.assertFalse(gear.bound)
        self.assertEqual(gear.snapshot, operation.result['item'])
        fact = CombatFact.objects.get(pk='blacksmith:' + operation.pk)
        self.assertEqual(fact.kind, 'forge')
        self.assertEqual(fact.payload['equipment_after'][gear.pk]['rules'], gear.rules)
        self.assertEqual(WorldAction.objects.filter(snapshot__blacksmith_energy=True).count(), 1)

    def test_single_piece_hashes_once_and_keeps_sync_revisions(self):
        from system_settings.models import SyncEntityState
        from .blacksmith_integrity import fingerprints
        from .blacksmith_models import BlacksmithIntegrity
        from .blacksmith_sync import checkpoint
        action, frozen = self.confirmed_action()
        SyncEntityState.objects.filter(model_label__in=(
            'system_settings.worldaction', 'system_settings.blacksmithoperation',
            'system_settings.blacksmithintegrity')).delete()
        with patch('system_settings.agent_world.blacksmith_sync.checkpoint', wraps=checkpoint) as refresh:
            operation = self.commit(action, frozen)
        refresh.assert_called_once_with('admin')
        self.assertEqual(BlacksmithIntegrity.objects.get(pk='admin').hashes, fingerprints('admin'))
        revisions = set(SyncEntityState.objects.values_list('model_label', 'object_pk'))
        energy = WorldAction.objects.get(snapshot__blacksmith_energy=True)
        for label, identity in (('blacksmithoperation', operation.pk), ('worldaction', action.pk),
                                ('worldaction', energy.pk), ('blacksmithintegrity', 'admin')):
            self.assertIn(('system_settings.' + label, identity), revisions)
        data = self.data()
        validate_source(data, metadata(data))

    def test_checkpoint_failure_rolls_back_piece_and_next_commit_still_refreshes(self):
        from .blacksmith_integrity import fingerprints
        from .blacksmith_models import BlacksmithIntegrity
        from .blacksmith_sync import checkpoint
        action, frozen = self.confirmed_action()
        stock = material_pool(self.agent.pk, 'admin')
        hashes = BlacksmithIntegrity.objects.get(pk='admin').hashes
        with patch('system_settings.agent_world.blacksmith_sync.checkpoint', side_effect=RuntimeError('hash failed')):
            with self.assertRaisesRegex(RuntimeError, 'hash failed'):
                self.commit(action, frozen)
        self.assertFalse(BlacksmithOperation.objects.exists())
        self.assertFalse(WorldAction.objects.filter(snapshot__blacksmith_energy=True).exists())
        self.assertEqual(material_pool(self.agent.pk, 'admin'), stock)
        self.assertEqual(BlacksmithIntegrity.objects.get(pk='admin').hashes, hashes)
        action.refresh_from_db()
        self.assertEqual((action.snapshot['cursor'], action.snapshot['phase']), (0, 'commit'))
        with patch('system_settings.agent_world.blacksmith_sync.checkpoint', wraps=checkpoint) as refresh:
            self.commit(action, frozen)
        refresh.assert_called_once_with('admin')
        self.assertEqual(BlacksmithIntegrity.objects.get(pk='admin').hashes, fingerprints('admin'))

    def test_repeated_commit_replays_without_debit_or_reroll(self):
        action, frozen = self.confirmed_action()
        first = self.commit(action, frozen)
        with patch('system_settings.agent_world.blacksmith_service.outcome', side_effect=AssertionError('不得重抽')):
            second = self.commit(action, frozen)
        self.assertEqual((first.pk, first.result), (second.pk, second.result))
        self.assertEqual(BlacksmithOperation.objects.count(), 1)
        self.assertEqual(stamina(self.agent, self.now), Decimal(98))
        self.assertEqual(CombatFact.objects.filter(kind='forge').count(), 1)
        tampered = copy.deepcopy(frozen)
        tampered['job'] = 'job.warrior'
        with self.assertRaisesRegex(ValueError, '其他操作'):
            self.commit(action, tampered)

    def test_competing_model_responses_cannot_reserve_the_same_last_materials(self):
        from .blacksmith_candidates import recipe_options
        from .blacksmith_runner import facts_for, save_stage
        band = {'piece_index': 0, 'phase': 'band', 'scene': 'blacksmith_level_band',
                'choice': self.rule['band_id'], 'source': 'system', 'reason': '系统选择说明：选择合法等级档。'}
        actions = [WorldAction.objects.create(pk=f'competing-{index}', task=self.task,
            agent=self.agent, actor_id=self.agent.pk,
            snapshot={'blacksmith': True, 'owner_id': 'admin', 'version': 1, 'cursor': 0,
                'phase': 'slot', 'current': {'band_id': self.rule['band_id']},
                'decisions': [copy.deepcopy(band)], 'manual': True, 'life_item_id': ''}) for index in range(2)]
        initial = [facts_for(action, self.agent) for action in actions]
        for facts in initial:
            self.assertIn(self.rule['id'], recipe_options(facts['rules'], facts['catalog'],
                          facts['profile'], facts['pool'], facts['energy']))
        current = {'band_id': self.rule['band_id'], 'recipe_id': self.rule['id'],
            'rule': copy.deepcopy(self.rule), 'reservation': {'ingredients': [
                {'sku': row['sku'], 'quantity': row['quantity']} for row in self.rule['ingredients']]}}
        slot = {'piece_index': 0, 'phase': 'slot', 'scene': 'blacksmith_slot',
                'choice': self.rule['id'], 'source': 'system', 'reason': '系统选择说明：已选当前部位。'}
        save_stage(actions[0], self.agent, phase='type', current=copy.deepcopy(current), decision=slot)
        with self.assertRaisesRegex(ValueError, '材料或职业路线'):
            save_stage(actions[1], self.agent, phase='type', current=copy.deepcopy(current), decision=slot)
        actions[1].refresh_from_db()
        self.assertEqual(actions[1].snapshot['phase'], 'slot')
        self.assertNotIn('reservation', actions[1].snapshot['current'])
        self.assertFalse(BlacksmithOperation.objects.exists())
        for ingredient in self.rule['ingredients']:
            self.assertEqual(stock_quantity(self.agent.pk, 'admin', ingredient['sku']), ingredient['quantity'])
        selected = template_options(self.catalog, self.profile, self.rule)[0]
        frozen = {'version': 1, 'rule': copy.deepcopy(self.rule), 'catalog_id': self.catalog.version,
            'template_id': selected['template_id'], 'level_min': selected['level_min'], 'level_max': selected['level_max'],
            'job': self.profile.progression['job'], 'quality_rules': copy.deepcopy(QUALITY_RULES),
            'materials': allocate(copy.deepcopy(available_pool('admin', self.agent.pk,
                exclude_action_id=actions[0].pk)), self.rule['ingredients'])}
        current.update(template_id=selected['template_id'], snapshot=frozen)
        chosen_type = {'piece_index': 0, 'phase': 'type', 'scene': 'blacksmith_type',
            'choice': selected['template_id'], 'source': 'system', 'reason': '系统选择说明：选择合法模板。'}
        save_stage(actions[0], self.agent, phase='commit', current=current, decision=chosen_type)
        self.commit(actions[0], frozen)
        self.assertEqual(BlacksmithOperation.objects.count(), 1)
        self.assertEqual(stamina(self.agent, self.now), Decimal(98))
        self.assertEqual(CombatFact.objects.filter(kind='forge').count(), 1)
        data = self.data()
        validate_source(data, metadata(data))

    def test_exception_after_material_consumption_rolls_back_all_business_state(self):
        action, frozen = self.confirmed_action()
        original = copy.deepcopy(action.snapshot)
        with patch('system_settings.agent_world.blacksmith_service.outcome', side_effect=RuntimeError('模拟生成失败')):
            with self.assertRaisesRegex(RuntimeError, '模拟生成失败'):
                self.commit(action, frozen)
        action.refresh_from_db()
        self.assertEqual(action.snapshot, original)
        self.assertEqual(BlacksmithOperation.objects.count(), 0)
        self.assertEqual(CombatFact.objects.filter(kind='forge').count(), 0)
        self.assertEqual(WorldAction.objects.filter(snapshot__blacksmith_energy=True).count(), 0)
        for row in self.rule['ingredients']:
            self.assertEqual(stock_quantity(self.agent.pk, 'admin', row['sku']), row['quantity'])
        self.assertEqual(stamina(self.agent, self.now), Decimal(100))

    def test_route_change_and_inventory_price_change_are_rejected(self):
        from .travel_models import AgentInventoryItem
        action, frozen = self.confirmed_action()
        self.profile.progression = {**self.profile.progression, 'job': 'job.warrior'}
        self.profile.save(update_fields=['progression'])
        with self.assertRaisesRegex(ValueError, '职业或装备目录'):
            self.commit(action, frozen)
        self.profile.progression = {**self.profile.progression, 'job': 'job.novice'}
        self.profile.save(update_fields=['progression'])
        AgentInventoryItem.objects.filter(pk=frozen['materials'][0]['inventory_id']).update(value=Decimal('99'))
        with self.assertRaisesRegex(ValueError, '材料发生变化'):
            self.commit(action, frozen)
        self.assertFalse(BlacksmithOperation.objects.exists())

    def alchemy_plan(self):
        from .alchemy_catalog import DEFAULT_RULES as ALCHEMY_RULES
        rule = copy.deepcopy(ALCHEMY_RULES['healing'])
        rule['ingredients'] = [{'sku': row['sku'], 'quantity': row['quantity']} for row in self.rule['ingredients']]
        entries = [{'recipe_id': 'healing', 'quantity': 1, 'rule': rule}]
        return {'version': 1, 'entries': entries, 'materials': copy.deepcopy(rule['ingredients'])}

    def alchemy_item(self, identity='alchemy-reserved'):
        return LifeItem.objects.create(pk=identity, owner_id='admin', actor_id=self.agent.pk,
            activity='alchemy', original_at=self.now + timedelta(hours=1), scheduled_at=self.now + timedelta(hours=1),
            context={'alchemy_plan': self.alchemy_plan()})

    def test_alchemy_reservation_blocks_forge_until_cancelled(self):
        from .life_schedule import revise
        action, frozen = self.confirmed_action()
        item = self.alchemy_item()
        with self.assertRaisesRegex(ValueError, '其他制作预留'):
            self.commit(action, frozen)
        revise(item, '取消隔离预留', status='cancelled')
        self.assertEqual(self.commit(action, frozen).piece_index, 0)

    def test_forge_reservation_blocks_real_alchemy_commit(self):
        from .alchemy_plan import build_plan
        from .alchemy_service import commit_bottle
        from .alchemy_catalog import catalog_for as alchemy_catalog
        plan = self.alchemy_plan()
        rule = plan['entries'][0]['rule']
        selected = build_plan('admin', self.agent.pk, [{'recipe_id': 'healing', 'quantity': 1}],
                              [{'id': 'healing', **rule}], Decimal(100))
        alchemy_catalog('admin')
        task = AgentTask.objects.create(task_kind='alchemy', name='隔离炼金', enabled=True,
            agent=self.agent, agent_ids=[self.agent.pk], alchemy_config={'owner_id': 'admin'})
        WorldAction.objects.create(pk='alchemy-current', task=task, agent=self.agent, actor_id=self.agent.pk,
                                   snapshot={'plan': selected})
        self.confirmed_action()
        with self.assertRaisesRegex(ValueError, '其他日程预留'):
            commit_bottle(self.agent.pk, 'alchemy-current', 0, 'healing', selected[0]['rule'],
                          '隔离炼金', task, 'agent-token', 'world-token', now=self.now)
        self.assertEqual(stamina(self.agent, self.now), Decimal(100))

    def test_shared_material_query_count_stays_constant_with_many_reservations(self):
        self.grant(25)
        self.alchemy_item('plan-0')
        with CaptureQueriesContext(connection) as baseline:
            available_pool('admin', self.agent.pk)
        for index in range(1, 20):
            self.alchemy_item(f'plan-{index}')
        with CaptureQueriesContext(connection) as measured:
            pool = available_pool('admin', self.agent.pk)
        self.assertEqual(len(measured), len(baseline))
        self.assertLessEqual(len(measured), 5)
        available = Counter()
        for row in pool:
            available[row['sku']] += row['quantity']
        for row in self.rule['ingredients']:
            self.assertEqual(available[row['sku']], row['quantity'] * 6)

    def test_frozen_forge_lots_remain_reserved_after_prior_alchemy_cancel(self):
        from .travel_models import AgentInventoryItem
        from .life_schedule import revise
        for index, row in enumerate(self.rule['ingredients']):
            AgentInventoryItem.objects.create(pk=f'traded-tail-{index}', owner_id='admin', actor_id=self.agent.pk,
                actor_name=self.agent.name, origin_actor_id='isolated-seller', name=row['name'],
                kind='combat_material', quantity=row['quantity'], value=row['price'], source={'sku': row['sku']})
        prior = self.alchemy_item()
        action, frozen = self.confirmed_action()
        frozen['materials'] = allocate(copy.deepcopy(available_pool('admin', self.agent.pk,
            exclude_action_id=action.pk)), self.rule['ingredients'])
        self.assertTrue(all(row['inventory_id'].startswith('traded-tail-') for row in frozen['materials']))
        action.snapshot['current']['snapshot'] = frozen
        action.save(update_fields=['snapshot'])
        revise(prior, '取消早先炼金预留', status='cancelled')
        free = {row['inventory_id']: row['quantity'] for row in available_pool('admin', self.agent.pk)}
        for row in frozen['materials']:
            self.assertEqual(free.get(row['inventory_id'], 0), 0,
                '已确认打造的具体材料批次不能因较早预留取消而重新暴露给其他制作')

    def test_market_sells_and_lists_only_free_lots_then_forge_can_commit_reserved_lot(self):
        from .travel_models import AgentInventoryItem
        from .market_disposition import select_rows
        from .market_models import MarketSession, MarketRuntime
        from .market_service import trade
        action, frozen = self.confirmed_action('reserved-before-market')
        ingredient = self.rule['ingredients'][0]
        first = frozen['materials'][0]
        extra = AgentInventoryItem.objects.create(pk='free-traded-material', owner_id='admin', actor_id=self.agent.pk,
            actor_name=self.agent.name, origin_actor_id='isolated-seller', name=ingredient['name'],
            kind='combat_material', quantity=ingredient['quantity'], value=ingredient['price'], source={'sku': ingredient['sku']})
        selected = select_rows('admin', self.agent.pk, ingredient['sku'], extra.quantity, 'low')
        self.assertEqual([(row.pk, quantity) for row, quantity in selected], [(extra.pk, extra.quantity)])
        SystemSetting.objects.update_or_create(key='system_mcp_config', defaults={'value': {'enabled': True}})
        session = MarketSession.objects.create(pk='reserved-material-session', owner_id='admin',
            actor_id=self.agent.pk, actor_name=self.agent.name, mode='mcp', expires_at=self.now + timedelta(minutes=5))
        MarketRuntime.objects.create(pk=session.pk, agent_token='agent-token', process_id=1)
        with self.assertRaises(ValueError):
            trade(session, self.agent, 'forbidden-reserved-list', {'kind': 'list',
                  'item_id': first['inventory_id'], 'quantity': 1, 'unit_price': '3.00'}, now=self.now)
        trade(session, self.agent, 'sell-free-material', {'kind': 'sell_combat_material',
            'material_id': ingredient['sku'][len('combat.'):], 'quantity': extra.quantity}, now=self.now)
        self.assertFalse(AgentInventoryItem.objects.filter(pk=extra.pk).exists())
        self.assertEqual(AgentInventoryItem.objects.get(pk=first['inventory_id']).quantity, first['quantity'])
        operation = self.commit(action, frozen)
        self.assertTrue(EquipmentInstance.objects.filter(pk=operation.result['equipment_id']).exists())
        self.assertFalse(AgentInventoryItem.objects.filter(pk=first['inventory_id']).exists())
        self.assertEqual(BlacksmithOperation.objects.count(), 1)

    def test_real_runner_stops_after_observing_one_result_and_syncs_complete_source(self):
        operation, scenes = self.run_one()
        self.assertEqual([scene for scene, _ in scenes].count('blacksmith_goal_count'), 2)
        self.assertEqual(operation.result['goal_id'], BlacksmithGoal.objects.get(operation_id=operation.pk).pk)
        action = WorldAction.objects.get(pk='forge-run')
        self.assertEqual((action.snapshot['cursor'], action.snapshot['phase']), (1, 'done'))
        self.assertEqual(len(action.result['stages']), 5)
        data = self.data()
        validate_source(data, metadata(data))
        from .combat.sync import validate_source as validate_combat, metadata as combat_metadata
        validate_combat(data, combat_metadata(data))

    def test_registered_goals_use_live_recipe_and_protect_materials(self):
        from .blacksmith_goals import register, summary, requirements
        from .alchemy_schedule_plan import available_pool as alchemy_available
        from .market_disposition import reserved_quantity
        template = template_options(self.catalog, self.profile, self.rule)[0]
        first = register('admin', self.agent.pk, self.rule['id'], template['template_id'], 'first')
        second = register('admin', self.agent.pk, self.rule['id'], template['template_id'], 'second')
        self.assertNotEqual(first.pk, second.pk)
        state = summary('admin', self.agent.pk)
        self.assertEqual((state['free_slots'], state['ready_count']), (1, 2))
        sku = self.rule['ingredients'][0]['sku']
        self.assertEqual(requirements('admin', self.agent.pk)[sku], self.rule['ingredients'][0]['quantity'] * 2)
        self.assertEqual(sum(row['quantity'] for row in alchemy_available('admin', self.agent.pk)
                             if row['sku'] == sku), 0)
        self.assertGreaterEqual(reserved_quantity('admin', self.agent.pk, sku), self.rule['ingredients'][0]['quantity'])
        catalog = BlacksmithCatalog.objects.get(pk='admin')
        rules = copy.deepcopy(catalog.rules)
        rules[self.rule['id']]['ingredients'][0]['quantity'] += 5
        catalog.rules = rules
        catalog.version += 1
        catalog.save(update_fields=['rules', 'version', 'updated_at'])
        self.assertEqual(summary('admin', self.agent.pk)['goals'][0]['ingredients'][0]['missing'], 5)

    def test_goal_requirements_validate_only_distinct_goal_recipes_once(self):
        from . import blacksmith_goals as goals
        template = template_options(self.catalog, self.profile, self.rule)[0]
        for identity in ('same-recipe-one', 'same-recipe-two'):
            goals.register('admin', self.agent.pk, self.rule['id'], template['template_id'], identity)
        other = DEFAULT_RULES['1-10:head']
        kind = template_options(self.catalog, self.profile, other)[0]
        goals.register('admin', self.agent.pk, other['id'], kind['template_id'], 'other-recipe')
        expected = Counter()
        for rule in (self.rule, self.rule, other):
            expected.update({part['sku']: part['quantity'] for part in rule['ingredients']})
        with patch.object(goals, 'template_options', wraps=goals.template_options) as types, \
             patch.object(goals, 'read_catalog', wraps=goals.read_catalog) as catalog, \
             patch.object(goals, 'rules_for', wraps=goals.rules_for) as rules:
            self.assertEqual(goals.requirements('admin', self.agent.pk), expected)
        self.assertEqual(types.call_count, 2)
        self.assertEqual({call.args[2]['id'] for call in types.call_args_list}, {self.rule['id'], other['id']})
        catalog.assert_called_once()
        rules.assert_called_once()

    def test_goal_requirements_skip_catalog_work_without_active_goals(self):
        from . import blacksmith_goals as goals
        with patch.object(goals, 'eligible', side_effect=AssertionError('无目标时不计算合法类型')):
            self.assertEqual(goals.requirements('admin', self.agent.pk), Counter())

    def test_goal_summary_reuses_one_eligibility_result_for_filtering_and_display(self):
        from . import blacksmith_goals as goals
        kind = template_options(self.catalog, self.profile, self.rule)[0]
        goal = goals.register('admin', self.agent.pk, self.rule['id'], kind['template_id'], 'summary-snapshot')
        choices = goals.eligible('admin', self.agent.pk)
        with patch.object(goals, 'eligible', side_effect=[choices, {}]) as eligibility:
            state = goals.summary('admin', self.agent.pk)
        eligibility.assert_called_once()
        self.assertEqual([row['id'] for row in state['goals']], [goal.pk])
        self.assertEqual(state['goals'][0]['ingredients'][0]['required'], self.rule['ingredients'][0]['quantity'])
        with patch.object(goals, 'eligible', side_effect=[{}, choices]) as eligibility:
            state = goals.summary('admin', self.agent.pk)
        eligibility.assert_called_once()
        self.assertEqual(state['goals'], [])
        self.assertEqual(state['invalid_goals'][0]['id'], goal.pk)
        goal.refresh_from_db()
        self.assertEqual(goal.status, 'active', '只读投影不能写入同步状态')

    def test_visit_can_register_zero_without_craftable_materials(self):
        from .blacksmith_runner import run_blacksmith_opportunity
        from .blacksmith_goals import summary
        self.alchemy_item()
        AgentExecutionLease.objects.update(token='', until=None)
        WorldActionRuntime.objects.update(token='', until=None)

        def choose_zero(owner, state, choices, **kwargs):
            return ('0' if kwargs['scene'] == 'blacksmith_goal_count' else next(iter(choices))), {}

        with patch('system_settings.decision.routing.choose_connections', side_effect=choose_zero):
            run_blacksmith_opportunity(self.task, key='zero-goals', manual=True)
        self.assertEqual(BlacksmithGoal.objects.count(), 0)

    def test_visit_can_register_three_without_craftable_materials(self):
        from .blacksmith_runner import run_blacksmith_opportunity
        from .blacksmith_goals import summary
        self.alchemy_item()
        AgentExecutionLease.objects.update(token='', until=None)
        WorldActionRuntime.objects.update(token='', until=None)

        def choose_three(owner, state, choices, **kwargs):
            return ('3' if kwargs['scene'] == 'blacksmith_goal_count' else next(iter(choices))), {}

        with patch('system_settings.decision.routing.choose_connections', side_effect=choose_three):
            record = run_blacksmith_opportunity(self.task, key='three-goals', manual=True)
        self.assertEqual((len(summary('admin', self.agent.pk)['goals']), BlacksmithOperation.objects.count()),
                         (3, 0), record.summary)
        data = self.data()
        validate_source(data, metadata(data))

    def test_three_new_ready_goals_auto_forge_at_visit_limit(self):
        from .blacksmith_runner import run_blacksmith_opportunity
        self.grant(2, key='three-ready-stock')
        AgentExecutionLease.objects.update(token='', until=None)
        WorldActionRuntime.objects.update(token='', until=None)
        scenes = []

        def choose(owner, state, choices, **kwargs):
            scene = kwargs['scene']
            scenes.append(scene)
            selected = {'blacksmith_goal_count': '3', 'blacksmith_level_band': '1-10',
                        'blacksmith_slot': '1-10:weapon', 'blacksmith_type': 'equip.training_sword'}[scene]
            self.assertIn(selected, choices)
            return selected, {}

        with patch('system_settings.decision.routing.choose_connections', side_effect=choose):
            run_blacksmith_opportunity(self.task, key='three-ready-goals', manual=True)
        self.assertEqual(BlacksmithOperation.objects.count(), 3)
        self.assertEqual(BlacksmithGoal.objects.filter(status='completed').count(), 3)
        self.assertNotIn('blacksmith_goal_priority', scenes)
        action = WorldAction.objects.get(pk='three-ready-goals')
        self.assertEqual((action.snapshot['cursor'], action.snapshot['phase']), (3, 'done'))
        data = self.data()
        validate_source(data, metadata(data))

    def test_competing_ready_goals_ask_once_and_keep_unbuilt_goal(self):
        from .blacksmith_goals import register
        from .blacksmith_runner import run_blacksmith_opportunity
        template = template_options(self.catalog, self.profile, self.rule)[0]
        first = register('admin', self.agent.pk, self.rule['id'], template['template_id'], 'priority-first')
        second = register('admin', self.agent.pk, self.rule['id'], template['template_id'], 'priority-second')
        AgentExecutionLease.objects.update(token='', until=None)
        WorldActionRuntime.objects.update(token='', until=None)
        scenes = []

        def choose(owner, state, choices, **kwargs):
            scenes.append(kwargs['scene'])
            return (second.pk if kwargs['scene'] == 'blacksmith_goal_priority' else '0'), {}

        with patch('system_settings.decision.routing.choose_connections', side_effect=choose):
            run_blacksmith_opportunity(self.task, key='priority-goals', manual=True)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual((first.status, second.status), ('active', 'completed'))
        self.assertEqual(BlacksmithOperation.objects.get().result['goal_id'], second.pk)
        self.assertEqual(scenes.count('blacksmith_goal_priority'), 1)

    def test_auto_market_sale_uses_unprotected_lot_and_releases_after_completion(self):
        from .blacksmith_goals import register
        from .market_disposition import surplus_plan
        from .market_plan_models import MarketDisposition
        from .market_models import MarketSession, MarketRuntime
        from .market_service import trade
        template = template_options(self.catalog, self.profile, self.rule)[0]
        goal = register('admin', self.agent.pk, self.rule['id'], template['template_id'], 'market-hold')
        ingredient = self.rule['ingredients'][0]
        MarketDisposition.objects.create(owner_id='admin', actor_id=self.agent.pk, sku=ingredient['sku'],
            target_hold=0, sell_ratio=100, list_ratio=0)
        self.assertEqual(surplus_plan('admin', self.agent.pk, ingredient['sku'])['sell'], 0)
        self.grant(1, key='extra-market-stock')
        self.assertEqual(surplus_plan('admin', self.agent.pk, ingredient['sku'])['sell'], ingredient['quantity'])
        SystemSetting.objects.update_or_create(key='system_mcp_config', defaults={'value': {'enabled': True}})
        session = MarketSession.objects.create(pk='protected-market-session', owner_id='admin',
            actor_id=self.agent.pk, actor_name=self.agent.name, mode='mcp', expires_at=self.now + timedelta(minutes=5))
        MarketRuntime.objects.create(pk=session.pk, agent_token='agent-token', process_id=1)
        trade(session, self.agent, 'protected-market-sale', {'kind': 'sell_combat_material',
            'material_id': ingredient['sku'][len('combat.'):], 'quantity': ingredient['quantity']},
            now=self.now, protect_goals=True)
        self.assertEqual(surplus_plan('admin', self.agent.pk, ingredient['sku'])['sell'], 0)
        goal.status = 'invalid'
        goal.save(update_fields=['status', 'updated_at'])
        self.assertEqual(surplus_plan('admin', self.agent.pk, ingredient['sku'])['sell'], ingredient['quantity'])

    def test_invalid_goal_is_visible_but_releases_slot_and_materials_on_read(self):
        from .blacksmith_goals import register, summary, requirements
        template = template_options(self.catalog, self.profile, self.rule)[0]
        goal = register('admin', self.agent.pk, self.rule['id'], template['template_id'], 'route-invalid')
        with patch('system_settings.agent_world.blacksmith_goals.template_options', return_value=[]):
            state = summary('admin', self.agent.pk)
            self.assertEqual((state['free_slots'], len(state['goals'])), (3, 0))
            self.assertEqual(state['invalid_goals'][0]['id'], goal.pk)
            self.assertFalse(requirements('admin', self.agent.pk))
        goal.refresh_from_db()
        self.assertEqual(goal.status, 'active', '图鉴查询不能改写同步状态')

    def test_market_marking_waits_when_all_stock_is_for_goal(self):
        from .blacksmith_goals import register
        from .market_disposition import enqueue
        from .market_disposition_worker import run as run_worker
        from .market_plan_models import MarketDisposition
        template = template_options(self.catalog, self.profile, self.rule)[0]
        register('admin', self.agent.pk, self.rule['id'], template['template_id'], 'market-marking')
        sku = self.rule['ingredients'][0]['sku']
        task = enqueue('admin', self.agent.pk, sku, 1, source='stock', operation='goal-stock')
        with patch('system_settings.agent_world.market_disposition_worker.choose_scene',
                   side_effect=AssertionError('全部受保护的材料不得进入处置模型')):
            run_worker(owner='admin')
        task.refresh_from_db()
        self.assertEqual(task.status, 'done')
        self.assertFalse(MarketDisposition.objects.filter(owner_id='admin', actor_id=self.agent.pk, sku=sku).exists())

    def test_frozen_v2_piece_preempts_goal_hold_without_double_reserving(self):
        from .blacksmith_goals import register, requirements
        template = template_options(self.catalog, self.profile, self.rule)[0]
        goal = register('admin', self.agent.pk, self.rule['id'], template['template_id'], 'frozen-v2')
        self.grant(1, key='free-after-frozen')
        action, _ = self.confirmed_action('frozen-v2-piece')
        state = action.snapshot
        state['version'] = 2
        state['current']['goal_id'] = goal.pk
        action.snapshot = state
        action.save(update_fields=['snapshot'])
        sku = self.rule['ingredients'][0]['sku']
        self.assertEqual(requirements('admin', self.agent.pk)[sku], 0)
        self.assertEqual(sum(row['quantity'] for row in available_pool('admin', self.agent.pk,
            protect_goals=True) if row['sku'] == sku), self.rule['ingredients'][0]['quantity'])

    def test_v2_sync_rejects_tampered_goal_selection_even_after_rehash(self):
        from utils.sync_manager import SyncError
        self.run_one()
        source = self.data()
        action = next(row for row in source if row['model'] == 'system_settings.worldaction'
                      and row['fields']['snapshot'].get('blacksmith'))
        for mutate in (
                lambda state: state.update(registered_count=0),
                lambda state: next(row for row in state['decisions'] if row['phase'] == 'type').update(goal_id='missing'),
                lambda state: next(row for row in state['decisions'] if row['phase'] == 'band').update(choice='20-30')):
            broken = copy.deepcopy(source)
            target = next(row for row in broken if row['model'] == action['model'] and row['pk'] == action['pk'])
            mutate(target['fields']['snapshot'])
            self.rehash(broken)
            with self.assertRaises(SyncError):
                validate_source(broken, metadata(broken))

    def test_v2_merge_rejects_conflicting_completion_of_same_goal(self):
        from utils.sync_manager import SyncError
        self.run_one()
        local = self.data()
        remote = copy.deepcopy(local)
        goal = next(row for row in remote if row['model'] == 'system_settings.blacksmithgoal')
        goal['fields']['operation_id'] = 'other-device:0'
        with self.assertRaises(SyncError):
            validate_conflicts(local, remote)

    def test_failed_piece_keeps_goal_and_materials(self):
        from .blacksmith_runner import run_blacksmith_opportunity
        AgentExecutionLease.objects.update(token='', until=None)
        WorldActionRuntime.objects.update(token='', until=None)

        def choose(owner, state, choices, **kwargs):
            scene = kwargs['scene']
            requested = {'blacksmith_goal_count': '1', 'blacksmith_level_band': '1-10',
                         'blacksmith_slot': '1-10:weapon', 'blacksmith_type': 'equip.training_sword'}
            return requested.get(scene, next(iter(choices))), {}

        with patch('system_settings.decision.routing.choose_connections', side_effect=choose), \
             patch('system_settings.agent_world.blacksmith_service.outcome', side_effect=RuntimeError('模拟打造失败')):
            run_blacksmith_opportunity(self.task, key='failed-goal', manual=True)
        self.assertEqual(BlacksmithGoal.objects.filter(status='active').count(), 1)
        self.assertFalse(BlacksmithOperation.objects.exists())
        self.assertTrue(all(stock_quantity(self.agent.pk, 'admin', row['sku']) == row['quantity']
                            for row in self.rule['ingredients']))

    def goal_choice(self, action, agent, phase, state, choices, *, count='1'):
        from .blacksmith_decisions import SCENES
        choice = {'goal_count': count, 'band': '1-10', 'slot': '1-10:weapon',
                  'type': 'equip.training_sword'}[phase]
        self.assertIn(choice, choices)
        return {'piece_index': action.snapshot['cursor'], 'phase': phase, 'scene': SCENES[phase],
                'choice': choice, 'source': 'system', 'reason': '系统选择说明：隔离测试合法选择。'}

    def test_stopped_goal_registration_remains_syncable_at_each_incomplete_stage(self):
        from .blacksmith_runner import run_blacksmith_opportunity
        AgentExecutionLease.objects.update(token='', until=None)
        WorldActionRuntime.objects.update(token='', until=None)
        for stop_phase in ('band', 'slot', 'type'):
            with self.subTest(phase=stop_phase):
                def choose(action, agent, phase, state, choices):
                    if phase == stop_phase:
                        raise ValueError('模拟登记中途候选失效')
                    return self.goal_choice(action, agent, phase, state, choices)

                key = 'stopped-registration-' + stop_phase
                with patch('system_settings.agent_world.blacksmith_goal_runner.choose', side_effect=choose), \
                     patch('system_settings.agent_world.action_schedule.select_agent', return_value=self.agent):
                    run_blacksmith_opportunity(self.task, key=key, manual=True)
                action = WorldAction.objects.get(pk=key)
                self.assertEqual((action.status, action.snapshot['phase']), ('skipped', 'done'))
                self.assertEqual(action.snapshot['remaining_registrations'], 1)
                data = self.data()
                validate_source(data, metadata(data))
        self.assertFalse(BlacksmithGoal.objects.exists())
        self.assertFalse(BlacksmithOperation.objects.exists())

    def test_stopped_registration_keeps_completed_choices_and_survives_repeated_restore(self):
        from system_settings.tests import MemoryStorageClient
        from utils.sync_manager import SyncManager, SyncError
        from .blacksmith_runner import run_blacksmith_opportunity
        AgentExecutionLease.objects.update(token='', until=None)
        WorldActionRuntime.objects.update(token='', until=None)

        def choose(action, agent, phase, state, choices):
            if action.snapshot['registered_count'] == 1:
                raise ValueError('登记第二件前停止')
            return self.goal_choice(action, agent, phase, state, choices, count='2')

        with patch('system_settings.agent_world.blacksmith_goal_runner.choose', side_effect=choose):
            run_blacksmith_opportunity(self.task, key='partly-registered', manual=True)
        goal = BlacksmithGoal.objects.get()
        self.assertEqual(goal.status, 'active')
        manager = SyncManager(MemoryStorageClient(), '/backup')
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        for _ in range(2):
            manager.apply_snapshot_data(copy.deepcopy(data), meta, full_overwrite=True)
            self.assertEqual(BlacksmithGoal.objects.get().pk, goal.pk)
            self.assertFalse(BlacksmithOperation.objects.exists())
            self.assertEqual(stamina(self.agent), Decimal(100))
        for mutate in (
                lambda state: state.update(registered_count=0),
                lambda state: next(row for row in state['decisions'] if row['phase'] == 'type').update(goal_id='missing')):
            broken = copy.deepcopy(data)
            action = next(row for row in broken if row['model'] == 'system_settings.worldaction'
                          and row['pk'] == 'partly-registered')
            mutate(action['fields']['snapshot'])
            self.rehash(broken)
            with self.assertRaises(SyncError):
                validate_source(broken, metadata(broken))

    def test_exhausted_registration_retries_sync_but_live_unfinished_done_is_rejected(self):
        from utils.sync_manager import SyncError
        from system_settings.decision.jev import DecisionUnavailable
        from .blacksmith_runner import run_blacksmith_opportunity
        AgentExecutionLease.objects.update(token='', until=None)
        WorldActionRuntime.objects.update(token='', until=None)

        def choose(action, agent, phase, state, choices):
            if phase == 'slot':
                raise DecisionUnavailable('模拟决策连接不可用')
            return self.goal_choice(action, agent, phase, state, choices)

        with patch('system_settings.agent_world.blacksmith_goal_runner.choose', side_effect=choose):
            for _ in range(3):
                run_blacksmith_opportunity(self.task, key='exhausted-registration', manual=True)
        action = WorldAction.objects.get(pk='exhausted-registration')
        self.assertEqual((action.status, action.snapshot['phase']), ('failed', 'done'))
        data = self.data()
        validate_source(data, metadata(data))
        row = next(row for row in data if row['model'] == 'system_settings.worldaction'
                   and row['pk'] == action.pk)
        row['fields']['status'] = 'claimed'
        self.rehash(data)
        with self.assertRaisesRegex(SyncError, '目标登记尚未完成'):
            validate_source(data, metadata(data))

    def test_completed_goal_is_removed_from_active_slots_and_sync_rejects_missing_receipt(self):
        from utils.sync_manager import SyncError
        operation, _ = self.run_one()
        self.assertEqual(BlacksmithGoal.objects.filter(status='active').count(), 0)
        self.assertEqual(BlacksmithGoal.objects.get(operation_id=operation.pk).status, 'completed')
        data = self.data()
        goal = next(row for row in data if row['model'] == 'system_settings.blacksmithgoal')
        goal['fields']['operation_id'] = 'missing-operation'
        self.rehash(data)
        with self.assertRaises(SyncError):
            validate_source(data, metadata(data))

    def test_incomplete_or_tampered_sources_are_rejected_even_after_rehash(self):
        from utils.sync_manager import SyncError
        operation, _ = self.run_one()
        original = self.data()
        validate_source(original, metadata(original))
        cases = {}
        cases['missing-energy'] = [row for row in copy.deepcopy(original) if not
            (row['model'] == 'system_settings.worldaction' and row['fields']['snapshot'].get('blacksmith_energy'))]
        cases['missing-forge'] = [row for row in copy.deepcopy(original) if not
            (row['model'] == 'system_settings.combatfact' and row['fields']['kind'] == 'forge')]
        material = copy.deepcopy(original)
        receipt = next(row for row in material if row['model'] == 'system_settings.blacksmithoperation')
        receipt['fields']['snapshot']['materials'][0]['quantity'] += 1
        cases['tampered-material'] = material
        missing = [row for row in copy.deepcopy(original) if row['model'] != 'system_settings.blacksmithoperation']
        cases['missing-receipt'] = missing
        for label, data in cases.items():
            with self.subTest(case=label), self.assertRaises(SyncError):
                self.rehash(data)
                validate_source(data, metadata(data))
        remote = copy.deepcopy(original)
        receipt = next(row for row in remote if row['model'] == 'system_settings.blacksmithoperation')
        receipt['fields']['reason'] = '另一设备生成不同事实'
        with self.assertRaisesRegex(SyncError, '两台设备产生不同结果'):
            validate_conflicts(original, remote)
        validate_conflicts(original, copy.deepcopy(original))

    def test_version_manifests_and_repeated_full_restore_preserve_single_result(self):
        from system_settings.tests import MemoryStorageClient
        from utils.sync_manager import SyncManager, SyncError
        from .combat.sync import validate_source as validate_combat, metadata as combat_metadata
        operation, _ = self.run_one()
        manager = SyncManager(MemoryStorageClient(), '/backup')
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        self.assertEqual(meta['combat_schema_version'], 16)
        self.assertEqual(meta['blacksmith_schema_version'], 2)
        with self.assertRaisesRegex(SyncError, '版本过新'):
            validate_source(data, {**metadata(data), 'blacksmith_schema_version': 3})
        with self.assertRaisesRegex(SyncError, '新版同步版本'):
            validate_source(data, {**metadata(data), 'blacksmith_schema_version': 0})
        with self.assertRaisesRegex(SyncError, '版本过新'):
            validate_combat(data, {**combat_metadata(data), 'combat_schema_version': 17})
        saved = copy.deepcopy(operation.result)
        for _ in range(2):
            manager.apply_snapshot_data(copy.deepcopy(data), meta, full_overwrite=True)
            self.assertEqual(BlacksmithOperation.objects.count(), 1)
            self.assertEqual(BlacksmithOperation.objects.get(pk=operation.pk).result, saved)
            self.assertEqual(EquipmentInstance.objects.filter(pk=saved['equipment_id']).count(), 1)
            current = manager.build_snapshot_data()
            validate_source(current, metadata(current))
            validate_combat(current, combat_metadata(current))

    def test_real_three_way_merge_restores_blacksmith_metadata_without_repeating_forge(self):
        from system_settings.tests import MemoryStorageClient
        from utils.sync_manager import SyncManager
        operation, _ = self.run_one()
        manager = SyncManager(MemoryStorageClient(), '/backup')
        original = manager.publish_v2_snapshot(source='blacksmith-test')
        catalog = catalog_for('admin')
        catalog.version += 1
        catalog.rules[self.rule['id']]['version'] = catalog.version
        catalog.rules[self.rule['id']]['ingredients'][0]['quantity'] += 1
        catalog.save(update_fields=['version', 'rules', 'updated_at'])
        saved = copy.deepcopy(operation.result)
        stock = {row['sku']: row['quantity'] for row in material_pool(self.agent.pk, 'admin')}
        baseline = original['meta']['snapshot_id']
        for _ in range(2):
            with patch.object(manager, 'apply_snapshot_data', wraps=manager.apply_snapshot_data) as restore:
                merged, _ = manager._merge_while_locked(lambda *_args: None, base_snapshot_id=baseline,
                    source='blacksmith-test', runner_id='isolated', should_abort=None)
            self.assertEqual(restore.call_count, 1, '必须经过真实合并恢复路径')
            self.assertEqual(restore.call_args.kwargs['remote_meta']['blacksmith_schema_version'], 2)
            self.assertEqual(restore.call_args.kwargs['remote_meta']['blacksmith_operations'], [operation.pk])
            self.assertEqual(catalog_for('admin').version, 2)
            self.assertEqual(BlacksmithOperation.objects.get(pk=operation.pk).result, saved)
            self.assertEqual(BlacksmithOperation.objects.count(), 1)
            self.assertEqual(EquipmentInstance.objects.filter(pk=saved['equipment_id']).count(), 1)
            self.assertEqual({row['sku']: row['quantity'] for row in material_pool(self.agent.pk, 'admin')}, stock)
            baseline = merged['meta']['snapshot_id']

    def test_retired_current_material_keeps_history_restorable_but_removes_new_choice(self):
        from system_settings.tests import MemoryStorageClient
        from utils.sync_manager import SyncManager
        from .blacksmith_catalog import MATERIALS, validate_rule
        from .blacksmith_candidates import recipe_options
        from .blacksmith_rolls import validate_snapshot
        operation, _ = self.run_one()
        manager = SyncManager(MemoryStorageClient(), '/backup')
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        current_materials = copy.deepcopy(MATERIALS)
        current_materials.pop(self.rule['ingredients'][0]['sku'])
        with patch('system_settings.agent_world.blacksmith_catalog.MATERIALS', current_materials):
            validate_snapshot(operation.snapshot)
            validate_source(data, metadata(data))
            with self.assertRaises(ValueError):
                validate_rule(self.rule)
            self.assertFalse(recipe_options({self.rule['id']: self.rule}, self.catalog, self.profile,
                                           material_pool(self.agent.pk, 'admin'), Decimal(100)))
            manager.apply_snapshot_data(copy.deepcopy(data), meta, full_overwrite=True)
            self.assertEqual(BlacksmithOperation.objects.get(pk=operation.pk).result, operation.result)

    def test_restored_manual_pending_piece_requires_new_local_execution_permission(self):
        from django.contrib.auth.models import User
        from rest_framework.test import APIClient
        from system_settings.decision.jev import DecisionUnavailable
        from system_settings.models import AgentRunRecord
        from system_settings.tests import MemoryStorageClient
        from utils.sync_manager import SyncManager
        from .blacksmith_authorization import authorized
        from .blacksmith_runner import tick_blacksmith
        self.grant(1, key='manual-recovery-extra-stock')
        user = User.objects.create_superuser('admin', password='isolated')
        action, _ = self.confirmed_action('manual-pending-restore')
        item = LifeItem.objects.create(pk=action.pk, owner_id='admin', actor_id=self.agent.pk,
            activity='blacksmith', task_id=self.task.pk, status='running', original_at=self.now,
            scheduled_at=self.now, context={'manual': True})
        action.record = AgentRunRecord.objects.create(task=self.task, task_name=self.task.name,
            agent=self.agent, agent_name=self.agent.name, trigger='手动执行', status='running', summary='等待提交已确认装备')
        action.snapshot['life_item_id'] = item.pk
        action.save(update_fields=['record', 'snapshot'])
        manager = SyncManager(MemoryStorageClient(), '/backup')
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        self.assertFalse(any(row['model'] == 'system_settings.worldactionruntime' for row in data))
        manager.apply_snapshot_data(copy.deepcopy(data), meta, full_overwrite=True)
        self.assertFalse(WorldActionRuntime.objects.get(pk='world').enabled)
        # A newly restored device has no old local agent/world execution leases.
        AgentExecutionLease.objects.update(token='', until=None)
        with patch('system_settings.decision.routing.choose_connections', side_effect=AssertionError('恢复不得调用模型')):
            tick_blacksmith()
        self.assertFalse(BlacksmithOperation.objects.exists(),
                         '复制的 manual 标记不能授权另一设备自动结算尚未完成的打造')
        action.refresh_from_db()
        self.assertEqual((action.status, action.snapshot['cursor'], action.snapshot['phase']), ('claimed', 0, 'commit'))
        self.assertFalse(authorized(action.pk, manual=True))
        client = APIClient()
        client.force_authenticate(user)
        before = stamina(self.agent)
        with patch('system_settings.decision.routing.choose_connections', side_effect=DecisionUnavailable('暂时不可用')):
            self.post_manual(client, self.task, self.agent.pk)
        action.refresh_from_db()
        self.assertEqual((action.status, action.snapshot['cursor'], action.snapshot['phase']), ('claimed', 1, 'continue'))
        self.assertTrue(authorized(action.pk, manual=True))
        self.assertFalse(WorldActionRuntime.objects.get(pk='world').enabled)
        self.assertEqual(LifeItem.objects.filter(activity='blacksmith').count(), 1)
        self.assertEqual(BlacksmithOperation.objects.filter(opportunity_id=action.pk).count(), 1)
        operation = BlacksmithOperation.objects.get(opportunity_id=action.pk)
        saved = copy.deepcopy(operation.result)
        after = stamina(self.agent)
        self.assertAlmostEqual(before - after, Decimal(2), delta=Decimal('.01'))
        stock = material_pool(self.agent.pk, 'admin')
        with patch('system_settings.decision.routing.choose_connections', return_value=('finish', {})):
            self.post_manual(client, self.task, self.agent.pk)
        action.refresh_from_db()
        self.assertEqual((action.status, action.snapshot['cursor'], action.snapshot['phase']), ('success', 1, 'done'))
        self.assertEqual(LifeItem.objects.filter(activity='blacksmith').count(), 1)
        self.assertEqual(BlacksmithOperation.objects.count(), 1)
        self.assertEqual(BlacksmithOperation.objects.get(pk=operation.pk).result, saved)
        self.assertEqual(EquipmentInstance.objects.filter(pk=saved['equipment_id']).count(), 1)
        self.assertEqual(material_pool(self.agent.pk, 'admin'), stock)
        self.assertAlmostEqual(after, stamina(self.agent), delta=Decimal('.01'))

    def test_manual_recovery_requires_matching_owner_actor_task_and_life_identity(self):
        from django.contrib.auth.models import User
        from rest_framework.test import APIClient
        from .blacksmith_authorization import authorized, reset_authorizations
        from .blacksmith_runner import pending_manual_item
        from .life_models import LifeProfile
        action, _ = self.confirmed_action('manual-scope-check')
        item = LifeItem.objects.create(pk=action.pk, owner_id='admin', actor_id=self.agent.pk,
            activity='blacksmith', task_id=self.task.pk, status='running', original_at=self.now,
            scheduled_at=self.now, context={'manual': True})
        action.snapshot['life_item_id'] = item.pk
        action.save(update_fields=['snapshot'])
        reset_authorizations()
        WorldActionRuntime.objects.filter(pk='world').update(enabled=False, token='', until=None)
        AgentExecutionLease.objects.update(token='', until=None)
        self.assertEqual(pending_manual_item(self.task, self.agent.pk, 'admin').pk, item.pk)
        self.assertIsNone(pending_manual_item(self.task, self.agent.pk, 'other-owner'))
        other = Agent.objects.create(name='另一位居民', model=self.agent.model)
        other_task = AgentTask.objects.create(task_kind='blacksmith', name='另一打造能力', enabled=True,
            agent=self.agent, agent_ids=[self.agent.pk], blacksmith_config={'owner_id': 'admin'})
        for resident in (self.agent, other):
            LifeProfile.objects.get_or_create(pk=resident.pk, defaults={'owner_id': 'admin'})
        self.config.settings['agent_ids'].append(other.pk)
        self.config.save(update_fields=['settings'])
        client = APIClient()
        client.force_authenticate(User.objects.create_superuser('admin', password='isolated'))
        for task, actor in ((self.task, other.pk), (other_task, self.agent.pk)):
            with patch('system_settings.decision.routing.choose_connections', side_effect=AssertionError('无可制作材料不得调用模型')):
                self.post_manual(client, task, actor)
            self.assertFalse(authorized(action.pk, manual=True))
            self.assertTrue(WorldAction.objects.filter(task_id=task.pk, actor_id=actor,
                snapshot__blacksmith=True).exclude(pk=action.pk).exists())
        action.refresh_from_db()
        self.assertEqual((action.status, action.snapshot['phase']), ('claimed', 'commit'))
        self.assertFalse(BlacksmithOperation.objects.exists())
        for field, invalid in (('owner_id', 'other-owner'), ('actor_id', other.pk),
                               ('task_id', other_task.pk), ('activity', 'alchemy'), ('status', 'cancelled')):
            with self.subTest(field=field):
                original = getattr(item, field)
                setattr(item, field, invalid)
                item.save(update_fields=[field])
                self.assertIsNone(pending_manual_item(self.task, self.agent.pk, 'admin'))
                setattr(item, field, original)
                item.save(update_fields=[field])
        for context in ({'manual': False}, {'manual': True, 'execution_key': 'another-action'}):
            item.context = context
            item.save(update_fields=['context'])
            self.assertIsNone(pending_manual_item(self.task, self.agent.pk, 'admin'))

    def test_unapproved_checkpoint_releases_materials_after_task_is_disabled(self):
        from .blacksmith_authorization import reset_authorizations
        from .blacksmith_runner import tick_blacksmith
        action, _ = self.confirmed_action('restored-then-disabled')
        reset_authorizations()
        WorldActionRuntime.objects.filter(pk='world').update(enabled=False)
        self.task.enabled = False
        self.task.save(update_fields=['enabled'])
        tick_blacksmith()
        action.refresh_from_db()
        self.assertNotEqual(action.status, 'claimed', '无执行许可仍必须允许停用活动释放预留')
        self.assertEqual(action.snapshot['current'], {})
        self.assertFalse(BlacksmithOperation.objects.exists())
        available = Counter()
        for row in available_pool('admin', self.agent.pk):
            available[row['sku']] += row['quantity']
        for row in self.rule['ingredients']:
            self.assertEqual(available[row['sku']], row['quantity'])

    def test_original_forge_history_survives_market_transfer_and_shop_sale(self):
        from .market_models import MarketSession, MarketRuntime, MarketListing
        from .market_service import trade
        action, frozen = self.confirmed_action()
        operation = self.commit(action, frozen)
        gear_id = operation.result['equipment_id']
        buyer = Agent.objects.create(name='隔离买家', model=self.agent.model)
        ensure('admin', buyer)
        self.config.settings['agent_ids'].append(buyer.pk)
        self.config.save(update_fields=['settings'])
        AgentExecutionLease.objects.create(agent=buyer, token='buyer-token', until=self.now + timedelta(hours=1))
        SystemSetting.objects.update_or_create(key='system_mcp_config', defaults={'value': {'enabled': True}})
        sessions = []
        for resident, token in [(self.agent, 'agent-token'), (buyer, 'buyer-token')]:
            session = MarketSession.objects.create(pk='session-' + resident.pk, owner_id='admin',
                actor_id=resident.pk, actor_name=resident.name, mode='mcp', expires_at=self.now + timedelta(minutes=5))
            MarketRuntime.objects.create(pk=session.pk, agent_token=token, process_id=1)
            sessions.append(session)
        append(self.profile, 'confirmed-list', 'gear_prepare', {'equipment_id': gear_id, 'action': 'list'})
        trade(sessions[0], self.agent, 'list-forge', {'kind': 'list_combat_equipment', 'equipment_id': gear_id, 'unit_price': '10.00'}, now=self.now)
        listing = MarketListing.objects.get(pk='list-forge')
        trade(sessions[1], buyer, 'buy-forge', {'kind': 'buy_listing', 'listing_id': listing.pk,
              'quantity': 1, 'version': listing.version}, now=self.now)
        self.assertEqual(EquipmentInstance.objects.get(pk=gear_id).actor_id, buyer.pk)
        trade(sessions[1], buyer, 'sell-forge', {'kind': 'sell_combat_equipment', 'equipment_id': gear_id}, now=self.now)
        self.assertTrue(EquipmentInstance.objects.get(pk=gear_id).sold)
        recorded = history('admin', self.agent.pk)['list'][0]['operations'][0]
        self.assertEqual(recorded['result'], operation.result)
        validate_source(self.data(), metadata(self.data()))
