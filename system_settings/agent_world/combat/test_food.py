"""Food rules, authoritative consumption, combat lifecycle and cross-domain sync."""
import copy
import json
import math
import random
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from pathlib import Path
from tempfile import TemporaryDirectory

from django.apps import apps
from django.core import serializers
from django.test import SimpleTestCase, TestCase

from system_settings.models import Agent, AIProvider, AIModel
from .. import food_effects, food_sync
from ..cooking_catalog import DEFAULT_RULES
from ..inventory_stock import add_stock, stock_quantity
from ..life_time import local_time, storage_time
from ..travel_models import AgentInventoryItem
from . import attributes, engine, explorations, food
from .catalog import bundled
from .facts import append
from .models import CombatFact, CombatProfile
from .preparation import prepare
from .profiles import wearing
from .queries import profile_view, snapshot
from .store import install
from .sync import metadata, validate_source


class FoodRuleTests(SimpleTestCase):
    def test_all_recipes_and_star_tiers_have_exact_effects(self):
        self.assertEqual(set(food_effects.BASE_EFFECTS), set(DEFAULT_RULES))
        for recipe_id, base in food_effects.BASE_EFFECTS.items():
            tiers = food_effects.previews(recipe_id)
            self.assertEqual([tier['stars'] for tier in tiers], [1, 2, 3, 4, 5])
            for tier, multiplier in zip(tiers, food_effects.STAR_MULTIPLIERS):
                self.assertEqual(tier['effects'], {key: float(Decimal(str(value)) * Decimal(multiplier))
                                                  for key, value in base.items()})
                self.assertTrue(tier['summary'])
        self.assertEqual(food_effects.effects_for('baked_potato', 3), {'physical_attack': .09})
        self.assertEqual(food_effects.describe({'physical_attack': .1}), '物理攻击+10%')
        for stars in (0, 6, True, '3'):
            with self.assertRaises(ValueError):
                food_effects.effects_for('baked_potato', stars)

    def test_duration_and_quantity_are_authoritative(self):
        for seconds, quantity in ((1800, 1), (3600, 2), (7200, 4)):
            self.assertEqual(food_effects.portions(seconds), quantity)
            with self.assertRaises(ValueError):
                food_effects.validate_selection({'recipe_id': 'baked_potato', 'stars': 1,
                                                 'quantity': quantity + 1}, seconds)

    def test_final_attack_multiplier_and_elements_merge_before_caps(self):
        catalog = bundled()[0]
        progress = attributes.initial()
        gear = [{'slot': 'body', 'stats': {'fire_power': .6, 'water_resist': -.5}}]
        base = attributes.attributes(catalog, progress, gear)
        boosted = attributes.attributes(catalog, progress, gear,
                    food_effects={'physical_attack': .09, 'fire_power': .06, 'water_resist': .1})
        self.assertEqual(boosted['physical_attack'], math.floor(Decimal(base['physical_attack']) * Decimal('1.09')))
        self.assertEqual(boosted['fire_power'], .4)
        self.assertEqual(boosted['water_resist'], -.25)  # -.5 + .1, then clamp; not -.25 + .1
        self.assertEqual(boosted['element'], base['element'])
        self.assertEqual(progress, attributes.initial())

    def test_recovery_is_capped_minimum_one_and_never_revives(self):
        meal = {'name': '派', 'effects': {'hp_recovery': .006, 'mp_recovery': .006}}
        player = engine.fighter({'hp_max': 100, 'mp_max': 100}, 'A', 1, hp=99, mp=0)
        events = food_effects.recover(player, meal)
        self.assertEqual((player['hp'], player['mp']), (100, 1))
        self.assertEqual([event.get('healing', event.get('restored')) for event in events], [1, 1])
        player.update(hp=0, mp=0)
        self.assertEqual(food_effects.recover(player, meal), [])
        self.assertEqual((player['hp'], player['mp']), (0, 0))

    def test_recovery_runs_once_before_action_only_when_fighting(self):
        catalog = bundled()[0]
        stats = attributes.attributes(catalog, attributes.initial(), [])
        state = {'player': engine.fighter(stats, 'A', 1, hp=20, mp=0),
                 'enemy': engine.fighter(stats, 'B', 1), 'monster_id': 'monster.slime', 'potions': {},
                 'food': {'name': '派', 'effects': {'hp_recovery': .1, 'mp_recovery': .1}}}
        original = copy.deepcopy(state)

        def action(catalog, player, *args):
            self.assertEqual(player['hp'], 20 + max(1, math.floor(stats['hp_max'] * .1)))
            self.assertEqual(player['mp'], max(1, math.floor(stats['mp_max'] * .1)))
            return []

        with patch.object(engine, 'player_action', side_effect=action), patch.object(engine, 'enemy_action', return_value=[]):
            result, events = engine.step(catalog, state, 'style.balanced', 1, random.Random(1))
        self.assertEqual(len(events), 2)
        self.assertEqual(state, original)
        for waiting, enemy, hp in ((True, state['enemy'], 20), (False, None, 20), (False, state['enemy'], 0)):
            test = copy.deepcopy(state)
            test['enemy'], test['player']['hp'] = enemy, hp
            result, events = engine.step(catalog, test, 'style.balanced', 1, random.Random(1), waiting=waiting)
            self.assertEqual(result['player']['hp'], hp)
            self.assertEqual(result['player']['mp'], 0)
            self.assertFalse(events)


