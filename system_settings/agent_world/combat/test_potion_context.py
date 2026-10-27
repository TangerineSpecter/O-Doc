"""Supply evidence stays personal, bounded and based on settled exploration facts."""
import json
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase

from system_settings.models import Agent, AIModel, AIProvider
from ..life_time import local_time, storage_time
from .explorations import request
from .facts import append
from .models import Exploration
from .party_models import AdventureEvent
from .potion_context import last_exploration
from .preparation import context
from .preparation_decision import build_plan
from .profiles import ensure, stats
from .store import install


class PotionContextTests(TestCase):
    def setUp(self):
        self.catalog = install()
        provider = AIProvider.objects.create(name='test', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='test', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='药剂测试', model=model)
        self.now = storage_time(local_time())
        self.profile = ensure('admin', self.agent, self.now)
        self.run = request('admin', self.agent, 'current-trip', {}, now=self.now)

    def previous(self, key='previous', **changes):
        values = dict(owner_id='admin', actor_id=self.agent.pk, catalog_id=self.catalog.version,
                      status='fallen', duration_seconds=1800, elapsed_seconds=1440,
                      snapshot={'plan': {'dungeon_id': 'dungeon.sprout_meadow',
                                        'potions': {'potion.heal.1': 8, 'potion.mana.1': 2}}},
                      result={'potions_used': {'potion.heal.1': 2, 'potion.mana.1': 1}},
                      ended_at=self.now - timedelta(minutes=1))
        values.update(changes)
        return Exploration.objects.create(pk=key, **values)

    def test_no_history_and_unsettled_or_unstarted_records_are_excluded(self):
        self.assertIsNone(last_exploration(self.run))
        self.previous('failed', status='failed')
        self.previous('unstarted', snapshot={'prepared_plan': {}})
        self.previous('unfinished', status='completed', ended_at=None)
        self.previous('other-owner', owner_id='other')
        self.previous('other-actor', actor_id='other')
        self.assertIsNone(last_exploration(self.run))

    def test_single_trip_actual_healing_excludes_blue_and_elixirs(self):
        previous = self.previous()
        events = [{'kind': 'potion', 'potion_id': 'potion.heal.1', 'restored': value} for value in (60, 15)]
        events += [{'kind': 'potion', 'potion_id': 'potion.mana.1', 'restored': 40},
                   {'kind': 'elixir', 'restored': 1000}]
        append(self.profile, 'prior-round', 'round', {'events': events}, previous)
        summary = last_exploration(self.run)
        self.assertEqual(summary, {'dungeon_id': 'dungeon.sprout_meadow', 'planned_minutes': 30,
                                  'actual_minutes': 24, 'outcome': '倒地', 'red_carried': 8,
                                  'red_used': 2, 'red_hp_restored': 75})
        self.assertLess(len(json.dumps(summary, ensure_ascii=False)), 300)
        self.assertEqual(context(self.run)['last_exploration'], summary)

    def test_group_healing_uses_referenced_events_and_only_self(self):
        previous = self.previous()
        event = AdventureEvent.objects.create(pk='shared-round', owner_id='admin', party_id='party',
            sequence=1, kind='round', payload={'events': [
                {'kind': 'potion', 'actor_id': self.agent.pk, 'potion_id': 'potion.heal.1', 'restored': 20},
                {'kind': 'potion', 'actor_id': self.agent.pk, 'potion_id': 'potion.heal.1', 'restored': 40},
                {'kind': 'potion', 'actor_id': 'teammate', 'potion_id': 'potion.heal.1', 'restored': 60}]})
        append(self.profile, 'personal-round', 'round', {'shared_event_id': event.pk, 'events': []}, previous)
        self.assertEqual(last_exploration(self.run)['red_hp_restored'], 60)

    def test_only_latest_settlement_and_missing_logs_are_unknown(self):
        self.previous('old', ended_at=self.now - timedelta(hours=2))
        latest = self.previous('latest', status='completed', elapsed_seconds=1800)
        summary = last_exploration(self.run)
        self.assertEqual(summary['outcome'], '完成')
        self.assertIsNone(summary['red_hp_restored'])
        latest.result = {'potions_used': {}}
        latest.save()
        self.assertEqual(last_exploration(self.run)['red_hp_restored'], 0)

    def test_only_supply_questions_receive_compact_evidence(self):
        self.previous()
        asked = {}

        def choose(run, agent, question, state, choices, fallback, instructions, **kwargs):
            asked[question] = state
            selected = {'dungeon_id': 'dungeon.sprout_meadow', 'duration_seconds': '1800',
                        'style_id': 'style.balanced', 'red_potion_count': '0',
                        'blue_potion_count': '0'}.get(question, fallback)
            return selected, {'choice': selected, 'source': 'decision_model'}

        with patch('system_settings.agent_world.combat.preparation_decision._choice', side_effect=choose):
            build_plan(self.run, self.agent, check=lambda: None)
        derived = stats(self.profile)
        for question in ('red_potion_count', 'blue_potion_count'):
            self.assertEqual(asked[question]['resources'], {'hp': self.profile.hp, 'hp_max': derived['hp_max'],
                                                           'mp': self.profile.mp, 'mp_max': derived['mp_max']})
            self.assertEqual(asked[question]['last_exploration']['red_carried'], 8)
            self.assertNotIn('events', asked[question]['last_exploration'])
        self.assertNotIn('last_exploration', asked['style_id'])
        self.assertNotIn('resources', asked['dungeon_id'])


    def supply_plan(self, red_count, red_id='potion.heal.1', *, real_tier_choice=False):
        from .preparation_decision import _choice as real_choice
        asked = {}

        def choose(run, agent, question, state, choices, fallback, instructions, **kwargs):
            asked[question] = (state, choices)
            if question == 'red_potion_id' and real_tier_choice:
                return real_choice(run, agent, question, state, choices, fallback, instructions, **kwargs)
            selected = {'dungeon_id': 'dungeon.sprout_meadow', 'duration_seconds': '1800',
                        'style_id': 'style.balanced', 'red_potion_count': str(red_count),
                        'red_potion_id': red_id, 'blue_potion_count': '0'}.get(question, fallback)
            return selected, {'choice': selected, 'source': 'decision_model'}

        with patch('system_settings.agent_world.combat.preparation_decision._choice', side_effect=choose):
            plan, trace = build_plan(self.run, self.agent, check=lambda: None)
        return plan, trace, asked

    def fund_and_level(self, level=30, money=1000):
        self.profile.progression = {**self.profile.progression, 'level': level}
        self.profile.save()
        self.agent.money = money
        self.agent.save(update_fields=['money'])

    def test_zero_red_skips_tier_question(self):
        self.fund_and_level()
        plan, trace, asked = self.supply_plan(0)
        self.assertNotIn('red_potion_id', asked)
        self.assertNotIn('red_potion_id', trace)
        self.assertEqual(plan['potions'], {})

    def test_chosen_low_tier_is_carried_and_bought_despite_higher_stock(self):
        from ..inventory_stock import add_stock
        self.fund_and_level()
        add_stock(self.agent.pk, 'admin', self.agent.name, 'combat.potion.heal.3', 10,
                  '红药', 'combat_potion', '30', 'higher-tier-stock')
        plan, trace, asked = self.supply_plan(3)
        self.assertEqual(plan['potions'], {'potion.heal.1': 3})
        self.assertEqual(plan['purchases'], {'potion.heal.1': 3})
        self.assertEqual(trace['red_potion_id']['choice'], 'potion.heal.1')
        self.assertEqual(asked['red_potion_id'][0]['selected_red_potion_count'], 3)
        self.assertEqual(set(asked['red_potion_id'][1]), {'potion.heal.1', 'potion.heal.2', 'potion.heal.3'})
        self.assertEqual(asked['red_potion_id'][1]['potion.heal.1']['purchase_cost'], '18.00')
        self.assertEqual(asked['blue_potion_count'][0]['selected_red_potion']['id'], 'potion.heal.1')

    def test_one_tier_skips_provider_and_uses_existing_stock_before_purchase(self):
        from ..inventory_stock import add_stock
        self.fund_and_level(level=1)
        add_stock(self.agent.pk, 'admin', self.agent.name, 'combat.potion.heal.1', 2,
                  '红药', 'combat_potion', '6', 'stock')
        with patch('system_settings.decision.routing.choose_scene') as provider:
            plan, trace, _ = self.supply_plan(3, real_tier_choice=True)
        provider.assert_not_called()
        self.assertEqual(trace['red_potion_id']['source'], 'single_candidate')
        self.assertEqual(plan['potions'], {'potion.heal.1': 3})
        self.assertEqual(plan['purchases'], {'potion.heal.1': 1})

    def test_unavailable_tiers_skip_choice_and_funding_changes_do_not_switch_tier(self):
        from .preparation import fit_potion_plan
        self.fund_and_level(money=0)
        plan, trace, asked = self.supply_plan(3)
        self.assertNotIn('red_potion_id', asked)
        self.assertEqual(trace['red_potion_id']['source'], 'unavailable')
        self.assertEqual(plan['potions'], {})
        self.fund_and_level()
        plan, _, _ = self.supply_plan(3, 'potion.heal.2')
        self.agent.money = 14
        self.agent.save(update_fields=['money'])
        fitted = fit_potion_plan(self.run, self.agent, plan)
        self.assertEqual(fitted['potions'], {'potion.heal.2': 1})
        self.assertEqual(fitted['purchases'], {'potion.heal.2': 1})

    def test_legacy_outage_uses_highest_obtainable_tier(self):
        self.fund_and_level()
        with patch('system_settings.decision.routing.choose_scene', return_value=None):
            plan, trace, _ = self.supply_plan(3, real_tier_choice=True)
        self.assertEqual(trace['red_potion_id']['source'], 'code_fallback')
        self.assertEqual(plan['potions'], {'potion.heal.3': 3})
