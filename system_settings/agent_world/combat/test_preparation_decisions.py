"""Regressions for sequential gear decisions and resale across holding periods."""
import json
from datetime import timedelta
from unittest.mock import patch

from django.apps import apps
from django.core import serializers
from django.test import TestCase

from system_settings.models import Agent, AIModel, AIProvider, SystemSetting
from .equipment_market import pending_preparation_actions
from .explorations import request
from .facts import append
from .models import CombatFact, EquipmentInstance
from .preparation import prepare, context
from .preparation_decision import _decide_old_equipment, _record_gear_decision, decided_for_sale_or_listing, _process_equipment
from .profiles import ensure, equip
from .store import install
from .sync import validate_source
from ..market_models import MarketConfig
from ..market_service import trade
from ..market_sessions import enter
from ..market_sync import reconcile_market


class PreparationEquipmentTests(TestCase):
    def setUp(self):
        self.catalog = install()
        provider = AIProvider.objects.create(name='test', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='test', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='A', model=model, money=1000)
        self.profile = ensure('admin', self.agent)
        self.starter = EquipmentInstance.objects.get(pk=self.profile.loadout['weapon'])

    def test_equipment_decision_receives_dungeon_and_weapon_elements(self):
        item = EquipmentInstance.objects.create(pk='element-candidate', owner_id='admin', actor_id=self.agent.pk,
            catalog_id=self.catalog.version, template_id=self.starter.template_id,
            snapshot={**self.starter.snapshot, 'element': 'water'})
        run = request('admin', self.agent, 'element-context', {})
        location = {'id': 'dungeon.sprout_meadow', 'name': '新芽草甸',
                    'monsters': [{'id': 'monster.slime', 'element': 'water', 'resists': {'earth': -.1}}]}
        with patch('system_settings.agent_world.combat.preparation_decision._choice',
                   return_value=('sell', {'choice': 'sell', 'source': 'decision_model'})) as choose:
            _process_equipment(run, self.agent, self.profile, self.catalog, {}, lambda: None, {},
                               dungeon_context=location)
        state = choose.call_args.args[3]
        self.assertEqual(state['candidate_equipment']['id'], item.pk)
        self.assertEqual(state['candidate_equipment']['element'], 'water')
        self.assertEqual(state['selected_dungeon'], location)
        self.assertEqual(next(iter(state['current_slot_equipment'].values()))['element'], '')

    def test_sale_and_listing_marks_skip_next_structured_and_text_preparation(self):
        marked = []
        for action in ('sell', 'list'):
            item = EquipmentInstance.objects.create(pk='marked-' + action, owner_id='admin',
                actor_id=self.agent.pk, catalog_id=self.catalog.version,
                template_id=self.starter.template_id, snapshot=self.starter.snapshot)
            marked.append(item.pk)
            append(self.profile, 'intent-' + action, 'gear_prepare',
                   {'equipment_id': item.pk, 'action': action, 'decision_source': 'decision_model'})
        fresh = EquipmentInstance.objects.create(pk='unmarked', owner_id='admin', actor_id=self.agent.pk,
            catalog_id=self.catalog.version, template_id=self.starter.template_id, snapshot=self.starter.snapshot)
        run = request('admin', self.agent, 'skip-decided-gear', {})
        shown = {row['id'] for row in context(run)['adventure']['equipment']}
        self.assertTrue(shown.isdisjoint(marked))
        self.assertIn(self.starter.pk, shown)  # The current loadout is still comparison evidence.
        self.assertIn(fresh.pk, shown)
        with patch('system_settings.agent_world.combat.preparation_decision._choice',
                   return_value=('sell', {'choice': 'sell', 'source': 'decision_model'})) as choose:
            _process_equipment(run, self.agent, self.profile, self.catalog, {}, lambda: None, {})
        self.assertEqual([call.args[2] for call in choose.call_args_list], ['equipment:' + fresh.pk])
        with patch('system_settings.agent_world.combat.preparation_decision._choice') as choose:
            _process_equipment(run, self.agent, self.profile, self.catalog, {}, lambda: None, {})
        choose.assert_not_called()

    def test_two_replacements_do_not_rejudge_an_already_considered_candidate(self):
        for identity, offset in [('candidate-a', 2), ('candidate-b', 1)]:
            EquipmentInstance.objects.create(pk=identity, owner_id='admin', actor_id=self.agent.pk,
                catalog_id=self.catalog.version, template_id=self.starter.template_id,
                snapshot=self.starter.snapshot, created_at=self.starter.created_at + timedelta(seconds=offset))
        run = request('admin', self.agent, 'sequential-replacement', {})
        asked = []

        def choice(run, agent, question_id, state, choices, fallback, instructions, **kwargs):
            asked.append(question_id)
            selected = {'dungeon_id': 'dungeon.sprout_meadow', 'duration_seconds': '1800',
                        'style_id': 'style.balanced', 'red_potion_count': '0',
                        'blue_potion_count': '0'}.get(question_id)
            if selected is None:
                selected = 'replace' if question_id.startswith('equipment:') else 'leave' if 'leave' in choices else 'sell'
            self.assertIn(selected, choices)
            return selected, {'choice': selected, 'source': 'decision_model', 'confidence': 1.0}

        with patch('system_settings.decision.routing.jev_enabled', return_value=True), \
             patch('system_settings.agent_world.combat.preparation_decision._choice', side_effect=choice):
            result = prepare(run.pk)
        self.assertEqual(result.status, 'active')
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.loadout['weapon'], 'candidate-b')
        facts = CombatFact.objects.filter(actor_id=self.agent.pk, kind='gear_prepare',
                                         payload__equipment_id='candidate-a')
        self.assertEqual(set(facts.values_list('payload__action', flat=True)), {'replace'})
        self.assertFalse(any(question.startswith('displaced:candidate-b:candidate-a') for question in asked))
        self.assertEqual(sum(self.starter.pk in question for question in asked), 1)
        self.assertEqual(result.snapshot['prepared_plan']['equipment']['weapon'], 'candidate-b')

    def test_untradable_displaced_weapons_can_be_retained_without_market_options(self):
        from .explorations import finish
        equip('admin', self.agent, 'remove-starter', {'weapon': None})
        for bound, locked in [(True, False), (False, True)]:
            with self.subTest(bound=bound, locked=locked):
                self.starter.bound, self.starter.locked = bound, locked
                self.starter.save()
                run = request('admin', self.agent, f'untradable-{bound}', {})
                with patch('system_settings.agent_world.combat.preparation_decision._choice',
                           return_value=('keep', {'choice': 'keep', 'source': 'decision_model'})) as choice:
                    _decide_old_equipment(run, self.agent, self.profile, self.catalog,
                                         self.starter, {}, {}, 'old', lambda: None)
                self.assertEqual(set(choice.call_args.args[4]), {'keep', 'leave'})
                self.starter.refresh_from_db()
                self.assertTrue(self.starter.retained_for_adventure)
                finish(run.pk)
                append(self.profile, f'legacy-intent-{bound}', 'gear_prepare',
                       {'equipment_id': self.starter.pk, 'action': 'list', 'decision_source': 'decision_model'})
                self.assertEqual(pending_preparation_actions('admin', self.agent.pk), [])

    def test_untradable_weapon_leave_preserves_previous_backup_state(self):
        from .explorations import finish
        equip('admin', self.agent, 'remove-bound', {'weapon': None})
        first = request('admin', self.agent, 'bound-first-keep', {})
        self.assertTrue(_record_gear_decision(first, self.starter, 'keep', 'decision_model'))
        finish(first.pk)
        run = request('admin', self.agent, 'bound-leave', {})
        with patch('system_settings.agent_world.combat.preparation_decision._choice',
                   return_value=('leave', {'choice': 'leave', 'source': 'decision_model'})):
            _decide_old_equipment(run, self.agent, self.profile, self.catalog,
                                  self.starter, {}, {}, 'old', lambda: None)
        self.starter.refresh_from_db()
        self.assertTrue(self.starter.retained_for_adventure)
        self.assertTrue(CombatFact.objects.filter(exploration_id=run.pk, kind='gear_prepare',
                                                  payload__action='defer').exists())

    def test_resale_repurchase_withdrawal_and_sync_preserve_historical_transfers(self):
        # Make the deterministic starter fixture tradable without inventing loot provenance.
        self.starter.bound = False
        self.starter.save()
        equip('admin', self.agent, 'remove-starter', {'weapon': None})
        buyer = Agent.objects.create(name='B', model=self.agent.model, money=1000)
        buyer_profile = ensure('admin', buyer)
        SystemSetting.objects.create(key='system_mcp_config', value={'enabled': True})
        MarketConfig.objects.create(pk='admin', seed='test')
        sessions = {agent.pk: enter('admin', agent, 'session-' + agent.pk)
                    for agent in (self.agent, buyer)}

        def intent(profile, key):
            append(profile, key, 'gear_prepare', {'equipment_id': self.starter.pk,
                   'action': 'list', 'decision_source': 'decision_model'})

        def listing(agent, key):
            return trade(sessions[agent.pk], agent, key, {'kind': 'list_combat_equipment',
                         'equipment_id': self.starter.pk, 'unit_price': '1.00'})

        def buy(agent, offer, key):
            trade(sessions[agent.pk], agent, key, {'kind': 'buy_listing',
                  'listing_id': offer['listing_id'], 'version': 1, 'quantity': 1})

        intent(self.profile, 'first-intent')
        first = listing(self.agent, 'first-listing')
        self.assertEqual(pending_preparation_actions('admin', self.agent.pk), [])
        with self.assertRaisesMessage(ValueError, '没有待执行的上架决定'):
            listing(self.agent, 'duplicate-listing')
        buy(buyer, first, 'first-purchase')
        self.assertNotIn(self.starter.pk, decided_for_sale_or_listing(buyer.pk))
        intent(buyer_profile, 'second-intent')
        self.assertEqual(len(pending_preparation_actions('admin', buyer.pk)), 1)
        second = listing(buyer, 'second-listing')
        buy(self.agent, second, 'repurchase')
        self.assertNotIn(self.starter.pk, decided_for_sale_or_listing(self.agent.pk))
        intent(self.profile, 'third-intent')
        third = listing(self.agent, 'third-listing')
        trade(sessions[self.agent.pk], self.agent, 'withdraw-third', {'kind': 'withdraw',
              'listing_id': third['listing_id'], 'version': 1})
        self.assertEqual(pending_preparation_actions('admin', self.agent.pk), [])
        trade(sessions[self.agent.pk], self.agent, 'shop-sale', {'kind': 'sell_combat_equipment',
              'equipment_id': self.starter.pk})
        reconcile_market()
        data = json.loads(serializers.serialize('json', [row
            for model in apps.get_app_config('system_settings').get_models()
            if model.__name__ != 'CombatRuntime' for row in model.objects.all()]))
        validate_source(data)
        # Historical ownership is proven by transfers, not by trusting the latest owner alone.
        from utils.sync_manager import SyncError
        CombatFact.objects.filter(kind='gear_trade_in', payload__transaction_id='first-purchase').delete()
        with self.assertRaisesMessage(SyncError, '归属转移'):
            reconcile_market()

    def test_gear_decision_key_fits_within_sync_limits(self):
        from .preparation_decision import _gear_decision_key
        from system_settings.models import SyncEntityState
        key = _gear_decision_key('f' * 64, 'e' * 64, 'replace')
        self.assertLessEqual(len(key), 120)
        fact = append(self.profile, key, 'gear_prepare', {'equipment_id': self.starter.pk, 'action': 'replace', 'decision_source': 'test'})
        state = SyncEntityState.objects.filter(model_label='system_settings.combatfact', object_pk=key).first()
        self.assertIsNotNone(state)

    def test_kept_weapon_is_not_implicitly_sold_and_is_judged_once_per_preparation(self):
        item = EquipmentInstance.objects.create(pk='backup', owner_id='admin', actor_id=self.agent.pk,
            catalog_id=self.catalog.version, template_id=self.starter.template_id, snapshot=self.starter.snapshot)
        run = request('admin', self.agent, 'choose-backup', {})
        with patch('system_settings.agent_world.combat.preparation_decision._choice',
                   return_value=('keep', {'choice': 'keep', 'source': 'decision_model'})) as choose:
            _process_equipment(run, self.agent, self.profile, self.catalog, {}, lambda: None, {})
            _process_equipment(run, self.agent, self.profile, self.catalog, {}, lambda: None, {})
        self.assertEqual(choose.call_count, 1)
        item.refresh_from_db()
        self.assertTrue(item.retained_for_adventure)
        self.assertEqual(pending_preparation_actions('admin', self.agent.pk), [])
        from .queries import market_context
        self.assertNotIn(item.pk, {row['id'] for row in market_context('admin', self.agent)['equipment']})
        shown = next(row for row in context(run)['adventure']['equipment'] if row['id'] == item.pk)
        self.assertTrue(shown['retained_for_adventure'])

    def test_retained_weapon_survives_checkpoint_and_sync_and_rejects_tampering(self):
        from copy import deepcopy
        from .archive import append_checkpoint
        from .sync import metadata
        from utils.sync_manager import SyncError
        self.starter.bound = False
        self.starter.save()
        equip('admin', self.agent, 'backup-remove', {'weapon': None})
        run = request('admin', self.agent, 'backup-sync', {})
        self.assertTrue(_record_gear_decision(run, self.starter, 'keep', 'decision_model'))
        append_checkpoint(self.profile)
        data = json.loads(serializers.serialize('json', [row
            for model in apps.get_app_config('system_settings').get_models()
            if model.__name__ != 'CombatRuntime' for row in model.objects.all()]))
        meta = metadata(data)
        self.assertEqual(meta['combat_schema_version'], 17)
        validate_source(data, meta)
        corrupted = deepcopy(data)
        gear = next(row for row in corrupted if row['model'] == 'system_settings.equipmentinstance'
                    and row['pk'] == self.starter.pk)
        gear['fields']['retained_for_adventure'] = False
        with self.assertRaises(SyncError):
            validate_source(corrupted, meta)
        with self.assertRaises(SyncError):
            validate_source(data, {**meta, 'combat_schema_version': 16})
        from utils.sync_manager import SyncManager
        from ..life_config import config_for
        from ..cooking_catalog import catalog_for
        config_for('admin')
        catalog_for('admin')
        manager = SyncManager()
        snapshot = manager.build_snapshot_data()
        snapshot_meta = manager.build_snapshot_meta(data_list=snapshot)
        for _ in range(2):
            manager.apply_snapshot_data(deepcopy(snapshot), snapshot_meta)
            self.assertTrue(EquipmentInstance.objects.get(pk=self.starter.pk).retained_for_adventure)
            self.assertEqual(CombatFact.objects.filter(exploration_id=run.pk, kind='gear_prepare',
                                                     payload__action='keep').count(), 1)

    def test_backup_decision_failure_keeps_original_loadout_and_retention(self):
        item = EquipmentInstance.objects.create(pk='backup-fallback', owner_id='admin', actor_id=self.agent.pk,
            catalog_id=self.catalog.version, template_id=self.starter.template_id, snapshot=self.starter.snapshot,
            retained_for_adventure=True)
        run = request('admin', self.agent, 'backup-fallback', {})
        before = dict(self.profile.loadout)
        with patch('system_settings.agent_world.combat.preparation_decision._choice',
                   return_value=(None, {'choice': None, 'source': 'code_fallback'})):
            _process_equipment(run, self.agent, self.profile, self.catalog, {}, lambda: None, {})
        item.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.loadout, before)
        self.assertTrue(item.retained_for_adventure)
        self.assertEqual(pending_preparation_actions('admin', self.agent.pk), [])

    def test_text_preparation_can_choose_a_backup(self):
        item = EquipmentInstance.objects.create(pk='text-backup', owner_id='admin', actor_id=self.agent.pk,
            catalog_id=self.catalog.version, template_id=self.starter.template_id, snapshot=self.starter.snapshot)
        run = request('admin', self.agent, 'text-backup', {})
        plan = {'dungeon_id':'dungeon.sprout_meadow', 'duration_seconds':1800, 'style_id':'style.balanced',
                'equipment':{}, 'equipment_decisions':{item.pk:'keep'}, 'purchases':{}, 'potions':{}, 'reason':''}
        with patch('system_settings.decision.routing.jev_enabled', return_value=False), \
             patch('system_settings.agent_world.combat.food.choose',
                   return_value=(None, {'choice':'none', 'source':'test'})):
            result = prepare(run.pk, planner=lambda *_: plan)
        item.refresh_from_db()
        self.assertEqual(result.status, 'active')
        self.assertTrue(item.retained_for_adventure)

    def test_text_preparation_can_keep_a_displaced_bound_weapon(self):
        item = EquipmentInstance.objects.create(pk='text-replacement', owner_id='admin', actor_id=self.agent.pk,
            catalog_id=self.catalog.version, template_id=self.starter.template_id, snapshot=self.starter.snapshot)
        run = request('admin', self.agent, 'text-displaced-backup', {})
        plan = {'dungeon_id':'dungeon.sprout_meadow', 'duration_seconds':1800, 'style_id':'style.balanced',
                'equipment':{'weapon':item.pk}, 'equipment_decisions':{self.starter.pk:'keep'},
                'purchases':{}, 'potions':{}, 'reason':''}
        prompts = []
        def planner(agent, prompt, state):
            prompts.append((prompt, state))
            return plan
        with patch('system_settings.decision.routing.jev_enabled', return_value=False), \
             patch('system_settings.agent_world.combat.food.choose',
                   return_value=(None, {'choice':'none', 'source':'test'})):
            result = prepare(run.pk, planner=planner)
        self.profile.refresh_from_db()
        self.starter.refresh_from_db()
        self.assertEqual(result.status, 'active')
        self.assertEqual(self.profile.loadout['weapon'], item.pk)
        self.assertTrue(self.starter.retained_for_adventure)
        self.assertIn('换装后被替换下来的武器', prompts[0][0])
        shown = next(row for row in prompts[0][1]['adventure']['equipment'] if row['id'] == self.starter.pk)
        self.assertTrue(shown['bound'])

    def test_backup_ownership_resets_on_sale_and_repurchase(self):
        from .explorations import finish
        self.starter.bound = False
        self.starter.save()
        equip('admin', self.agent, 'holding-remove', {'weapon': None})
        buyer = Agent.objects.create(name='B', model=self.agent.model, money=1000)
        ensure('admin', buyer)
        SystemSetting.objects.create(key='system_mcp_config', value={'enabled': True})
        MarketConfig.objects.create(pk='admin', seed='test')

        def decide(agent, action, key):
            run = request('admin', agent, key, {})
            item = EquipmentInstance.objects.get(pk=self.starter.pk)
            self.assertTrue(_record_gear_decision(run, item, action, 'decision_model'))
            finish(run.pk)

        def list_and_buy(seller, purchaser, key):
            from ..market_sessions import close_session
            sessions = {agent.pk: enter('admin', agent, key + '-session-' + agent.pk)
                        for agent in (seller, purchaser)}
            listed = trade(sessions[seller.pk], seller, key + '-list', {'kind':'list_combat_equipment',
                'equipment_id':self.starter.pk, 'unit_price':'1.00'})
            trade(sessions[purchaser.pk], purchaser, key + '-buy', {'kind':'buy_listing',
                'listing_id':listed['listing_id'], 'version':1, 'quantity':1})
            item = EquipmentInstance.objects.get(pk=self.starter.pk)
            self.assertEqual(item.actor_id, purchaser.pk)
            self.assertFalse(item.retained_for_adventure)
            for session in sessions.values():
                close_session(session, 'test completed')

        decide(self.agent, 'keep', 'holding-keep-a')
        decide(self.agent, 'list', 'holding-list-a')
        list_and_buy(self.agent, buyer, 'holding-first')
        decide(buyer, 'keep', 'holding-keep-b')
        decide(buyer, 'list', 'holding-list-b')
        list_and_buy(buyer, self.agent, 'holding-second')
        self.assertNotIn(self.starter.pk, decided_for_sale_or_listing(self.agent.pk))
        from ..market_queries import history
        transactions = history('admin', {})['items']
        related = [row for row in transactions if row['id'].startswith('holding-')]
        self.assertEqual(len(related), 4)
        self.assertTrue(all(row['equipment_snapshot']['template_id'] == self.starter.template_id for row in related))
        self.assertEqual(history('another-owner', {})['items'], [])

