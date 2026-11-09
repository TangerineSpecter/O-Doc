"""Seven-day retention never outruns verified completed statistics."""
import copy
from collections import Counter
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, TransactionTestCase

from system_settings.models import SyncEntityState
from utils.sync_policy import SyncError
from . import test_parties, test_retention_settlement, test_solo_settlement
from .analytics_models import CombatPartyCoverage, CombatPartyDay, CombatPartySettlement, CombatSoloSettlement
from .migration_guard import PROTECTION_ENV
from .models import CombatFact, Exploration
from .party_daily_automatic import automatic_batch
from .party_models import AdventureEvent, AdventureMember
from .retention_policy import RETENTION_ENV
from .retention_cleanup import cleanup_batch
from .solo_daily_backfill import automatic_batch as solo_batch
from .sync import metadata, validate_source


class RetentionCleanupTests(TestCase):
    setUp = test_parties.PartyServiceTests.setUp
    start = test_parties.PartyServiceTests.start
    join = test_parties.PartyServiceTests.join
    force_clear = test_parties.PartyServiceTests.force_clear
    data = test_parties.PartyServiceTests.data
    finished_party = test_retention_settlement.PartySettlementArchiveTests.finished_party
    finished_solo = test_solo_settlement.SoloSettlementTests.finished_solo

    def test_all_finished_sources_must_be_covered_before_any_old_rounds_are_removed(self):
        party, _ = self.finished_party()
        original_now, original_actor = self.now, self.agents[0]
        # The cutoff falls between the two completion times. Even the newer
        # finished battle, which is not yet eligible, must prevent cleanup.
        self.now = original_now + timedelta(minutes=1)
        self.agents[0] = self.agents[2]
        solo, _ = self.finished_solo()
        self.now, self.agents[0] = original_now, original_actor
        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            self.assertEqual(automatic_batch(max_seconds=60)['settlement_created'], 1)
            before = (CombatFact.objects.count(), AdventureEvent.objects.count())
            blocked = cleanup_batch(now=self.now + timedelta(days=7, seconds=65))
            self.assertTrue(blocked['blocked'])
            self.assertEqual(blocked['backlog']['legacy_solo_runs'], 1)
            self.assertEqual((CombatFact.objects.count(), AdventureEvent.objects.count()), before)
            self.assertEqual(solo_batch(max_seconds=60)['created'], 1)
            # Even after a summary exists, changed raw evidence in a newer
            # ineligible battle must block the older eligible one.
            recent_fact = CombatFact.objects.filter(exploration_id=solo.pk, kind='round').first()
            original_payload = copy.deepcopy(recent_fact.payload)
            CombatFact.objects.filter(pk=recent_fact.pk).update(payload={'corrupted': True})
            with self.assertRaises(SyncError):
                cleanup_batch(now=self.now + timedelta(days=7, seconds=65))
            self.assertEqual((CombatFact.objects.count(), AdventureEvent.objects.count()), before)
            CombatFact.objects.filter(pk=recent_fact.pk).update(payload=original_payload)
            cleaned = cleanup_batch(now=self.now + timedelta(days=7, seconds=65))
            self.assertFalse(cleaned['blocked'])
            self.assertEqual(cleaned['cleaned'], 1)
            self.assertGreater(cleaned['round_facts'], 0)
            self.assertGreater(cleaned['round_events'], 0)
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=7, seconds=65))['cleaned'], 0)
            self.assertTrue(CombatFact.objects.filter(kind='round', exploration_id=solo.pk).exists())
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=40))['cleaned'], 1)
        self.assertIn('archive', CombatPartySettlement.objects.get(pk=party.pk).content)
        self.assertIn('archive', CombatSoloSettlement.objects.get(pk=solo.pk).content)
        self.assertFalse(CombatFact.objects.filter(kind='round', exploration_id=solo.pk).exists())
        self.assertFalse(AdventureEvent.objects.filter(kind='round', party_id=party.pk).exists())
        self.assertTrue(validate_source(self.data(), metadata(self.data())))

    def test_unfinished_battle_is_not_summarized_or_cleaned_and_does_not_block_old_cleanup(self):
        from . import explorations

        party, _ = self.finished_party()
        active = explorations.request('admin', self.agents[2], 'active-next', {'adventure_mode': 'solo'}, now=self.now)
        active = explorations.depart(active.pk, self.plan, now=self.now)
        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            automatic_batch(max_seconds=60)
            self.assertFalse(CombatPartySettlement.objects.filter(pk=active.snapshot['party_id']).exists())
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=8))['cleaned'], 1)
            active.refresh_from_db()
            self.assertFalse(active.ended_at)
            self.assertTrue(CombatFact.objects.filter(exploration_id=active.pk, kind='depart').exists())
            self.assertNotIn('archive', (CombatPartySettlement.objects.filter(pk=active.snapshot['party_id'])
                                        .values_list('content', flat=True).first() or {}))
            self.assertIn('archive', CombatPartySettlement.objects.get(pk=party.pk).content)

    def test_new_battle_after_compaction_still_backfills_on_the_same_resident_chain(self):
        from . import explorations
        from .party_models import AdventureParty

        old, _ = self.finished_party()
        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            automatic_batch(max_seconds=60)
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=8))['cleaned'], 1)
            later = self.now + timedelta(days=8)
            run = explorations.request('admin', self.agents[0], 'after-retention',
                                       {'adventure_mode': 'solo'}, now=later)
            run = explorations.depart(run.pk, self.plan, now=later)
            party = AdventureParty.objects.get(pk=run.snapshot['party_id'])
            self.force_clear(party, later + timedelta(seconds=15))
            explorations.finish(run.pk, now=later + timedelta(seconds=20))
            result = automatic_batch(max_seconds=60)
            self.assertEqual(result['failures'], [])
            self.assertEqual(result['settlement_created'], 1)
            self.assertIn('archive', CombatPartySettlement.objects.get(pk=old.pk).content)
            self.assertNotIn('archive', CombatPartySettlement.objects.get(pk=party.pk).content)
            self.assertTrue(validate_source(self.data(), metadata(self.data())))

    def test_archived_daily_statistics_rebuild_from_verified_outcomes(self):
        from .archived_daily_rebuild import automatic_batch as rebuild_batch
        from .party_daily_sync import COVERAGE, DAY

        party, _ = self.finished_party()
        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            automatic_batch(max_seconds=60)
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=8))['cleaned'], 1)
            expected = {str(row['pk']): row for row in self.data() if row['model'] in (COVERAGE, DAY)}
            self.assertTrue(expected)
            CombatPartyCoverage.objects.filter(pk=party.pk).delete()
            CombatPartyDay.objects.filter(party_id=party.pk).delete()
            recovered = automatic_batch(max_seconds=60)
            self.assertEqual((recovered['created'], recovered['failures']), (1, []))
            actual = {str(row['pk']): row for row in self.data() if row['model'] in (COVERAGE, DAY)}
            self.assertEqual(actual, expected)
            day = CombatPartyDay.objects.filter(party_id=party.pk).first()
            changed = copy.deepcopy(day.groups)
            changed[0]['kills'] += 1
            CombatPartyDay.objects.filter(pk=day.pk).update(groups=changed)
            rebuilt = rebuild_batch(max_seconds=60)
            self.assertEqual((rebuilt['rebuilt'], rebuilt['failures']), (1, []))
            self.assertEqual({str(row['pk']): row for row in self.data() if row['model'] in (COVERAGE, DAY)}, expected)
            CombatPartyDay.objects.filter(pk=day.pk).delete()
            rebuilt = rebuild_batch(max_seconds=60)
            self.assertEqual((rebuilt['rebuilt'], rebuilt['failures']), (1, []))
            self.assertEqual({str(row['pk']): row for row in self.data() if row['model'] in (COVERAGE, DAY)}, expected)
            self.assertTrue(validate_source(self.data(), metadata(self.data())))

    def test_corrupted_archived_source_is_not_used_to_rebuild_statistics(self):
        from .archived_daily_rebuild import automatic_batch as rebuild_batch

        party, _ = self.finished_party()
        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            automatic_batch(max_seconds=60)
            cleanup_batch(now=self.now + timedelta(days=8))
            CombatPartyDay.objects.filter(party_id=party.pk).delete()
            marker = CombatPartySettlement.objects.get(pk=party.pk)
            changed = copy.deepcopy(marker.content)
            changed['kills'][0]['participants'][0]['experience'] += 1
            CombatPartySettlement.objects.filter(pk=party.pk).update(content=changed)
            result = rebuild_batch(max_seconds=60)
            self.assertEqual(result['rebuilt'], 0)
            self.assertEqual(len(result['failures']), 1)
            self.assertFalse(CombatPartyDay.objects.filter(party_id=party.pk).exists())

    def test_last_member_exit_and_recent_battles_delay_cleanup(self):
        party, _ = self.finished_party()
        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            automatic_batch(max_seconds=60)
            before = CombatFact.objects.filter(kind='round').count()
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=6))['cleaned'], 0)
            member = AdventureMember.objects.filter(party_id=party.pk).first()
            original = member.left_at
            # The source validator also checks the member frame, so restore it
            # before trying an eligible cleanup.
            AdventureMember.objects.filter(pk=member.pk).update(left_at=self.now + timedelta(days=3))
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=9))['cleaned'], 0)
            self.assertEqual(CombatFact.objects.filter(kind='round').count(), before)
            AdventureMember.objects.filter(pk=member.pk).update(left_at=original)
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=9))['cleaned'], 1)

    def test_corrupt_source_or_interrupted_delete_rolls_back_the_whole_page(self):
        from . import retention_cleanup

        party, _ = self.finished_party()
        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            automatic_batch(max_seconds=60)
            fact = CombatFact.objects.filter(kind='round').first()
            payload = copy.deepcopy(fact.payload)
            before = (CombatFact.objects.count(), AdventureEvent.objects.count())
            CombatFact.objects.filter(pk=fact.pk).update(payload={'corrupted': True})
            with self.assertRaises(SyncError):
                cleanup_batch(now=self.now + timedelta(days=8))
            self.assertEqual((CombatFact.objects.count(), AdventureEvent.objects.count()), before)
            self.assertNotIn('archive', CombatPartySettlement.objects.get(pk=party.pk).content)
            CombatFact.objects.filter(pk=fact.pk).update(payload=payload)
            delete_rows = retention_cleanup._delete_rows
            def fail_after_deletion(model, identities):
                delete_rows(model, identities)
                if model == AdventureEvent:
                    raise RuntimeError('stop')
            with patch('system_settings.agent_world.combat.retention_cleanup._delete_rows', side_effect=fail_after_deletion):
                with self.assertRaisesMessage(RuntimeError, 'stop'):
                    cleanup_batch(now=self.now + timedelta(days=8))
            self.assertEqual((CombatFact.objects.count(), AdventureEvent.objects.count()), before)
            self.assertNotIn('archive', CombatPartySettlement.objects.get(pk=party.pk).content)
            removed_ids = list(CombatFact.objects.filter(kind='round').values_list('pk', flat=True))
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=8))['cleaned'], 1)
        self.assertFalse(SyncEntityState.objects.filter(model_label='system_settings.combatfact',
                                                        object_pk__in=removed_ids).exists())
        self.assertTrue(Exploration.objects.filter(snapshot__party_id=party.pk).exists())

    def test_world_and_departure_results_match_after_cleanup_even_for_subday_windows(self):
        from ..analytics.combat_kills import load_combat_kills
        from ..analytics.combat_statistics import load_combat_statistics
        from ..life_time import local_time
        from .queries import profile_view, snapshot

        party, _ = self.finished_party()
        with patch.dict('os.environ', {PROTECTION_ENV: '0', RETENTION_ENV: '2'}):
            automatic_batch(max_seconds=60)
            run_ids = list(Exploration.objects.filter(snapshot__party_id=party.pk).values_list('pk', flat=True))
            event = AdventureEvent.objects.filter(party_id=party.pk, kind='round',
                payload__contains={'personal': {}}).first()
            at = local_time(event.created_at)
            start = at.replace(hour=0, minute=0, second=0, microsecond=0)
            residents = {agent.pk: {'id': agent.pk, 'name': agent.name} for agent in self.agents}

            def counts(**kwargs):
                return Counter({key: sum(row.count for row in rows) for key, rows in group_rows(
                    load_combat_kills('admin', actor_ids=residents, **kwargs)).items()})

            def group_rows(rows):
                groups = {}
                for row in rows:
                    key = (row.actor_id, row.exploration_id, row.monster.get('id'),
                           row.monster.get('rank'), row.monster.get('level'))
                    groups.setdefault(key, []).append(row)
                return groups

            windows = [dict(start=start, end=start + timedelta(days=days), include_daily=True)
                       for days in (7, 30, 366)]
            windows += [dict(start=at + timedelta(microseconds=1), end=at + timedelta(hours=1),
                             include_daily=True), dict(exploration_ids=run_ids, include_daily=False)]
            before = [counts(**window) for window in windows]
            cohort = load_combat_statistics('admin', start, start + timedelta(days=1), residents,
                                             include_daily=True, departure_ids=run_ids,
                                             finished_departure_ids=run_ids)
            discoveries = {agent.pk: profile_view('admin', agent)['discoveries']['defeated'] for agent in self.agents}
            originals = list(Exploration.objects.filter(pk__in=run_ids).values_list('snapshot', flat=True))
            self.assertTrue(any((snapshot.get('party_final') or {}).get('events') for snapshot in originals))
            last_end = max(*Exploration.objects.filter(pk__in=run_ids).values_list('ended_at', flat=True),
                           *AdventureMember.objects.filter(party_id=party.pk).values_list('left_at', flat=True))
            boundary = last_end + timedelta(days=2)
            self.assertEqual(cleanup_batch(now=boundary - timedelta(microseconds=1))['cleaned'], 0)
            with patch.dict('os.environ', {RETENTION_ENV: '0'}), self.assertRaisesRegex(ValueError, RETENTION_ENV):
                cleanup_batch(now=boundary)
            self.assertEqual(cleanup_batch(now=boundary)['cleaned'], 1)
            self.assertTrue(all((snapshot.get('party_final') or {}).get('events') == []
                                for snapshot in Exploration.objects.filter(pk__in=run_ids)
                                .values_list('snapshot', flat=True)))
            self.assertEqual([counts(**window) for window in windows], before)
            self.assertEqual(load_combat_statistics('admin', start, start + timedelta(days=1), residents,
                             include_daily=True, departure_ids=run_ids, finished_departure_ids=run_ids), cohort)
            self.assertEqual({agent.pk: profile_view('admin', agent)['discoveries']['defeated']
                              for agent in self.agents}, discoveries)
            for run in Exploration.objects.filter(pk__in=run_ids):
                view = snapshot(run)
                self.assertTrue(view['history_archived'])
                self.assertEqual(len(view['archived_kills']), run.result['kills'])
                self.assertEqual(sum(row['experience'] for row in view['archived_kills']), run.result['experience'])
                self.assertEqual(len({row['id'] for row in view['archived_kills']}), len(view['archived_kills']))
                self.assertEqual(Counter(reward['id'] for row in view['archived_kills'] for reward in row['rewards']),
                                 Counter(reward['id'] for reward in run.result['rewards']))

    def test_old_complete_backup_merges_and_archived_backup_restores_without_round_resurrection(self):
        from system_settings.tests import MemoryStorageClient
        from system_settings.sync_state import canonical_hash
        from utils.sync_manager import SyncManager
        from utils.sync_merge import item_identity, revision_key
        from .party_daily import FACT
        from .party_daily_sync import COVERAGE, DAY, SETTLEMENT
        from .party_sync import EVENT

        party, _ = self.finished_party()
        manager = SyncManager(MemoryStorageClient(), '/test-retention')

        def revisions(rows):
            return {revision_key(row['model'], item_identity(row)): {
                'hash': canonical_hash(row['fields']), 'revision_at': '2026-11-03T12:00:00+00:00',
                'origin_device': 'single-device', 'deleted': False} for row in rows}

        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            without_summary = manager.build_snapshot_data()
            old_meta = manager.build_snapshot_meta(data_list=without_summary)
            automatic_batch(max_seconds=60)
            old = manager.build_snapshot_data()
            old_with_summary_meta = manager.build_snapshot_meta(data_list=old)
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=8))['cleaned'], 1)
            archived = manager.build_snapshot_data()
            archived_meta = manager.build_snapshot_meta(data_list=archived)
            self.assertEqual(archived_meta['combat_schema_version'], 20)
            for older, older_meta in ((old, old_with_summary_meta), (without_summary, old_meta)):
                for local, remote, remote_meta in ((archived, older, older_meta), (older, archived, archived_meta)):
                    merged, manifest, _ = manager.merge_v2_data(
                        {'data': old, 'revisions': revisions(old), 'meta': old_with_summary_meta},
                        local, revisions(local), {'data': remote, 'meta': remote_meta, 'revisions': revisions(remote)})
                    self.assertTrue(validate_source(merged, metadata(merged)))
                    self.assertFalse(any(row['model'] == FACT and row['fields']['kind'] == 'round'
                                         and row['fields']['exploration_id'] in
                                         {item['exploration_id'] for item in
                                          CombatPartySettlement.objects.get(pk=party.pk).content['runs']}
                                         for row in merged))
                    self.assertFalse(any(row['model'] == EVENT and row['fields']['kind'] == 'round'
                                         and row['fields']['party_id'] == party.pk for row in merged))
                    self.assertTrue(any(row['model'] == SETTLEMENT and 'archive' in row['fields']['content']
                                        for row in merged))
                    removed_keys = {revision_key(row['model'], str(row['pk'])) for row in older
                                    if row['model'] in (FACT, EVENT) and row['fields']['kind'] == 'round'}
                    self.assertFalse(removed_keys & set(manifest))

            # A same-day timestamp change is not protected by the old shared
            # event hash. The compact settlement must still detect it.
            damaged = copy.deepcopy(without_summary)
            event = next(row for row in damaged if row['model'] == EVENT and row['fields']['kind'] == 'round'
                         and any(action.get('kind') == 'kill' for actions in
                                 row['fields']['payload']['personal'].values() for action in actions))
            from django.utils.dateparse import parse_datetime
            event['fields']['created_at'] = (parse_datetime(event['fields']['created_at']) + timedelta(seconds=1)).isoformat()
            with self.assertRaises(SyncError):
                manager.merge_v2_data(None, archived, revisions(archived), {
                    'data': damaged, 'meta': old_meta, 'revisions': revisions(damaged)})
            snapshot = manager.publish_v2_snapshot(source='test', data_list=archived, revisions=revisions(archived))
            saved = manager.get_v2_snapshot(snapshot['meta']['snapshot_id'])
            for _ in range(2):
                manager.apply_snapshot_data(copy.deepcopy(saved['data']), remote_meta=saved['meta'], full_overwrite=True)
                self.assertFalse(AdventureEvent.objects.filter(party_id=party.pk, kind='round').exists())
                self.assertTrue(validate_source(manager.build_snapshot_data()))
            # Explicitly restoring a whole older snapshot is different from a
            # merge: it restores that snapshot's original rounds, which the
            # automatic seven-day process can safely compact again.
            manager.apply_snapshot_data(copy.deepcopy(old), remote_meta=old_with_summary_meta, full_overwrite=True)
            self.assertTrue(AdventureEvent.objects.filter(party_id=party.pk, kind='round').exists())
            self.assertNotIn('archive', CombatPartySettlement.objects.get(pk=party.pk).content)
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=8))['cleaned'], 1)
            self.assertFalse(AdventureEvent.objects.filter(party_id=party.pk, kind='round').exists())
            self.assertTrue(validate_source(manager.build_snapshot_data()))

    def test_independently_compacted_devices_reconcile_snapshot_precision_without_losing_exact_time(self):
        from datetime import datetime
        from system_settings.sync_state import canonical_hash
        from system_settings.tests import MemoryStorageClient
        from utils.sync_manager import SyncManager
        from utils.sync_merge import item_identity, revision_key
        from .party_daily_sync import SETTLEMENT
        from .store import digest

        party, _ = self.finished_party()
        AdventureEvent.objects.filter(party_id=party.pk).update(created_at=self.now.replace(microsecond=123456))
        manager = SyncManager(MemoryStorageClient(), '/test-archive-precision')

        def revisions(rows):
            return {revision_key(row['model'], item_identity(row)): {
                'hash': canonical_hash(row['fields']), 'revision_at': '2026-11-03T12:00:00+00:00',
                'origin_device': 'test', 'deleted': False} for row in rows}

        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            automatic_batch(max_seconds=60)
            original = manager.build_snapshot_data()
            original_meta = manager.build_snapshot_meta(data_list=original)
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=8))['cleaned'], 1)
            precise = manager.build_snapshot_data()
            rounded = copy.deepcopy(precise)
            marker = next(row for row in rounded if row['model'] == SETTLEMENT and row['pk'] == party.pk)
            times = marker['fields']['content']['archive']['exact_event_times']
            self.assertTrue(times)
            for key, value in times.items():
                at = datetime.fromisoformat(value.replace('Z', '+00:00'))
                times[key] = at.replace(microsecond=at.microsecond // 1000 * 1000).isoformat()
            marker['fields']['digest'] = digest(marker['fields']['content'])
            self.assertTrue(validate_source(rounded, metadata(rounded)))
            for local, remote in ((precise, rounded), (rounded, precise)):
                merged, _, _ = manager.merge_v2_data(
                    {'data': original, 'revisions': revisions(original), 'meta': original_meta},
                    local, revisions(local), {'data': remote, 'meta': manager.build_snapshot_meta(data_list=remote),
                                              'revisions': revisions(remote)})
                self.assertTrue(validate_source(merged, metadata(merged)))
                actual = next(row for row in merged if row['model'] == SETTLEMENT and row['pk'] == party.pk)
                expected = next(row for row in precise if row['model'] == SETTLEMENT and row['pk'] == party.pk)
                self.assertEqual(actual, expected)
            conflicting = copy.deepcopy(precise)
            marker = next(row for row in conflicting if row['model'] == SETTLEMENT and row['pk'] == party.pk)
            times = marker['fields']['content']['archive']['exact_event_times']
            key = next(iter(times))
            at = datetime.fromisoformat(times[key].replace('Z', '+00:00'))
            times[key] = at.replace(microsecond=123789).isoformat()
            marker['fields']['digest'] = digest(marker['fields']['content'])
            self.assertTrue(validate_source(conflicting, metadata(conflicting)))
            with self.assertRaises(SyncError):
                manager.merge_v2_data(None, precise, revisions(precise), {
                    'data': conflicting, 'meta': manager.build_snapshot_meta(data_list=conflicting),
                    'revisions': revisions(conflicting)})

    def test_single_device_sync_publishes_archive_over_its_older_active_snapshot(self):
        from . import explorations
        from system_settings.tests import MemoryStorageClient
        from utils.sync_manager import SyncManager

        manager = SyncManager(MemoryStorageClient(), '/test-aligned-retention')
        run, party = self.start()
        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            active = manager.build_snapshot_data()
            old = manager.publish_v2_snapshot(source='test', data_list=active,
                                               revisions=manager._build_revision_manifest(active))
            base_id = old['meta']['snapshot_id']
            self.force_clear(party, self.now + timedelta(seconds=15))
            explorations.finish(run.pk, now=self.now + timedelta(seconds=20))
            self.assertEqual(automatic_batch(max_seconds=60)['settlement_created'], 1)
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=8))['cleaned'], 1)
            published, _, _ = manager.sync_v2(source='auto', base_snapshot_id=base_id)
            self.assertEqual(published['meta']['combat_schema_version'], 20)
            current = manager.get_v2_current()
            self.assertFalse(any(row['model'] == 'system_settings.adventureevent'
                                 and row['fields']['party_id'] == party.pk and row['fields']['kind'] == 'round'
                                 for row in current['data']))
            self.assertTrue(validate_source(current['data'], current['meta']))

    def test_complete_old_remote_snapshot_syncs_through_real_merge_without_reviving_rounds(self):
        from system_settings.tests import MemoryStorageClient
        from utils.sync_manager import SyncManager

        party, _ = self.finished_party()
        manager = SyncManager(MemoryStorageClient(), '/test-merge-retention')
        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            automatic_batch(max_seconds=60)
            old = manager.build_snapshot_data()
            manager.publish_v2_snapshot(source='test', data_list=old,
                                        revisions=manager._build_revision_manifest(old))
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=8))['cleaned'], 1)
            before = {row.pk: copy.deepcopy(row.result) for row in Exploration.objects.filter(snapshot__party_id=party.pk)}
            snapshot, _, _ = manager.sync_v2(source='auto')
            self.assertEqual(snapshot['meta']['combat_schema_version'], 20)
            self.assertFalse(AdventureEvent.objects.filter(party_id=party.pk, kind='round').exists())
            self.assertEqual({row.pk: row.result for row in Exploration.objects.filter(snapshot__party_id=party.pk)}, before)
            self.assertTrue(validate_source(manager.build_snapshot_data()))

    def test_legacy_solo_archive_merges_complete_old_backup_in_both_directions(self):
        from system_settings.tests import MemoryStorageClient
        from system_settings.sync_state import canonical_hash
        from utils.sync_manager import SyncManager
        from utils.sync_merge import item_identity, revision_key

        run, _ = self.finished_solo()
        manager = SyncManager(MemoryStorageClient(), '/test-solo-retention')
        def revisions(rows):
            return {revision_key(row['model'], item_identity(row)): {
                'hash': canonical_hash(row['fields']), 'revision_at': '2026-11-03T12:00:00+00:00',
                'origin_device': 'single-device', 'deleted': False} for row in rows}

        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            old = manager.build_snapshot_data()
            old_meta = manager.build_snapshot_meta(data_list=old)
            self.assertEqual(solo_batch(max_seconds=60)['created'], 1)
            self.assertEqual(cleanup_batch(now=self.now + timedelta(days=8))['cleaned'], 1)
            compact = manager.build_snapshot_data()
            from .queries import snapshot
            view = snapshot(Exploration.objects.get(pk=run.pk))
            self.assertTrue(view['history_archived'])
            self.assertEqual(len(view['archived_kills']), run.result['kills'])
            self.assertEqual(sum(row['experience'] for row in view['archived_kills']), run.result['experience'])
            compact_meta = manager.build_snapshot_meta(data_list=compact)
            for local, remote, meta in ((compact, old, old_meta), (old, compact, compact_meta)):
                merged, _, _ = manager.merge_v2_data(None, local, revisions(local), {
                    'data': remote, 'meta': meta, 'revisions': revisions(remote)})
                self.assertTrue(validate_source(merged, metadata(merged)))
                self.assertFalse(any(row['model'] == 'system_settings.combatfact'
                                     and row['fields']['exploration_id'] == run.pk
                                     and row['fields']['kind'] == 'round' for row in merged))
                self.assertTrue(any(row['model'] == 'system_settings.combatsolosettlement'
                                    and 'archive' in row['fields']['content'] for row in merged))

    def test_archived_observation_api_exposes_only_the_owner_personal_outcomes(self):
        from django.contrib.auth.models import User
        from rest_framework.test import APIClient

        party, _ = self.finished_party()
        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            automatic_batch(max_seconds=60)
            cleanup_batch(now=self.now + timedelta(days=8))
        run = Exploration.objects.filter(snapshot__party_id=party.pk).first()
        client = APIClient()
        client.force_authenticate(User.objects.create_superuser('admin', 'fixture@example.invalid', 'fixture'))
        url = f'/api/settings/agent-world/combat/explorations/{run.pk}/'
        response = client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()['data']
        self.assertTrue(data['historyArchived'])
        self.assertEqual(len(data['archivedKills']), run.result['kills'])
        if data['archivedKills']:
            self.assertIn('occurredAt', data['archivedKills'][0])
            self.assertIn('monster', data['archivedKills'][0])
        marker = CombatPartySettlement.objects.get(pk=party.pk)
        changed = copy.deepcopy(marker.content)
        changed['kills'][0]['participants'][0]['experience'] += 1
        from .store import digest
        CombatPartySettlement.objects.filter(pk=party.pk).update(content=changed, digest=digest(changed))
        invalid = client.get(url)
        self.assertEqual(invalid.status_code, 409)
        self.assertIn('结算无法核对', invalid.json()['msg'])
        CombatPartyDay.objects.filter(party_id=party.pk).delete()
        day = self.now.date().isoformat()
        analytics = client.get('/api/settings/agent-world/analytics/', {'start_date': day, 'end_date': day})
        self.assertEqual(analytics.status_code, 409)
        self.assertEqual(analytics.json()['data']['reason'], 'invalid_combat_statistics_source')
        client.force_authenticate(User.objects.create_user('other'))
        self.assertEqual(client.get(url).status_code, 404)


class RetentionReadConsistencyTests(TransactionTestCase):
    def test_nested_transaction_holds_cleanup_gate_during_fallback_read(self):
        import threading
        from django.db import transaction
        from ..analytics.consistency import analytics_snapshot
        from ..farm_gate import farm_gate

        entered, attempted = threading.Event(), threading.Event()
        def cleanup_side():
            attempted.set()
            with farm_gate():
                entered.set()

        with transaction.atomic():
            with analytics_snapshot() as daily:
                self.assertFalse(daily)
                thread = threading.Thread(target=cleanup_side)
                thread.start()
                self.assertTrue(attempted.wait(2))
                self.assertFalse(entered.wait(.2))
            self.assertTrue(entered.wait(2))
            thread.join(timeout=2)
            self.assertFalse(thread.is_alive())
