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
from .blacksmith_models import BlacksmithOperation
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
            selected = {'blacksmith_level_band': '1-10', 'blacksmith_slot': '1-10:weapon',
                        'blacksmith_type': 'equip.training_sword', 'blacksmith_continue': 'finish'}[scene]
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
        continuation = next(state for scene, state in scenes if scene == 'blacksmith_continue')
        self.assertEqual(continuation['completed'][0]['result']['equipment_id'], operation.result['equipment_id'])
        action = WorldAction.objects.get(pk='forge-run')
        self.assertEqual((action.snapshot['cursor'], action.snapshot['phase']), (1, 'done'))
        self.assertEqual(len(action.result['stages']), 4)
        data = self.data()
        validate_source(data, metadata(data))
        from .combat.sync import validate_source as validate_combat, metadata as combat_metadata
        validate_combat(data, combat_metadata(data))

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
        self.assertEqual(meta['combat_schema_version'], 12)
        self.assertEqual(meta['blacksmith_schema_version'], 1)
        with self.assertRaisesRegex(SyncError, '版本过新'):
            validate_source(data, {**metadata(data), 'blacksmith_schema_version': 2})
        with self.assertRaisesRegex(SyncError, '新版同步版本'):
            validate_source(data, {**metadata(data), 'blacksmith_schema_version': 0})
        with self.assertRaisesRegex(SyncError, '版本过新'):
            validate_combat(data, {**combat_metadata(data), 'combat_schema_version': 13})
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
            self.assertEqual(restore.call_args.kwargs['remote_meta']['blacksmith_schema_version'], 1)
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
