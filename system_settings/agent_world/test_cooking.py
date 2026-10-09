import copy
import hashlib
import json
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import TestCase, SimpleTestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError
from system_settings.models import Agent, AgentTask, AIProvider, AIModel, AgentExecutionLease, WorldActionRuntime, WorldAction
from .cooking_catalog import DEFAULT_RULES, validate_rule, skill_progress
from .cooking_models import CookingCatalog, CookingSkill, CookingOperation, CookingIntegrity
from .cooking_service import commit_portion
from .cooking_queries import recipes
from .cooking_runner import validate_decision, run_cooking_opportunity
from .cooking_sync import reconcile_cooking
from .inventory_stock import add_stock, stock_quantity, take_stock
from .travel_models import AgentInventoryItem


class CookingRuleTests(SimpleTestCase):
    def test_twenty_recipes_and_level_boundaries(self):
        self.assertEqual(len(DEFAULT_RULES), 20)
        for level in range(1, 11):
            floor = 100 * (level - 1) ** 2
            self.assertEqual(skill_progress(floor)['level'], level)
            if level > 1:
                self.assertEqual(skill_progress(floor - 1)['level'], level - 1)
        self.assertEqual(skill_progress(331904)['level'], 99)
        self.assertEqual(skill_progress(100000)['experience'], 100000)

    def test_invalid_rules(self):
        original = {k: v for k, v in DEFAULT_RULES['baked_potato'].items() if k != 'name'}
        for field, value in [('required_level', 100), ('experience', True), ('energy_cost', 101), ('sale_price', 'NaN'), ('sale_price', '1.001'), ('ingredients', [{'sku': 'product.cow.gold', 'quantity': 1}]), ('ingredients', [])]:
            with self.subTest(field=field, value=value), self.assertRaises(ValidationError):
                validate_rule({**original, field: value})
        with self.assertRaises(ValidationError):
            validate_rule({**original, 'ingredients': [*original['ingredients'], *original['ingredients']]})

    def test_plan_limits(self):
        options = [{'id': 'x', 'max_portions': 6}, {'id': 'y', 'max_portions': 6}]
        for choices in ([{'recipe_id': 'x', 'quantity': 7}], [{'recipe_id': 'x', 'quantity': 4}, {'recipe_id': 'y', 'quantity': 3}], [{'recipe_id': 'bad', 'quantity': 1}], [{'recipe_id': 'x', 'quantity': True}], [{'recipe_id': 'x', 'quantity': 1, 'price': 1}]):
            with self.subTest(choices=choices), self.assertRaises(ValueError):
                validate_decision({'choices': choices, 'reason': '制作'}, options)
        self.assertEqual(validate_decision({'choices': [], 'reason': '休息'}, options)['choices'], [])


