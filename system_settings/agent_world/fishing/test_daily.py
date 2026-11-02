import copy
import os
import tempfile
from datetime import datetime, time, timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings

from utils.sync_policy import SyncError
from ..analytics.fishing_statistics import load_fishing_statistics
from ..combat.migration_guard import PROTECTION_ENV
from ..life_time import SHANGHAI, local_time, storage_time
from . import tests as fishing_tests
from .analytics_models import FishingTripCoverage, FishingTripDay
from .daily_backfill import backfill, backfill_batch
from .daily_sync import COVERAGE, DAY
from .models import FishingEvent
from .service import finish
from .sync import metadata, validate_conflicts, validate_source


@override_settings(USE_TZ=True)
class FishingDailyTests(TestCase):
    setUp = fishing_tests.FishingTests.setUp
    buy = fishing_tests.FishingTests.buy
    trip = fishing_tests.FishingTests.trip
    prepared = fishing_tests.FishingTests.prepared
    cast_at = fishing_tests.FishingTests.cast_at

    def finished_trip(self):
        trip = self.prepared()
        self.cast_at(trip, minutes=5, kind='fish')
        self.cast_at(trip, minutes=10, kind='empty')
        finish(trip.pk, '返回')
        trip.refresh_from_db()
        return trip

    def test_backfill_is_protected_idempotent_and_matches_raw_statistics(self):
        trip = self.finished_trip()
        before = FishingEvent.objects.count()
        with patch.dict(os.environ, {PROTECTION_ENV: '0'}), self.assertRaisesMessage(ValueError, '请先'):
            backfill('admin', trip.pk)
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            self.assertTrue(backfill('admin', trip.pk)['created'])
            self.assertFalse(backfill('admin', trip.pk)['created'])
        self.assertEqual(FishingEvent.objects.count(), before)
        self.assertEqual(FishingTripCoverage.objects.count(), 1)
        self.assertGreater(FishingTripDay.objects.count(), 0)
        day = local_time(FishingEvent.objects.filter(trip=trip, kind='cast').first().created_at).date()
        first = storage_time(datetime.combine(day, time.min, SHANGHAI))
        residents = {self.agent.pk: {'id': self.agent.pk, 'name': self.agent.name, 'avatar': '', 'departed': False}}
        raw = load_fishing_statistics('admin', first, first+timedelta(days=1), residents)
        daily = load_fishing_statistics('admin', first, first+timedelta(days=1), residents, include_daily=True)
        self.assertEqual(daily, raw)
        self.assertEqual((daily[0]['casts'], daily[0]['catches']), (2, 1))
        from ..analytics.fishing_daily import load_daily_fishing
        self.assertEqual(load_daily_fishing('admin', residents, first, first+timedelta(days=1))[0], {trip.pk})
        FishingTripDay.objects.filter(trip_id=trip.pk).update(counters={})
        fallback = load_fishing_statistics('admin', first, first+timedelta(days=1), residents, include_daily=True)
        self.assertEqual(fallback, raw)

    def test_fishing_contribution_is_validated_and_uses_versioned_sync(self):
        from utils.sync_manager import SyncManager
        trip = self.finished_trip()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            backfill('admin', trip.pk)
        with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
            manager = SyncManager()
            source = manager.build_snapshot_data()
            info = manager.build_snapshot_meta(data_list=source)
        self.assertEqual(metadata(source)['fishing_schema_version'], 2)
        validate_source(source, info)
        with self.assertRaisesMessage(SyncError, '钓鱼同步2'):
            validate_source(source, {**info, 'fishing_schema_version': 1})
        bad = copy.deepcopy(source)
        next(row for row in bad if row['model'] == DAY)['fields']['counters']['casts'] += 1
        with self.assertRaisesMessage(SyncError, '与原始来源'):
            validate_source(bad, info)
        with self.assertRaisesMessage(SyncError, '不同设备'):
            validate_conflicts(source, bad)
        missing = [row for row in source if row['model'] != COVERAGE]
        with self.assertRaisesMessage(SyncError, '缺少来源覆盖'):
            validate_source(missing, info)

    def test_daily_statistics_mix_covered_and_uncovered_trips_once(self):
        from ..analytics.fishing_daily import load_daily_fishing
        first_trip = self.finished_trip()
        second = self.prepared(key='uncovered-trip')
        self.cast_at(second, minutes=5, kind='empty')
        finish(second.pk, '返回')
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            backfill('admin', first_trip.pk)
        day = local_time(FishingEvent.objects.filter(trip=first_trip, kind='cast').first().created_at).date()
        start = storage_time(datetime.combine(day, time.min, SHANGHAI))
        residents = {self.agent.pk: {'id': self.agent.pk, 'name': self.agent.name, 'avatar': '', 'departed': False}}
        raw = load_fishing_statistics('admin', start, start+timedelta(days=1), residents)
        daily = load_fishing_statistics('admin', start, start+timedelta(days=1), residents, include_daily=True)
        self.assertEqual(daily, raw)
        self.assertEqual((daily[0]['casts'], daily[0]['catches']), (3, 1))
        self.assertEqual(load_daily_fishing('admin', residents, start, start+timedelta(days=1))[0], {first_trip.pk})

    def test_incomplete_event_sequence_does_not_write_a_summary(self):
        trip = self.finished_trip()
        event = FishingEvent.objects.filter(trip=trip, sequence=2).first()
        event.delete()
        before = FishingEvent.objects.count()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}), self.assertRaisesMessage(ValueError, '序列不完整'):
            backfill('admin', trip.pk)
        self.assertFalse(FishingTripCoverage.objects.exists())
        self.assertEqual(FishingEvent.objects.count(), before)

    def test_batch_resumes_and_does_not_repeat_finished_trip(self):
        trip = self.finished_trip()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            first = backfill_batch('admin', limit=1)
            after = backfill_batch('admin', after=first['next_after'], limit=1)
            retry = backfill_batch('admin', limit=1)
        self.assertEqual((first['created'], after['created'], retry['created']), (1, 0, 0))
        self.assertEqual(first['next_after'], trip.pk)
        self.assertFalse(first['cleanup_ready'])

    def test_batch_skips_malformed_outcome_and_continues(self):
        first = self.finished_trip()
        second = self.prepared(key='malformed-batch-second')
        self.cast_at(second, minutes=5, kind='empty')
        finish(second.pk, '返回')
        bad, good = sorted((first.pk, second.pk))
        event = FishingEvent.objects.filter(trip_id=bad, kind='cast').order_by('sequence').first()
        self.assertIsNotNone(event)
        FishingEvent.objects.filter(pk=event.pk).update(data={**event.data, 'outcome': None})
        before = FishingEvent.objects.count()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            with self.assertRaisesMessage(ValueError, '钓鱼事件结果无效'):
                backfill('admin', bad)
            result = backfill_batch('admin', limit=5, max_seconds=60)
        self.assertEqual((result['processed'], result['created']), (2, 1))
        self.assertEqual([item['trip_id'] for item in result['failures']], [bad])
        self.assertEqual(result['next_after'], good)
        self.assertFalse(result['has_more'])
        self.assertTrue(FishingTripCoverage.objects.filter(pk=good).exists())
        self.assertFalse(FishingTripCoverage.objects.filter(pk=bad).exists())
        self.assertEqual(FishingEvent.objects.count(), before)

    def test_invalid_catch_is_not_silently_recorded_as_no_catch(self):
        trip = self.finished_trip()
        event = FishingEvent.objects.filter(trip=trip, kind='cast').order_by('sequence').first()
        FishingEvent.objects.filter(pk=event.pk).update(data={**event.data, 'catch': []})
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}), self.assertRaisesMessage(ValueError, '钓鱼事件捕获内容无效'):
            backfill('admin', trip.pk)
        self.assertFalse(FishingTripCoverage.objects.filter(pk=trip.pk).exists())

    def test_ordinary_sync_merges_independent_daily_contributions(self):
        from system_settings.sync_state import suspend_tracking
        from system_settings.tests import MemoryStorageClient
        from utils.sync_manager import SyncManager

        first = self.finished_trip()
        second = self.prepared(key='independent-sync-trip')
        self.cast_at(second, minutes=5, kind='empty')
        finish(second.pk, '返回')
        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            manager = SyncManager(MemoryStorageClient(), '/test-backup')
            with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
                backfill('admin', first.pk)
            with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
                manager.publish_v2_snapshot(source='remote-device')
            # Emulate the local device having materialized only the other trip.
            with suspend_tracking():
                FishingTripDay.objects.filter(trip_id=first.pk).delete()
                FishingTripCoverage.objects.filter(pk=first.pk).delete()
            with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
                backfill('admin', second.pk)
            self.assertEqual(set(FishingTripCoverage.objects.values_list('pk', flat=True)), {second.pk})
            expected_event_count = FishingEvent.objects.count()
            with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
                snapshot, _, _ = manager.sync_v2(source='test')
                remote = manager.get_v2_snapshot(snapshot['meta']['snapshot_id'])
                self.assertEqual(remote['meta']['fishing_schema_version'], 2)
                self.assertEqual({row['pk'] for row in remote['data'] if row['model'] == COVERAGE},
                                 {first.pk, second.pk})
                manager.apply_snapshot_data(copy.deepcopy(remote['data']), remote_meta=remote['meta'],
                                            full_overwrite=True)
            self.assertEqual(set(FishingTripCoverage.objects.values_list('pk', flat=True)), {first.pk, second.pk})
            self.assertEqual(set(FishingTripDay.objects.values_list('trip_id', flat=True)), {first.pk, second.pk})
            self.assertEqual(FishingEvent.objects.count(), expected_event_count)

    def test_fake_webdav_publish_and_repeated_restore_preserve_daily_counts(self):
        from system_settings.tests import MemoryStorageClient
        from utils.sync_manager import SyncManager
        trip = self.finished_trip()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            backfill('admin', trip.pk)
        with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
            manager = SyncManager(MemoryStorageClient(), '/test-backup')
            data = manager.build_snapshot_data()
            snapshot = manager.publish_v2_snapshot(source='test', data_list=data, revisions={})
            remote = manager.get_v2_snapshot(snapshot['meta']['snapshot_id'])
            self.assertEqual(remote['meta']['fishing_schema_version'], 2)
            transactions = {(row['pk'], row['fields']['owner_id'], row['fields']['actor_id']) for row in remote['data']
                            if row['model'] == 'system_settings.markettransaction'}
            for item in (row['fields'] for row in remote['data'] if row['model'] == 'system_settings.agentinventoryitem'):
                trade = item['source'].get('market_trade_id')
                if trade:
                    self.assertIn((trade, item['owner_id'], item['actor_id']), transactions)
            expected = list(FishingTripDay.objects.order_by('day').values('day', 'counters'))
            for _ in range(2):
                manager.apply_snapshot_data(copy.deepcopy(remote['data']), remote_meta=remote['meta'], full_overwrite=True)
                self.assertEqual(FishingTripCoverage.objects.count(), 1)
                self.assertEqual(list(FishingTripDay.objects.order_by('day').values('day', 'counters')), expected)

    def test_legacy_bait_return_reference_requires_real_owner_and_return_fact(self):
        from utils.sync_manager import SyncManager
        from ..travel_models import AgentInventoryItem
        from .return_provenance import validate_legacy_returns
        trip = self.finished_trip()
        item = AgentInventoryItem.objects.get(owner_id='admin', actor_id=self.agent.pk, source__sku='bait.worm')
        item.source = {**item.source, 'market_trade_id': 'fishing-return:' + trip.pk}
        item.save(update_fields=['source'])
        forged = copy.copy(item)
        forged.owner_id = 'other'
        with self.assertRaises(SyncError):
            validate_legacy_returns([forged])
        forged = copy.copy(item)
        forged.source = {**item.source, 'sku': 'bait.other'}
        with self.assertRaises(SyncError):
            validate_legacy_returns([forged])
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            backfill('admin', trip.pk)
        with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
            manager = SyncManager()
            data = manager.build_snapshot_data()
            info = manager.build_snapshot_meta(data_list=data)
            manager.apply_snapshot_data(copy.deepcopy(data), info, full_overwrite=True)
            restored = AgentInventoryItem.objects.get(pk=item.pk)
            self.assertEqual(restored.source['market_trade_id'], 'fishing-return:' + trip.pk)
            restored.source = {**restored.source, 'market_trade_id': 'fishing-return:missing'}
            restored.save(update_fields=['source'])
            broken = manager.build_snapshot_data()
            with self.assertRaisesMessage(SyncError, '缺失市场转移或钓鱼返还依据'):
                manager.apply_snapshot_data(broken, manager.build_snapshot_meta(data_list=broken), full_overwrite=True)

    def test_two_devices_merge_distinct_trip_contributions(self):
        from system_settings.sync_state import canonical_hash
        from utils.sync_manager import SyncManager
        from utils.sync_merge import item_identity, revision_key
        first = self.finished_trip()
        second = self.prepared(key='second-fishing-trip')
        self.cast_at(second, minutes=5, kind='empty')
        finish(second.pk, '返回')
        manager = SyncManager()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            backfill('admin', first.pk)
            local = manager.build_snapshot_data()
            backfill('admin', second.pk)
            remote = manager.build_snapshot_data()
        remote = [row for row in remote if not (row['model'] == COVERAGE and row['pk'] == first.pk)
                  and not (row['model'] == DAY and row['fields']['trip_id'] == first.pk)]

        def revisions(data, device):
            return {revision_key(row['model'], item_identity(row)): {
                'hash': canonical_hash(row['fields']), 'revision_at': '2026-11-02T12:00:00',
                'origin_device': device, 'deleted': False} for row in data}

        with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
            merged, _, _ = manager.merge_v2_data(None, local, revisions(local, 'a'), {
                'data': remote, 'meta': manager.build_snapshot_meta(data_list=remote),
                'revisions': revisions(remote, 'b')})
        validate_source(merged, {**metadata(merged), 'fishing_owners': ['admin']})
        self.assertEqual({row['pk'] for row in merged if row['model'] == COVERAGE}, {first.pk, second.pk})
        expected_days = {row['pk']: row['fields'] for row in [*local, *remote] if row['model'] == DAY}
        self.assertEqual({row['pk']: row['fields'] for row in merged if row['model'] == DAY}, expected_days)


