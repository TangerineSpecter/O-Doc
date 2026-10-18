"""Legacy sealing, self-contained history, and catalog-independent sync regressions."""
import copy
import json
from datetime import timedelta
from unittest.mock import patch

from django.core import serializers
from django.test import TestCase

from .test_food import FoodExplorationTests
from .models import CombatCatalog, CombatFact, CombatIntegrity, CombatProfile, EquipmentInstance, Exploration
from .store import digest, install
from .profiles import equip, ensure, adopt_catalog
from . import explorations
from .history import freeze_legacy, maintain, runtime_catalog_ids
from .history_snapshot import indexed, aggregate_frame, normalize_source, compact_source, FACT, CHAIN, GEAR, RUN, CATALOG, PROFILE
from .sync import validate_source, metadata


class FrozenHistoryTests(TestCase):
    setUp = FoodExplorationTests.setUp
    stock = FoodExplorationTests.stock
    trip = FoodExplorationTests.trip
    exported = FoodExplorationTests.exported

    def legacy_fixture(self):
        run = self.trip()
        explorations.finish(run.pk, now=self.now + timedelta(seconds=15))
        from ..life_sync import checkpoint_all
        checkpoint_all()
        data = self.exported()
        data = [row for row in data if not (row['model'] == FACT and row['fields']['kind'] == 'checkpoint')]
        source = next(row for row in data if row['model'] == CATALOG)
        old = copy.deepcopy(source)
        old['pk'] = 'historical-rules'
        old['fields']['created_at'] = '2020-01-01T00:00:00'
        data.append(old)
        for row in data:
            fields = row['fields']
            if row['model'] in (PROFILE, GEAR, RUN):
                fields['catalog_id'] = old['pk']
            if row['model'] == GEAR:
                fields.pop('rules', None)
                fields['snapshot'].pop('element', None)
            if row['model'] == RUN:
                fields['snapshot'].pop('history_frozen', None)
                fields['snapshot'].pop('history', None)
            if row['model'] == FACT:
                fields['payload'].pop('progression_after', None)
                fields['payload'].pop('equipment_after', None)
        rows = indexed(data)
        ordered = sorted((row for (kind, _), row in rows.items() if kind == FACT), key=lambda row: row['sequence'])
        previous = ''
        for number, row in enumerate(ordered, 1):
            row['sequence'], row['previous_hash'] = number, previous
            content = {key: row[key] for key in ('id','actor_id','owner_id','sequence','kind','exploration_id','elapsed_seconds','payload','previous_hash')}
            row['digest'] = previous = digest(content)
        chain = rows[(CHAIN, self.agent.pk)]
        chain.update(head=len(ordered), digest=previous, frame=digest(aggregate_frame(rows, self.agent.pk, frozen=False)))
        for row in data:
            row['fields'] = {key: value for key, value in rows[(row['model'], str(row['pk']))].items() if key != 'id'}
        run.refresh_from_db()
        return data, run

    def load_legacy_fixture(self, data):
        # Only the isolated test database is changed; no application/media data is used.
        CombatFact.objects.all().delete()
        selected = [row for row in data if row['model'] in {FACT, CHAIN, GEAR, RUN, PROFILE, CATALOG}]
        for obj in serializers.deserialize('json', json.dumps(selected)):
            obj.save()

    def test_startup_seals_legacy_without_regenerating_old_equipment(self):
        data, run = self.legacy_fixture()
        self.load_legacy_fixture(data)
        starter = EquipmentInstance.objects.get(actor_id=self.agent.pk)
        original = copy.deepcopy(starter.snapshot)
        self.assertNotIn('element', original)
        with patch('system_settings.agent_world.combat.equipment.generate', side_effect=AssertionError('must not regenerate')):
            maintain(self.catalog)
        starter.refresh_from_db()
        self.assertEqual(starter.snapshot, original)
        self.assertEqual(starter.rules['version'], 1)
        run.refresh_from_db()
        self.assertEqual(run.snapshot['history_frozen'], 1)
        self.assertEqual(run.snapshot['history']['source_catalog'], 'historical-rules')
        self.assertEqual(CombatFact.objects.filter(kind='checkpoint').count(), 1)
        head = CombatIntegrity.objects.get(pk=self.agent.pk).head
        maintain(self.catalog)
        self.assertEqual(CombatIntegrity.objects.get(pk=self.agent.pk).head, head)

    def test_deleted_old_catalog_does_not_break_equipment_history_or_sync(self):
        data, run = self.legacy_fixture()
        self.load_legacy_fixture(data)
        maintain(self.catalog)
        CombatCatalog.objects.filter(pk='historical-rules').delete()
        with patch('system_settings.agent_world.combat.equipment.generate', side_effect=AssertionError('must not replay')):
            data = compact_source(self.exported())
            validate_source(data, metadata(data))
        profile = CombatProfile.objects.get(pk=self.agent.pk)
        identity = profile.loadout['weapon']
        equip('admin', self.agent, 'off', {'weapon': None})
        equip('admin', self.agent, 'on', {'weapon': identity})
        from .queries import snapshot, history
        self.assertEqual(snapshot(run)['result']['report'], run.result['report'])
        self.assertEqual(history('admin', self.agent.pk)['total'], 1)
        run = self.trip('new-trip')
        self.assertEqual(run.status, 'active')

    def test_live_exploration_pins_old_rules_until_finished(self):
        run = self.trip()
        new_version = 'combat-future'
        CombatCatalog.objects.create(pk=new_version, tables=self.catalog.tables, digest=digest(self.catalog.tables),
                                     created_at=run.created_at + timedelta(seconds=1))
        from .catalog import Catalog
        future = Catalog(self.catalog.tables, new_version)
        maintain(future)
        self.assertIn(self.catalog.version, runtime_catalog_ids())
        self.assertEqual(CombatProfile.objects.get(pk=self.agent.pk).catalog_id, self.catalog.version)
        explorations.finish(run.pk, now=self.now + timedelta(seconds=15))
        maintain(future)
        self.assertEqual(runtime_catalog_ids(), {new_version})
        archived = Exploration.objects.get(pk=run.pk)
        self.assertEqual(archived.snapshot['history']['source_catalog'], self.catalog.version)

    def test_invalid_legacy_frame_or_chain_is_not_blessed_by_sealing(self):
        from utils.sync_manager import SyncError
        data, _ = self.legacy_fixture()
        for mutation in ('frame', 'fact', 'rules'):
            bad = copy.deepcopy(data)
            if mutation == 'frame':
                next(row for row in bad if row['model'] == GEAR)['fields']['snapshot']['stats']['strength'] = 999
            elif mutation == 'fact':
                next(row for row in bad if row['model'] == FACT)['fields']['payload']['fake'] = True
            else:
                next(row for row in bad if row['model'] == CATALOG and row['pk'] == 'historical-rules')['fields']['tables']['monsters'][0]['name'] = 'tampered'
            with self.subTest(mutation=mutation), self.assertRaises(SyncError):
                normalize_source(bad)

    def test_export_includes_only_runtime_catalogs_and_restore_is_idempotent(self):
        from utils.sync_manager import SyncManager
        from ..life_config import config_for
        from ..cooking_catalog import catalog_for
        data, _ = self.legacy_fixture()
        self.load_legacy_fixture(data)
        config_for('admin')
        catalog_for('admin')
        manager = SyncManager()
        snapshot = manager.build_snapshot_data()
        self.assertEqual([row['pk'] for row in snapshot if row['model'] == CATALOG], [self.catalog.version])
        meta = manager.build_snapshot_meta(data_list=snapshot)
        self.assertEqual(meta['combat_schema_version'], 8)
        self.assertEqual(meta['combat_checkpoints'].keys(), {self.agent.pk})
        original = copy.deepcopy(EquipmentInstance.objects.get(actor_id=self.agent.pk).snapshot)
        for _ in range(2):
            manager.apply_snapshot_data(copy.deepcopy(snapshot), meta)
            self.assertEqual(CombatFact.objects.filter(kind='checkpoint').count(), 1)
            self.assertEqual(EquipmentInstance.objects.get(actor_id=self.agent.pk).snapshot, original)
        self.assertEqual(manager.build_snapshot_meta(data_list=manager.build_snapshot_data())['combat_checkpoints'], meta['combat_checkpoints'])

    def test_version_eight_requires_checkpoint_and_frozen_equipment_rules(self):
        from utils.sync_manager import SyncError
        self.trip()
        data = self.exported()
        for mutation in ('manifest', 'checkpoint', 'rules'):
            bad, meta = copy.deepcopy(data), metadata(data)
            if mutation == 'manifest':
                meta['combat_checkpoints'] = {}
            elif mutation == 'checkpoint':
                bad = [row for row in bad if not (row['model'] == FACT and row['fields']['kind'] == 'checkpoint')]
            else:
                next(row for row in bad if row['model'] == GEAR)['fields']['rules']['job_levels'] = {}
            with self.subTest(mutation=mutation), self.assertRaises(SyncError):
                validate_source(bad, meta)

    def test_legacy_import_is_upgraded_to_self_contained_records(self):
        from utils.sync_manager import SyncManager
        from ..cooking_catalog import catalog_for
        from ..life_config import config_for
        from ..cooking_quality_sync import metadata as cooking_metadata
        data, _ = self.legacy_fixture()
        meta = {**metadata(data), **cooking_metadata(data), 'combat_schema_version': 7}
        manager = SyncManager()
        manager.apply_snapshot_data(data, meta)
        self.assertEqual(CombatFact.objects.filter(kind='checkpoint').count(), 1)
        maintain(self.catalog)
        validate_source(compact_source(self.exported()))

    def test_storage_summary_is_owner_scoped(self):
        ensure('admin', self.agent)
        from .history import summary
        self.assertEqual(summary('admin')['frozen_residents'], 1)
        self.assertEqual(summary('stranger')['frozen_residents'], 0)

    def test_repair_mode_rejects_frozen_tampering_before_any_restore(self):
        from utils.sync_manager import SyncManager, SyncError
        self.trip()
        data = self.exported()
        meta = metadata(data)
        before = CombatFact.objects.count()
        next(row for row in data if row['model'] == GEAR)['fields']['rules']['job_levels'] = {}
        with self.assertRaises(SyncError):
            SyncManager().apply_snapshot_data(data, meta, integrity='repair')
        self.assertEqual(CombatFact.objects.count(), before)
        self.assertTrue(EquipmentInstance.objects.get(actor_id=self.agent.pk).rules['job_levels'])

    def test_preserving_an_installed_bundle_still_seals_legacy_state(self):
        data, _ = self.legacy_fixture()
        self.load_legacy_fixture(data)
        with patch('system_settings.agent_world.combat.store.bundled', side_effect=ValueError('fixture invalid bundle')):
            self.assertEqual(install().version, self.catalog.version)
        self.assertEqual(CombatFact.objects.filter(kind='checkpoint').count(), 1)
        validate_source(compact_source(self.exported()))
