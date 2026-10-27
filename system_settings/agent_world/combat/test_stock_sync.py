"""Cross-domain material inventory: real market operations and immutable receipts."""
import copy
import json
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from django.apps import apps
from django.core import serializers
from django.test import TestCase

from .. import test_market as market_fixture
from .. import test_alchemy_schedule as alchemy_fixture
from ..inventory_stock import add_stock, take_stock, stock_quantity
from ..market_models import MarketListing
from .facts import append
from .profiles import ensure
from .store import install
from .sync import validate_source, metadata


class MaterialStockSyncTests(TestCase):
    operation = market_fixture.MarketTests.operation

    def setUp(self):
        temp = TemporaryDirectory(prefix='odoc-stock-sync-')
        self.addCleanup(temp.cleanup)
        self.enterContext(self.settings(MEDIA_ROOT=temp.name, SYSTEM_LOG_DIR=str(Path(temp.name) / 'logs'),
                                        ODOC_WORLD_LOCK_PATH=str(Path(temp.name) / 'world.lock')))
        market_fixture.MarketTests.setUp(self)
        install()
        self.profile = ensure('admin', self.a)
        from ..life_config import config_for
        config = config_for('admin')
        config.settings = {**config.settings, 'agent_ids': [self.a.pk, self.b.pk]}
        config.save()
        self.sku = 'combat.material.moss_cave.1'
        self.item = add_stock(self.a.pk, 'admin', self.a.name, self.sku, 10, '黏液', 'combat_material', '1.04')
        append(self.profile, 'material-drop', 'round', {'events': [{'kind': 'kill', 'rewards': [
            {'kind': 'material', 'item': {'id': 'material.moss_cave.1'}, 'quantity': 10}]}]})

    def data(self):
        return json.loads(serializers.serialize('json', [item
            for model in apps.get_app_config('system_settings').get_models()
            if model.__name__ != 'CombatRuntime' for item in model.objects.all()]))

    def check(self):
        data = self.data()
        validate_source(data, metadata(data))
        return data

    def listing(self):
        self.check()
        result = self.operation(self.a, self.sa, 'list-material', 'list', item_id=self.item.pk,
                                quantity=6, unit_price='2.00')
        self.check()
        return MarketListing.objects.get(pk=result['listing_id'])

    def test_old_material_stock_sells_at_current_catalog_price_and_syncs(self):
        self.check()
        result = self.operation(self.a, self.sa, 'sell-old-material', 'sell_combat_material',
                                material_id='material.moss_cave.1', quantity=2)
        self.assertEqual(result['total'], '9.00')
        self.assertEqual(stock_quantity(self.a.pk, 'admin', self.sku), 8)
        self.check()

    def test_old_lots_use_current_price_for_automatic_market_reference(self):
        from ..market_disposition import aggregate, listing_price
        row = next(row for row in aggregate('admin', self.a.pk) if row['sku'] == self.sku)
        self.assertEqual(row['value'], Decimal('4.50'))
        disposition = SimpleNamespace(list_price_ratio=Decimal('1.20'))
        self.assertEqual(listing_price(disposition, self.sku, 'admin', self.a.pk), Decimal('5.40'))
        self.item.refresh_from_db()
        self.assertEqual(self.item.value, Decimal('1.04'))

    def test_material_listing_purchase_withdraw_and_repeat_validate(self):
        listing = self.listing()
        self.operation(self.b, self.sb, 'buy-material', 'buy_listing', listing_id=listing.pk,
                       quantity=2, version=listing.version)
        # A resident can buy materials before ever entering the combat domain.
        ensure('admin', self.b)
        self.check()
        listing.refresh_from_db()
        self.operation(self.a, self.sa, 'withdraw-material', 'withdraw', listing_id=listing.pk,
                       version=listing.version)
        for _ in range(2):
            self.check()
        self.assertEqual(stock_quantity(self.a.pk, 'admin', self.sku), 8)
        self.assertEqual(stock_quantity(self.b.pk, 'admin', self.sku), 2)

    def test_force_upload_publishes_material_escrow_and_strictly_validates(self):
        from utils.sync_manager import SyncManager
        from system_settings.tests import MemoryStorageClient
        listing = self.listing()
        manager = SyncManager(MemoryStorageClient(), '/backup')
        snapshot, summary, _ = manager.sync_v2(manual_upload=True, force_overwrite=True)
        self.assertTrue(summary['force_overwrite'])
        validate_source(snapshot['data'], snapshot['meta'])
        self.assertEqual(MarketListing.objects.get(pk=listing.pk).remaining_quantity, 6)
        self.assertEqual(stock_quantity(self.a.pk, 'admin', self.sku), 4)
        for _ in range(2):
            manager.apply_snapshot_data(copy.deepcopy(snapshot['data']), snapshot['meta'], full_overwrite=True)
            self.check()
            self.assertEqual(stock_quantity(self.a.pk, 'admin', self.sku), 4)

    def test_archive_withdraw_returns_materials(self):
        from ..market_archive import withdraw_for_archive
        self.listing()
        withdraw_for_archive(self.a, self.now)
        self.check()
        self.assertEqual(stock_quantity(self.a.pk, 'admin', self.sku), 10)

    def test_missing_trade_or_extra_inventory_still_fails(self):
        from utils.sync_manager import SyncError
        self.listing()
        data = self.check()
        missing = [row for row in data if row['model'] != 'system_settings.markettransaction'
                   or row['pk'] != 'list-material']
        with self.assertRaisesMessage(SyncError, '战斗库存'):
            validate_source(missing, metadata(missing))
        take_stock(self.a.pk, 'admin', self.sku, 1)
        with self.assertRaisesMessage(SyncError, '战斗库存'):
            self.check()

    def test_alchemy_receipts_deduct_materials_once_and_check_ownership(self):
        from utils.sync_manager import SyncError
        data = self.check()
        item = next(row for row in data if row['model'] == 'system_settings.agentinventoryitem'
                    and row['pk'] == self.item.pk)
        item['fields']['quantity'] -= 2
        # Only combat's cross-domain quantity reconciliation is under test here;
        # the alchemy domain separately validates recipe/quality/energy receipts.
        receipt = {'model': 'system_settings.alchemyoperation', 'pk': 'bottle', 'fields': {
            'actor_id': self.a.pk, 'owner_id': 'admin', 'snapshot': {'materials': [
                {'sku': self.sku, 'quantity': 2}]}}}
        data.append(receipt)
        for _ in range(2):
            validate_source(data, metadata(data))
        bad = copy.deepcopy(data)
        bad[-1]['fields']['owner_id'] = 'other'
        with self.assertRaisesMessage(SyncError, '消费归属'):
            validate_source(bad, metadata(bad))
        with self.assertRaisesMessage(SyncError, '战斗库存'):
            validate_source(data[:-1], metadata(data[:-1]))


