"""Real isolated batch trades consume existing forge/exploration intents once."""
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core import serializers
from django.test import TestCase

from system_settings.models import SystemSetting, WorldAction, WorldActionRuntime
from . import market_batch, test_market_automation as fixtures
from .combat.equipment_market import pending_preparation_actions, preparation_intents
from .combat.facts import append
from .combat.models import EquipmentInstance
from .combat.profiles import ensure
from .life_config import DEFAULTS
from .life_models import LifeConfig, LifeItem
from .life_time import local_time, storage_time
from .market_models import MarketListing, MarketTransaction
from .market_plan_models import MarketPlan, MarketTick
from .market_sessions import close_session, enter


class PreparationEquipmentBatchTests(TestCase):
    plan = fixtures.MarketAutomationTests.plan
    tick = fixtures.MarketAutomationTests.tick

    def setUp(self):
        self.enterContext(patch('django.utils.timezone.now', return_value=datetime(2026, 10, 22, 8)))
        fixtures.MarketAutomationTests.setUp(self)
        self.profile = ensure('admin', self.a)
        self.starter = EquipmentInstance.objects.get(pk=self.profile.loadout['weapon'])
        LifeConfig.objects.update_or_create(pk='admin', defaults={'migrated': True,
            'settings': {**DEFAULTS, 'market_automation_v2': True, 'agent_ids': [self.a.pk]}})
        self.enterContext(patch('system_settings.decision.routing.complete_json',
                                side_effect=AssertionError('No text fallback')))
        self.enterContext(patch('system_settings.decision.routing.jev_enabled', return_value=True))
        self.enterContext(patch('system_settings.decision.failover.attempt_plan', return_value=(['jev'], None)))

    def mark(self, action, identity=None):
        item = EquipmentInstance.objects.create(pk=identity or action, owner_id='admin',
            actor_id=self.a.pk, catalog_id=self.profile.catalog_id,
            template_id=self.starter.template_id, snapshot=self.starter.snapshot,
            rules=self.starter.rules, value=40)
        append(self.profile, 'intent:' + item.pk, 'gear_prepare',
               {'equipment_id': item.pk, 'action': action, 'decision_source': 'decision_model'})
        return item

    def execute(self, plan, tick):
        actions = market_batch.build_actions('admin', self.a.pk, plan, self.now)
        return market_batch.execute('admin', self.a, plan, tick, actions, self.now)

    def next_tick(self):
        return MarketTick.objects.create(pk='next-tick', owner_id='admin', actor_id=self.a.pk,
            hour=storage_time(local_time(self.now).replace(minute=0, second=0, microsecond=0)),
            scheduled_at=self.now)

    def test_sale_and_listing_share_one_entry_and_do_not_repeat(self):
        sold, listed = self.mark('sell'), self.mark('list')
        plan = self.plan()
        tick = self.tick(plan)
        with patch('system_settings.decision.routing.choose_scene', return_value='20%') as choose:
            result = self.execute(plan, tick)
        self.assertTrue(result['ok'], result)
        self.assertEqual(len(result['done']), 2)
        choose.assert_called_once()
        self.assertEqual(choose.call_args.args[2], 'combat_listing_price')
        self.assertEqual(set(choose.call_args.args[4]), {'10%', '20%', '30%', '40%', '50%'})
        sold.refresh_from_db()
        self.assertTrue(sold.sold)
        self.assertEqual(MarketListing.objects.get().unit_price, Decimal('8'))
        self.assertEqual(pending_preparation_actions('admin', self.a.pk), [])
        self.assertIn(listed.pk, preparation_intents(self.a.pk))  # Completed marks still prevent re-questioning.
        with patch('system_settings.decision.routing.choose_scene', side_effect=AssertionError('No redraw')):
            self.execute(plan, tick)
        self.assertEqual(MarketTransaction.objects.count(), 2)
        self.assertEqual(WorldAction.objects.filter(snapshot__market_energy=True).count(), 1)

    def test_missing_price_connection_waits_without_market_entry(self):
        item = self.mark('list')
        plan = self.plan()
        tick = self.tick(plan)
        with patch('system_settings.decision.failover.attempt_plan', return_value=([], None)), \
             patch('system_settings.agent_world.market_tick.ensure_ticks', return_value=0), \
             patch('system_settings.agent_world.market_planning.refresh_queue_needs', return_value=0), \
             patch('system_settings.decision.routing.choose_scene', side_effect=AssertionError('No choice')):
            from .market_tick import run
            self.assertEqual(run(self.now)['entered'], 0)
        self.assertEqual(len(pending_preparation_actions('admin', self.a.pk)), 1)
        self.assertFalse(WorldAction.objects.filter(snapshot__market_energy=True).exists())
        self.assertFalse(MarketListing.objects.exists())
        self.assertIn(item.pk, preparation_intents(self.a.pk))

    def test_price_failure_preserves_intent_and_never_calls_text_model(self):
        self.mark('list')
        plan = self.plan()
        with patch('system_settings.decision.routing.choose_scene', return_value=None):
            result = self.execute(plan, self.tick(plan))
        self.assertEqual(len(result['skipped']), 1)
        self.assertEqual(len(pending_preparation_actions('admin', self.a.pk)), 1)
        self.assertFalse(MarketListing.objects.exists())

    def test_saved_price_survives_failed_trade_and_synced_plan_restore(self):
        self.mark('list')
        plan = self.plan()
        with patch('system_settings.decision.routing.choose_scene', return_value='30%') as choose, \
             patch.object(market_batch, 'trade', side_effect=ValueError('temporary failure')):
            first = self.execute(plan, self.tick(plan))
        self.assertEqual(len(first['failed']), 1)
        choose.assert_called_once()
        plan.refresh_from_db()
        exported = serializers.serialize('json', [plan])
        plan.context = {}
        plan.save()
        for restored in serializers.deserialize('json', exported):
            restored.save()
        # Hourly ticks are local runtime state and are cleared by a restore.
        # The chosen price must survive in the synchronized plan, not this tick.
        MarketTick.objects.all().delete()
        with patch('system_settings.decision.routing.choose_scene', side_effect=AssertionError('No redraw')):
            second = self.execute(MarketPlan.objects.get(pk=plan.pk), self.next_tick())
        self.assertTrue(second['ok'], second)
        self.assertEqual(MarketListing.objects.get().unit_price, Decimal('12'))
        self.assertEqual(MarketTransaction.objects.count(), 1)
        self.assertEqual(pending_preparation_actions('admin', self.a.pk), [])

    def test_batch_entry_protects_future_energy_and_manual_entry_keeps_boundary(self):
        from .stamina_settings import SETTING_KEY
        from .life_commitments import ResourceProtected
        self.mark('sell')
        plan = self.plan()
        SystemSetting.objects.create(pk=SETTING_KEY, value=[{
            'effective_at': local_time(self.now - timedelta(days=1)).isoformat(), 'recovery_per_hour': 0}])
        for index in range(5):
            LifeItem.objects.create(pk=f'future-{index}', owner_id='admin', actor_id=self.a.pk,
                activity='post_publish', original_at=self.now,
                scheduled_at=self.now + timedelta(hours=index + 1))
        with self.assertRaises(ResourceProtected):
            self.execute(plan, self.tick(plan))
        self.assertFalse(MarketTransaction.objects.exists())
        WorldActionRuntime.objects.filter(pk='world').update(enabled=False)
        with self.assertRaisesMessage(ValueError, '本机自动执行已关闭'):
            enter('admin', self.a, 'blocked-batch', task=self.task, mode='batch')
        manual = enter('admin', self.a, 'allowed-manual', task=self.task, mode='manual')
        self.assertEqual(manual.mode, 'manual')
        close_session(manual, 'test complete')

    def test_stop_during_price_decision_prevents_listing(self):
        self.mark('list')
        plan = self.plan()
        def stop(*args, **kwargs):
            WorldActionRuntime.objects.filter(pk='world').update(enabled=False)
            return '20%'
        with patch('system_settings.decision.routing.choose_scene', side_effect=stop):
            result = self.execute(plan, self.tick(plan))
        self.assertFalse(result['ok'])
        self.assertFalse(MarketListing.objects.exists())
        self.assertEqual(len(pending_preparation_actions('admin', self.a.pk)), 1)
