import copy
from decimal import Decimal
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase, TransactionTestCase
from system_settings.models import WorldAction, AgentExecutionLease, WorldActionRuntime, SystemSetting, Agent, AgentTask
from . import test_cooking as legacy_tests
from .cooking_quality import RULES, probabilities, skill_progress, level_cost, unit_value, experience_for, material_stars, outcome
from .cooking_catalog import DEFAULT_RULES
from .cooking_plan import build_plan, base_values_for
from .cooking_materials import material_pool, allocate
from .cooking_service import commit_portion
from .cooking_queries import recipes
from .cooking_models import CookingSkill, CookingOperation
from .cooking_sync import reconcile_cooking, checkpoint_all
from .cooking_quality_sync import normalize_legacy_inventory, validate_source
from .inventory_stock import add_stock, take_stock, stock_quantity
from .travel_models import AgentInventoryItem
from utils.sync_manager import SyncManager, SyncError


class CookingQualityAlgorithmTests(SimpleTestCase):
    def test_all_thresholds_and_distributions(self):
        total, previous = 0, 0
        for level in range(1, 100):
            self.assertEqual(skill_progress(total)['level'], level)
            if level > 1:
                self.assertEqual(skill_progress(total - 1)['level'], level - 1)
            if level <= 10:
                self.assertEqual(total, 100 * (level - 1) ** 2)
            for average in (1, 2, 3, 4, 5):
                distribution = probabilities(level, average)
                self.assertAlmostEqual(sum(distribution), 1)
                self.assertTrue(all(0 <= p <= 1 for p in distribution))
                if average > 1:
                    self.assertGreater(distribution[4], probabilities(level, average - 1)[4])
            self.assertGreater(probabilities(level, 1)[4], previous)
            previous = probabilities(level, 1)[4]
            if level < 99:
                total += level_cost(level)
        self.assertEqual(total, 331904)
        self.assertEqual(skill_progress(total * 2)['level'], 99)
        self.assertEqual(skill_progress(total * 2)['experience'], total * 2)
        self.assertAlmostEqual(probabilities(99, 5)[4], .31640625)

    def test_weights_prices_and_experience(self):
        rows = [{'sku': 'crop.tomato', 'quantity': 2, 'stars': 5},
                {'sku': 'product.chicken.normal', 'quantity': 1, 'stars': 1}]
        self.assertEqual(material_stars(rows, {'crop.tomato': 19, 'product.chicken.normal': 30}), Decimal(220) / 68)
        self.assertEqual([unit_value(46, s) for s in range(1, 6)], [46, 56, 69, 83, 102])
        self.assertEqual(unit_value('46.01', 1), Decimal('46.01'))
        self.assertEqual([experience_for(10, s) for s in range(1, 6)], [10, 11, 12, 13, 14])
        self.assertEqual(experience_for(11, 2), 12)
        for invalid in (True, 0, 6):
            with self.assertRaises(ValueError): unit_value(46, invalid)


