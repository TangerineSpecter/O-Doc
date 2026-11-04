"""Protect original combat facts while analytics history is backfilled."""

import copy
import os
import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import SimpleTestCase, TestCase

from utils.sync_policy import SyncError
from .archive import archive_owners, archive_profile, compact, merged_markers, require_reconciled_sources
from .migration_guard import (CombatBackfillProtected, LegacyCombatArchiveDisabled, PROTECTION_ENV,
                              is_protected, require_sync_unprotected)


class CombatBackfillGuardTests(SimpleTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='odoc-combat-guard-')
        self.addCleanup(self.temp.cleanup)
        self.tempdir = patch('tempfile.gettempdir', return_value=self.temp.name)
        self.tempdir.start()
        self.addCleanup(self.tempdir.stop)
        self.settings_override = self.settings(BASE_DIR=Path(self.temp.name), MEDIA_ROOT=Path(self.temp.name) / 'media')
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.protected = patch.dict(os.environ, {PROTECTION_ENV: '1'})
        self.protected.start()
        self.addCleanup(self.protected.stop)

    def test_automatic_and_direct_archival_are_stopped_before_database_access(self):
        from .. import worker

        with patch('system_settings.agent_world.combat.archive.checkpoint_all') as checkpoint:
            worker.maintain_combat_history()
        checkpoint.assert_not_called()
        with self.assertRaises(CombatBackfillProtected):
            archive_profile(object(), datetime(2026, 1, 1), apply=True)
        with self.assertRaises(CombatBackfillProtected):
            archive_owners(None, 7, apply=True)
        with self.assertRaisesMessage(CommandError, '回填保护'):
            call_command('archive_combat_facts', '--days', '7', '--apply')

    def test_legacy_automatic_archive_is_off_when_unconfigured_or_invalid(self):
        from .. import worker
        with patch('system_settings.agent_world.combat.archive.checkpoint_all') as checkpoint:
            for value in ('', 'invalid', '0'):
                with self.subTest(value=value), patch.dict(os.environ, {PROTECTION_ENV: '0', 'ODOC_COMBAT_ARCHIVE_DAYS': value}):
                    worker.maintain_combat_history()
            with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
                os.environ.pop('ODOC_COMBAT_ARCHIVE_DAYS', None)
                worker.maintain_combat_history()
        checkpoint.assert_not_called()

    def test_legacy_deletion_is_retired_even_without_backfill_protection(self):
        from .. import worker
        with patch.dict(os.environ, {PROTECTION_ENV: '0', 'ODOC_COMBAT_ARCHIVE_DAYS': '7'}), \
             patch.object(worker, '_combat_maintenance_day', None), \
             patch('system_settings.agent_world.combat.archive.checkpoint_all') as checkpoint:
            with self.assertLogs('system_settings.agent_world.worker', level='WARNING'):
                worker.maintain_combat_history()
            checkpoint.assert_not_called()
            with self.assertRaisesMessage(LegacyCombatArchiveDisabled, '旧战斗归档'):
                archive_profile(object(), datetime(2026, 1, 1), apply=True)
            with self.assertRaisesMessage(LegacyCombatArchiveDisabled, '旧战斗归档'):
                archive_owners(None, 7, apply=True)
            with self.assertRaisesMessage(CommandError, '旧战斗归档'):
                call_command('archive_combat_facts', '--days', '7', '--apply')

    def test_markers_cannot_discard_another_devices_unique_fact(self):
        local = [{'model': 'system_settings.combatintegrity', 'pk': 'a',
                  'fields': {'archive_sequence': 4, 'archive_digest': 'digest'}}]
        remote = [{'model': 'system_settings.combatfact', 'pk': 'depart',
                   'fields': {'actor_id': 'a', 'sequence': 3, 'kind': 'depart'}}]
        revisions = {'system_settings.combatfact:depart': {'hash': 'hash'}}
        original = copy.deepcopy((remote, revisions))
        with self.assertRaisesMessage(SyncError, '回填保护'):
            compact(remote, revisions, merged_markers([local, remote]))
        self.assertEqual((remote, revisions), original)

    def test_sync_upload_download_restore_and_import_stop_before_side_effects(self):
        from utils.sync_manager import SyncManager

        manager = SyncManager()
        with patch.object(manager, 'create_local_safety_backup') as backup, \
             patch.object(manager, 'get_v2_current') as remote:
            for action in (
                lambda: manager.sync_v2(),
                lambda: manager.publish_v2_snapshot(source='manual'),
                lambda: manager.force_download_v2(),
                lambda: manager.restore_v2_snapshot('old'),
                lambda: manager.import_local_backup_zip('/missing.zip'),
                lambda: manager.apply_snapshot_data([], full_overwrite=True),
            ):
                with self.subTest(action=action), self.assertRaisesMessage(SyncError, '回填保护'):
                    action()
        backup.assert_not_called()
        remote.assert_not_called()

    def test_protection_is_configured_per_process_and_fails_safe_for_unknown_values(self):
        for value in ('1', 'true', 'unexpected'):
            with self.subTest(value=value), patch.dict(os.environ, {PROTECTION_ENV: value}):
                self.assertTrue(is_protected())
        for value in ('', '0', 'false', 'off'):
            with self.subTest(value=value), patch.dict(os.environ, {PROTECTION_ENV: value}):
                self.assertFalse(is_protected())

    def test_unknown_protection_value_reports_configuration_and_remains_safe(self):
        with patch.dict(os.environ, {PROTECTION_ENV: '0ff'}), self.assertLogs(
                'system_settings.agent_world.combat.migration_guard', level='WARNING') as logged:
            self.assertTrue(is_protected())
            with self.assertRaisesMessage(SyncError, '配置值无法识别'):
                require_sync_unprotected()
            with self.assertRaisesMessage(CombatBackfillProtected, '配置值无法识别'):
                archive_profile(object(), datetime(2026, 1, 1), apply=True)
        self.assertEqual(len(logged.output), 1)

    def test_legacy_compaction_is_unchanged_when_protection_is_off(self):
        data = [{'model': 'system_settings.combatfact', 'pk': 'old',
                 'fields': {'actor_id': 'a', 'sequence': 1}}]
        with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
            kept, _ = compact(data, marker_map={'a': (1, 'digest')})
        self.assertEqual(kept, [])

    def test_sync_refuses_unreconciled_old_sources_even_when_migration_flag_is_off(self):
        marker = [{'model': 'system_settings.combatintegrity', 'pk': 'a',
                   'fields': {'archive_sequence': 4, 'archive_digest': 'digest'}}]
        source = [{'model': 'system_settings.combatfact', 'pk': 'only-copy',
                   'fields': {'actor_id': 'a', 'sequence': 3, 'kind': 'depart'}}]
        original = copy.deepcopy((marker, source))
        with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
            with self.assertRaisesMessage(SyncError, '仍存在的战斗来源'):
                require_reconciled_sources([marker, source], merged_markers([marker, source]))
            require_reconciled_sources([marker], merged_markers([marker]))
        self.assertEqual((marker, source), original)

    def test_equal_archive_boundaries_with_different_digests_or_stock_are_rejected(self):
        base = [{'model': 'system_settings.combatintegrity', 'pk': 'a', 'fields': {
            'owner_id': 'owner', 'archive_sequence': 4, 'archive_digest': 'digest', 'archive_stock': {'combat.x': 2}}}]
        for field, value in (('archive_digest', 'different'), ('archive_stock', {'combat.x': 3})):
            with self.subTest(field=field):
                other = copy.deepcopy(base)
                other[0]['fields'][field] = value
                with self.assertRaisesMessage(SyncError, '存在分叉'):
                    merged_markers([base, other])

    def test_background_backfill_requires_both_explicit_enablement_and_protection(self):
        from .. import worker
        result = {'next_after': '', 'has_more': False, 'created': 1, 'failures': []}
        with patch('system_settings.agent_world.combat.party_daily_backfill.backfill_batch', return_value=result) as batch, \
             patch.object(worker, '_combat_backfill_retry_at', 0.0), \
             patch.object(worker, '_combat_backfill_cursor', ''), \
             patch.object(worker, '_combat_backfill_failed_in_cycle', False):
            with patch.dict(os.environ, {'ODOC_COMBAT_DAILY_BACKFILL': '1', PROTECTION_ENV: '0'}):
                worker.maintain_combat_daily_backfill()
            with patch.dict(os.environ, {'ODOC_COMBAT_DAILY_BACKFILL': '0', PROTECTION_ENV: '1'}):
                worker.maintain_combat_daily_backfill()
            batch.assert_not_called()
            with patch.dict(os.environ, {'ODOC_COMBAT_DAILY_BACKFILL': '1', PROTECTION_ENV: '1'}):
                worker.maintain_combat_daily_backfill()
            batch.assert_called_once()

    def test_automatic_daily_drains_backlog_and_rechecks_after_five_minutes(self):
        from .party_daily_automatic import AUTO_ENV, INTERVAL_SECONDS, PAGE_PAUSE_SECONDS, enabled, run_loop

        class StopAfterTwoPages:
            waits = []

            def is_set(self):
                return len(self.waits) >= 2

            def wait(self, seconds):
                self.waits.append(seconds)

        pages = [
            {'next_after': 'next-party', 'has_more': True, 'created': 2, 'failures': []},
            {'next_after': 'last', 'has_more': False, 'created': 1, 'failures': []},
        ]
        stop = StopAfterTwoPages()
        self.assertEqual(INTERVAL_SECONDS, 300)
        with patch.dict(os.environ, {PROTECTION_ENV: '0'}, clear=True), \
             patch('system_settings.agent_world.combat.party_daily_automatic.automatic_batch', side_effect=pages) as batch, \
             patch('system_settings.agent_world.combat.party_daily_automatic.automatic_solo_batch',
                   return_value={'next_after': '', 'has_more': False, 'created': 0, 'failures': []}), \
             patch('system_settings.agent_world.combat.retention_cleanup.cleanup_batch',
                   return_value={'cleaned': 0, 'blocked': False, 'has_more': False}) as cleanup, \
             patch('system_settings.agent_world.combat.archived_daily_rebuild.automatic_batch',
                   return_value={'rebuilt': 0, 'failures': [], 'next_after': '', 'has_more': False}), \
             patch('system_settings.agent_world.combat.party_daily_automatic.close_old_connections'):
            self.assertTrue(enabled())
            run_loop(stop)
        self.assertEqual([call.kwargs['after'] for call in batch.call_args_list], ['', 'next-party'])
        self.assertEqual(stop.waits, [PAGE_PAUSE_SECONDS, INTERVAL_SECONDS])
        cleanup.assert_called_once()
        with patch.dict(os.environ, {AUTO_ENV: '0'}):
            self.assertFalse(enabled())

    def test_automatic_daily_pauses_when_protection_is_active(self):
        from .party_daily_automatic import INTERVAL_SECONDS, run_loop

        class StopAfterWait:
            stopped = False
            def is_set(self): return self.stopped
            def wait(self, seconds):
                self.stopped = True
                self.seconds = seconds

        stop = StopAfterWait()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}), \
             patch('system_settings.agent_world.combat.party_daily_automatic.automatic_batch') as batch:
            run_loop(stop)
        batch.assert_not_called()
        self.assertEqual(stop.seconds, INTERVAL_SECONDS)

    def test_automatic_daily_retries_cleanup_after_rebuilding_archived_contributions(self):
        from .party_daily_automatic import INTERVAL_SECONDS, PAGE_PAUSE_SECONDS, run_loop

        class StopAfterTwoWaits:
            def __init__(self): self.waits = []
            def is_set(self): return len(self.waits) >= 2
            def wait(self, seconds): self.waits.append(seconds)

        stop = StopAfterTwoWaits()
        page = {'next_after': '', 'has_more': False, 'created': 0, 'failures': []}
        cleanups = [{'cleaned': 0, 'blocked': True, 'has_more': False, 'backlog': {'invalid_party_summaries': 1}},
                    {'cleaned': 1, 'blocked': False, 'has_more': False, 'round_facts': 2, 'round_events': 1}]
        with patch.dict(os.environ, {PROTECTION_ENV: '0', 'ODOC_COMBAT_DAILY_AUTO': '1'}), \
             patch('system_settings.agent_world.combat.party_daily_automatic.automatic_batch', return_value=page), \
             patch('system_settings.agent_world.combat.party_daily_automatic.automatic_solo_batch', return_value=page), \
             patch('system_settings.agent_world.combat.retention_cleanup.cleanup_batch', side_effect=cleanups) as cleanup, \
             patch('system_settings.agent_world.combat.archived_daily_rebuild.automatic_batch',
                   return_value={'rebuilt': 1, 'failures': [], 'next_after': '', 'has_more': False}) as rebuild, \
             patch('system_settings.agent_world.combat.party_daily_automatic.close_old_connections'):
            run_loop(stop)
        self.assertEqual(stop.waits, [PAGE_PAUSE_SECONDS, INTERVAL_SECONDS])
        self.assertEqual(cleanup.call_count, 2)
        rebuild.assert_called_once()

    def test_automatic_daily_retries_a_failed_batch_without_advancing_cursor(self):
        from .party_daily_automatic import ERROR_RETRY_SECONDS, INTERVAL_SECONDS, run_loop

        class StopAfterTwoWaits:
            def __init__(self): self.waits = []
            def is_set(self): return len(self.waits) >= 2
            def wait(self, seconds): self.waits.append(seconds)

        stop = StopAfterTwoWaits()
        result = {'next_after': 'complete', 'has_more': False, 'created': 1, 'failures': []}
        with patch.dict(os.environ, {PROTECTION_ENV: '0', 'ODOC_COMBAT_DAILY_AUTO': '1'}), \
             patch('system_settings.agent_world.combat.party_daily_automatic.automatic_batch',
                   side_effect=[RuntimeError('database temporarily unavailable'), result]) as batch, \
             patch('system_settings.agent_world.combat.party_daily_automatic.automatic_solo_batch',
                   return_value={'next_after': '', 'has_more': False, 'created': 0, 'failures': []}), \
             patch('system_settings.agent_world.combat.retention_cleanup.cleanup_batch',
                   return_value={'cleaned': 0, 'blocked': False, 'has_more': False}), \
             patch('system_settings.agent_world.combat.archived_daily_rebuild.automatic_batch',
                   return_value={'rebuilt': 0, 'failures': [], 'next_after': '', 'has_more': False}), \
             patch('system_settings.agent_world.combat.party_daily_automatic.close_old_connections'), \
             self.assertLogs('system_settings.agent_world.combat.party_daily_automatic', level='ERROR'):
            run_loop(stop)
        self.assertEqual([call.kwargs['after'] for call in batch.call_args_list], ['', ''])
        self.assertEqual(stop.waits, [ERROR_RETRY_SECONDS, INTERVAL_SECONDS])

    def test_automatic_daily_revisits_new_low_ids_during_a_long_backlog(self):
        from .party_daily_automatic import run_loop

        class StopAfterTwoWaits:
            def __init__(self): self.waits = []
            def is_set(self): return len(self.waits) >= 2
            def wait(self, seconds): self.waits.append(seconds)

        page = {'next_after': 'later-id', 'has_more': True, 'created': 1, 'failures': []}
        with patch.dict(os.environ, {PROTECTION_ENV: '0', 'ODOC_COMBAT_DAILY_AUTO': '1'}), \
             patch('system_settings.agent_world.combat.party_daily_automatic.automatic_batch', return_value=page) as batch, \
             patch('system_settings.agent_world.combat.party_daily_automatic.automatic_solo_batch',
                   return_value={'next_after': '', 'has_more': False, 'created': 0, 'failures': []}), \
             patch('system_settings.agent_world.combat.party_daily_automatic.close_old_connections'), \
             patch('system_settings.agent_world.combat.party_daily_automatic.time.monotonic', side_effect=[0, 0, 301]):
            run_loop(StopAfterTwoWaits())
        self.assertEqual([call.kwargs['after'] for call in batch.call_args_list], ['', ''])

    def test_protected_backfill_drain_tracks_progress_and_failed_sources(self):
        from io import StringIO
        import json

        pages = [
            {'processed': 2, 'created': 1, 'failures': [{'party_id': 'bad', 'reason': '来源不完整'}],
             'has_more': True, 'next_after': 'b'},
            {'processed': 1, 'created': 1, 'failures': [], 'has_more': False, 'next_after': 'c'},
        ]
        target = 'system_settings.management.commands.backfill_party_daily_drain.backfill_batch'
        with patch(target, side_effect=pages) as batch, patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            output = StringIO()
            call_command('backfill_party_daily_drain', '--owner', 'admin', '--pause-seconds', '0', stdout=output)
        result = json.loads(output.getvalue())
        self.assertEqual((result['batches'], result['processed'], result['created']), (2, 3, 2))
        self.assertEqual((result['stop_reason'], result['has_more'], result['next_after']),
                         ('complete_with_failures', False, ''))
        self.assertEqual(result['failures'][0]['party_id'], 'bad')
        self.assertEqual((result['failures_total'], result['failure_details_truncated']), (1, False))
        self.assertEqual([item.kwargs['after'] for item in batch.call_args_list], ['', 'b'])

        pages = [{'processed': amount, 'created': 0,
                  'failures': [{'party_id': str(offset + i), 'reason': '缺失'} for i in range(amount)],
                  'has_more': offset < 100, 'next_after': str(offset + amount)}
                 for offset, amount in ((0, 50), (50, 50), (100, 20))]
        with patch(target, side_effect=pages), patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            output = StringIO()
            call_command('backfill_party_daily_drain', '--pause-seconds', '0', stdout=output)
        result = json.loads(output.getvalue())
        self.assertEqual((result['failures_total'], len(result['failures']), result['failure_details_truncated']),
                         (120, 100, True))

        incomplete = {'processed': 1, 'created': 1, 'failures': [], 'has_more': True, 'next_after': 'resume-here'}
        with patch(target, return_value=incomplete), patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            output = StringIO()
            call_command('backfill_party_daily_drain', '--max-batches', '1', '--pause-seconds', '0', stdout=output)
        result = json.loads(output.getvalue())
        self.assertEqual((result['stop_reason'], result['has_more'], result['next_after']),
                         ('batch_limit', True, 'resume-here'))

        with patch(target) as batch, patch.dict(os.environ, {PROTECTION_ENV: '0'}):
            with self.assertRaisesMessage(CommandError, '请先在本进程启用'):
                call_command('backfill_party_daily_drain')
        batch.assert_not_called()

    def test_fishing_background_backfill_also_requires_protection(self):
        from .. import worker
        result = {'next_after': '', 'has_more': False, 'created': 1, 'failures': []}
        with patch('system_settings.agent_world.fishing.daily_backfill.backfill_batch', return_value=result) as batch, \
             patch.object(worker, '_fishing_backfill_retry_at', 0.0), \
             patch.object(worker, '_fishing_backfill_cursor', ''), \
             patch.object(worker, '_fishing_backfill_failed_in_cycle', False):
            with patch.dict(os.environ, {'ODOC_FISHING_DAILY_BACKFILL': '1', PROTECTION_ENV: '0'}):
                worker.maintain_fishing_daily_backfill()
            batch.assert_not_called()
            with patch.dict(os.environ, {'ODOC_FISHING_DAILY_BACKFILL': '1', PROTECTION_ENV: '1'}):
                worker.maintain_fishing_daily_backfill()
            batch.assert_called_once()


