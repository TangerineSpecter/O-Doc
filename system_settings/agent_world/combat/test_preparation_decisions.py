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
from .preparation import prepare
from .preparation_decision import _decide_old_equipment, decided_for_sale_or_listing
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

    def test_two_replacements_in_one_preparation_keep_distinct_disposition_facts(self):
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
                selected = 'replace' if question_id.startswith('equipment:') else 'sell'
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
        self.assertEqual(set(facts.values_list('payload__action', flat=True)), {'replace', 'sell'})
        self.assertFalse(any(self.starter.pk in question for question in asked))
        self.assertEqual(result.snapshot['prepared_plan']['equipment']['weapon'], 'candidate-b')

    def test_untradable_displaced_items_skip_questions_and_legacy_market_intents(self):
        equip('admin', self.agent, 'remove-starter', {'weapon': None})
        for bound, locked in [(True, False), (False, True)]:
            with self.subTest(bound=bound, locked=locked):
                self.starter.bound, self.starter.locked = bound, locked
                self.starter.save()
                with patch('system_settings.agent_world.combat.preparation_decision._choice') as choice:
                    _decide_old_equipment(None, self.agent, self.profile, self.catalog,
                                         self.starter, {}, {}, 'old', lambda: None)
                choice.assert_not_called()
                append(self.profile, f'legacy-intent-{bound}', 'gear_prepare',
                       {'equipment_id': self.starter.pk, 'action': 'list', 'decision_source': 'decision_model'})
                self.assertEqual(pending_preparation_actions('admin', self.agent.pk), [])

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

