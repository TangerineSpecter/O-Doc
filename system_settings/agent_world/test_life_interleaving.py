"""Isolated contracts for scheduling, protection, checkpoint replay and sync."""
import copy
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from django.core import serializers
from .life_energy import Commitment, forecast, allowance
from .life_time import SHANGHAI, local_time, storage_time
from .life_models import LifeConfig, LifeCycle, LifeItem, LifeInterleavingState
from .life_config import DEFAULTS, ensure_profiles, validate_settings
from .test_cooking import CookingTests


class EnergyTimelineTests(SimpleTestCase):
    def test_rates_cap_and_changed_history(self):
        now = datetime(2026, 10, 22, 8, tzinfo=SHANGHAI)
        for rate, expected in ((0, 0), (5, 5), (100, 100)):
            recovery = [{'effective_at': now.isoformat(), 'recovery_per_hour': rate}]
            events = [Commitment('future', now + timedelta(hours=1), Decimal(100), 'main')]
            self.assertEqual(allowance(100, now, events, recovery), expected)
        history = [{'effective_at': now.isoformat(), 'recovery_per_hour': 0},
                   {'effective_at': (now + timedelta(minutes=30)).isoformat(), 'recovery_per_hour': 100}]
        self.assertEqual(allowance(100, now, events, history), 50)
        result = forecast(90, now, [Commitment('a', now + timedelta(hours=2), Decimal(100), 'a'),
            Commitment('b', now + timedelta(hours=2, minutes=1), Decimal(2), 'b')], [])
        self.assertFalse(result['safe'])  # recovery that spilled above 100 cannot be spent later

    def test_unknown_and_next_day(self):
        now = datetime(2026, 10, 22, 23, tzinfo=SHANGHAI)
        self.assertEqual(allowance(100, now, [Commitment('unknown', now, None, 'farm')], []), 0)
        recovery = [{'effective_at': now.isoformat(), 'recovery_per_hour': 0}]
        self.assertEqual(allowance(50, now, [Commitment('tomorrow', now + timedelta(hours=2), Decimal(40), 'main')], recovery), 10)