class CombatBackfillDatabaseTests(TestCase):
    from .test_food import FoodExplorationTests
    setUp = FoodExplorationTests.setUp
    stock = FoodExplorationTests.stock
    trip = FoodExplorationTests.trip

    def test_eligible_legacy_facts_and_archive_boundary_survive_protected_attempts(self):
        from datetime import timedelta
        from django.utils import timezone
        from . import explorations
        from .archive import append_checkpoint
        from .models import CombatFact, CombatIntegrity, CombatProfile
        from .. import worker

        run = self.trip()
        explorations.finish(run.pk, now=self.now + timedelta(seconds=15))
        checkpoint = append_checkpoint(CombatProfile.objects.get(pk=self.agent.pk))
        CombatFact.objects.filter(pk=checkpoint.pk).update(created_at=timezone.now()-timedelta(days=10))
        before = list(CombatFact.objects.filter(actor_id=self.agent.pk).values_list('pk', flat=True))
        chain = CombatIntegrity.objects.get(pk=self.agent.pk)
        boundary = (chain.head, chain.archive_sequence, chain.archive_digest)

        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            preview = archive_owners(None, 7, apply=False)
            self.assertGreater(next(item['archived'] for item in preview if item['actor'] == self.agent.pk), 0)
            worker.maintain_combat_history()
            with self.assertRaises(CombatBackfillProtected):
                archive_owners(None, 7, apply=True)
            with self.assertRaisesMessage(CommandError, '回填保护'):
                call_command('archive_combat_facts', '--days', '7', '--apply')

        self.assertEqual(list(CombatFact.objects.filter(actor_id=self.agent.pk).values_list('pk', flat=True)), before)
        chain.refresh_from_db()
        self.assertEqual((chain.head, chain.archive_sequence, chain.archive_digest), boundary)

    def test_sync_refuses_to_discard_other_devices_unarchived_departure(self):
        from datetime import timedelta
        from django.utils import timezone
        from utils.sync_manager import SyncManager
        from . import explorations
        from .archive import append_checkpoint
        from .models import CombatFact, CombatProfile

        run = self.trip()
        explorations.finish(run.pk, now=self.now+timedelta(seconds=15))
        checkpoint = append_checkpoint(CombatProfile.objects.get(pk=self.agent.pk))
        CombatFact.objects.filter(pk=checkpoint.pk).update(created_at=timezone.now()-timedelta(days=10))
        manager = SyncManager()
        with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
            unarchived = manager.build_snapshot_data()
            self.assertTrue(any(row['model'] == 'system_settings.combatfact' and row['fields']['kind'] == 'depart'
                                for row in unarchived))
            # Build an old-version archived fixture in the isolated test DB.
            with patch('system_settings.agent_world.combat.archive.reject_legacy_archive'):
                self.assertTrue(any(item.get('archived') for item in archive_owners(None, 7, apply=True)))
            archived = manager.build_snapshot_data()
            with self.assertRaisesMessage(SyncError, '仍存在的战斗来源'):
                manager.merge_v2_data(None, archived, {}, {'data': unarchived,
                    'meta': manager.build_snapshot_meta(data_list=unarchived), 'revisions': {}})