class CookingTests(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=self.temp.name, ODOC_WORLD_LOCK_PATH=str(Path(self.temp.name) / 'world.lock'))
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.user = User.objects.create_superuser('admin', 'cook@example.invalid', 'test')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        provider = AIProvider.objects.create(name='test', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='test', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='厨师', model=model)
        self.task = AgentTask.objects.create(id='cooking-test', task_kind='cooking', name='美食制作', agent=self.agent, agent_ids=[self.agent.pk], cooking_config={'owner_id': 'admin'}, enabled=True)
        self.now = timezone.now()
        AgentExecutionLease.objects.create(agent=self.agent, token='a', until=self.now + timedelta(days=1))
        WorldActionRuntime.objects.create(pk='world', token='w', until=self.now + timedelta(days=1))

    def supply(self, sku='crop.potato', quantity=2):
        return add_stock(self.agent.pk, 'admin', self.agent.name, sku, quantity, '材料', 'farm_product', 18)

    def prepare(self, key='op', recipe='baked_potato', count=1, rule=None):
        snapshot = copy.deepcopy(rule or DEFAULT_RULES[recipe])
        WorldAction.objects.create(pk=key, task=self.task, agent=self.agent, actor_id=self.agent.pk,
            snapshot={'cooking': True, 'plan': [{'recipe_id': recipe, 'rule': snapshot} for _ in range(count)]})
        return snapshot

    def cook(self, key='op', index=0, recipe='baked_potato', rule=None):
        return commit_portion(self.agent.pk, key, index, recipe, rule or DEFAULT_RULES[recipe], '练习厨艺', self.task, 'a', 'w')

    def test_get_is_derived_and_all_recipes_have_no_images(self):
        response = self.client.get('/api/settings/agent-world/cooking/recipes/', {'agentId': self.agent.pk})
        self.assertEqual(response.status_code, 200)
        data = response.data['data']
        self.assertEqual(len(data['recipes']), 20)
        self.assertEqual(data['skill']['level'], 1)
        self.assertTrue(all(not row['icon_url'] for row in data['recipes']))
        self.assertFalse(CookingCatalog.objects.exists())
        self.assertFalse(CookingSkill.objects.exists())

    def test_success_and_idempotence(self):
        self.supply(); self.prepare()
        one = self.cook(); self.assertEqual(self.cook().pk, one.pk)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 1)
        self.assertEqual(CookingSkill.objects.get(pk=self.agent.pk).experience, 10)
        self.assertEqual(WorldAction.objects.filter(snapshot__cooking_energy=True).count(), 1)
        reconcile_cooking()

    def test_missing_later_ingredient_rolls_back_everything(self):
        rule = copy.deepcopy(DEFAULT_RULES['baked_potato'])
        rule['ingredients'].append({'sku': 'crop.cucumber', 'quantity': 1})
        self.supply(); self.prepare(rule=rule)
        with self.assertRaisesRegex(ValueError, '库存不足'):
            self.cook(rule=rule)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'crop.potato'), 2)
        self.assertFalse(CookingSkill.objects.exists())
        self.assertFalse(CookingOperation.objects.exists())
        self.assertFalse(CookingCatalog.objects.exists())

    def test_level_gate(self):
        self.supply('crop.tomato', 2); self.supply('product.chicken.normal', 1)
        self.prepare(recipe='tomato_eggs')
        with self.assertRaisesRegex(ValueError, '等级不足'):
            self.cook(recipe='tomato_eggs')
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'crop.tomato'), 2)

    def test_upgrade_and_six_portions_limit(self):
        rule = {**DEFAULT_RULES['baked_potato'], 'experience': 100}
        self.supply(quantity=12); self.prepare(count=6, rule=rule)
        for index in range(6): self.cook(index=index, rule=rule)
        self.assertEqual(CookingSkill.objects.get(pk=self.agent.pk).experience, 600)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 6)
        with self.assertRaisesRegex(ValueError, '六份'): self.cook(index=6, rule=rule)
        reconcile_cooking()

    def test_fifo_across_rows(self):
        self.supply(quantity=1)
        AgentInventoryItem.objects.create(pk='other-row', actor_id=self.agent.pk, owner_id='admin', name='土豆', kind='farm_product', quantity=1, value=20, source={'sku': 'crop.potato', 'lots': [{'quantity': 1, 'price': '20'}]})
        self.prepare()
        row = self.cook()
        self.assertEqual(Decimal(row.result['ingredient_value']), 38)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'crop.potato'), 0)

    def test_other_resident_stock_not_consumed(self):
        other = Agent.objects.create(name='邻居', model=self.agent.model)
        add_stock(other.pk, 'admin', other.name, 'crop.potato', 2, '土豆', 'farm_product', 18)
        self.prepare()
        with self.assertRaisesRegex(ValueError, '库存不足'): self.cook()
        self.assertEqual(stock_quantity(other.pk, 'admin', 'crop.potato'), 2)

    def test_gold_product_not_substituted(self):
        self.supply('crop.tomato', 2); self.supply('product.chicken.gold', 1)
        row = next(row for row in recipes('admin', self.agent) if row['id'] == 'tomato_eggs')
        self.assertEqual(row['state'], 'locked')
        self.assertEqual(next(i for i in row['ingredients'] if i['sku'] == 'product.chicken.normal')['owned'], 0)

    def test_disabled_or_invalid_lease(self):
        self.supply(); self.prepare()
        self.task.enabled = False; self.task.save()
        with self.assertRaisesRegex(ValueError, '停止'): self.cook()
        self.task.enabled = True; self.task.save()
        AgentExecutionLease.objects.filter(agent=self.agent).update(token='bad')
        with self.assertRaisesRegex(ValueError, '锁失效'): self.cook()

    def test_insufficient_energy(self):
        self.supply(); self.prepare()
        WorldAction.objects.create(pk='spent', actor_id=self.agent.pk, status='success', energy_cost=100, consumed_at=timezone.now(), effects_done=True)
        with self.assertRaisesRegex(ValueError, '体力不足'): self.cook()
        self.assertFalse(CookingOperation.objects.exists())

    def test_durable_plan_rejects_unissued_recipe(self):
        self.supply(); self.prepare()
        with self.assertRaisesRegex(ValueError, '计划'):
            self.cook(rule={**DEFAULT_RULES['baked_potato'], 'sale_price': '100000'})

    def test_rule_changes_do_not_reprice_existing_or_issued_products(self):
        self.supply(quantity=4); old = self.prepare()
        rule = {k: v for k, v in DEFAULT_RULES['baked_potato'].items() if k != 'name'}
        response = self.client.patch('/api/settings/agent-world/cooking/recipes/baked_potato/', {**rule, 'sale_price': '99'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.cook(rule=old)
        new = {**DEFAULT_RULES['baked_potato'], 'sale_price': '99.00'}
        self.prepare(key='new', rule=new); self.cook(key='new', rule=new)
        self.assertEqual(take_stock(self.agent.pk, 'admin', 'dish.baked_potato', 1), 46)
        self.assertEqual(take_stock(self.agent.pk, 'admin', 'dish.baked_potato', 1), 99)
        reconcile_cooking()

    def test_market_escrow_keeps_price_lots(self):
        from .market_inventory import split_item, deliver
        self.supply(); self.prepare(); self.cook()
        item = AgentInventoryItem.objects.get(source__sku='dish.baked_potato')
        payload = split_item(item, 1)
        self.assertEqual(payload['source']['lots'][0]['price'], '46')
        deliver('admin', self.agent, payload, 'trade')
        self.assertEqual(take_stock(self.agent.pk, 'admin', 'dish.baked_potato', 1), 46)

    def test_integrity_missing_fact_detected(self):
        from system_settings.sync_state import suspend_tracking
        from utils.sync_manager import SyncError
        self.supply(); self.prepare(); self.cook()
        with suspend_tracking(): CookingOperation.objects.all().delete()
        with self.assertRaises(SyncError): reconcile_cooking()

    def test_snapshot_roundtrip_and_missing_whole_domain(self):
        from utils.sync_manager import SyncManager, SyncError
        self.supply(); self.prepare(); self.cook()
        manager = SyncManager(); data = manager.build_snapshot_data(); meta = manager.build_snapshot_meta()
        absent = [row for row in data if not row['model'].startswith('system_settings.cooking')]
        with self.assertRaises(SyncError): manager.apply_snapshot_data(absent, meta)
        manager.apply_snapshot_data(data, meta, full_overwrite=True)
        manager.apply_snapshot_data(data, meta, full_overwrite=True)
        self.assertEqual(CookingSkill.objects.get(pk=self.agent.pk).experience, 10)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 1)

    def test_legacy_snapshot_supported(self):
        from utils.sync_manager import SyncManager
        manager = SyncManager(); data = manager.build_snapshot_data()
        manager.apply_snapshot_data(data, full_overwrite=True)
        self.assertFalse(CookingSkill.objects.exists())

    def test_owner_isolation(self):
        CookingSkill.objects.create(pk=self.agent.pk, owner_id='other', actor_name=self.agent.name)
        self.assertEqual(self.client.get(f'/api/settings/agent-world/cooking/agents/{self.agent.pk}/').status_code, 403)

    def test_foreign_cooking_task_rejects_life_binding_before_skill_exists(self):
        from .life_models import LifeProfile, LifeConfig
        other = User.objects.create_user('other', 'other@example.invalid', 'test')
        self.client.force_authenticate(other)
        self.task.enabled = False
        self.task.agent_ids = []  # Legacy task bindings fall back to the primary resident.
        self.task.save()
        self.assertFalse(CookingSkill.objects.exists())
        response = self.client.post('/api/settings/agent-world/life/config/',
            {'settings': {'agent_ids': [self.agent.pk]}}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(LifeProfile.objects.filter(pk=self.agent.pk).exists())
        self.assertFalse(any(self.agent.pk in settings.get('agent_ids', [])
            for settings in LifeConfig.objects.values_list('settings', flat=True)))
        self.assertEqual(self.task.cooking_config['owner_id'], 'admin')

    def test_foreign_cooking_task_rejects_market_binding_and_rolls_back_task(self):
        other = User.objects.create_user('other', 'other@example.invalid', 'test')
        self.client.force_authenticate(other)
        response = self.client.post('/api/settings/agent-tasks/', {'task_kind': 'market',
            'name': '市场交易', 'agent': self.agent.pk, 'agents': [self.agent.pk], 'trigger': '定时任务'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(AgentTask.objects.filter(task_kind='market').exists())
        self.assertFalse(CookingSkill.objects.exists())

    def test_retained_cooking_skill_rejects_other_binding_entries(self):
        from .life_config import ensure_profiles
        from .market_sessions import validate_market_agents
        from .investment_service import validate_agents
        from .life_models import LifeProfile
        self.task.delete()
        CookingSkill.objects.create(pk=self.agent.pk, owner_id='admin', actor_name=self.agent.name)
        for validate in (ensure_profiles, validate_market_agents, validate_agents):
            with self.subTest(entry=validate.__name__), self.assertRaisesRegex(ValueError, '厨艺'):
                validate('other', [self.agent.pk])
        self.assertFalse(LifeProfile.objects.filter(pk=self.agent.pk).exists())

    def test_same_owner_can_bind_cooking_resident_to_life_and_market_repeatedly(self):
        from .life_config import ensure_profiles
        from .market_sessions import validate_market_agents
        from .cooking_queries import validate_actor
        from .life_models import LifeProfile
        for _ in range(2):
            ensure_profiles('admin', [self.agent.pk])
            validate_market_agents('admin', [self.agent.pk])
            validate_actor('admin', self.agent.pk)
        self.assertEqual(LifeProfile.objects.filter(pk=self.agent.pk, owner_id='admin').count(), 1)
        self.assertFalse(CookingSkill.objects.exists())

    def test_task_serializer_is_owner_scoped_and_default_disabled(self):
        from system_settings.serializers import AgentTaskSerializer
        from types import SimpleNamespace
        request = SimpleNamespace(user=self.user)
        serializer = AgentTaskSerializer(data={'task_kind': 'cooking', 'name': '任意', 'agent': self.agent.pk, 'agents': [self.agent.pk], 'trigger': '定时任务'}, context={'request': request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        task = serializer.save()
        self.assertEqual(task.cooking_config['owner_id'], 'admin')
        self.assertEqual(task.name, '美食制作')
        self.assertFalse(task.enabled)
        self.assertEqual(AgentTask.objects.filter(task_kind='cooking').count(), 1)

    def test_runner_partial_success_and_retry(self):
        AgentExecutionLease.objects.filter(agent=self.agent).delete()
        WorldActionRuntime.objects.filter(pk='world').update(token='', until=None)
        self.supply(quantity=4)
        original = commit_portion
        def intermittent(*args, **kwargs):
            if args[2] == 1:
                raise ValueError('材料状态已变化')
            return original(*args, **kwargs)
        with patch('system_settings.agent_world.cooking_runner.decide', return_value={'choices': [{'recipe_id': 'baked_potato', 'quantity': 2}], 'reason': '练习'}), patch('system_settings.agent_world.cooking_runner.commit_portion', side_effect=intermittent):
            record = run_cooking_opportunity(self.task, key='runner', manual=True)
        self.assertEqual(record.status, 'failed')
        self.assertEqual(CookingOperation.objects.count(), 1)
        run_cooking_opportunity(self.task, key='runner', manual=True)
        self.assertEqual(CookingOperation.objects.count(), 1)

    def test_image_binding_before_creation_clear_and_resource_protection(self):
        from io import BytesIO
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .item_icons import upload_icon
        from .item_catalog_icons import set_catalog_item_icon, is_catalog_item_icon_used
        from .travel_views import InventorySerializer, inventory_context
        output = BytesIO(); Image.new('RGB', (8, 8), 'red').save(output, 'PNG')
        asset, _ = upload_icon(SimpleUploadedFile('food.png', output.getvalue()), 'admin', '美食')
        set_catalog_item_icon('admin', 'dish.baked_potato', asset.pk)
        self.assertTrue(is_catalog_item_icon_used(asset.pk))
        self.supply(); self.prepare(); self.cook()
        item = AgentInventoryItem.objects.get(source__sku='dish.baked_potato')
        data = InventorySerializer(item, context=inventory_context([item], 'admin')).data
        self.assertEqual(data['icon_asset_id'], asset.pk)
        take_stock(self.agent.pk, 'admin', 'dish.baked_potato', 1)
        self.assertTrue(is_catalog_item_icon_used(asset.pk))
        set_catalog_item_icon('admin', 'dish.baked_potato', None)
        self.assertFalse(is_catalog_item_icon_used(asset.pk))
        reconcile_cooking()

    def test_real_market_sale_replays_and_uses_old_price_lots(self):
        from system_settings.models import SystemSetting
        from .market_sessions import enter
        from .market_service import trade
        from .models import WorldLedger
        self.supply(quantity=4); self.prepare(); self.cook()
        rule = {**DEFAULT_RULES['baked_potato'], 'sale_price': '60'}
        self.prepare(key='new-price', rule=rule); self.cook(key='new-price', rule=rule)
        item = AgentInventoryItem.objects.get(source__sku='dish.baked_potato')
        market = AgentTask.objects.create(id='cook-market', task_kind='market', agent=self.agent,
            agent_ids=[self.agent.pk], market_config={'owner_id': 'admin'}, enabled=True)
        SystemSetting.objects.create(key='system_mcp_config', value={'enabled': True})
        AgentExecutionLease.objects.filter(agent=self.agent).update(token='', until=None)
        session = enter('admin', self.agent, 'sell-session', task=market, mode='manual')
        operation = {'kind': 'sell', 'item_id': item.pk, 'quantity': 2}
        result = trade(session, self.agent, 'sell-cooked', operation)
        self.assertEqual(Decimal(result['total']), 106)
        self.assertEqual(trade(session, self.agent, 'sell-cooked', operation), result)
        self.assertEqual(WorldLedger.objects.filter(pk=f'market:sell-cooked:{self.agent.pk}').count(), 1)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 0)
        reconcile_cooking()

    def test_interrupted_recovery_keeps_committed_portions_and_finalizes_cooking(self):
        from .cooking_runner import tick_cooking
        from .action_runner import repair_effects
        self.supply(); self.prepare(); self.cook()
        WorldAction.objects.filter(pk='op').update(updated_at=self.now - timedelta(minutes=20))
        tick_cooking(None)
        action = WorldAction.objects.get(pk='op')
        self.assertEqual(action.status, 'failed')
        self.assertTrue(action.effects_done)
        self.assertEqual(len(action.result['operations']), 1)
        action.effects_done = False; action.save()
        repair_effects(action)
        self.assertTrue(WorldAction.objects.get(pk='op').effects_done)
        self.assertEqual(CookingOperation.objects.count(), 1)
        reconcile_cooking()

    def test_real_listing_transfer_preserves_dish_price_and_trade_idempotence(self):
        from system_settings.models import SystemSetting
        from .market_sessions import enter
        from .market_service import trade
        from .market_models import MarketListing
        self.supply(); self.prepare(); self.cook()
        item = AgentInventoryItem.objects.get(source__sku='dish.baked_potato')
        other = Agent.objects.create(name='买家', model=self.agent.model, money=200)
        market = AgentTask.objects.create(id='dish-market', task_kind='market', agent=self.agent,
            agent_ids=[self.agent.pk, other.pk], market_config={'owner_id': 'admin'}, enabled=True)
        SystemSetting.objects.create(key='system_mcp_config', value={'enabled': True})
        AgentExecutionLease.objects.filter(agent=self.agent).update(token='', until=None)
        seller = enter('admin', self.agent, 'seller', task=market, mode='manual')
        buyer = enter('admin', other, 'buyer', task=market, mode='manual')
        trade(seller, self.agent, 'dish-list', {'kind': 'list', 'item_id': item.pk, 'quantity': 1, 'unit_price': '70'})
        listing = MarketListing.objects.get(pk='dish-list')
        operation = {'kind': 'buy_listing', 'listing_id': listing.pk, 'version': listing.version, 'quantity': 1}
        result = trade(buyer, other, 'dish-buy', operation)
        self.assertEqual(trade(buyer, other, 'dish-buy', operation), result)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 0)
        self.assertEqual(stock_quantity(other.pk, 'admin', 'dish.baked_potato'), 1)
        purchased = AgentInventoryItem.objects.get(actor_id=other.pk, source__sku='dish.baked_potato')
        self.assertEqual(Decimal(purchased.source['lots'][0]['price']), 46)
        self.assertEqual(Decimal(result['total']), 70)
        reconcile_cooking()

    def test_removed_resident_keeps_skill_and_history(self):
        self.supply(); self.prepare(); self.cook()
        actor_id = self.agent.pk
        self.agent.delete()
        reconcile_cooking()
        self.assertTrue(CookingSkill.objects.filter(pk=actor_id).exists())
        self.assertEqual(self.client.get(f'/api/settings/agent-world/cooking/agents/{actor_id}/history/').status_code, 200)


class ConcurrentCookingTests(TransactionTestCase):
    setUp = CookingTests.setUp
    supply = CookingTests.supply
    prepare = CookingTests.prepare

    def test_two_opportunities_cannot_consume_the_last_portion_twice(self):
        from concurrent.futures import ThreadPoolExecutor
        from django.db import close_old_connections
        self.supply()
        self.prepare(key='one'); self.prepare(key='two')
        def attempt(key):
            close_old_connections()
            try:
                commit_portion(self.agent.pk, key, 0, 'baked_potato', DEFAULT_RULES['baked_potato'], '争用最后食材', self.task, 'a', 'w')
                return 'success'
            except ValueError as exc:
                return str(exc)
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, ['one', 'two']))
        self.assertEqual(results.count('success'), 1)
        self.assertEqual(CookingOperation.objects.count(), 1)
        self.assertEqual(CookingSkill.objects.get(pk=self.agent.pk).experience, 10)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'dish.baked_potato'), 1)
        reconcile_cooking()
