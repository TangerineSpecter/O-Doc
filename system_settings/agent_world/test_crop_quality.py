import copy
import math
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import TestCase, SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from system_settings.models import Agent, AgentTask, AIProvider, AIModel, AgentExecutionLease, WorldActionRuntime, SystemSetting, WorldAction
from .farm_models import AgentFarm, FarmCatalog, FarmOperation
from .farm_service import ensure_farms, commit_operation, advance_farm
from .farm_quality import probabilities, skill_progress, level_cost, unit_value, crop_result, experience_for, estimate, FERTILIZERS, roll
from .farm_quality_sync import validate_chain, metadata, validate_snapshot, validate_source
from .farm_catalog import DEFAULT_RULES, validate_rules
from .inventory_stock import add_stock, take_stock, stock_quantity, preview_cost
from .market_shop import current_batch, supply_quotes
from .market_sessions import enter
from .market_service import trade
from .market_spending import spending_context, check_purchase, MarketPurchaseBlocked
from .market_models import MarketTransaction, MarketListing
from utils.sync_manager import SyncError, SyncManager


class QualityAlgorithmTests(SimpleTestCase):
    def test_all_level_thresholds_and_quality_monotonicity(self):
        total, last_five = 0, -1
        for level in range(1, 100):
            self.assertEqual(skill_progress(total)['level'], level)
            if level > 1:
                self.assertEqual(skill_progress(total - 1)['level'], level - 1)
            distribution = probabilities(level)
            self.assertAlmostEqual(sum(distribution), 1)
            self.assertGreater(distribution[4], last_five)
            self.assertGreater(probabilities(level, .1)[4], distribution[4])
            last_five = distribution[4]
            if level < 99: total += level_cost(level)
        self.assertEqual(total, 217609)
        self.assertEqual(skill_progress(total * 2)['level'], 99)

    def test_rounding_and_experience(self):
        self.assertEqual([unit_value(18, s) for s in range(1, 6)], [18, 22, 27, 33, 40])
        self.assertEqual(experience_for(7200, 4), 32)
        for invalid in (0, 6, True):
            with self.assertRaises(ValueError): unit_value(18, invalid)

    def test_events_and_fractional_extra_are_deterministic(self):
        crop = {'planting_level': 99, 'random_seed': 'cycle', 'rules': DEFAULT_RULES['crops']['sunflower'], 'fertilizer': FERTILIZERS['yield']}
        self.assertEqual(crop_result(crop), crop_result(copy.deepcopy(crop)))
        for event_draw, event in ((.1, 'normal'), (.92, 'pests'), (.97, 'cold')):
            with patch('system_settings.agent_world.farm_quality.roll', side_effect=lambda seed, label: event_draw if label == 'event' else .1):
                result = crop_result(crop)
                self.assertEqual(result['event'], event)
                self.assertEqual(result['fertilizer_extra'], 2)

    def test_price_sensitivity_across_all_crops_and_levels(self):
        both_signs = set()
        for level in (1, 25, 50, 75, 99):
            for rule in DEFAULT_RULES['crops'].values():
                base = estimate(rule, level)['expected_revenue']
                for kind, fertilizer in FERTILIZERS.items():
                    extra = estimate(rule, level, fertilizer)['expected_revenue'] - base
                    for price in range(fertilizer['base_price'] - fertilizer['fluctuation'], fertilizer['base_price'] + fertilizer['fluctuation'] + 1):
                        both_signs.add(extra > price)
        self.assertEqual(both_signs, {True, False})
        rule = DEFAULT_RULES['crops']['sunflower']
        delta = estimate(rule, 50, FERTILIZERS['quality'])['expected_revenue'] - estimate(rule, 50)['expected_revenue']
        self.assertGreater(delta, 10)
        self.assertLess(delta, 20)


