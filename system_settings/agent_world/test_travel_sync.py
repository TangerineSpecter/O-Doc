import csv
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.core import serializers
from django.test import TestCase
from django.utils import timezone

from system_settings.models import SyncEntityState
from system_settings.tests import MemoryStorageClient
from utils.sync_manager import SyncError, SyncManager
from . import travel_sync
from .travel_csv import HEADERS
from .travel_models import TravelDestination, TravelSeedState
from .travel_seed import initialize_travel_destinations


class TravelSparseSyncTests(TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'cities.csv'
        with self.path.open('w', encoding='utf-8', newline='') as stream:
            writer = csv.writer(stream)
            writer.writerow(HEADERS)
            writer.writerows([
                ['1', 'CN', '中国', '四川', '成都', 'Chengdu', '100', '1'],
                ['2', 'CN', '中国', '广东', '深圳', 'Shenzhen', '200', '1'],
                ['3', 'JP', '日本', '', '东京', 'Tokyo', '300', '0'],
            ])
        self.seed_patch = patch.object(travel_sync, 'SEED_PATH', self.path)
        self.seed_patch.start()
        self.addCleanup(self.seed_patch.stop)
        self.media_settings = self.settings(MEDIA_ROOT=Path(self.tmp.name) / 'media')
        self.media_settings.enable()
        self.addCleanup(self.media_settings.disable)
        initialize_travel_destinations(self.path)
        self.manager = SyncManager(MemoryStorageClient(), '/sync-test')

    def rows(self):
        return json.loads(serializers.serialize('json', TravelDestination.objects.order_by('pk')))

    def test_defaults_are_omitted_and_existing_tracking_rows_pruned(self):
        rows = self.rows()
        for row in rows:
            SyncEntityState.objects.update_or_create(
                model_label=travel_sync.LABEL, object_pk=row['pk'],
                defaults={'content_hash': 'old-hash'},
            )
        exported = self.manager.build_snapshot_data(compact_travel=True)
        self.assertFalse(any(row['model'] == travel_sync.LABEL for row in exported))
        revisions = self.manager._build_revision_manifest(exported)
        self.assertFalse(any(key.startswith(travel_sync.PREFIX) for key in revisions))
        self.assertFalse(SyncEntityState.objects.filter(model_label=travel_sync.LABEL).exists())
        self.assertEqual(TravelDestination.objects.count(), 3)
        # 本地备份导出仍然包含全目录。
        full = self.manager.build_snapshot_data()
        self.assertEqual(sum(row['model'] == travel_sync.LABEL for row in full), 3)

    def test_edits_reset_to_defaults_and_new_cities_remain_explicit(self):
        city = TravelDestination.objects.get(pk='1')
        city.price = 999
        city.save()
        edited = self.manager.build_snapshot_data(compact_travel=True)
        revision = self.manager._build_revision_manifest(edited)[travel_sync.PREFIX + '1']
        city.price = 100
        city.save()
        TravelDestination.objects.create(pk='custom', country_code='CN', country='中国', city='新城市', price=5)
        reset = self.manager.build_snapshot_data(compact_travel=True)
        ids = {row['pk'] for row in reset if row['model'] == travel_sync.LABEL}
        self.assertEqual(ids, {'1', 'custom'})
        reset_revision = self.manager._build_revision_manifest(reset)[travel_sync.PREFIX + '1']
        self.assertNotEqual(revision['hash'], reset_revision['hash'])
        remote = {'data': reset, 'revisions': self.manager._build_revision_manifest(reset)}
        merged, _, _ = self.manager.merge_v2_data(
            {'data': edited, 'revisions': {travel_sync.PREFIX + '1': revision}},
            edited, {travel_sync.PREFIX + '1': revision}, remote,
        )
        row = next(row for row in merged if row['model'] == travel_sync.LABEL and row['pk'] == '1')
        self.assertEqual(row['fields']['price'], '100.00')

    def test_legacy_default_rows_do_not_become_deletions_or_conflicts(self):
        legacy_rows = self.rows()
        legacy_revisions = {travel_sync.PREFIX + row['pk']: {
            'hash': str(row['pk']), 'deleted': False, 'revision_at': timezone.now().isoformat(),
        } for row in legacy_rows}
        city = TravelDestination.objects.get(pk='1')
        city.enabled = False
        city.save()
        TravelDestination.objects.get(pk='2').delete()
        local = self.manager.build_snapshot_data(compact_travel=True)
        local_revisions = self.manager._build_revision_manifest(local)
        merged, revisions, summary = self.manager.merge_v2_data(
            {'data': legacy_rows, 'revisions': legacy_revisions}, local, local_revisions,
            {'data': legacy_rows, 'revisions': legacy_revisions},
        )
        self.assertEqual([row['pk'] for row in merged if row['model'] == travel_sync.LABEL], ['1'])
        self.assertTrue(revisions[travel_sync.PREFIX + '2']['deleted'])
        self.assertNotIn(travel_sync.PREFIX + '3', revisions)
        self.assertEqual(summary['conflicts'], 0)
        self.manager.apply_snapshot_data(merged, remote_meta=travel_sync.metadata(revisions), full_overwrite=True)
        self.manager._apply_v2_revisions(revisions)
        self.assertFalse(TravelDestination.objects.filter(pk='2').exists())
        self.assertFalse(TravelDestination.objects.get(pk='1').enabled)
        self.assertTrue(TravelDestination.objects.filter(pk='3').exists())
        initialize_travel_destinations(self.path)
        self.assertFalse(TravelDestination.objects.filter(pk='2').exists())

    def test_sparse_restore_reconstructs_defaults_and_resets_local_edits(self):
        city = TravelDestination.objects.get(pk='1')
        city.price = 999
        city.save()
        with patch.object(self.manager, 'create_local_safety_backup', return_value='test-backup'):
            snapshot = self.manager.publish_v2_snapshot(source='test', data_list=[], revisions={})
            restored, _ = self.manager.restore_v2_snapshot(snapshot['meta']['snapshot_id'])
        self.assertEqual(TravelDestination.objects.get(pk='1').price, 100)
        self.assertFalse(any(row['model'] == travel_sync.LABEL for row in restored['data']))
        TravelDestination.objects.all().delete()
        TravelSeedState.objects.all().delete()
        self.manager.apply_snapshot_data(restored['data'], remote_meta=restored['meta'], full_overwrite=True)
        self.assertEqual(TravelDestination.objects.count(), 3)
        self.assertTrue(travel_sync.enabled())

    def test_catalog_mismatch_rejected_before_writes(self):
        meta = travel_sync.metadata({})
        meta['travel_catalog']['sha256'] = 'different'
        with self.assertRaisesRegex(SyncError, '目录版本不一致'):
            self.manager.apply_snapshot_data([], remote_meta=meta, full_overwrite=True)
        self.assertEqual(TravelDestination.objects.count(), 3)

    def test_current_version_rejects_sparse_snapshot_for_old_client(self):
        meta = {**travel_sync.metadata({}), 'app_version': '1.1.5'}
        with patch.object(self.manager, 'get_current_app_version', return_value='1.1.4'):
            with self.assertRaisesRegex(SyncError, '更新的系统'):
                self.manager.validate_remote_snapshot_version(meta)

    def test_unchanged_sync_and_legacy_head_upgrade(self):
        data = self.manager.build_snapshot_data()
        revisions = self.manager._build_revision_manifest(data)
        snapshot = self.manager.publish_v2_snapshot(source='test', data_list=data, revisions=revisions)
        _, summary, _ = self.manager.sync_v2(base_snapshot_id=snapshot['meta']['snapshot_id'])
        self.assertTrue(summary['unchanged'])
        head = {'meta': {key: value for key, value in snapshot['meta'].items() if key != 'travel_catalog'},
                'revisions': revisions, 'media': {}}
        self.assertFalse(self.manager._local_matches_head(head))

    def test_full_zip_backup_restores_without_seed_dependency(self):
        backup = str(Path(self.tmp.name) / 'backup.zip')
        self.manager.write_local_backup_zip(backup)
        TravelDestination.objects.all().delete()
        self.manager.import_local_backup_zip(backup)
        self.assertEqual(TravelDestination.objects.count(), 3)

    def test_full_backup_preserves_deleted_default_without_tracking_index(self):
        from system_settings.sync_state import suspend_tracking
        TravelDestination.objects.get(pk='2').delete()
        backup = str(Path(self.tmp.name) / 'deleted-city.zip')
        self.manager.write_local_backup_zip(backup)
        with suspend_tracking():
            SyncEntityState.objects.filter(model_label=travel_sync.LABEL).delete()
            # 模拟在仍含默认目录的设备恢复 ZIP。
            digest, defaults = travel_sync.catalog()
            TravelDestination.objects.create(pk='2', **{**defaults['2'], 'updated_at': timezone.now()})
        self.manager.import_local_backup_zip(backup)
        data = self.manager.build_snapshot_data(compact_travel=True)
        revisions = self.manager._build_revision_manifest(data)
        self.assertTrue(revisions[travel_sync.PREFIX + '2']['deleted'])
        expanded = travel_sync.expand(data, travel_sync.metadata(revisions))
        self.assertNotIn('2', {row['pk'] for row in expanded if row['model'] == travel_sync.LABEL})

    def test_fresh_device_sync_rebuilds_defaults_without_reviving_deleted_city(self):
        from system_settings.sync_state import suspend_tracking
        city = TravelDestination.objects.get(pk='1')
        city.price = 888
        city.save()
        TravelDestination.objects.get(pk='2').delete()
        snapshot = self.manager.publish_v2_snapshot(source='test')
        with suspend_tracking():
            TravelDestination.objects.all().delete()
            TravelSeedState.objects.all().delete()
            SyncEntityState.objects.all().delete()
        with patch.object(self.manager, 'create_local_safety_backup', return_value='test-backup'):
            synced, _, _ = self.manager.sync_v2()
        self.assertEqual(set(TravelDestination.objects.values_list('pk', flat=True)), {'1', '3'})
        self.assertEqual(TravelDestination.objects.get(pk='1').price, 888)
        self.assertEqual(synced['meta']['travel_catalog']['deleted_ids'], ['2'])
        _, summary, _ = self.manager.sync_v2(base_snapshot_id=synced['meta']['snapshot_id'])
        self.assertTrue(summary['unchanged'])

    def test_sparse_snapshot_rejects_inconsistent_deletion_manifest(self):
        TravelDestination.objects.get(pk='2').delete()
        snapshot = self.manager.publish_v2_snapshot(source='test')
        meta = snapshot['meta']
        broken = {**meta, 'travel_catalog': {**meta['travel_catalog'], 'deleted_ids': []}}
        self.manager._write_remote_json(broken, self.manager._snapshot_path(meta['snapshot_id'], 'snapshot_meta.json'))
        with self.assertRaisesRegex(SyncError, '删除清单与修订不一致'):
            self.manager.get_v2_snapshot(meta['snapshot_id'])

    def test_default_restore_does_not_update_existing_default_cities(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as captured:
            self.manager.apply_snapshot_data([], remote_meta=travel_sync.metadata({}), full_overwrite=True)
        writes = [query['sql'] for query in captured.captured_queries
                  if query['sql'].startswith(('UPDATE', 'INSERT', 'DELETE'))
                  and 'system_settings_traveldestination' in query['sql']]
        self.assertEqual(writes, [])


class TravelFullCatalogSyncTests(TestCase):
    def test_production_sized_catalog_drops_only_default_tracking_rows(self):
        from .travel_seed import SEED_PATH
        initialize_travel_destinations(SEED_PATH)
        expected = TravelDestination.objects.count()
        self.assertGreater(expected, 30000)
        SyncEntityState.objects.bulk_create([
            SyncEntityState(model_label=travel_sync.LABEL, object_pk=pk, content_hash='legacy')
            for pk in TravelDestination.objects.values_list('pk', flat=True)
        ], batch_size=500)
        # 模拟人工改价后回到默认、以及历史迁移纠错后的原值：均需保留。
        city = TravelDestination.objects.first()
        city.save()
        manager = SyncManager()
        data = manager.build_snapshot_data(compact_travel=True)
        revisions = manager._build_revision_manifest(data)
        self.assertEqual(sum(row['model'] == travel_sync.LABEL for row in data), 1)
        self.assertEqual(sum(key.startswith(travel_sync.PREFIX) for key in revisions), 1)
        self.assertEqual(SyncEntityState.objects.filter(model_label=travel_sync.LABEL).count(), 1)
        self.assertEqual(TravelDestination.objects.count(), expected)