class AlchemyCombatStockSyncTests(TestCase):
    item = alchemy_fixture.AlchemyScheduleTests.item
    specification = alchemy_fixture.AlchemyScheduleTests.specification
    run_saved = alchemy_fixture.AlchemyScheduleTests.run_saved

    def setUp(self):
        from ..test_alchemy_schedule import AlchemyScheduleTests
        from ..travel_models import AgentInventoryItem
        AlchemyScheduleTests.setUp(self)
        ingredients = list(AgentInventoryItem.objects.filter(actor_id=self.agent.pk))
        for item in ingredients:
            take_stock(self.agent.pk, 'admin', item.source['sku'], item.quantity)
        install()
        profile = ensure('admin', self.agent)
        for item in ingredients:
            add_stock(self.agent.pk, 'admin', self.agent.name, item.source['sku'], item.quantity,
                      item.name, item.kind, item.value)
        append(profile, 'alchemy-material-drop', 'round', {'events': [{'kind': 'kill', 'rewards': [
            {'kind': 'material', 'item': {'id': item.source['sku'][len('combat.'):]},
             'quantity': item.quantity} for item in ingredients]}]})

    def test_real_alchemy_commit_then_upload_and_repeated_restore(self):
        from utils.sync_manager import SyncManager
        from system_settings.tests import MemoryStorageClient
        from ..alchemy_models import AlchemyOperation
        item = self.item(activity='alchemy', task_id=self.task.pk, context={'alchemy_plan': self.specification()})
        self.assertEqual(self.run_saved(item).status, 'success')
        manager = SyncManager(MemoryStorageClient(), '/backup')
        snapshot, summary, _ = manager.sync_v2(manual_upload=True, force_overwrite=True)
        self.assertTrue(summary['force_overwrite'])
        for _ in range(2):
            manager.apply_snapshot_data(copy.deepcopy(snapshot['data']), snapshot['meta'], full_overwrite=True)
            validate_source(manager.build_snapshot_data())
            self.assertEqual(AlchemyOperation.objects.count(), 1)
