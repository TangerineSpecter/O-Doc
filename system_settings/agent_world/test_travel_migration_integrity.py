"""Historical migration writes must keep existing asset restore checks valid."""
import copy
import importlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

from django.db import connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, override_settings

from system_settings.models import SyncEntityState
from . import test_travel as fixtures
from .cooking_models import CookingCatalog, CookingIntegrity
from .cooking_integrity import fingerprints as cooking_fingerprints
from .cooking_sync import reconcile_cooking
from .market_models import MarketConfig, MarketIntegrity
from .market_sync import fingerprints as market_fingerprints, reconcile_market
from .travel_models import AgentInventoryItem


class TravelMigrationIntegrityTests(TestCase):
    setUp = fixtures.TravelTests.setUp
    journey = fixtures.TravelTests.journey

    def prepare(self):
        migration = importlib.import_module('system_settings.migrations.0066_simplify_historical_travel_text')
        historical = MigrationExecutor(connection).loader.project_state([
            ('system_settings', '0066_simplify_historical_travel_text')]).apps
        journey = self.journey(status='completed')
        MarketConfig.objects.create(pk='admin', seed='migration-test')
        CookingCatalog.objects.create(pk='admin')
        item = AgentInventoryItem.objects.create(pk='travel-souvenir', owner_id='admin', actor_id=self.agent.pk,
            name='手工藝品', quantity=2, value='12.50', created_at=journey.created_at.replace(microsecond=1),
            source={'journey_id': journey.pk, 'description': '傳統圖案', 'source_url': 'https://example.invalid/藝品'})
        return migration, historical, item

    def apply(self, migration, historical):
        migration.apply(historical, SimpleNamespace(connection=connection))

    def test_historical_repair_preserves_both_restore_checks_and_checkpoint_backup(self):
        migration, historical, item = self.prepare()
        before_market = copy.deepcopy(MarketIntegrity.objects.get(pk='admin').hashes)
        before_cooking = copy.deepcopy(CookingIntegrity.objects.get(pk='admin').hashes)
        MarketIntegrity.objects.create(pk='untouched', hashes={'unrelated': 'preserve'})
        CookingIntegrity.objects.create(pk='untouched', hashes={'unrelated': 'preserve'})
        with TemporaryDirectory() as folder, override_settings(SYSTEM_LOG_DIR=folder):
            self.apply(migration, historical)
            backups = list((Path(folder) / 'travel-text-backups').glob('*.json'))
            records = json.loads(backups[0].read_text())['records']
            for model, before in [('marketintegrity', before_market), ('cookingintegrity', before_cooking)]:
                saved = next(row for row in records if row['model'] == 'system_settings.' + model)
                self.assertEqual(saved['before']['hashes'], before)
            self.apply(migration, historical)
            self.assertEqual(len(list((Path(folder) / 'travel-text-backups').glob('*.json'))), 1)
        item.refresh_from_db()
        self.assertEqual((item.name, item.quantity, str(item.value)), ('手工艺品', 2, '12.50'))
        self.assertEqual(item.source['description'], '传统图案')
        self.assertEqual(item.source['source_url'], 'https://example.invalid/藝品')
        for model, expected, before in [(MarketIntegrity, market_fingerprints('admin'), before_market),
                                        (CookingIntegrity, cooking_fingerprints('admin'), before_cooking)]:
            self.assertEqual(model.objects.get(pk='admin').hashes, expected)
            self.assertNotEqual(expected['AgentInventoryItem'], before['AgentInventoryItem'])
            self.assertEqual({k: v for k, v in expected.items() if k != 'AgentInventoryItem'},
                             {k: v for k, v in before.items() if k != 'AgentInventoryItem'})
            self.assertEqual(model.objects.get(pk='untouched').hashes, {'unrelated': 'preserve'})
            self.assertTrue(SyncEntityState.objects.filter(model_label=model._meta.label_lower, object_pk='admin').exists())
        # The unrelated sentinel checkpoints are intentionally not valid business snapshots.
        MarketIntegrity.objects.filter(pk='untouched').delete()
        CookingIntegrity.objects.filter(pk='untouched').delete()
        reconcile_market()
        reconcile_cooking()

    def test_existing_inventory_conflict_is_not_blessed_by_text_repair(self):
        migration, historical, item = self.prepare()
        integrity = MarketIntegrity.objects.get(pk='admin')
        integrity.hashes['AgentInventoryItem'] = 'existing-conflict'
        integrity.save()
        with TemporaryDirectory() as folder, override_settings(SYSTEM_LOG_DIR=folder):
            with self.assertRaisesRegex(RuntimeError, '背包指纹不一致'):
                self.apply(migration, historical)
            self.assertEqual(list(Path(folder).iterdir()), [])
        item.refresh_from_db()
        self.assertEqual(item.name, '手工藝品')
        self.assertEqual(MarketIntegrity.objects.get(pk='admin').hashes['AgentInventoryItem'], 'existing-conflict')

    def test_checkpoint_write_failure_rolls_back_text_and_all_hashes(self):
        migration, historical, item = self.prepare()
        before_market = copy.deepcopy(MarketIntegrity.objects.get(pk='admin').hashes)
        before_cooking = copy.deepcopy(CookingIntegrity.objects.get(pk='admin').hashes)
        with TemporaryDirectory() as folder, override_settings(SYSTEM_LOG_DIR=folder), \
                patch.object(historical.get_model('system_settings', 'CookingIntegrity'), 'save', side_effect=RuntimeError('write failed')):
            with self.assertRaisesRegex(RuntimeError, 'write failed'), transaction.atomic():
                self.apply(migration, historical)
            self.assertEqual(len(list((Path(folder) / 'travel-text-backups').glob('*.json'))), 1)
        item.refresh_from_db()
        self.assertEqual(item.name, '手工藝品')
        self.assertEqual(MarketIntegrity.objects.get(pk='admin').hashes, before_market)
        self.assertEqual(CookingIntegrity.objects.get(pk='admin').hashes, before_cooking)
