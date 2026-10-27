"""Shopping tournaments, legal loadouts and synced interrupted comparisons."""
from copy import deepcopy
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core import serializers
from django.test import TestCase

from . import market_batch, market_equipment_shopping, test_market_equipment_shopping as fixtures
from .market_equipment_candidates import equipment_candidates
from .market_equipment_selection import KEY, validate
from .market_models import MarketSession, MarketTransaction
from .market_plan_models import MarketNoBuy, MarketPlan
from .market_sync import end_restored_sessions, fingerprints, reconcile_market


class EquipmentSelectionTests(TestCase):
    setUp = fixtures.EquipmentShoppingTests.setUp
    listing = fixtures.EquipmentShoppingTests.listing
    hour = fixtures.EquipmentShoppingTests.hour
    run_hour = fixtures.EquipmentShoppingTests.run_hour
    plan = fixtures.EquipmentShoppingTests.plan

    def bought(self):
        return list(MarketTransaction.objects.filter(actor_id=self.a.pk,
            operation__kind='buy_listing').values_list('result__equipment_id', flat=True))

    def refused(self):
        return set(MarketNoBuy.objects.filter(actor_id=self.a.pk).values_list('equipment_id', flat=True))

    def test_two_better_staffs_only_final_winner_is_bought(self):
        self.listing('staff-a'); self.listing('staff-b')
        self.plan(budget='0')
        def decide(owner, agent, scene, state, choices, **kwargs):
            if scene == 'market':
                return 'enter'
            self.assertEqual(self.bought(), [])
            if state['provisional_equipment'].get('weapon', {}).get('equipment_id') == 'staff-a':
                self.assertEqual(Decimal(state['provisional_total']), 10)
            return 'buy'
        result, choose = self.run_hour(decide)
        self.assertEqual(result['entered'], 1)
        self.assertEqual(choose.call_count, 3)
        self.assertEqual(self.bought(), ['staff-b'])
        self.assertEqual(self.refused(), {'staff-a'})

    def test_rejecting_challenger_keeps_first_provisional_winner(self):
        self.listing('staff-a'); self.listing('staff-b')
        self.plan(budget='0')
        self.run_hour(['enter', 'buy', 'no'])
        self.assertEqual(self.bought(), ['staff-a'])
        self.assertEqual(self.refused(), {'staff-b'})

    def test_ring_replacement_retains_two_distinct_winners(self):
        for identity in ('ring-a', 'ring-b', 'ring-c'):
            self.listing(identity, 'equip.ring', level=2)
        self.plan(budget='0')
        _, choose = self.run_hour(['enter', 'ring_1', 'ring_2', 'ring_1'])
        self.assertEqual(set(self.bought()), {'ring-b', 'ring-c'})
        self.assertEqual(self.refused(), {'ring-a'})
        state = choose.call_args_list[3].args[3]
        self.assertEqual({key: value['equipment_id'] for key, value in state['provisional_equipment'].items()},
                         {'ring_1': 'ring-a', 'ring_2': 'ring-b'})
        self.assertEqual(set(choose.call_args_list[3].args[4]), {'ring_1', 'ring_2', 'no'})

    def hands_market(self):
        self.profile.progression.update(job='job.elementalist', level=35)
        self.profile.save(update_fields=['progression'])
        self.listing('one-hand', 'equip.mage_staff', level=11)
        self.listing('shield-a', 'equip.offhand.magic_shield', level=11)
        self.listing('shield-b', 'equip.offhand.magic_shield', level=11)
        self.listing('two-hand', 'equip.staff', level=30)
        self.plan(budget='0')
        self.assertEqual(len(equipment_candidates('admin', self.a.pk)), 4)

    def test_final_two_hand_choice_rejects_all_market_offhands(self):
        self.hands_market()
        _, choose = self.run_hour(['enter', 'buy', 'buy', 'buy', 'buy', 'two_handed'])
        self.assertEqual(self.bought(), ['two-hand'])
        self.assertEqual(self.refused(), {'one-hand', 'shield-a', 'shield-b'})
        state = choose.call_args.args[3]
        self.assertEqual(state['stage'], 'hands')
        self.assertEqual(Decimal(state['alternatives']['one_handed']['total']), 20)
        self.assertEqual(set(state['alternatives']['two_handed']['equipment']), {'weapon'})

    def test_final_one_hand_choice_buys_weapon_and_one_offhand(self):
        self.hands_market()
        self.run_hour(['enter', 'buy', 'buy', 'buy', 'buy', 'one_handed'])
        self.assertEqual(set(self.bought()), {'one-hand', 'shield-b'})
        self.assertEqual(self.refused(), {'two-hand', 'shield-a'})

    def test_hands_choice_failure_does_not_buy_or_reject_alternatives(self):
        self.hands_market()
        self.run_hour(['enter', 'buy', 'buy', 'buy', 'buy', None])
        self.assertEqual(self.bought(), [])
        self.assertEqual(self.refused(), {'shield-a'})
        self.run_hour(['enter', 'two_handed'], hour=1)
        self.assertEqual(self.bought(), ['two-hand'])

    def test_question_limit_can_stop_before_hand_choice(self):
        self.hands_market()
        with patch.object(market_equipment_shopping, 'MAX_DECISIONS', 4):
            self.run_hour(['enter', 'buy', 'buy', 'buy', 'buy'])
        self.assertEqual(self.bought(), [])
        self.assertEqual(self.refused(), {'shield-a'})
        self.run_hour(['enter', 'two_handed'], hour=1)
        self.assertEqual(self.bought(), ['two-hand'])

    def test_new_weapon_during_hand_choice_keeps_offhand_available_for_recomparison(self):
        self.hands_market()
        def decide(owner, agent, scene, state, choices, **kwargs):
            if scene == 'market':
                return 'enter'
            if state['stage'] == 'hands':
                self.listing('new-one-hand', 'equip.mage_staff', level=11)
                return 'two_handed'
            return 'buy'
        self.run_hour(decide)
        self.assertEqual(self.bought(), [])
        self.assertEqual(self.refused(), {'shield-a'})
        self.run_hour(['enter', 'buy', 'one_handed'], hour=1)
        self.assertEqual(set(self.bought()), {'new-one-hand', 'shield-b'})
        self.assertEqual(self.refused(), {'one-hand', 'two-hand', 'shield-a'})

    def test_twenty_question_limit_defers_entire_purchase(self):
        with patch('system_settings.agent_world.market_sessions.stamina', return_value=100), \
             patch('system_settings.agent_world.life_commitments.require_energy'):
            for number in range(21):
                self.listing(f'staff-{number:02d}')
        plan = self.plan(budget='0')
        _, choose = self.run_hour(['enter', *(['buy'] * 20)])
        self.assertEqual(choose.call_count, 21)
        self.assertEqual(self.bought(), [])
        plan.refresh_from_db()
        self.assertEqual(len(plan.context[KEY]['pending']), 1)
        self.run_hour(['enter', 'buy'], hour=1)
        self.assertEqual(self.bought(), ['staff-20'])
        self.assertEqual(len(self.refused()), 20)

    def test_synced_progress_resumes_without_reasking_and_without_authorization(self):
        self.listing('staff-a'); self.listing('staff-b')
        plan = self.plan(budget='0')
        self.run_hour(['enter', 'buy', None])
        self.assertEqual(self.bought(), [])
        plan.refresh_from_db()
        progress = deepcopy(plan.context[KEY])
        before = fingerprints('admin')['MarketPlan']
        exported = serializers.serialize('json', [plan])
        plan.context = {}
        plan.save(update_fields=['context'])
        self.assertNotEqual(fingerprints('admin')['MarketPlan'], before)
        for restored in serializers.deserialize('json', exported):
            restored.save()
        end_restored_sessions()
        plan.refresh_from_db()
        self.assertEqual(plan.context[KEY], progress)
        self.assertFalse(MarketSession.objects.filter(actor_id=self.a.pk, status='active').exists())
        self.assertEqual(self.bought(), [])
        _, choose = self.run_hour(['enter', 'buy'], hour=1)
        self.assertEqual(choose.call_count, 2)
        self.assertEqual(choose.call_args.args[3]['provisional_equipment']['weapon']['equipment_id'], 'staff-a')
        self.assertEqual(self.bought(), ['staff-b'])

    def test_batch_can_continue_on_next_days_market_plan(self):
        self.listing('staff-a'); self.listing('staff-b')
        self.plan(budget='0')
        self.run_hour(['enter', 'buy', None])
        tomorrow = MarketPlan.objects.create(pk='tomorrow', owner_id='admin', actor_id=self.a.pk,
            plan_date=self.now.date() + timedelta(days=1), budget=0)
        self.run_hour(['enter', 'buy'], hour=24)
        self.assertEqual(self.bought(), ['staff-b'])
        tomorrow.refresh_from_db()
        self.assertEqual(tomorrow.context[KEY]['phase'], 'done')

    def test_bought_but_unworn_equipment_is_next_hours_comparison_baseline(self):
        self.listing('staff-a')
        self.plan(budget='0')
        self.run_hour(['enter', 'buy'])
        self.listing('staff-b')
        _, choose = self.run_hour(['enter', 'no'], hour=1)
        self.assertEqual(choose.call_args.args[3]['provisional_equipment']['weapon']['equipment_id'], 'staff-a')
        self.assertEqual(self.bought(), ['staff-a'])
        self.profile.refresh_from_db()
        self.assertNotEqual(self.profile.loadout.get('weapon'), 'staff-a')

    def test_existing_unworn_inventory_competes_before_market(self):
        gear, listing = self.listing('owned-staff')
        # Use a normal withdrawal before assigning this fixture to the buyer.
        from .market_sessions import close_session, enter
        from .market_service import trade
        session = enter('admin', self.b, 'withdraw-owned', task=self.task, mode='batch', now=self.now)
        trade(session, self.b, 'withdraw-owned-op', {'kind': 'withdraw', 'listing_id': listing.pk,
              'version': listing.version}, self.now)
        close_session(session, 'done', self.now)
        gear.actor_id = self.a.pk
        gear.save(update_fields=['actor_id'])
        self.listing('market-staff')
        self.plan(budget='0')
        _, choose = self.run_hour(['enter', 'buy', 'no'])
        self.assertTrue(choose.call_args_list[1].args[3]['candidate_owned'])
        self.assertEqual(choose.call_args.args[3]['provisional_equipment']['weapon']['equipment_id'], 'owned-staff')
        self.assertEqual(self.bought(), [])
        self.assertEqual(self.refused(), {'market-staff'})

    def test_quote_change_invalidates_provisional_winner_without_marking_it(self):
        _, listing = self.listing('staff-a')
        self.listing('staff-b')
        self.plan(budget='0')
        self.run_hour(['enter', 'buy', None])
        listing.unit_price = Decimal('15')
        listing.version += 1
        listing.save(update_fields=['unit_price', 'version'])
        _, choose = self.run_hour(['enter', 'buy', 'no'], hour=1)
        self.assertEqual(choose.call_args_list[1].args[3]['price'], '15.00')
        self.assertEqual(self.bought(), ['staff-a'])
        self.assertNotIn('staff-a', self.refused())

    def test_new_competitor_before_commit_is_compared_before_purchase(self):
        self.listing('staff-a')
        self.plan(budget='0')
        created = False
        def decide(owner, agent, scene, state, choices, **kwargs):
            nonlocal created
            if scene == 'market':
                return 'enter'
            if not created:
                created = True
                self.listing('staff-b')
            return 'buy'
        self.run_hour(decide)
        self.assertEqual(self.bought(), ['staff-b'])

    def test_failed_second_trade_rolls_back_entire_ring_pair_and_can_retry(self):
        self.listing('ring-a', 'equip.ring', level=2)
        self.listing('ring-b', 'equip.ring', level=2)
        plan = self.plan(budget='0')
        original = market_batch.trade
        calls = 0
        def failing(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError('fixture second trade failed')
            return original(*args, **kwargs)
        with patch.object(market_batch, 'trade', side_effect=failing):
            self.run_hour(['enter', 'ring_1', 'ring_2'])
        self.assertEqual(self.bought(), [])
        plan.refresh_from_db()
        self.assertEqual(plan.spent, 0)
        self.assertEqual(plan.context[KEY]['phase'], 'ready')
        self.run_hour(['enter'], hour=1)
        self.assertEqual(set(self.bought()), {'ring-a', 'ring-b'})
        plan.refresh_from_db()
        self.assertEqual(plan.spent, 20)

    def test_aggregate_budget_prevents_selecting_two_individually_affordable_rings(self):
        self.listing('ring-a', 'equip.ring', level=2, price='60')
        self.listing('ring-b', 'equip.ring', level=2, price='60')
        self.a.money = Decimal('100')
        self.a.save(update_fields=['money'])
        self.plan(budget='0')
        self.run_hour(['enter', 'ring_1', 'ring_2'])
        self.assertEqual(self.bought(), [])
        self.assertEqual(self.refused(), set())

    def test_sync_rejects_invalid_version_duplicate_rings_and_conflicting_hands(self):
        self.listing('staff-a')
        plan = self.plan(budget='0')
        self.run_hour(['enter', None])
        plan.refresh_from_db()
        progress = deepcopy(plan.context[KEY])
        progress['version'] = 999
        with self.assertRaises(ValueError):
            validate(progress)
        progress['version'] = 1
        item = progress['pending'][0]
        progress['pools'] = {'one_handed': item, 'two_handed': item}
        with self.assertRaises(ValueError):
            validate(progress)
        plan.context[KEY]['version'] = 999
        plan.save(update_fields=['context'])
        from utils.sync_manager import SyncError
        with self.assertRaisesMessage(SyncError, '暂选进度'):
            reconcile_market()

    def test_selection_progress_is_in_sync_export_while_ticks_are_not(self):
        self.listing('staff-a'); self.listing('staff-b')
        plan = self.plan(budget='0')
        self.run_hour(['enter', 'buy', None])
        import json
        from utils.sync_models import SnapshotModels
        models = SnapshotModels(['system_settings'])
        # Exercise the actual model registry/export query, without exporting unrelated
        # combat fixtures whose progression is deliberately set directly in setUp.
        snapshot = json.loads(serializers.serialize('json', [item
            for model in models.iter_target_models()
            if model is MarketPlan
            for item in models.queryset_for_export(model)]))
        row = next(row for row in snapshot if row['model'] == 'system_settings.marketplan' and row['pk'] == plan.pk)
        self.assertEqual(row['fields']['context'][KEY]['pools']['one_handed']['equipment_id'], 'staff-a')
        self.assertNotIn('system_settings.markettick',
                         [model._meta.label_lower for model in models.iter_target_models()])