class CropQualityTests(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        settings = override_settings(MEDIA_ROOT=self.temp.name, ODOC_WORLD_LOCK_PATH=str(Path(self.temp.name) / 'world.lock'))
        settings.enable(); self.addCleanup(settings.disable)
        self.user = User.objects.create_superuser('admin', 'quality@example.invalid', 'test')
        self.client = APIClient(); self.client.force_authenticate(self.user)
        provider = AIProvider.objects.create(name='test', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='test', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='园丁', model=model)
        self.task = AgentTask.objects.create(id='farm-quality', name='农场', task_kind='farm', agent=self.agent,
            agent_ids=[self.agent.pk], enabled=True, farm_config={'owner_id': 'admin'})
        ensure_farms(self.task)
        self.now = timezone.now()
        AgentExecutionLease.objects.create(agent=self.agent, token='a', until=self.now + timedelta(days=3))
        WorldActionRuntime.objects.create(pk='world', token='w', until=self.now + timedelta(days=3))
        SystemSetting.objects.create(key='system_mcp_config', value={'enabled': True, 'apiKey': 'test'})
        self.counter = 0

    def supply(self, sku, quantity=1, price=15, stars=1):
        return add_stock(self.agent.pk, 'admin', self.agent.name, sku, quantity, sku, 'farm_supply', price, stars=stars)

    def op(self, kind, key=None, now=None, **params):
        self.counter += 1
        return commit_operation(self.agent.pk, key or f'quality-{self.counter}', 0, {'kind': kind, **params}, '经营', self.task, 'a', 'w', now=now or self.now)

    def farm(self):
        return AgentFarm.objects.get(pk=self.agent.pk)

    def session(self):
        AgentExecutionLease.objects.all().delete()
        task = AgentTask.objects.create(id='market-quality', name='市场', task_kind='market', agent=self.agent,
            agent_ids=[self.agent.pk], enabled=True, market_config={'owner_id': 'admin'})
        return enter('admin', self.agent, 'quality-session', task=task, mode='manual', now=self.now)

    def test_automatic_water_over_24_hours_and_idempotent_experience(self):
        catalog = FarmCatalog.objects.get(pk='admin')
        catalog.rules['crops']['potato']['growth_seconds'] = 100000
        catalog.save()
        self.supply('seed.potato')
        self.op('plant', crop='potato', targets=['0'])
        with patch('system_settings.agent_world.farm_clock.weather', return_value='sun'):
            at = self.now + timedelta(seconds=100000)
            advance_farm(self.agent.pk, at)
            self.assertEqual(self.farm().state['plots'][0]['crop']['grown'], 100000)
            first = self.op('harvest', key='harvest', now=at, targets=['0'])
            repeat = self.op('harvest', key='harvest', now=at, targets=['0'])
        self.assertEqual(first.pk, repeat.pk)
        self.assertEqual(self.farm().state['planting_experience'], first.result['experience_gained'])
        validate_chain(self.farm(), list(self.farm().operations.order_by('created_at', 'id')))

    def test_fertilizer_exclusive_and_atomic_missing_supply(self):
        self.supply('seed.sunflower', 2)
        self.op('plant', crop='sunflower', targets=['0', '1'])
        self.supply('fertilizer.quality')
        with self.assertRaises(ValueError): self.op('fertilize', fertilizer='quality', targets=['0', '1'])
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'fertilizer.quality'), 1)
        self.assertIsNone(self.farm().state['plots'][0]['crop']['fertilizer'])
        first = self.op('fertilize', key='fert', fertilizer='quality', targets=['0'])
        self.assertEqual(self.op('fertilize', key='fert', fertilizer='quality', targets=['0']).pk, first.pk)
        self.supply('fertilizer.yield')
        with self.assertRaises(ValueError): self.op('fertilize', fertilizer='yield', targets=['0'])
        at = self.now + timedelta(hours=12)
        with self.assertRaises(ValueError): self.op('fertilize', now=at, fertilizer='yield', targets=['1'])

    def test_fertilizer_rule_snapshot_and_quality_display_readonly(self):
        self.supply('seed.sunflower')
        self.op('plant', crop='sunflower', targets=['0'])
        catalog = FarmCatalog.objects.get(pk='admin')
        catalog.rules['fertilizers']['quality']['quality_bonus'] = .2; catalog.save()
        self.supply('fertilizer.quality', price=10)
        self.op('fertilize', fertilizer='quality', targets=['0'])
        self.assertEqual(self.farm().state['plots'][0]['crop']['fertilizer']['quality_bonus'], .1)
        state = copy.deepcopy(self.farm().state)
        response = self.client.get(f'/api/settings/agent-world/farms/{self.agent.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('star_probabilities', response.data['data']['state']['plots'][0]['crop'])
        self.assertEqual(self.farm().state, state)

    def test_star_inventory_and_low_star_fifo_consumption(self):
        high = self.supply('crop.potato', 2, 40, stars=5)
        low = self.supply('crop.potato', 1, 18)
        self.supply('crop.potato', 2, 22, stars=2)
        self.assertNotEqual(high.pk, low.pk)
        self.assertEqual(preview_cost(self.agent.pk, 'admin', 'crop.potato', 4), Decimal(102))
        self.assertEqual(take_stock(self.agent.pk, 'admin', 'crop.potato', 4), Decimal(102))
        high.refresh_from_db(); self.assertEqual(high.quantity, 1)

    def test_legacy_inventory_migration_keeps_identity_value_and_escrow(self):
        from django.apps import apps
        from importlib import import_module
        item = self.supply('crop.potato', 3, 18)
        session = self.session()
        result = trade(session, self.agent, 'legacy-list', {'kind': 'list', 'item_id': item.pk, 'quantity': 1, 'unit_price': 25}, now=self.now)
        item.refresh_from_db(); item.source.pop('stars'); item.save()
        listing = MarketListing.objects.get(pk=result['listing_id'])
        listing.item['source'].pop('stars'); listing.save()
        before = (item.pk, item.quantity, item.value, copy.deepcopy(item.source), listing.pk, listing.item['quantity'])
        import_module('system_settings.migrations.0055_crop_quality_supplies').initialize_stars(apps, None)
        item.refresh_from_db(); listing.refresh_from_db()
        self.assertEqual((item.pk, item.quantity, item.value, {k:v for k,v in item.source.items() if k != 'stars'}, listing.pk, listing.item['quantity']), before)
        self.assertEqual(item.source['stars'], 1)
        self.assertEqual(listing.item['source']['stars'], 1)

    def test_limited_fertilizer_can_choose_later_plot_and_plan_protects_inventory(self):
        from .farm_plan import stage_options, validate_resources
        self.supply('seed.potato', 4); self.op('plant', crop='potato', targets=['0','1','2','3'])
        self.supply('fertilizer.quality')
        options = stage_options(self.farm(), [], 'fertilize', 6)
        self.assertEqual([o['operation']['targets'] for o in options], [['0'], ['1'], ['2'], ['3']])
        with self.assertRaises(ValueError): validate_resources(self.farm(), [o['operation'] for o in options[:2]])
        self.op('fertilize', **{k:v for k,v in options[-1]['operation'].items() if k != 'kind'})
        self.assertEqual(self.farm().state['plots'][3]['crop']['fertilizer']['kind'], 'quality')

    def test_hourly_quotes_ranges_and_configuration_boundary(self):
        one = current_batch('admin', self.now)
        self.assertEqual(current_batch('admin', self.now).supplies, one.supplies)
        for hour in range(40):
            batch = current_batch('admin', self.now + timedelta(hours=hour))
            for item in batch.supplies:
                self.assertTrue(item['min_price'] <= int(item['price']) <= item['max_price'])
                self.assertEqual(batch.supplies, supply_quotes('admin', batch.pk))
        catalog = FarmCatalog.objects.get(pk='admin'); catalog.rules['fertilizers']['quality']['base_price'] = 30; catalog.save()
        self.assertEqual(current_batch('admin', self.now).supplies, one.supplies)
        new = current_batch('admin', self.now + timedelta(hours=41))
        self.assertEqual(new.supplies[0]['base_price'], 30)
        one.supplies = []; one.save()
        old_slots = copy.deepcopy(one.slots)
        supplemented = current_batch('admin', self.now)
        self.assertEqual(supplemented.slots, old_slots)
        self.assertTrue(supplemented.supplies)

    def test_effect_configuration_waits_for_next_quote_batch(self):
        current_batch('admin', self.now)
        catalog = FarmCatalog.objects.get(pk='admin')
        catalog.rules['fertilizers']['quality']['quality_bonus'] = .2; catalog.save()
        self.supply('seed.potato', 2)
        self.op('plant', crop='potato', targets=['0'])
        self.assertEqual(self.farm().state['plots'][0]['crop']['fertilizer_rules']['quality']['quality_bonus'], .1)
        self.op('plant', now=self.now + timedelta(hours=1), crop='potato', targets=['1'])
        self.assertEqual(self.farm().state['plots'][1]['crop']['fertilizer_rules']['quality']['quality_bonus'], .2)

    def test_quote_endpoints_and_independent_sku_sequences(self):
        from .market_shop import config_for
        config = config_for('admin'); config.seed = 'fertilizer-bounds'; config.save()
        prices = [set(), set()]
        for index in range(200):
            for i, quote in enumerate(supply_quotes('admin', str(index))): prices[i].add(int(quote['price']))
        self.assertEqual(prices, [set(range(10,21)), set(range(25,46))])
        before = supply_quotes('admin', 'independent')
        catalog = FarmCatalog.objects.get(pk='admin'); catalog.rules['fertilizers']['quality']['base_price'] = 100; catalog.save()
        after = supply_quotes('admin', 'independent')
        self.assertEqual(before[1], after[1])
        self.assertEqual(int(after[0]['price']) - int(before[0]['price']), 85)

    def test_resident_observations_hide_pricing_rules_without_changing_facts(self):
        from .farm_runner import decide
        from .market_tools import call_market_tool
        from .item_catalog import item_catalog
        self.supply('seed.potato'); self.op('plant', crop='potato', targets=['0'])
        self.supply('fertilizer.quality', quantity=2, price=12); self.op('fertilize', fertilizer='quality', targets=['0'])
        before = copy.deepcopy(self.farm().state)
        batch = current_batch('admin', self.now)
        quotes = copy.deepcopy(batch.supplies)
        observations = [call_market_tool('get_market_shop', {}, self.agent),
                        call_market_tool('get_market_context', {}, self.agent)]
        with patch('system_settings.agent_world.farm_runner.AIService.chat_completion_messages', return_value='{"choices":[],"reason":"休息"}') as chat:
            decide(self.task, self.agent, self.farm(), [])
        import json
        observations.append(json.loads(chat.call_args.args[0][-1]['content'].split('\n补充经营偏好：')[0]))
        hidden = {'base_price', 'fluctuation', 'min_price', 'max_price', 'price_delta'}
        def inspect(value):
            if isinstance(value, dict):
                self.assertFalse(hidden & value.keys())
                for child in value.values(): inspect(child)
            elif isinstance(value, list):
                for child in value: inspect(child)
        for observation in observations: inspect(observation)
        self.assertEqual(observations[0]['supplies'][0]['price'], quotes[0]['price'])
        self.assertEqual(observations[1]['planting']['fertilizers']['quality']['next_inventory_cost'], '12')
        for item in item_catalog('admin'):
            if item['category'] == 'fertilizer':
                self.assertIsNone(item['purchase_price'])
                self.assertIsNone(item['reference_value'])
        batch.refresh_from_db()
        self.assertEqual(batch.supplies, quotes)
        self.assertEqual(self.farm().state, before)

    def test_snapshot_rejects_missing_cycle_facts_and_changed_harvest_stars(self):
        self.supply('seed.potato'); self.op('plant', crop='potato', targets=['0'])
        self.supply('fertilizer.quality'); self.op('fertilize', fertilizer='quality', targets=['0'])
        manager = SyncManager(); data = manager.build_snapshot_data()
        validate_source(data)
        broken = copy.deepcopy(data)
        for row in broken:
            if row['model'] == 'system_settings.agentfarm': row['fields']['state'].pop('planting_experience')
        with self.assertRaises(SyncError): validate_source(broken)
        broken = [r for r in copy.deepcopy(data) if r['model'] != 'system_settings.farmoperation' or r['fields']['operation']['kind'] != 'fertilize']
        with self.assertRaises(SyncError): manager.apply_snapshot_data(broken)
        self.op('harvest', now=self.now + timedelta(hours=2), targets=['0'])
        broken = manager.build_snapshot_data()
        for row in broken:
            if row['model'] == 'system_settings.farmoperation' and row['fields']['operation']['kind'] == 'harvest':
                entry = row['fields']['result']['production_bonus'][0]
                entry['stars'] = entry['stars'] % 5 + 1
        with self.assertRaises(SyncError): validate_source(broken)

    def test_constant_supply_budget_quantity_and_exclusion_from_slots(self):
        session = self.session(); batch = current_batch('admin', self.now)
        op = {'kind': 'buy_shop', 'batch_id': batch.pk, 'slot_id': 'fertilizer.quality', 'quantity': 3}
        first = trade(session, self.agent, 'buy-fertilizer', op, now=self.now)
        self.assertEqual(first, trade(session, self.agent, 'buy-fertilizer', op, now=self.now))
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'fertilizer.quality'), 3)
        self.assertEqual(spending_context('admin', self.agent.pk)['slots_remaining'], 2)
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.money, 10000 - Decimal(batch.supplies[0]['price']) * 3)
        self.agent.money = 1; self.agent.save()
        with self.assertRaises(MarketPurchaseBlocked): check_purchase('admin', self.agent.pk, {**op, 'quantity': 1})
        with self.assertRaises(ValueError): trade(session, self.agent, 'old-price', {**op, 'batch_id': 'expired'}, now=self.now)
        item = self.supply('fertilizer.yield')
        with self.assertRaises(ValueError): trade(session, self.agent, 'list-fert', {'kind': 'list', 'item_id': item.pk, 'quantity': 1, 'unit_price': 99}, now=self.now)

    def test_star_listing_withdraw_and_actual_store_price(self):
        item = self.supply('crop.potato', 3, 40, stars=5)
        session = self.session()
        listing = trade(session, self.agent, 'list-high', {'kind': 'list', 'item_id': item.pk, 'quantity': 2, 'unit_price': 60}, now=self.now)
        escrow = MarketListing.objects.get(pk=listing['listing_id'])
        self.assertEqual(escrow.item['source']['stars'], 5)
        withdrawal = trade(session, self.agent, 'withdraw-high', {'kind': 'withdraw', 'listing_id': escrow.pk, 'version': 1}, now=self.now)
        from .travel_models import AgentInventoryItem
        returned = AgentInventoryItem.objects.get(pk=withdrawal['item_id'])
        self.assertEqual(returned.source['stars'], 5)
        sale = trade(session, self.agent, 'sell-high', {'kind': 'sell', 'item_id': returned.pk, 'quantity': 2}, now=self.now)
        self.assertEqual(Decimal(sale['total']), 80)
        self.assertEqual(sale['stars'], 5)

    def test_snapshot_roundtrip_and_missing_quality_fact_rejection(self):
        self.supply('seed.potato'); self.op('plant', crop='potato', targets=['0'])
        self.supply('fertilizer.quality'); self.op('fertilize', fertilizer='quality', targets=['0'])
        self.op('harvest', now=self.now + timedelta(hours=2), targets=['0'])
        manager = SyncManager(); data = manager.build_snapshot_data(); meta = manager.build_snapshot_meta(data_list=data)
        expected = self.farm().state['planting_experience']
        manager.apply_snapshot_data(copy.deepcopy(data), meta)
        manager.apply_snapshot_data(copy.deepcopy(data), meta)
        self.assertEqual(self.farm().state['planting_experience'], expected)
        broken = copy.deepcopy(data)
        for row in broken:
            if row['model'] == 'system_settings.agentinventoryitem' and row['fields']['source'].get('sku', '').startswith('crop.'):
                row['fields']['source'].pop('stars')
        with self.assertRaises(SyncError): manager.apply_snapshot_data(broken, meta)
        self.assertEqual(self.farm().state['planting_experience'], expected)
        broken = copy.deepcopy(data)
        for row in broken:
            if row['model'] == 'system_settings.marketbatch': row['fields'].pop('supplies')
        with self.assertRaises(SyncError): manager.apply_snapshot_data(broken, meta)

    def test_malformed_fertilizer_settings(self):
        rules = copy.deepcopy(DEFAULT_RULES)
        rules['fertilizers']['quality']['fluctuation'] = 15
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError): validate_rules(rules)

    def test_same_opportunity_harvest_replant_and_fertilize(self):
        from .farm_runner import run_farm_opportunity
        self.supply('seed.potato', 2)
        self.op('plant', crop='potato', targets=['0'])
        at = self.now + timedelta(hours=2)
        advance_farm(self.agent.pk, at)
        self.supply('fertilizer.quality')
        AgentExecutionLease.objects.all().delete()
        decisions = []
        def choose(task, agent, farm, options):
            stage = options[0]['stage']
            decisions.append(stage)
            legal = [o for o in options if o['operation']['kind'] == {'manage': 'harvest', 'plant': 'plant', 'fertilize': 'fertilize'}[stage]]
            if stage == 'fertilize': legal = [o for o in legal if o['operation']['fertilizer'] == 'quality']
            return {'choices': [o['id'] for o in legal[:1]], 'reason': stage}
        with patch('system_settings.agent_world.farm_runner.decide', side_effect=choose), patch('django.utils.timezone.now', return_value=at):
            record = run_farm_opportunity(self.task, key='staged', locked='w')
        self.assertEqual(record.status, 'success')
        self.assertEqual(decisions, ['manage', 'plant', 'fertilize'])
        operations = list(FarmOperation.objects.filter(opportunity_id='staged').order_by('id'))
        self.assertEqual([o.operation['kind'] for o in operations], ['harvest', 'plant', 'fertilize'])
        self.assertEqual(self.farm().state['plots'][0]['crop']['fertilizer']['kind'], 'quality')
        validate_chain(self.farm(), [FarmOperation.objects.get(pk=k) for k in self.farm().state['operation_keys']])

    def test_five_star_buy_listing_and_cooking_cost(self):
        from .market_sessions import close_session
        from .travel_models import AgentInventoryItem
        from .cooking_queries import recipes
        item = self.supply('crop.potato', 2, 40, stars=5)
        session = self.session()
        listing = trade(session, self.agent, 'premium', {'kind': 'list', 'item_id': item.pk, 'quantity': 2, 'unit_price': 60}, now=self.now)
        close_session(session, '结束', self.now)
        buyer = Agent.objects.create(name='买家', model=self.agent.model)
        task = AgentTask.objects.get(pk='market-quality'); task.agent_ids.append(buyer.pk); task.save()
        buyer_session = enter('admin', buyer, 'buyer', task=task, mode='manual', now=self.now)
        sale = trade(buyer_session, buyer, 'buy-premium', {'kind': 'buy_listing', 'listing_id': listing['listing_id'], 'version': 1, 'quantity': 1}, now=self.now)
        delivered = AgentInventoryItem.objects.get(pk=sale['item_id'])
        self.assertEqual(delivered.source['stars'], 5)
        self.assertEqual(delivered.value, 40)
        self.supply('crop.potato', 1, 18)
        self.supply('crop.potato', 1, 40, stars=5)
        recipe = next(r for r in recipes('admin', self.agent) if r['id'] == 'baked_potato')
        self.assertEqual(Decimal(recipe['ingredient_value']), 58)

    def test_disaster_adjusts_price_experience_and_quantity_only_once(self):
        for event_draw, event in ((.92, 'pests'), (.97, 'cold')):
            with self.subTest(event=event):
                self.supply('seed.sunflower')
                self.op('plant', crop='sunflower', targets=['0'])
                at = self.now + timedelta(hours=12)
                with patch('system_settings.agent_world.farm_quality.roll', side_effect=lambda seed, label: event_draw if label == 'event' else .99):
                    advance_farm(self.agent.pk, at)
                    expected = copy.deepcopy(self.farm().state['plots'][0]['crop']['result'])
                    result = self.op('harvest', now=at, targets=['0'])
                self.assertEqual(result.result['harvested'][0]['result'], expected)
                production = result.result['production_bonus'][0]
                self.assertEqual(production['event'], event)
                self.assertEqual(production['quantity'], 4 if event == 'pests' else 5)
                self.assertEqual(result.result['experience_gained'], expected['experience'])
                self.now = at + timedelta(minutes=1)

    def test_yield_fertilizer_adds_to_profession_then_pests_reduce_total(self):
        from .models import WorldProfession
        from .farm_bonus import validate_bonus_chain
        self.agent.profession = WorldProfession.objects.create(name='丰收专家', farm_yield_percentage='50')
        self.agent.save(update_fields=['profession'])
        self.supply('seed.sunflower'); self.op('plant', crop='sunflower', targets=['0'])
        self.supply('fertilizer.yield', price=25); self.op('fertilize', fertilizer='yield', targets=['0'])
        at = self.now + timedelta(hours=12)
        with patch('system_settings.agent_world.farm_quality.roll', side_effect=lambda seed,label: .92 if label == 'event' else .1):
            result = self.op('harvest', now=at, targets=['0']).result
        entry = result['production_bonus'][0]
        self.assertEqual((entry['base_quantity'],entry['profession_quantity'],entry['fertilizer_extra'],entry['quantity']), (5,7,2,7))
        self.assertEqual(Decimal(self.farm().state['yield_remainders']['crop.sunflower']), Decimal('.5'))
        self.assertEqual(result['experience_gained'], experience_for(43200, entry['stars']))
        validate_bonus_chain(self.farm().state, list(self.farm().operations.order_by('created_at','id')))
