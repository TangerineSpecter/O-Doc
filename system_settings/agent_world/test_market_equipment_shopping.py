"""Hourly unjudged listings -> entry -> one comparison per equipment instance."""
import random
from copy import deepcopy
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from . import market_batch, market_tick
from .combat import equipment
from .combat.facts import append
from .combat.models import EquipmentInstance
from .combat.profiles import ensure
from .combat.store import current
from .life_config import DEFAULTS
from .life_models import LifeConfig, LifeItem
from .life_time import local_time, storage_time
from .market_equipment_candidates import equipment_candidates, equipment_summary
from .market_models import MarketListing, MarketSession, MarketTransaction
from .market_no_buy import record
from .market_plan_models import MarketGoal, MarketNoBuy, MarketTick
from .market_service import trade
from .market_sessions import close_session, enter
from . import test_market_automation as fixtures


class EquipmentShoppingTests(TestCase):
    plan = fixtures.MarketAutomationTests.plan
    tick = fixtures.MarketAutomationTests.tick

    def setUp(self):
        self.enterContext(patch('django.utils.timezone.now', return_value=datetime(2026, 10, 26, 8)))
        fixtures.MarketAutomationTests.setUp(self)
        self.profile = ensure('admin', self.a)
        self.seller = ensure('admin', self.b)
        self.catalog = current(self.profile.catalog_id)
        progress = dict(self.profile.progression)
        progress.update(job='job.mage', level=16)
        self.profile.progression = progress
        self.profile.save(update_fields=['progression'])
        LifeConfig.objects.update_or_create(pk='admin', defaults={'migrated': True,
            'settings': {**DEFAULTS, 'market_automation_v2': True, 'agent_ids': [self.a.pk, self.b.pk]}})
        self.enterContext(patch('system_settings.agent_world.market_planning.refresh_queue_needs', return_value=0))
        self.enterContext(patch('system_settings.agent_world.market_bait_refresh.refresh_bait_needs', return_value=0))
        self.enterContext(patch('system_settings.decision.routing.complete_json', side_effect=AssertionError('No text fallback')))

    def listing(self, identity, template='equip.mage_staff', *, level=11, price='10'):
        snapshot = equipment.generate(self.catalog, template, level, 'white', random.Random(7))
        item = EquipmentInstance.objects.create(pk=identity, owner_id='admin', actor_id=self.b.pk,
            catalog_id=self.catalog.version, template_id=template, snapshot=snapshot, value=40)
        append(self.seller, 'list-intent:' + identity, 'gear_prepare',
               {'equipment_id': identity, 'action': 'list', 'decision_source': 'decision_model'})
        session = enter('admin', self.b, 'seller:' + identity, task=self.task, mode='batch', now=self.now)
        result = trade(session, self.b, 'list:' + identity,
                       {'kind': 'list_combat_equipment', 'equipment_id': identity, 'unit_price': price}, self.now)
        close_session(session, 'listed', self.now)
        return item, MarketListing.objects.get(pk=result['listing_id'])

    def hour(self, hour=0):
        now = self.now + timedelta(hours=hour)
        return MarketTick.objects.create(pk=f'hour-{hour}', owner_id='admin', actor_id=self.a.pk,
            hour=storage_time(local_time(now).replace(minute=0, second=0, microsecond=0)), scheduled_at=now)

    def run_hour(self, choices, hour=0):
        self.hour(hour)
        with patch('system_settings.agent_world.market_tick.ensure_ticks', return_value=0), \
             patch('system_settings.agent_world.market_equipment_shopping.choose_scene', side_effect=choices) as choose:
            result = market_tick.run(self.now + timedelta(hours=hour), limit=10)
        return result, choose

    def test_no_goal_or_empty_slot_needed_and_weaker_stats_still_reach_model(self):
        item, _ = self.listing('weak-staff')
        item.snapshot['stats'] = {'magic_attack': 1}
        # A legacy snapshot without an affix list cannot be recalibrated and is forwarded as-is.
        item.snapshot['affixes'] = None
        item.save(update_fields=['snapshot'])
        self.plan(budget='0')
        rows = equipment_candidates('admin', self.a.pk)
        self.assertEqual([row['equipment_id'] for row in rows], [item.pk])
        result, choose = self.run_hour(['enter', 'no'])
        self.assertEqual(result['entered'], 1)
        self.assertEqual(choose.call_args_list[0].args[3]['equipment'],
                         [{'type': 'mage_staff', 'name': '法杖', 'count': 1}])
        state = choose.call_args_list[1].args[3]
        self.assertEqual(state['candidate_equipment']['stats'], {'magic_attack': 1})
        self.assertIn('weapon', state['current_equipment'])
        self.assertIn('stats', state['current_equipment']['weapon'])
        self.assertTrue(MarketNoBuy.objects.filter(actor_id=self.a.pk, equipment_id=item.pk).exists())

    def test_listing_projection_uses_effective_stats_without_rewriting_copy(self):
        from .combat.equipment_effective import for_instance
        from .market_queries import listings
        item, listing = self.listing('legacy-blue')
        original = deepcopy(listing.item['equipment_snapshot'])
        item.snapshot['quality'] = 'blue'
        item.snapshot['stats'] = {'magic_attack': 1}
        item.save(update_fields=['snapshot'])
        row = next(row for row in listings('admin', {'seller_id': self.b.pk, 'status': 'all'})['items']
                   if row['id'] == listing.pk)
        self.assertEqual(row['item']['equipment_snapshot']['stats'], for_instance(item)['stats'])
        listing.refresh_from_db()
        self.assertEqual(listing.item['equipment_snapshot'], original)

    def test_explicit_no_disappears_next_hour_and_new_instance_appears(self):
        one, _ = self.listing('staff-1')
        two, _ = self.listing('staff-2')
        self.plan(budget='0')
        _, choose = self.run_hour(['enter', 'no', 'no'])
        self.assertEqual(choose.call_count, 3)
        self.assertEqual(MarketNoBuy.objects.filter(actor_id=self.a.pk).count(), 2)
        self.assertEqual(equipment_summary(equipment_candidates('admin', self.a.pk)), [])
        result, choose = self.run_hour([], hour=1)
        self.assertEqual(result['skipped'], 1)
        choose.assert_not_called()
        self.listing('staff-3')
        rows = equipment_candidates('admin', self.a.pk)
        self.assertEqual([row['equipment_id'] for row in rows], ['staff-3'])

    def test_wait_and_connection_failure_do_not_mark_or_enter(self):
        self.listing('staff')
        self.plan(budget='0')
        for hour, selected in enumerate(('wait', None)):
            result, choose = self.run_hour([selected], hour=hour)
            self.assertEqual((result['entered'], choose.call_count), (0, 1))
        self.assertFalse(MarketNoBuy.objects.exists())
        self.assertFalse(MarketSession.objects.filter(actor_id=self.a.pk).exists())

    def test_filter_uses_rules_owner_level_and_instance_marks_without_prefilter_cap(self):
        blocked, _ = self.listing('blocked')
        record('admin', self.a.pk, blocked.pk)
        self.listing('wrong-job', 'equip.sword', level=11)
        self.listing('too-high', level=20)
        available, listing = self.listing('valid')
        rows = equipment_candidates('admin', self.a.pk)
        self.assertEqual([row['equipment_id'] for row in rows], [available.pk])
        self.profile.progression['job'] = 'job.priest'
        self.profile.save(update_fields=['progression'])
        self.assertEqual(len(equipment_candidates('admin', self.a.pk)), 1)
        listing.owner_id = 'other'
        listing.save(update_fields=['owner_id'])
        self.assertEqual(equipment_candidates('admin', self.a.pk), [])

    def test_ring_is_one_decision_against_both_occupied_slots(self):
        for slot in ('ring_1', 'ring_2'):
            snapshot = equipment.generate(self.catalog, 'equip.ring', 2, 'white', random.Random(8))
            gear = EquipmentInstance.objects.create(pk=slot, owner_id='admin', actor_id=self.a.pk,
                catalog_id=self.catalog.version, template_id='equip.ring', snapshot=snapshot)
            self.profile.loadout[slot] = gear.pk
        self.profile.save(update_fields=['loadout'])
        self.listing('ring', 'equip.ring', level=2)
        rows = equipment_candidates('admin', self.a.pk)
        self.assertEqual(len(rows), 1)
        self.assertEqual(set(rows[0]['current']), {'ring_1', 'ring_2'})
        self.assertEqual(equipment_summary(rows)[0]['count'], 1)

    def test_successful_buy_commits_and_disappears_without_auto_equip(self):
        item, listing = self.listing('buy-staff')
        plan = self.plan(budget='0')
        self.a.refresh_from_db()
        before = self.a.money
        result, _ = self.run_hour(['enter', 'buy'])
        self.assertEqual(result['entered'], 1)
        item.refresh_from_db(); listing.refresh_from_db(); plan.refresh_from_db(); self.a.refresh_from_db()
        self.assertEqual((item.actor_id, listing.status), (self.a.pk, 'sold'))
        self.assertEqual((plan.spent, plan.budget, self.a.money), (10, 10, before - 10))
        self.profile.refresh_from_db()
        self.assertNotEqual(self.profile.loadout['weapon'], item.pk)
        self.assertEqual(equipment_candidates('admin', self.a.pk), [])
        self.assertFalse(MarketNoBuy.objects.exists())
        self.assertEqual(MarketTransaction.objects.filter(actor_id=self.a.pk, operation__kind='buy_listing').count(), 1)

    def test_stale_quote_does_not_spend_or_mark_refusal(self):
        item, listing = self.listing('changing')
        plan = self.plan(budget='0')
        def decide(owner, agent, scene, state, choices, **kwargs):
            if scene == 'market':
                return 'enter'
            MarketListing.objects.filter(pk=listing.pk).update(version=2)
            return 'buy'
        result, _ = self.run_hour(decide)
        self.assertFalse(MarketNoBuy.objects.exists())
        self.assertEqual(len(equipment_candidates('admin', self.a.pk)), 1)
        plan.refresh_from_db()
        self.assertEqual(plan.spent, 0)

    def test_replaying_successful_purchase_only_accounts_once(self):
        item, listing = self.listing('replay')
        plan = self.plan(budget='0')
        session = enter('admin', self.a, 'buyer-replay', task=self.task, mode='batch', now=self.now)
        operation = {'kind': 'buy_listing', 'listing_id': listing.pk,
                     'version': listing.version, 'quantity': 1, 'unit_price': '10'}
        for _ in range(2):
            market_batch._purchase(session, self.a, plan, 'purchase-replay', operation, '',
                                   self.now, equipment=True)
        plan.refresh_from_db()
        self.assertEqual((plan.budget, plan.spent), (10, 10))
        self.assertEqual(MarketTransaction.objects.filter(pk='purchase-replay').count(), 1)

    def test_session_stop_after_decision_does_not_write_refusal(self):
        self.listing('stop')
        self.plan(budget='0')
        def decide(owner, agent, scene, state, choices, **kwargs):
            if scene == 'market':
                return 'enter'
            from system_settings.models import WorldActionRuntime
            WorldActionRuntime.objects.filter(pk='world').update(enabled=False)
            return 'no'
        self.run_hour(decide)
        self.assertFalse(MarketNoBuy.objects.exists())
        self.assertEqual(len(equipment_candidates('admin', self.a.pk)), 1)

    def test_decision_failure_or_session_stop_keeps_unanswered_items(self):
        self.listing('first'); self.listing('second')
        self.plan(budget='0')
        _, choose = self.run_hour(['enter', 'no', None])
        self.assertEqual(choose.call_count, 3)
        self.assertEqual(MarketNoBuy.objects.filter(actor_id=self.a.pk).count(), 1)
        self.assertEqual([row['equipment_id'] for row in equipment_candidates('admin', self.a.pk)], ['second'])

    def test_funds_preserve_daily_allocation(self):
        self.listing('expensive', price='100')
        plan = self.plan(budget='50')
        self.a.money = Decimal('120')
        self.a.save(update_fields=['money'])
        self.assertEqual(market_batch.equipment_funds('admin', self.a.pk, plan), Decimal('70'))
        result, _ = self.run_hour(['enter', 'buy'])
        plan.refresh_from_db()
        self.assertEqual((plan.spent, plan.budget), (0, 50))
        self.assertFalse(MarketNoBuy.objects.exists())

    def test_new_reservation_during_decision_blocks_purchase_without_marking(self):
        self.listing('reserved-staff', price='100')
        plan = self.plan(budget='0')
        def decide(owner, agent, scene, state, choices, **kwargs):
            if scene == 'market':
                return 'enter'
            LifeItem.objects.create(pk='new-reservation', owner_id='admin', actor_id=self.a.pk,
                activity='travel', original_at=self.now, scheduled_at=self.now, budget=Decimal('9950'))
            return 'buy'
        self.run_hour(decide)
        plan.refresh_from_db()
        self.assertEqual((plan.spent, plan.budget), (0, 0))
        self.assertFalse(MarketNoBuy.objects.exists())

    def test_old_daily_slot_target_is_retired_and_releases_its_funds_once(self):
        self.listing('new-opportunity')
        plan = self.plan(budget='100')
        goal = MarketGoal.objects.create(pk='legacy-slot', owner_id='admin', actor_id=self.a.pk,
            plan=plan, kind='equipment', slot='body', quantity=1, max_unit_price=Decimal('100'))
        self.run_hour(['wait'])
        plan.refresh_from_db(); goal.refresh_from_db()
        self.assertEqual((plan.budget, goal.status), (0, 'cancelled'))
        from .market_planning import retire_equipment_goals
        retire_equipment_goals(plan)
        plan.refresh_from_db()
        self.assertEqual(plan.budget, 0)