@override_settings(USE_TZ=False)
class FishingNaiveDailyTests(TestCase):
    def test_naive_storage_cross_midnight_and_daily_source_fallback(self):
        from .models import FishingTrip
        fishing_tests.NaiveFishingTests.test_default_naive_storage_prepare_cast_and_return(self)
        trip = FishingTrip.objects.get(owner_id='naive')
        for event in FishingEvent.objects.filter(trip=trip):
            stamp = datetime(2026, 10, 23, 0, 0) if event.kind == 'return' else datetime(2026, 10, 22, 23, 59, 59)
            FishingEvent.objects.filter(pk=event.pk).update(created_at=stamp)
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            backfill('naive', trip.pk)
        resident = {trip.actor_id: {'id': trip.actor_id, 'name': trip.actor_name, 'avatar': '', 'departed': False}}
        for first in (datetime(2026, 10, 22), datetime(2026, 10, 23)):
            raw = load_fishing_statistics('naive', first, first+timedelta(days=1), resident)
            daily = load_fishing_statistics('naive', first, first+timedelta(days=1), resident, include_daily=True)
            self.assertEqual(daily, raw)
        from ..analytics.fishing_daily import load_daily_fishing
        self.assertEqual(load_daily_fishing('naive', resident, datetime(2026, 10, 22), datetime(2026, 10, 23))[0], {trip.pk})
        self.assertEqual(FishingTripDay.objects.filter(trip_id=trip.pk).count(), 2)