class IdleSchedulingTests(TestCase):
    def setUp(self):
        self.enterContext(patch('django.utils.timezone.now', return_value=datetime(2026, 10, 22, 8)))
        CookingTests.setUp(self)
        from system_settings.models import AgentExecutionLease, WorldActionRuntime
        AgentExecutionLease.objects.all().delete()
        WorldActionRuntime.objects.filter(pk='world').update(enabled=True, token='', until=None)
        self.now = local_time()
        self.config = LifeConfig.objects.create(pk='admin', migrated=True, settings={**DEFAULTS,
            'agent_ids': [self.agent.pk], 'interleaving_enabled': True})
        ensure_profiles('admin', [self.agent.pk])
        LifeCycle.objects.create(pk='cycle', owner_id='admin', starts_at=self.now - timedelta(hours=1),
            ends_at=self.now + timedelta(days=1), snapshot={'participants': [self.agent.pk], 'settings': self.config.settings})
        self.enterContext(patch('system_settings.decision.routing.complete_json', side_effect=AssertionError('No text fallback')))
        self.enterContext(patch('system_settings.agent_world.life_interleaving.available_window', return_value=3600))
        self.summary = ({'cooking': {'craftable_recipes': 1}}, {'energy': 20, 'projection': {'safe': True}}, 3600)

    def state(self):
        return LifeInterleavingState.objects.create(pk=self.agent.pk, owner_id='admin', next_decision_at=self.now, next_check_at=self.now)

    def test_new_selection_reads_changed_stock_and_passes_live_opportunities(self):
        from .combat.profiles import ensure
        ensure('admin', self.agent)
        from .inventory_stock import take_stock
        from .life_interleaving_candidates import build, selection_input
        CookingTests.supply(self, quantity=8)
        with patch('system_settings.agent_world.life_interleaving_candidates.available_window', return_value=3600), \
             patch('system_settings.agent_world.life_interleaving_candidates.capacity',
                   return_value={'energy': 100, 'projection': {'safe': True}}):
            before, resource, gap = build(self.config, self.agent, self.now)
            take_stock(self.agent.pk, 'admin', 'crop.potato', 6)
            after, resource, gap = build(self.config, self.agent, self.now)
            self.assertEqual(before['cooking']['available_recipes'][0]['max_quantity'], 4)
            self.assertEqual(after['cooking']['available_recipes'][0]['max_quantity'], 1)
            state = selection_input(self.config, self.agent, after, resource, gap, self.now)
            self.assertEqual(state['activities']['cooking'], after['cooking'])
            self.assertIn('保护后续承诺', state['decision_context'])
            take_stock(self.agent.pk, 'admin', 'crop.potato', 2)
            empty, _, _ = build(self.config, self.agent, self.now)
            self.assertNotIn('cooking', empty)

    def exploration_task(self):
        from .combat.schedule import ensure_task
        return ensure_task('admin')

    def test_first_adventure_is_only_candidate_without_creating_business_data(self):
        from .life_interleaving_candidates import build
        from .combat.models import CombatProfile, EquipmentInstance, CombatCatalog, CombatFact
        self.exploration_task()
        CookingTests.supply(self, quantity=8)
        with patch('system_settings.agent_world.life_interleaving_candidates.available_window', return_value=3600), \
             patch('system_settings.agent_world.life_interleaving_candidates.capacity', return_value={'energy': 100, 'projection': {'safe': True}}):
            candidates, _, _ = build(self.config, self.agent, self.now)
        self.assertEqual(set(candidates), {'exploration'})
        self.assertTrue(candidates['exploration']['initial_adventure'])
        for model in (CombatProfile, EquipmentInstance, CombatCatalog, CombatFact):
            self.assertFalse(model.objects.exists(), model.__name__)

    def test_first_adventure_waits_for_time_energy_and_enabled_capability(self):
        from .life_interleaving_candidates import build
        task = self.exploration_task()
        for seconds, energy, enabled in ((1799, 100, True), (3600, 21, True), (3600, 100, False)):
            with self.subTest(seconds=seconds, energy=energy, enabled=enabled):
                task.enabled = enabled
                task.save()
                with patch('system_settings.agent_world.life_interleaving_candidates.available_window', return_value=seconds), \
                     patch('system_settings.agent_world.life_interleaving_candidates.capacity', return_value={'energy': energy, 'projection': {'safe': True}}):
                    self.assertEqual(build(self.config, self.agent, self.now)[0], {})

    def test_first_adventure_executes_without_activity_model_and_initializes_once(self):
        from .life_interleaving import process
        from .combat.models import CombatProfile, EquipmentInstance, Exploration
        from system_settings.models import AgentRunRecord
        self.exploration_task()
        state = self.state()
        with patch('system_settings.agent_world.life_interleaving_candidates.available_window', return_value=3600), \
             patch('system_settings.agent_world.life_interleaving_candidates.capacity', return_value={'energy': 100, 'projection': {'safe': True}}), \
             patch('system_settings.agent_world.life_interleaving.choose') as choose:
            process(self.config, state, None, self.now)
            choose.assert_not_called()
            item = LifeItem.objects.get(activity='exploration')
            self.assertEqual(item.status, 'running')
            self.assertIn('首次冒险由系统引导', item.intent)
            profile = CombatProfile.objects.get(pk=self.agent.pk)
            self.assertEqual(profile.progression['level'], 1)
            self.assertEqual(Exploration.objects.get().life_item_id, item.pk)
            self.assertTrue(AgentRunRecord.objects.filter(summary__contains='首次冒险由系统引导').exists())
            process(self.config, state, None, self.now + timedelta(minutes=5))
        self.assertEqual(CombatProfile.objects.count(), 1)
        self.assertEqual(EquipmentInstance.objects.filter(pk='starter:' + self.agent.pk).count(), 1)
        self.assertEqual(Exploration.objects.count(), 1)

    def test_first_adventure_respects_pause_and_world_switch(self):
        from .life_interleaving import process
        from .combat.models import CombatProfile
        from system_settings.models import WorldActionRuntime
        self.exploration_task()
        state = self.state()
        self.config.paused_agents = [self.agent.pk]
        self.config.save()
        with patch('system_settings.agent_world.life_interleaving.choose') as choose:
            process(self.config, state, None, self.now)
            self.config.paused_agents = []
            self.config.save()
            WorldActionRuntime.objects.filter(pk='world').update(enabled=False)
            process(self.config, state, None, self.now)
            choose.assert_not_called()
        self.assertFalse(CombatProfile.objects.exists())
        self.assertFalse(LifeItem.objects.exists())

    def test_after_initialization_normal_candidates_and_wait_return(self):
        from .combat.profiles import ensure
        from .life_interleaving_candidates import build
        from .life_interleaving import process
        self.exploration_task()
        ensure('admin', self.agent)
        CookingTests.supply(self, quantity=8)
        with patch('system_settings.agent_world.life_interleaving_candidates.available_window', return_value=3600), \
             patch('system_settings.agent_world.life_interleaving_candidates.capacity', return_value={'energy': 100, 'projection': {'safe': True}}), \
             patch('system_settings.agent_world.life_interleaving.choose', return_value='wait') as choose:
            candidates, _, _ = build(self.config, self.agent, self.now)
            self.assertIn('cooking', candidates)
            self.assertFalse(candidates['exploration']['initial_adventure'])
            process(self.config, self.state(), None, self.now)
        self.assertIn('wait', choose.call_args.args[4])
        self.assertFalse(LifeItem.objects.exists())

    def test_no_candidates_no_call_and_wait_has_no_card(self):
        from .life_interleaving import process
        state = self.state()
        with patch('system_settings.agent_world.life_interleaving.build', return_value=({}, {}, 3600)), patch('system_settings.agent_world.life_interleaving.choose') as choose:
            process(self.config, state, None, self.now)
            choose.assert_not_called()
        with patch('system_settings.agent_world.life_interleaving.build', return_value=self.summary), patch('system_settings.agent_world.life_interleaving.choose', return_value='wait') as choose:
            process(self.config, state, None, self.now)
            self.assertEqual(set(choose.call_args.args[4]), {'cooking', 'wait'})
            self.assertFalse(LifeItem.objects.exists())
            process(self.config, state, None, self.now + timedelta(minutes=10))
            self.assertEqual(choose.call_count, 1)
        self.assertGreaterEqual(local_time(state.next_decision_at), self.now + timedelta(minutes=59))

    def test_activity_choice_checkpoint_does_not_redraw(self):
        from .life_interleaving import process
        state = self.state()
        with patch('system_settings.agent_world.life_interleaving.build', return_value=self.summary), \
             patch('system_settings.agent_world.life_interleaving.choose', return_value='cooking') as choose, \
             patch('system_settings.agent_world.life_interleaving.prepare'), \
             patch('system_settings.agent_world.life_runner.execute_item'):
            process(self.config, state, None, self.now)
            item = LifeItem.objects.get()
            self.assertEqual(item.context['interleaving']['opportunity_id'], item.pk)
            process(self.config, state, None, self.now + timedelta(minutes=5))
            self.assertEqual(choose.call_count, 1)
            self.assertEqual(LifeItem.objects.count(), 1)

    def test_pending_main_prevents_decision(self):
        from .life_interleaving import ready
        LifeItem.objects.create(pk='main', owner_id='admin', actor_id=self.agent.pk,
            original_at=self.now, scheduled_at=self.now + timedelta(minutes=20))
        self.assertFalse(ready(self.config, self.agent, self.now))

    def test_manual_spend_allowed_but_auto_reserves_future(self):
        from .life_commitments import require_energy, ResourceProtected
        from .stamina_settings import SETTING_KEY
        from system_settings.models import SystemSetting
        SystemSetting.objects.create(pk=SETTING_KEY, value=[{'effective_at': (self.now - timedelta(days=1)).isoformat(), 'recovery_per_hour': 0}])
        for i in range(4):
            LifeItem.objects.create(pk=f'main-{i}', owner_id='admin', actor_id=self.agent.pk, activity='post_publish',
                original_at=self.now, scheduled_at=self.now + timedelta(hours=i + 1))
        with self.assertRaises(ResourceProtected):
            require_energy('admin', self.agent, 21)
        require_energy('admin', self.agent, 20)
        require_energy('admin', self.agent, 100, manual=True)

    def test_choices_replay_and_fail_closed(self):
        from .life_interleaving_choices import checkpoint_choice, choose
        from system_settings.decision.jev import DecisionUnavailable
        item = LifeItem.objects.create(pk='idle', owner_id='admin', actor_id=self.agent.pk, activity='cooking',
            original_at=self.now, scheduled_at=self.now, context={'interleaving': {'version': 1, 'choices': []}})
        with patch('system_settings.decision.routing.choose_connections', return_value=('x', .8)) as provider:
            for _ in range(2):
                self.assertEqual(checkpoint_choice(item, self.agent, 'recipe', 'cooking_recipe', {}, {'x': 'X', 'y': 'Y'}), 'x')
            self.assertEqual(provider.call_count, 1)
        with patch('system_settings.decision.routing.choose_connections', side_effect=DecisionUnavailable('offline')):
            with self.assertRaises(DecisionUnavailable):
                choose('admin', self.agent, 'life_interleaving', {}, {'x': 'X', 'wait': 'Wait'})

    def test_legacy_snapshot_empty_state_hash_compatible_and_invalid_relation_rejected(self):
        import json
        from .life_sync import checkpoint_all
        from .life_models import LifeProfile, LifeIntegrity
        from .life_snapshot import validate_source
        from utils.sync_manager import SyncError
        checkpoint_all()
        data = json.loads(serializers.serialize('json', [*LifeConfig.objects.all(), *LifeProfile.objects.all(), *LifeCycle.objects.all(), *LifeIntegrity.objects.all()]))
        for row in data:
            if row['model'].endswith('lifeintegrity'):
                row['fields']['hashes'].pop('LifeInterleavingState')
        validate_source(data)
        state = self.state()
        data += json.loads(serializers.serialize('json', [state]))
        data[-1]['fields']['owner_id'] = 'someone-else'
        with self.assertRaises(SyncError):
            validate_source(data)

    def test_config_defaults_and_validation(self):
        self.assertFalse(validate_settings({})['interleaving_enabled'])
        for key in ('interleaving_check_minutes', 'interleaving_decision_minutes', 'interleaving_wait_minutes'):
            with self.assertRaises(ValueError):
                validate_settings({key: 0})

    def test_main_inputs_and_voluntary_empty_slot(self):
        from .life_main_context import build
        from .life_output_validation import validate_life_output
        item = LifeItem.objects.create(pk='main', owner_id='admin', actor_id=self.agent.pk, original_at=self.now, scheduled_at=self.now)
        context = build('admin', self.agent, [item])
        self.assertEqual(context['activities'], [])  # cooking belongs only to idle
        self.assertNotIn('recent_experiences', context)
        context.update(daily_planning=True, travel_budget_ceiling='0')
        context['slots'][0]['allowed_activities'] = ['investment']
        value = {'plans': [{'id': 'main', 'activity': 'rest', 'reason': '今天无需投资'}]}
        self.assertEqual(validate_life_output(value, '', context), value)

    def test_real_cooking_entry_and_actual_facts(self):
        from .combat.profiles import ensure
        ensure('admin', self.agent)
        from .inventory_stock import add_stock
        from .life_interleaving import process
        from .life_facts import actuals
        from .cooking_models import CookingOperation
        add_stock(self.agent.pk, 'admin', self.agent.name, 'crop.potato', 2, '土豆', 'farm_product', 18)
        state = self.state()
        def answer(owner, facts, choices, **kwargs):
            return ('stop' if 'stop' in choices else next(iter(choices))), .9
        with patch('system_settings.decision.routing.choose_connections', side_effect=answer):
            process(self.config, state, None, self.now)
        item = LifeItem.objects.get()
        self.assertEqual(item.activity, 'cooking')
        self.assertEqual(item.status, 'completed', item.result)
        self.assertEqual(CookingOperation.objects.count(), 1)
        facts = actuals(item)
        self.assertEqual(facts['source'], 'interleaved')
        self.assertEqual(Decimal(facts['actual_energy_cost']), Decimal(2))

    def test_preparation_failure_retains_selected_prefix(self):
        from .inventory_stock import add_stock
        from .life_interleaving import process, prepare
        from system_settings.decision.jev import DecisionUnavailable
        add_stock(self.agent.pk, 'admin', self.agent.name, 'crop.potato', 20, '土豆', 'farm_product', 18)
        state = self.state()
        with patch('system_settings.agent_world.life_interleaving.build', return_value=self.summary), \
             patch('system_settings.agent_world.life_interleaving.choose', return_value='cooking'), \
             patch('system_settings.agent_world.life_interleaving.prepare', side_effect=DecisionUnavailable('offline')):
            with self.assertRaises(DecisionUnavailable):
                process(self.config, state, None, self.now)
        item = LifeItem.objects.get()
        with patch('system_settings.decision.routing.choose_connections', side_effect=lambda owner, facts, choices, **kwargs: (next(iter(choices)), 1)):
            prepare(item, self.agent)
        item.refresh_from_db()
        plan = copy.deepcopy(item.context['cooking_plan'])
        with patch('system_settings.decision.routing.choose_connections', side_effect=AssertionError('No redraw')):
            prepare(item, self.agent)
        item.refresh_from_db()
        self.assertEqual(item.context['cooking_plan'], plan)

    def test_real_alchemy_preparation_uses_strict_checkpointed_decisions(self):
        from .alchemy_catalog import DEFAULT_RULES as ALCHEMY_RULES
        from .life_interleaving import prepare
        from system_settings.decision.jev import DecisionUnavailable
        rules = {key: copy.deepcopy(ALCHEMY_RULES[key]) for key in ('healing', 'focus')}
        for rule in rules.values():
            rule['required_level'] = 1
            rule['ingredients'] = [{'sku': 'combat.material.moss_cave.1', 'quantity': 1}]
        facts = {'rules': rules, 'level': 1, 'energy': 3, 'pool': [
            {'inventory_id': 'material', 'sku': 'combat.material.moss_cave.1',
             'quantity': 3, 'price': '1', 'created_at': ''}]}
        item = LifeItem.objects.create(pk='idle-alchemy', owner_id='admin', actor_id=self.agent.pk,
            activity='alchemy', original_at=self.now, scheduled_at=self.now,
            context={'interleaving': {'version': 1, 'choices': []}})
        with patch('system_settings.agent_world.life_interleaving.task_for', return_value=self.task), \
             patch('system_settings.agent_world.alchemy_schedule_plan.planning_facts', return_value=facts), \
             patch('system_settings.agent_world.life_commitments.capacity', return_value={'energy': 3}):
            with patch('system_settings.decision.routing.choose_connections', side_effect=DecisionUnavailable('offline')):
                with self.assertRaises(DecisionUnavailable):
                    prepare(item, self.agent)
            item.refresh_from_db()
            self.assertNotIn('alchemy_plan', item.context)
            def answer(owner, state, choices, **kwargs):
                return {'alchemy_recipe': 'healing', 'alchemy_quantity': '1',
                        'alchemy_continue': 'finish'}[kwargs['scene']], .9
            with patch('system_settings.decision.routing.choose_connections', side_effect=answer) as provider:
                prepare(item, self.agent)
                self.assertEqual([call.kwargs['scene'] for call in provider.call_args_list],
                                 ['alchemy_recipe', 'alchemy_quantity', 'alchemy_continue'])
            item.refresh_from_db()
            self.assertEqual(item.context['alchemy_plan']['entries'][0]['quantity'], 1)
            self.assertEqual(len(item.context['interleaving']['choices']), 3)
            with patch('system_settings.decision.routing.choose_connections', side_effect=AssertionError('No redraw')):
                prepare(item, self.agent)

    def test_recovery_reuses_craft_operations_and_debits(self):
        from .combat.profiles import ensure
        ensure('admin', self.agent)
        from .inventory_stock import add_stock
        from .life_interleaving import process
        from .life_craft_recovery import resume
        from .life_schedule import execution_key
        from .cooking_models import CookingOperation
        from system_settings.models import WorldAction
        add_stock(self.agent.pk, 'admin', self.agent.name, 'crop.potato', 2, '土豆', 'farm_product', 18)
        with patch('system_settings.decision.routing.choose_connections', side_effect=lambda owner, facts, choices, **kw: (next(iter(choices)), .9)):
            process(self.config, self.state(), None, self.now)
        item = LifeItem.objects.get()
        action = WorldAction.objects.get(pk=execution_key(item))
        item.status = 'running'; item.save()
        action.status = 'claimed'; action.save()
        operation_ids = list(CookingOperation.objects.values_list('pk', flat=True))
        debits = list(WorldAction.objects.filter(energy_cost__gt=0).values_list('pk', flat=True))
        with patch('system_settings.decision.routing.choose_connections', side_effect=AssertionError('No new decision')):
            self.assertTrue(resume(action, 'cooking'))
        self.assertEqual(list(CookingOperation.objects.values_list('pk', flat=True)), operation_ids)
        self.assertEqual(list(WorldAction.objects.filter(energy_cost__gt=0).values_list('pk', flat=True)), debits)
        action.refresh_from_db(); self.assertEqual(action.status, 'success')

    def test_idle_does_not_block_new_cycle_or_legacy_recovery(self):
        from .life_activities import main_items
        from .life_schedule import recover
        item = LifeItem.objects.create(pk='idle', owner_id='admin', actor_id=self.agent.pk, activity='cooking',
            original_at=self.now - timedelta(days=1), scheduled_at=self.now - timedelta(days=1),
            context={'interleaving': {'version': 1, 'opportunity_id': 'idle', 'expires_at': self.now.isoformat(), 'choices': []}})
        self.assertFalse(main_items(LifeItem.objects.all()).exists())
        recover(self.config, self.now)
        item.refresh_from_db()
        self.assertEqual(local_time(item.scheduled_at).date(), (self.now - timedelta(days=1)).date())

    def test_duration_shrinks_to_remaining_legal_choice(self):
        from .life_interleaving_candidates import legal_durations
        item = LifeItem.objects.create(pk='idle', owner_id='admin', actor_id=self.agent.pk, activity='exploration',
            original_at=self.now, scheduled_at=self.now, context={'interleaving': {'version': 1}})
        with patch('system_settings.agent_world.life_interleaving_candidates.available_window', return_value=2000), \
             patch('system_settings.agent_world.life_interleaving_candidates.capacity', return_value={'energy': 100}):
            self.assertEqual(legal_durations(item, (1800, 3600, 7200), seconds=True), [1800])

    def test_four_candidates_share_one_choice_and_events_keep_cooldown(self):
        from .life_interleaving import process
        from .inventory_stock import add_stock
        choices = {kind: {'energy_allowance': 20} for kind in ('cooking', 'alchemy', 'fishing', 'exploration')}
        state = self.state()
        with patch('system_settings.agent_world.life_interleaving.build', return_value=(choices, self.summary[1], 3600)), \
             patch('system_settings.agent_world.life_interleaving.choose', return_value='wait') as choose:
            process(self.config, state, None, self.now)
            self.assertEqual(set(choose.call_args.args[4]), {*choices, 'wait'})
            add_stock(self.agent.pk, 'admin', self.agent.name, 'crop.potato', 2, '土豆', 'farm_product', 18)
            state.refresh_from_db()
            process(self.config, state, None, self.now + timedelta(minutes=1))
            self.assertEqual(choose.call_count, 1)

    def test_disable_during_choice_does_not_start_activity(self):
        from .life_interleaving import process
        from system_settings.models import AgentRunRecord
        def disable(*args, **kwargs):
            config = LifeConfig.objects.get(pk=self.config.pk)
            config.settings['interleaving_enabled'] = False
            config.save()
            return 'cooking'
        state = self.state()
        with patch('system_settings.agent_world.life_interleaving.build', return_value=self.summary), \
             patch('system_settings.agent_world.life_interleaving.choose', side_effect=disable):
            process(self.config, state, None, self.now)
        self.assertFalse(LifeItem.objects.exists())
        record = AgentRunRecord.objects.get(trigger='系统穿插')
        self.assertEqual(record.status, 'failed')
        state.refresh_from_db()
        self.assertEqual((state.phase, state.checkpoint), ('idle', {}))
        self.assertEqual(local_time(state.next_decision_at), self.now + timedelta(minutes=30))
        self.config.refresh_from_db()
        self.config.settings['interleaving_enabled'] = True
        self.config.save()
        later = self.now + timedelta(minutes=31)
        with patch('django.utils.timezone.now', return_value=storage_time(later)), \
             patch('system_settings.agent_world.life_interleaving.build', return_value=self.summary), \
             patch('system_settings.agent_world.life_interleaving.choose', return_value='wait'):
            process(self.config, state, None, later)
        record.refresh_from_db()
        self.assertEqual(record.status, 'failed')
        self.assertEqual(AgentRunRecord.objects.filter(trigger='系统穿插').count(), 2)

    def test_expired_unattached_choices_finish_when_resident_is_not_scheduled(self):
        from .life_interleaving_usage import root_record
        from .life_runner import tick_life
        from system_settings.models import Agent, WorldActionRuntime
        state = self.state()
        for mode in ('interleaving_disabled', 'world_disabled', 'paused', 'removed', 'archived'):
            with self.subTest(mode=mode):
                self.config.settings = {**self.config.settings, 'interleaving_enabled': mode != 'interleaving_disabled'}
                self.config.paused_agents = [self.agent.pk] if mode == 'paused' else []
                self.config.save()
                cycle = LifeCycle.objects.get(pk='cycle')
                cycle.snapshot['participants'] = [] if mode == 'removed' else [self.agent.pk]
                cycle.save()
                Agent.objects.filter(pk=self.agent.pk).update(archived_at=storage_time(self.now) if mode == 'archived' else None)
                WorldActionRuntime.objects.filter(pk='world').update(enabled=mode != 'world_disabled')
                opportunity = 'expired-' + mode
                record = root_record('admin', self.agent, opportunity)
                state.phase = 'backoff'
                state.checkpoint = {'opportunity_id': opportunity, 'selected': 'cooking',
                    'selected_at': (self.now - timedelta(hours=1)).isoformat(),
                    'expires_at': (self.now - timedelta(seconds=1)).isoformat()}
                state.next_decision_at = self.now + timedelta(hours=2)
                state.save()
                with patch('system_settings.agent_world.life_runner._plan_cycle'), \
                     patch('system_settings.agent_world.life_runner.due_item', return_value=None):
                    tick_life(None)
                    tick_life(None)
                record.refresh_from_db(); state.refresh_from_db()
                self.assertEqual(record.status, 'failed')
                self.assertEqual(len(record.steps), 1)
                self.assertEqual((state.phase, state.checkpoint), ('idle', {}))
                self.assertEqual(local_time(state.next_decision_at), self.now + timedelta(hours=2))
                self.assertFalse(LifeItem.objects.exists())

    def test_selection_cleanup_preserves_domain_worker_and_unexpired_choice(self):
        from .life_interleaving_usage import root_record
        from .life_runner import tick_life
        from system_settings.models import WorldActionRuntime
        WorldActionRuntime.objects.filter(pk='world').update(enabled=False)
        state = self.state()
        record = root_record('admin', self.agent, 'domain-owned')
        marker = {'version': 1, 'opportunity_id': 'domain-owned', 'selection_record_id': record.pk,
                  'expires_at': (self.now - timedelta(seconds=1)).isoformat()}
        item = LifeItem.objects.create(pk='domain-owned', owner_id='admin', actor_id=self.agent.pk,
            original_at=self.now, scheduled_at=self.now, activity='cooking', status='running',
            context={'interleaving': marker, 'execution_started': self.now.isoformat()})
        for linked in (item, None):
            state.item = linked
            state.checkpoint = {key: marker[key] for key in ('opportunity_id', 'expires_at')}
            state.save()
            with patch('system_settings.agent_world.life_runner.finish_running'):
                tick_life(None)
            record.refresh_from_db(); item.refresh_from_db(); state.refresh_from_db()
            self.assertEqual((record.status, item.status), ('running', 'running'))
            self.assertEqual(state.checkpoint['opportunity_id'], 'domain-owned')
        item.delete()
        pending = root_record('admin', self.agent, 'not-expired')
        state.checkpoint = {'opportunity_id': 'not-expired', 'expires_at': (self.now + timedelta(hours=1)).isoformat()}
        state.save()
        tick_life(None)
        pending.refresh_from_db(); state.refresh_from_db()
        self.assertEqual(pending.status, 'running')
        self.assertEqual(state.checkpoint['opportunity_id'], 'not-expired')

    def test_terminal_selection_record_cannot_be_reused_for_new_activity(self):
        from .life_interleaving import process
        from .life_interleaving_usage import root_record
        from .run_diagnostics import finish_record
        state = self.state()
        record = root_record('admin', self.agent, 'already-finished')
        finish_record(record, 'failed', '旧机会已经结束', '', '空档选择结束')
        state.checkpoint = {'opportunity_id': 'already-finished', 'selected': 'cooking',
            'selected_at': self.now.isoformat(), 'expires_at': (self.now + timedelta(hours=1)).isoformat()}
        state.save()
        with patch('system_settings.agent_world.life_interleaving.build', return_value=self.summary), \
             patch('system_settings.agent_world.life_interleaving.prepare') as prepare, \
             patch('system_settings.agent_world.life_runner.execute_item') as execute:
            process(self.config, state, None, self.now)
        self.assertFalse(LifeItem.objects.exists())
        prepare.assert_not_called(); execute.assert_not_called()
        record.refresh_from_db(); state.refresh_from_db()
        self.assertEqual(record.status, 'failed')
        self.assertEqual((state.phase, state.checkpoint), ('idle', {}))

    def test_sync_checks_choice_and_record_ownership_and_repeated_restore(self):
        import json
        from .life_interleaving import process
        from .life_interleaving_sync import validate_snapshot
        from .life_sync import checkpoint_all, reconcile_life
        from .life_models import LifeProfile
        from system_settings.models import AgentRunRecord, WorldActionRuntime
        from utils.sync_manager import SyncError
        state = self.state()
        with patch('system_settings.agent_world.life_interleaving.build', return_value=self.summary), \
             patch('system_settings.agent_world.life_interleaving.choose', return_value='cooking'), \
             patch('system_settings.agent_world.life_interleaving.prepare'), \
             patch('system_settings.agent_world.life_runner.execute_item'):
            process(self.config, state, None, self.now)
        data = json.loads(serializers.serialize('json', [*LifeProfile.objects.all(), *LifeItem.objects.all(),
            *LifeInterleavingState.objects.all(), *AgentRunRecord.objects.all()]))
        validate_snapshot(data)
        checkpoint_all()
        reconcile_life()
        reconcile_life()
        self.assertEqual(LifeItem.objects.count(), 1)
        self.assertFalse(WorldActionRuntime.objects.get(pk='world').enabled)
        bad = copy.deepcopy(data)
        next(r for r in bad if r['model'].endswith('agentrunrecord'))['fields']['random_context']['owner_id'] = 'foreign'
        with self.assertRaises(SyncError):
            validate_snapshot(bad)
        bad = copy.deepcopy(data)
        marker = next(r for r in bad if r['model'].endswith('lifeitem'))['fields']['context']['interleaving']
        marker['choices'] = [{'question': 'same', 'scene': 'cooking_recipe', 'choice': 'a'}] * 2
        with self.assertRaises(SyncError):
            validate_snapshot(bad)

    def test_optional_exploration_shopping_preserves_departure_energy(self):
        from types import SimpleNamespace
        from .life_interleaving_preparation import fit_supply_energy
        item = LifeItem.objects.create(pk='idle', owner_id='admin', actor_id=self.agent.pk, activity='exploration',
            original_at=self.now, scheduled_at=self.now, context={'interleaving': {'version': 1}})
        run = SimpleNamespace(life_item_id=item.pk)
        plan = {'duration_seconds': 1800, 'purchases': {'potion.heal.1': 2}, 'potions': {'potion.heal.1': 2}}
        with patch('system_settings.agent_world.life_commitments.capacity', return_value={'energy': 22}):
            fitted = fit_supply_energy(run, self.agent, plan)
            self.assertEqual(fitted['purchases'], {})
            self.assertEqual(fitted['potions'], {})
        with patch('system_settings.agent_world.life_commitments.capacity', return_value={'energy': 27}):
            self.assertEqual(fit_supply_energy(run, self.agent, plan), plan)

    def test_late_automatic_debit_rechecks_current_manual_spending(self):
        from system_settings.models import WorldAction
        from .life_commitments import require_energy, ResourceProtected
        WorldAction.objects.create(pk='manual-consumption', actor_id=self.agent.pk, status='success',
                                   consumed_at=storage_time(self.now - timedelta(seconds=1)), energy_cost=100)
        with self.assertRaises(ResourceProtected):
            require_energy('admin', self.agent, 1, now=self.now - timedelta(minutes=10))

    def test_expired_unselected_checkpoint_does_not_replay_next_day(self):
        from .life_interleaving import process
        from .life_interleaving_usage import root_record
        state = self.state()
        old = root_record('admin', self.agent, 'old-opportunity')
        state.checkpoint = {'opportunity_id': 'old-opportunity', 'selected': 'cooking',
                            'expires_at': (self.now - timedelta(seconds=1)).isoformat()}
        state.save()
        with patch('system_settings.agent_world.life_interleaving.build', return_value=self.summary), \
             patch('system_settings.agent_world.life_interleaving.choose', return_value='wait') as choose:
            process(self.config, state, None, self.now)
            choose.assert_called_once()
        old.refresh_from_db()
        self.assertEqual(old.status, 'failed')
        self.assertFalse(LifeItem.objects.exists())

    def test_late_model_response_cannot_start_expired_opportunity(self):
        from .life_interleaving import process
        from system_settings.models import AgentRunRecord
        state = self.state()
        with patch('system_settings.agent_world.life_interleaving.build', return_value=self.summary), \
             patch('system_settings.agent_world.life_interleaving.choose', return_value='cooking'), \
             patch('django.utils.timezone.now', return_value=storage_time(self.now + timedelta(hours=2))):
            process(self.config, state, None, self.now)
        self.assertFalse(LifeItem.objects.exists())
        self.assertEqual(AgentRunRecord.objects.get(trigger='系统穿插').status, 'failed')