class FoodExplorationTests(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(prefix='odoc-food-tests-')
        self.addCleanup(self.temp.cleanup)
        isolated = self.settings(MEDIA_ROOT=self.temp.name, ODOC_WORLD_LOCK_PATH=str(Path(self.temp.name) / 'world.lock'))
        isolated.enable()
        self.addCleanup(isolated.disable)
        self.catalog = install()
        provider = AIProvider.objects.create(name='test', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='test', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='A', model=model)
        self.now = storage_time(local_time())
        dungeon = min(self.catalog.tables['dungeons'], key=lambda row: int(row['recommended_level_min']))
        self.plan = {'dungeon_id': dungeon['id'], 'duration_seconds': 1800, 'style_id': 'style.balanced',
                     'potions': {}, 'food': {'recipe_id': 'baked_potato', 'stars': 3, 'quantity': 1}}

    def stock(self, recipe='baked_potato', stars=3, quantity=4, price='10'):
        return add_stock(self.agent.pk, 'admin', self.agent.name, 'dish.' + recipe, quantity,
                         DEFAULT_RULES[recipe]['name'], 'dish', price, 'fixture', stars=stars)

    def trip(self, key='trip', plan=None):
        run = explorations.request('admin', self.agent, key, {}, now=self.now)
        return explorations.depart(run.pk, plan or self.plan, now=self.now)

    def exported(self):
        return json.loads(serializers.serialize('json', [row
            for model in apps.get_app_config('system_settings').get_models()
            if model.__name__ != 'CombatRuntime' for row in model.objects.all()]))

    def test_candidates_filter_duration_and_keep_star_groups_separate(self):
        self.stock(stars=3, quantity=3)
        self.stock(stars=2, quantity=1)
        self.assertEqual(food.candidates(self.agent.pk, 'admin', 7200), {})
        self.assertEqual(set(food.candidates(self.agent.pk, 'admin', 3600)), {'baked_potato:3'})
        self.stock(stars=3, quantity=1)
        candidate = food.candidates(self.agent.pk, 'admin', 7200)['baked_potato:3']
        self.assertEqual((candidate['quantity'], candidate['owned']), (4, 4))
        self.assertEqual(food.candidates(self.agent.pk, 'other', 1800), {})
        self.assertEqual(food.candidates('other', 'admin', 1800), {})

    def test_fifo_across_rows_and_price_lots_consumes_only_selected_stars(self):
        self.stock(stars=1, quantity=9)
        first = self.stock(quantity=1, price='10')
        self.stock(quantity=1, price='20')
        second = AgentInventoryItem.objects.get(pk=first.pk)
        second.pk = 'later-inventory'
        second.quantity, second.value = 4, Decimal('30')
        second.source = {**second.source, 'lots': [{'quantity': 4, 'price': '30'}]}
        second.save(force_insert=True)
        run = self.trip(plan={**self.plan, 'duration_seconds': 7200,
                              'food': {**self.plan['food'], 'quantity': 4}})
        self.assertFalse(AgentInventoryItem.objects.filter(pk=first.pk).exists())
        second.refresh_from_db()
        self.assertEqual((second.quantity, second.source['lots']), (2, [{'quantity': 2, 'price': '30'}]))
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 11)
        self.assertEqual([row['lots'] for row in run.snapshot['food']['consumed']],
                         [[{'quantity': 1, 'price': '10'}, {'quantity': 1, 'price': '20'}], [{'quantity': 2, 'price': '30'}]])

    def test_departure_is_idempotent_and_rollback_restores_food(self):
        item = self.stock()
        run = explorations.request('admin', self.agent, 'trip', {}, now=self.now)
        with patch.object(explorations, 'spawn', side_effect=ValueError('fixture failure')):
            with self.assertRaises(ValueError):
                explorations.depart(run.pk, self.plan, now=self.now)
        item.refresh_from_db()
        self.assertEqual(item.quantity, 4)
        self.assertFalse(CombatFact.objects.filter(kind='depart').exists())
        run = explorations.depart(run.pk, self.plan, now=self.now)
        explorations.depart(run.pk, self.plan, now=self.now)
        item.refresh_from_db()
        self.assertEqual(item.quantity, 3)
        self.assertEqual(CombatFact.objects.filter(kind='depart').count(), 1)
        self.assertEqual(snapshot(run)['result']['food']['quantity'], 1)

    def test_missing_stock_falls_back_and_early_finish_does_not_refund(self):
        run = self.trip()
        self.assertIsNone(run.snapshot['food'])
        self.assertIsNone(run.snapshot['plan']['food'])
        self.assertIn('库存不足', run.result['food_adjustment'])
        explorations.finish(run.pk, now=self.now)
        self.stock()
        run = self.trip('next')
        explorations.finish(run.pk, now=self.now)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 3)
        self.assertIn('3星烤土豆×1份', explorations.Exploration.objects.get(pk=run.pk).result['report'])
        profile = CombatProfile.objects.get(pk=self.agent.pk)
        self.assertEqual(profile_view('admin', self.agent)['attributes'], attributes.attributes(
            self.catalog, profile.progression, wearing(profile)))

    def test_empty_candidates_skip_models_and_invalid_response_falls_back(self):
        run = explorations.request('admin', self.agent, 'trip', {}, now=self.now)
        with patch('system_settings.agent_world.combat.preparation_decision._choice') as choice:
            selected, _ = food.choose(run, self.agent, 1800, structured=True)
        choice.assert_not_called()
        self.assertIsNone(selected)
        self.stock()
        selected, record = food.choose(run, self.agent, 1800, structured=False, planner=lambda *args: {'choice': 'bad'})
        self.assertEqual(selected, self.plan['food'])
        self.assertEqual(record['source'], 'code_fallback')
        with patch('system_settings.agent_world.combat.preparation_decision._choice', return_value=('none', {})):
            self.assertIsNone(food.choose(run, self.agent, 1800, structured=True)[0])

    def test_structured_order_minimal_input_and_selected_summary(self):
        self.stock()
        run = explorations.request('admin', self.agent, 'trip', {}, now=self.now)
        asked = []

        def choice(run, agent, question_id, state, choices, fallback, instructions, **kwargs):
            asked.append(question_id)
            selected = {'dungeon_id': self.plan['dungeon_id'], 'duration_seconds': '1800', 'food': 'baked_potato:3',
                        'style_id': 'style.balanced', 'red_potion_count': '0', 'blue_potion_count': '0'}.get(question_id, fallback)
            if question_id == 'food':
                self.assertEqual(state, {'required_quantity': 1})
                self.assertIn('物理攻击+9%', choices[selected])
            if question_id in ('style_id', 'red_potion_count', 'blue_potion_count'):
                self.assertEqual(state['selected_food'], '物理攻击+9%')
            return selected, {'choice': selected, 'source': 'decision_model'}

        with patch('system_settings.decision.routing.jev_enabled', return_value=True), \
                patch('system_settings.agent_world.combat.preparation_decision._choice', side_effect=choice):
            run = prepare(run.pk)
        self.assertEqual(asked[:6], ['dungeon_id', 'duration_seconds', 'food', 'style_id', 'red_potion_count', 'blue_potion_count'])
        self.assertEqual(run.snapshot['food']['stars'], 3)
        self.assertEqual(profile_view('admin', self.agent)['attributes'], run.state['player']['stats'])

    def test_text_path_uses_independent_food_question_and_never_trusts_effects(self):
        self.stock()
        run = explorations.request('admin', self.agent, 'trip', {}, now=self.now)
        with patch('system_settings.decision.routing.jev_enabled', return_value=False):
            run = prepare(run.pk, planner=lambda agent, instruction, state:
                          {'choice': 'baked_potato:3'} if 'choices' in state else {key: value for key, value in self.plan.items() if key != 'food'})
        self.assertEqual(run.snapshot['food']['effects'], {'physical_attack': .09})
        self.assertEqual(run.snapshot['preparation_decisions']['food']['source'], 'text_model')

    def test_pause_resume_retains_effect_and_does_not_consume_again(self):
        self.stock()
        run = self.trip()
        run.status, run.phase = 'paused', 'interrupted'
        run.save()
        append(CombatProfile.objects.get(pk=self.agent.pk), 'pause-test', 'pause', {}, run)
        resumed = explorations.resume(run.pk, now=self.now + timedelta(seconds=15))
        self.assertEqual(resumed.state['food'], run.state['food'])
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 3)

    def test_sync_roundtrip_and_tampering_rejected_in_both_domains(self):
        self.stock()
        run = self.trip()
        data = self.exported()
        meta = metadata(data)
        validate_source(data, meta)
        food_sync.validate_source(data, meta, require_manifest=True)
        from ..cooking_quality_sync import validate_source as validate_cooking, metadata as cooking_metadata
        validate_cooking(data, cooking_metadata(data))
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 3)
        from utils.sync_manager import SyncError
        for mutation in ('missing', 'effects', 'quantity', 'stars', 'owner', 'lots'):
            bad = copy.deepcopy(data)
            row = next(row for row in bad if row['model'] == food_sync.RUN and str(row['pk']) == run.pk)['fields']
            if mutation == 'missing':
                row['snapshot'].pop('food')
            elif mutation in ('effects', 'quantity', 'stars'):
                row['snapshot']['food'][mutation] = {} if mutation == 'effects' else 5
            elif mutation == 'owner':
                row['snapshot']['food']['consumed'][0]['owner_id'] = 'other'
            else:
                row['snapshot']['food']['consumed'][0]['lots'][0]['quantity'] = 99
            with self.subTest(mutation=mutation), self.assertRaises(SyncError):
                validate_source(bad, meta)
            with self.subTest(domain='cooking', mutation=mutation), self.assertRaises(SyncError):
                validate_cooking(bad, cooking_metadata(data))
        with self.assertRaises(SyncError):
            validate_source(data, {**meta, 'food_explorations': []})

    def test_old_explorations_without_food_still_validate(self):
        run = explorations.request('admin', self.agent, 'legacy', {}, now=self.now)
        data = self.exported()
        validate_source(data)
        self.assertNotIn('food_version', run.snapshot)

    def test_level_up_rebuilds_bonus_once(self):
        self.stock()
        run = self.trip()

        def killed(catalog, state, *args, **kwargs):
            result = copy.deepcopy(state)
            result['enemy']['hp'] = 0
            return result, []

        gain = int(self.catalog.row('level_experience', 'level.1')['experience_to_next'])
        with patch.object(engine, 'step', side_effect=killed), patch.object(attributes, 'kill_experience', return_value=gain):
            run = explorations.tick(run.pk, now=self.now + timedelta(seconds=15))
        profile = CombatProfile.objects.get(pk=self.agent.pk)
        self.assertGreater(profile.progression['level'], 1)
        self.assertEqual(run.state['player']['stats'], food.combat_stats(profile, self.catalog, run.snapshot))
        self.assertEqual(run.state['food'], run.snapshot['food'])
        base = attributes.attributes(self.catalog, profile.progression, wearing(profile))
        self.assertEqual(run.state['player']['stats']['physical_attack'], math.floor(Decimal(base['physical_attack']) * Decimal('1.09')))

    def test_promotion_rebuild_keeps_food_without_consuming_again(self):
        from .preparation import promotion
        self.stock()
        run = self.trip()
        profile = CombatProfile.objects.get(pk=self.agent.pk)
        gained = sum(int(self.catalog.row('level_experience', f'level.{level}')['experience_to_next']) for level in range(1, 10))
        profile.progression, _ = attributes.award(self.catalog, profile.progression, gained, stop_at_promotion=True)
        profile.save()
        explorations.hold_for_promotion(run, profile)
        job = attributes.promotion_options(self.catalog, profile.progression)[0]['id']
        promotion(run.pk, planner=lambda *args: {'job_id': job, 'reason': 'fixture'})
        run.refresh_from_db()
        profile.refresh_from_db()
        self.assertEqual(run.status, 'active')
        self.assertEqual(run.state['player']['stats'], food.combat_stats(profile, self.catalog, run.snapshot))
        self.assertEqual(run.state['food'], run.snapshot['food'])
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 3)

    def test_text_failure_falls_back_but_cancellation_stops_preparation(self):
        self.stock()
        run = explorations.request('admin', self.agent, 'trip', {}, now=self.now)
        def unavailable(*args):
            raise TimeoutError('fixture')
        self.assertEqual(food.choose(run, self.agent, 1800, structured=False, planner=unavailable)[0], self.plan['food'])
        def cancel(*args):
            explorations.CombatRuntime.objects.filter(pk=run.pk).update(authorized=False)
            raise TimeoutError('fixture')
        def check():
            if not explorations.CombatRuntime.objects.filter(pk=run.pk, authorized=True).exists():
                raise ValueError('准备已取消')
        with self.assertRaisesMessage(ValueError, '准备已取消'):
            food.choose(run, self.agent, 1800, structured=False, planner=cancel, check=check)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 4)

    def test_outage_defaults_to_three_red_potions_and_random_available_food(self):
        from .profiles import ensure
        ensure('admin', self.agent, self.now)
        self.stock(quantity=1)
        self.stock(recipe='pumpkin_pie', stars=1, quantity=1)
        add_stock(self.agent.pk, 'admin', self.agent.name, 'combat.potion.heal.1', 3,
                  '红药', 'combat_potion', '10', 'fixture')
        run = explorations.request('admin', self.agent, 'fallback-trip', {}, now=self.now)
        with patch('system_settings.decision.routing.jev_enabled', return_value=True), \
                patch('system_settings.decision.routing.choose_scene', return_value=None):
            run = prepare(run.pk)
        plan = run.snapshot['plan']
        self.assertEqual(plan['duration_seconds'], 1800)
        self.assertEqual(plan['potions'], {'potion.heal.1': 3})
        self.assertIn(plan['food']['recipe_id'], ('baked_potato', 'pumpkin_pie'))
        self.assertEqual(plan['food']['quantity'], 1)
        trace = run.snapshot['preparation_decisions']
        self.assertEqual(trace['red_potion_count']['source'], 'code_fallback')
        self.assertEqual(trace['red_potion_count']['choice'], 3)
        self.assertEqual(trace['blue_potion_count']['choice'], 0)
        self.assertEqual(trace['food']['source'], 'code_fallback')
        self.assertEqual(trace['food']['choice'], f"{plan['food']['recipe_id']}:{plan['food']['stars']}")

    def test_food_fallback_is_repeatable_and_filters_by_selected_duration(self):
        self.stock(quantity=4)
        self.stock(recipe='pumpkin_pie', stars=1, quantity=3)
        run = explorations.request('admin', self.agent, 'trip', {}, now=self.now)
        with patch('system_settings.decision.routing.choose_scene', return_value=None):
            first, record = food.choose(run, self.agent, 7200, structured=True)
            second, _ = food.choose(run, self.agent, 7200, structured=True)
        self.assertEqual(first, {**self.plan['food'], 'quantity': 4})
        self.assertEqual(second, first)
        self.assertEqual(record['source'], 'code_fallback')
        # Preparing a choice never consumes the stock.
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 4)

    def test_explicit_model_none_and_zero_potions_are_preserved(self):
        self.stock()
        run = explorations.request('admin', self.agent, 'trip', {}, now=self.now)
        with patch('system_settings.decision.routing.choose_scene', return_value=('none', 1)):
            selection, record = food.choose(run, self.agent, 1800, structured=True)
        self.assertIsNone(selection)
        self.assertEqual(record['source'], 'decision_model')
        selection, record = food.choose(run, self.agent, 1800, structured=False, planner=lambda *args: {'choice': 'none'})
        self.assertIsNone(selection)
        self.assertEqual(record['source'], 'text_model')
        from .preparation_decision import _choice
        with patch('system_settings.decision.routing.choose_scene', return_value=('0', 1)):
            selection, record = _choice(run, self.agent, 'red_potion_count', {},
                                        {'0': '0瓶', '3': '3瓶'}, '3', '')
        self.assertEqual(selection, '0')
        self.assertEqual(record['source'], 'decision_model')

    def test_native_text_request_contains_only_food_choices(self):
        self.stock()
        run = explorations.request('admin', self.agent, 'trip', {}, now=self.now)
        def complete(agent, prompt, validate, **kwargs):
            context = json.loads(prompt.split('\n', 1)[1])
            self.assertEqual(set(context), {'choices', 'required_quantity'})
            self.assertNotIn('memory', prompt)
            return validate({'choice': 'baked_potato:3'})
        with patch('system_settings.decision.routing.complete_json', side_effect=complete):
            selection, _ = food.choose(run, self.agent, 1800, structured=False)
        self.assertEqual(selection, self.plan['food'])

    def test_api_food_contract_authentication_and_camel_case(self):
        from django.contrib.auth.models import User
        from rest_framework.test import APIClient
        client = APIClient()
        url = '/api/settings/agent-world/cooking/recipes/'
        self.assertIn(client.get(url).status_code, (401, 403))
        client.force_authenticate(User.objects.create_superuser('admin', password='fixture'))
        response = client.get(url)
        self.assertEqual(response.status_code, 200)
        recipes = response.json()['data']['recipes']
        self.assertEqual(len(recipes), 20)
        self.assertEqual(recipes[0]['adventureEffects'][2]['effects']['physicalAttack'], .09)
        self.stock()
        run = self.trip()
        response = client.get(f'/api/settings/agent-world/combat/explorations/{run.pk}/')
        self.assertEqual(response.status_code, 200)
        meal = response.json()['data']['result']['food']
        self.assertEqual(meal['recipeId'], 'baked_potato')
        self.assertEqual(meal['consumed'][0]['ownerId'], 'admin')
        self.assertEqual(meal['effects']['physicalAttack'], .09)
        stranger = User.objects.create_user('stranger', password='fixture')
        client.force_authenticate(stranger)
        self.assertEqual(client.get(f'/api/settings/agent-world/combat/explorations/{run.pk}/').status_code, 404)

    def test_restore_twice_does_not_reconsume_or_recreate_food(self):
        from utils.sync_manager import SyncManager
        from ..cooking_catalog import catalog_for
        from ..life_config import config_for
        config_for('admin')
        catalog_for('admin')
        self.stock()
        run = self.trip()
        explorations.finish(run.pk, now=self.now + timedelta(seconds=15))
        manager = SyncManager()
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        # All restore/media paths must stay inside this test's temporary directory.
        from django.conf import settings
        self.assertEqual(Path(settings.MEDIA_ROOT).resolve(), Path(self.temp.name).resolve())
        for _ in range(2):
            manager.apply_snapshot_data(copy.deepcopy(data), meta)
            self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 3)
            self.assertEqual(CombatFact.objects.filter(exploration_id=run.pk, kind='depart').count(), 1)
        run.refresh_from_db()
        self.assertEqual(run.result['food']['effects'], {'physical_attack': .09})

    def test_repair_mode_and_missing_versions_cannot_bypass_food_validation(self):
        from utils.sync_manager import SyncManager, SyncError
        self.stock()
        run = self.trip()
        data = self.exported()
        from ..cooking_quality_sync import metadata as cooking_metadata
        meta = {**metadata(data), **cooking_metadata(data)}
        with TemporaryDirectory(prefix='odoc-food-outside-') as outside:
            sentinel = Path(outside) / 'sentinel.txt'
            sentinel.write_bytes(b'untouched')
            for version in (None, {}, {**meta, 'combat_schema_version': 6}, {**meta, 'food_explorations': []}):
                with self.subTest(meta=version), self.assertRaises(SyncError):
                    SyncManager().apply_snapshot_data(copy.deepcopy(data), version, integrity='repair')
            bad = copy.deepcopy(data)
            for row in bad:
                if row['model'] == food_sync.RUN:
                    for frame in (row['fields']['snapshot'], row['fields']['state'], row['fields']['result']):
                        frame['food']['effects']['physical_attack'] = .99
                if row['model'] == food_sync.FACT and row['fields']['kind'] == 'depart':
                    row['fields']['payload']['food']['effects']['physical_attack'] = .99
            with self.assertRaises(SyncError):
                SyncManager().apply_snapshot_data(bad, meta, integrity='repair')
            self.assertEqual(sentinel.read_bytes(), b'untouched')
        run.refresh_from_db()
        self.assertEqual(run.snapshot['food']['effects'], {'physical_attack': .09})
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 3)

    def test_old_departed_snapshot_compatibility_and_version_downgrade_rejection(self):
        from utils.sync_manager import SyncError
        run = self.trip()
        data = self.exported()
        with self.assertRaises(SyncError):
            validate_source(data, {'combat_schema_version': 6})
        # A legacy snapshot has none of the new fields, including its departure fact.
        for row in data:
            fields = row['fields']
            if row['model'] == food_sync.RUN:
                for container in (fields['snapshot'], fields['state'], fields['result']):
                    for key in ('food', 'food_version', 'food_adjustment'):
                        container.pop(key, None)
                fields['snapshot']['plan'].pop('food', None)
            if row['model'] == food_sync.FACT and fields['kind'] == 'depart':
                for key in ('food', 'food_version', 'food_adjustment'):
                    fields['payload'].pop(key, None)
                fields['payload']['plan'].pop('food', None)
        food_sync.validate_source(data, {'combat_schema_version': 6})