class CookingQualityTests(TestCase):
    setUp = legacy_tests.CookingTests.setUp
    prepare = legacy_tests.CookingTests.prepare
    cook = legacy_tests.CookingTests.cook

    def supply(self, quantity=2, stars=1, price=18, sku='crop.potato'):
        return add_stock(self.agent.pk, 'admin', self.agent.name, sku, quantity, sku, 'farm_product', price, stars=stars)

    def quality_plan(self, key='quality', choices=None):
        choices = choices or [{'recipe_id': 'baked_potato', 'quantity': 1, 'ingredient_strategy': 'low_stars_first'}]
        plan = build_plan('admin', self.agent.pk, choices, recipes('admin', self.agent), 100)
        WorldAction.objects.create(pk=key, task=self.task, agent=self.agent, actor_id=self.agent.pk,
            snapshot={'cooking': True, 'owner_id': 'admin', 'plan': plan})
        return plan

    def execute(self, key, plan, index=0):
        portion = plan[index]
        return commit_portion(self.agent.pk, key, index, portion['recipe_id'], portion['rule'], '制作测试', self.task, 'a', 'w')

    def test_default_and_high_star_previews_and_sequential_allocation(self):
        low = self.supply(quantity=3)
        high = self.supply(quantity=3, stars=5, price=40)
        row = next(row for row in recipes('admin', self.agent) if row['id'] == 'baked_potato')
        previews = row['quality_previews']
        self.assertEqual([p['material_stars'] for p in previews[0]['portions']], ['1', '3', '5'])
        self.assertEqual([p['material_stars'] for p in previews[1]['portions']], ['5', '3', '1'])
        self.assertEqual(previews[0]['portions'][0]['ingredient_value'], '36')
        self.assertEqual(previews[1]['portions'][0]['ingredient_value'], '80')
        plan = self.quality_plan(choices=[{'recipe_id': 'baked_potato', 'quantity': 2, 'ingredient_strategy': 'high_stars_first'}])
        self.assertEqual(plan[0]['rule']['materials'][0]['inventory_id'], high.pk)
        first = self.execute('quality', plan)
        self.assertEqual(self.execute('quality', plan).pk, first.pk)
        self.execute('quality', plan, 1)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'crop.potato'), 2)
        self.assertEqual(AgentInventoryItem.objects.get(pk=low.pk).quantity, 2)
        reconcile_cooking()

    def test_same_star_fifo_price_lots_and_actual_cost(self):
        item = self.supply(quantity=1, stars=3, price=27)
        self.supply(quantity=1, stars=3, price=30)
        plan = self.quality_plan()
        self.assertEqual(plan[0]['rule']['materials'][0]['lots'], [{'quantity': 1, 'price': '27'}, {'quantity': 1, 'price': '30'}])
        op = self.execute('quality', plan)
        self.assertEqual(Decimal(op.result['ingredient_value']), 57)
        self.assertEqual(Decimal(op.result['processing_gain']), Decimal(op.result['unit_price']) - 57)
        self.assertFalse(AgentInventoryItem.objects.filter(pk=item.pk).exists())
        reconcile_cooking()

    def test_plan_checks_combined_inventory_and_energy(self):
        self.supply(quantity=2)
        options = recipes('admin', self.agent)
        for choices, energy in (([{'recipe_id': 'baked_potato', 'quantity': 2}], 100),
                                ([{'recipe_id': 'baked_potato', 'quantity': 1}], 1)):
            with self.assertRaises(ValueError): build_plan('admin', self.agent.pk, choices, options, energy)
        rule = copy.deepcopy(DEFAULT_RULES['baked_potato'])
        options.append({**rule, 'id': 'other'})
        with self.assertRaisesRegex(ValueError, '冲突'):
            build_plan('admin', self.agent.pk, [{'recipe_id': 'baked_potato', 'quantity': 1}, {'recipe_id': 'other', 'quantity': 1}], options, 100)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'crop.potato'), 2)

    def test_changed_confirmed_material_does_not_substitute_or_commit(self):
        item = self.supply()
        self.supply(stars=5, price=40)
        plan = self.quality_plan()
        take_stock(self.agent.pk, 'admin', 'crop.potato', 2)
        with self.assertRaisesRegex(ValueError, '变化'): self.execute('quality', plan)
        self.assertFalse(CookingSkill.objects.exists())
        self.assertFalse(CookingOperation.objects.exists())
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 0)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'crop.potato'), 2)
        self.assertFalse(AgentInventoryItem.objects.filter(pk=item.pk).exists())

    def test_changed_lot_rolls_back_and_preserves_all_resources(self):
        item = self.supply()
        plan = self.quality_plan()
        item.source['lots'][0]['price'] = '19'
        item.save()
        with self.assertRaisesRegex(ValueError, '批次发生变化'): self.execute('quality', plan)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'crop.potato'), 2)
        self.assertFalse(CookingSkill.objects.exists())
        self.assertFalse(WorldAction.objects.filter(snapshot__cooking_energy=True).exists())

    def test_quality_snapshot_cannot_consume_more_than_recipe(self):
        self.supply(quantity=4)
        plan = self.quality_plan()
        rule = plan[0]['rule']
        rule['materials'][0]['quantity'] = 4
        rule['materials'][0]['lots'][0]['quantity'] = 4
        WorldAction.objects.filter(pk='quality').update(snapshot={'cooking': True, 'plan': plan})
        with self.assertRaisesRegex(ValueError, '配方'): self.execute('quality', plan)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'crop.potato'), 4)

    def test_each_portion_uses_current_level_and_rules_are_frozen(self):
        self.supply(quantity=6)
        rule = {**DEFAULT_RULES['baked_potato'], 'experience': 99}
        self.prepare(key='seed', rule=rule); self.cook(key='seed', rule=rule)
        plan = self.quality_plan(choices=[{'recipe_id': 'baked_potato', 'quantity': 2}])
        from .farm_models import FarmCatalog
        from .farm_catalog import DEFAULT_RULES as FARM_RULES
        FarmCatalog.objects.create(pk='admin', rules={**copy.deepcopy(FARM_RULES), 'crops': {**FARM_RULES['crops'], 'potato': {**FARM_RULES['crops']['potato'], 'sale_price': 999}}})
        first = self.execute('quality', plan)
        second = self.execute('quality', plan, 1)
        self.assertEqual(first.result['cooking_level'], 1)
        self.assertEqual(second.result['cooking_level'], 2)
        self.assertEqual(plan[0]['rule']['base_values']['crop.potato'], '18')
        reconcile_cooking()

    def test_model_can_correct_resource_conflict_once(self):
        from .cooking_runner import decide
        self.supply()
        options = recipes('admin', self.agent)
        bad = {'choices': [{'recipe_id': 'baked_potato', 'quantity': 2}], 'reason': '多做'}
        good = {'choices': [{'recipe_id': 'baked_potato', 'quantity': 1, 'ingredient_strategy': 'high_stars_first'}], 'reason': '精品'}
        import json
        with patch('system_settings.agent_world.cooking_runner.AIService.chat_completion_messages', side_effect=[json.dumps(bad), json.dumps(good)]) as ai:
            decision = decide(self.task, self.agent, options)
        self.assertEqual(ai.call_count, 2)
        self.assertEqual(decision, good)
        self.assertFalse(CookingOperation.objects.exists())

    def test_dishes_separate_stars_and_keep_origin_and_prices(self):
        one = add_stock(self.agent.pk, 'admin', self.agent.name, 'dish.baked_potato', 1, '烤土豆', 'dish', '46.01')
        five = add_stock(self.agent.pk, 'admin', self.agent.name, 'dish.baked_potato', 2, '烤土豆', 'dish', 102, stars=5)
        self.assertNotEqual(one.pk, five.pk)
        one.source.pop('stars'); one.save()
        normalize_legacy_inventory()
        one.refresh_from_db()
        self.assertEqual(one.source['stars'], 1)
        self.assertEqual(one.value, Decimal('46.01'))
        self.assertEqual(AgentInventoryItem.objects.count(), 2)

    def test_full_missing_and_repeated_snapshot_recovery(self):
        self.supply(stars=5, price=40)
        plan = self.quality_plan()
        original = self.execute('quality', plan)
        manager = SyncManager()
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        self.assertEqual(meta['cooking_schema_version'], 2)
        for _ in range(2): manager.apply_snapshot_data(copy.deepcopy(data), meta)
        self.assertEqual(CookingOperation.objects.count(), 1)
        self.assertEqual(CookingOperation.objects.get(pk=original.pk).result, original.result)
        self.assertEqual(CookingSkill.objects.get(pk=self.agent.pk).experience, original.result['experience_gained'])
        for kind in ('stars', 'operation', 'random', 'rules', 'cost', 'lots'):
            broken = copy.deepcopy(data)
            if kind == 'operation':
                broken = [r for r in broken if r['model'] != 'system_settings.cookingoperation']
            else:
                for row in broken:
                    if kind == 'stars' and row['model'] == 'system_settings.agentinventoryitem': row['fields']['source'].pop('stars')
                    if kind == 'lots' and row['model'] == 'system_settings.agentinventoryitem': row['fields']['source']['lots'][0]['quantity'] += 1
                    if row['model'] == 'system_settings.cookingoperation':
                        if kind == 'random': row['fields']['result']['random_draw'] = .999
                        if kind == 'rules': row['fields']['snapshot'].pop('quality_rules')
                        if kind == 'cost': row['fields']['result']['ingredient_value'] = '0'
            with self.subTest(kind=kind), self.assertRaises(SyncError): manager.apply_snapshot_data(broken, meta)
        self.assertEqual(CookingOperation.objects.get(pk=original.pk).result, original.result)

    def test_old_snapshot_normalization_keeps_history_xp_and_id(self):
        self.supply(); self.prepare(); old = self.cook()
        item = AgentInventoryItem.objects.get(source__sku='dish.baked_potato')
        item.source.pop('stars'); item.save()
        checkpoint_all()
        manager = SyncManager(); data = manager.build_snapshot_data()
        manager.apply_snapshot_data(copy.deepcopy(data), {'cooking_schema_version': 1, 'cooking_owners': ['admin']})
        self.assertEqual(AgentInventoryItem.objects.get(pk=item.pk).source['stars'], 1)
        self.assertEqual(CookingOperation.objects.get(pk=old.pk).snapshot, old.snapshot)
        self.assertEqual(CookingSkill.objects.get(pk=self.agent.pk).experience, 10)
        reconcile_cooking()

    def test_legacy_zero_millisecond_hashes_restore_without_accepting_corruption(self):
        from .cooking_integrity import ASSETS, ENERGY_FIELDS, dates_for, fingerprints, hash_rows
        self.supply(); rule = self.prepare()
        instant = self.now.replace(microsecond=123)
        old = commit_portion(self.agent.pk, 'op', 0, 'baked_potato', rule,
                             '旧版制作', self.task, 'a', 'w', now=instant)
        manager = SyncManager()
        data = manager.build_snapshot_data()
        # Recreate the old checkpoint before .000Z and Z were compared semantically.
        raw = fingerprints('admin')
        for model in ASSETS:
            raw[model.__name__] = hash_rows(list(model.objects.filter(owner_id='admin')
                .order_by('pk').values()), dates_for(model), normalize=False)
        raw['energy'] = hash_rows(list(WorldAction.objects.filter(snapshot__cooking_energy=True,
            snapshot__owner_id='admin').order_by('pk').values(*ENERGY_FIELDS)), normalize=False)
        operation = next(row for row in data if row['model'] == 'system_settings.cookingoperation')
        self.assertIn('.000', operation['fields']['created_at'])
        for row in data:
            if row['model'] == 'system_settings.cookingintegrity':
                row['fields']['hashes'] = raw
        meta = {'cooking_schema_version': 1, 'cooking_owners': ['admin']}
        for _ in range(2):
            manager.apply_snapshot_data(copy.deepcopy(data), meta)
        restored = CookingOperation.objects.get(pk=old.pk)
        self.assertEqual(restored.created_at, instant.replace(microsecond=0))
        self.assertEqual(restored.result, old.result)
        self.assertEqual(CookingSkill.objects.get(pk=self.agent.pk).experience, 10)
        reconcile_cooking()
        broken = copy.deepcopy(data)
        for row in broken:
            if row['model'] == 'system_settings.cookingskill':
                row['fields']['experience'] += 1
        with self.assertRaisesRegex(SyncError, '原始快照完整性'):
            manager.apply_snapshot_data(broken, meta)
        self.assertEqual(CookingSkill.objects.get(pk=self.agent.pk).experience, 10)

    def test_actual_market_partial_trade_and_cancel_preserve_stars_and_value(self):
        from .market_sessions import enter
        from .market_service import trade
        from .market_models import MarketListing
        item = add_stock(self.agent.pk, 'admin', self.agent.name, 'dish.baked_potato', 2, '烤土豆', 'dish', 102, stars=5)
        buyer = Agent.objects.create(name='买家', model=self.agent.model, money=300)
        task = AgentTask.objects.create(id='quality-market', task_kind='market', agent=self.agent, agent_ids=[self.agent.pk, buyer.pk], market_config={'owner_id': 'admin'}, enabled=True)
        SystemSetting.objects.create(key='system_mcp_config', value={'enabled': True})
        AgentExecutionLease.objects.all().delete()
        WorldActionRuntime.objects.filter(pk='world').update(token='', until=None)
        seller_session = enter('admin', self.agent, 'seller', task=task, mode='manual')
        buyer_session = enter('admin', buyer, 'buyer', task=task, mode='manual')
        trade(seller_session, self.agent, 'list-quality', {'kind': 'list', 'item_id': item.pk, 'quantity': 2, 'unit_price': '120'})
        listing = MarketListing.objects.get(pk='list-quality')
        trade(buyer_session, buyer, 'buy-quality', {'kind': 'buy_listing', 'listing_id': listing.pk, 'version': listing.version, 'quantity': 1})
        listing.refresh_from_db()
        trade(seller_session, self.agent, 'cancel-quality', {'kind': 'withdraw', 'listing_id': listing.pk, 'version': listing.version})
        for actor in (self.agent, buyer):
            stock = AgentInventoryItem.objects.get(actor_id=actor.pk, source__sku='dish.baked_potato')
            self.assertEqual(stock.source['stars'], 5)
            self.assertEqual(stock.source['lots'], [{'quantity': 1, 'price': '102'}])
        purchased = AgentInventoryItem.objects.get(actor_id=buyer.pk, source__sku='dish.baked_potato')
        sold = trade(buyer_session, buyer, 'sell-quality', {'kind': 'sell', 'item_id': purchased.pk, 'quantity': 1})
        self.assertEqual(Decimal(sold['total']), 102)

    def test_failure_after_consumption_rolls_back_and_retry_keeps_result(self):
        self.supply(stars=5, price=40)
        plan = self.quality_plan()
        expected = outcome('quality:0', 1, plan[0]['rule']['materials'], plan[0]['rule'])
        with patch('system_settings.agent_world.cooking_service.add_stock', side_effect=ValueError('保存失败')):
            with self.assertRaisesRegex(ValueError, '保存失败'): self.execute('quality', plan)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'crop.potato'), 2)
        self.assertFalse(CookingSkill.objects.exists())
        self.assertFalse(CookingOperation.objects.exists())
        self.assertFalse(WorldAction.objects.filter(snapshot__cooking_energy=True).exists())
        op = self.execute('quality', plan)
        for field, value in expected.items(): self.assertEqual(op.result[field], value)
        reconcile_cooking()

    def test_version2_manifest_and_pending_plan_are_required(self):
        self.supply()
        plan = self.quality_plan()
        self.execute('quality', plan)
        manager = SyncManager(); data = manager.build_snapshot_data(); meta = manager.build_snapshot_meta(data_list=data)
        for key in ('cooking_owners', 'cooking_quality_operations', 'cooking_quality_plans'):
            broken_meta = {k: v for k, v in meta.items() if k != key}
            with self.subTest(key=key), self.assertRaises(SyncError): manager.apply_snapshot_data(copy.deepcopy(data), broken_meta)
        broken = copy.deepcopy(data)
        for row in broken:
            if row['model'] == 'system_settings.worldaction' and str(row['pk']) == 'quality':
                row['fields']['snapshot']['plan'][0]['rule'].pop('experience')
        with self.assertRaises(SyncError): manager.apply_snapshot_data(broken, meta)

    def test_metadata_uses_exported_snapshot_not_later_database_writes(self):
        self.supply(quantity=4)
        plan = self.quality_plan()
        self.execute('quality', plan)
        manager = SyncManager(); data = manager.build_snapshot_data()
        next_plan = self.quality_plan(key='later')
        self.execute('later', next_plan)
        meta = manager.build_snapshot_meta(data_list=data)
        self.assertEqual(meta['cooking_quality_operations'], ['quality:0'])
        self.assertEqual(meta['cooking_quality_plans'], ['quality'])
        validate_source(data, meta)

    def test_webdav_internal_merge_preserves_version2_results_and_rejects_missing_manifest(self):
        self.supply(stars=5, price=40)
        plan = self.quality_plan()
        original = self.execute('quality', plan)
        manager = SyncManager()
        data = manager.build_snapshot_data()
        remote = {'data': copy.deepcopy(data), 'meta': manager.build_snapshot_meta(data_list=data),
                  'revisions': manager._build_revision_manifest(data), 'media': {}}
        with patch.object(manager, 'get_v2_current', return_value=remote), \
                patch.object(manager, '_restore_v2_media'), \
                patch.object(manager, 'reconcile_missing_book_media'), \
                patch.object(manager, 'publish_v2_snapshot', return_value={}):
            for _ in range(2):
                manager._merge_while_locked(lambda *args: None, base_snapshot_id='',
                    source='manual', runner_id='test', should_abort=None)
        self.assertEqual(CookingOperation.objects.get(pk=original.pk).result, original.result)
        self.assertEqual(CookingOperation.objects.count(), 1)
        self.assertEqual(CookingSkill.objects.get(pk=self.agent.pk).experience, original.result['experience_gained'])
        broken = copy.deepcopy(remote)
        broken['meta'].pop('cooking_quality_operations')
        with self.assertRaises(SyncError):
            manager.merge_v2_data(None, data, remote['revisions'], broken)

    def test_first_confirmed_plan_is_protected_before_any_portion_commits(self):
        from .cooking_runner import run_cooking_opportunity
        AgentExecutionLease.objects.filter(agent=self.agent).delete()
        WorldActionRuntime.objects.filter(pk='world').update(token='', until=None)
        self.supply()
        with patch('system_settings.agent_world.cooking_runner.decide', return_value={
                'choices': [{'recipe_id': 'baked_potato', 'quantity': 1}], 'reason': '准备制作'}), \
                patch('system_settings.agent_world.cooking_runner.commit_portion', side_effect=ValueError('中断')):
            record = run_cooking_opportunity(self.task, key='before-first', manual=True)
        self.assertEqual(record.status, 'failed')
        self.assertFalse(CookingOperation.objects.exists())
        manager = SyncManager()
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        self.assertEqual(meta['cooking_owners'], ['admin'])
        self.assertEqual(meta['cooking_quality_plans'], ['before-first'])
        validate_source(data, meta)
        manager.apply_snapshot_data(copy.deepcopy(data), meta)
        broken = [row for row in data if row['model'] != 'system_settings.cookingintegrity']
        broken_meta = {**meta, 'cooking_owners': []}
        with self.assertRaises(SyncError):
            manager.apply_snapshot_data(broken, broken_meta)
        self.assertFalse(CookingSkill.objects.exists())

    def test_migration_preserves_legacy_inventory_and_escrow_identity(self):
        import importlib
        from django.apps import apps
        from .market_models import MarketListing
        item = add_stock(self.agent.pk, 'admin', self.agent.name, 'dish.baked_potato', 2, '烤土豆', 'dish', '46.01')
        item.source.pop('stars'); item.save()
        listing = MarketListing.objects.create(pk='legacy-escrow', owner_id='admin', seller_id=self.agent.pk,
            seller_name=self.agent.name, item={'source': {'sku': 'dish.baked_potato'}, 'quantity': 1, 'value': '46.01'},
            initial_quantity=1, remaining_quantity=1, unit_price='60')
        migrate = importlib.import_module('system_settings.migrations.0056_dish_stars').initialize_stars
        for _ in range(2): migrate(apps, None)
        item.refresh_from_db(); listing.refresh_from_db()
        self.assertEqual(item.source['stars'], 1)
        self.assertEqual(item.quantity, 2)
        self.assertEqual(item.value, Decimal('46.01'))
        self.assertEqual(item.pk, AgentInventoryItem.objects.get().pk)
        self.assertEqual(listing.item['source'], {'sku': 'dish.baked_potato', 'stars': 1})
        self.assertEqual(listing.item['value'], '46.01')
        self.assertEqual(listing.remaining_quantity, 1)

    def test_recipe_api_accepts_level99_and_preserves_one_star_price_precision(self):
        body = {'ingredients': [{'sku': 'crop.potato', 'quantity': 2}], 'requiredLevel': 99,
                'salePrice': '46.01', 'experience': 10, 'energyCost': 2}
        response = self.client.patch('/api/settings/agent-world/cooking/recipes/baked_potato/', body, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['required_level'], 99)
        self.assertEqual(response.data['data']['sale_price'], '46.01')
        row = next(row for row in recipes('admin', self.agent) if row['id'] == 'baked_potato')
        self.assertEqual(row['state'], 'locked')
        body['requiredLevel'] = 100
        self.assertEqual(self.client.patch('/api/settings/agent-world/cooking/recipes/baked_potato/', body, format='json').status_code, 400)

    def test_api_catalog_and_history_expose_quality_without_writes(self):
        self.supply(stars=5, price=40)
        response = self.client.get('/api/settings/agent-world/cooking/recipes/', {'agentId': self.agent.pk})
        row = next(row for row in response.data['data']['recipes'] if row['id'] == 'baked_potato')
        self.assertEqual(len(row['quality_previews']), 2)
        self.assertFalse(CookingSkill.objects.exists())
        plan = self.quality_plan(); op = self.execute('quality', plan)
        history = self.client.get(f'/api/settings/agent-world/cooking/agents/{self.agent.pk}/history/').data['data']['list'][0]
        self.assertEqual(history['result']['stars'], op.result['stars'])
        from .item_catalog import item_catalog
        dish = next(row for row in item_catalog('admin') if row['sku'] == 'dish.baked_potato')
        self.assertEqual(dish['star_quantities'][str(op.result['stars'])], 1)


class ConcurrentQualityCookingTests(TransactionTestCase):
    setUp = legacy_tests.CookingTests.setUp
    supply = CookingQualityTests.supply
    quality_plan = CookingQualityTests.quality_plan

    def test_concurrent_quality_plans_cannot_consume_last_ingredients_twice(self):
        from concurrent.futures import ThreadPoolExecutor
        from django.db import close_old_connections
        self.supply(stars=5, price=40)
        plans = {key: self.quality_plan(key=key) for key in ('quality-one', 'quality-two')}
        def attempt(key):
            close_old_connections()
            try:
                commit_portion(self.agent.pk, key, 0, 'baked_potato', plans[key][0]['rule'], '并发制作', self.task, 'a', 'w')
                return True
            except ValueError:
                return False
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, plans))
        self.assertEqual(sum(results), 1)
        self.assertEqual(CookingOperation.objects.count(), 1)
        op = CookingOperation.objects.get()
        self.assertEqual(CookingSkill.objects.get(pk=self.agent.pk).experience, op.result['experience_gained'])
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 1)
        reconcile_cooking()
