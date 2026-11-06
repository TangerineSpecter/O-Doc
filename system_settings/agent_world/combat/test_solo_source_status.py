"""Historical gaps must not erase evidence or permanently starve valid cleanup."""
import copy
import json
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from system_settings.sync_state import suspend_tracking
from utils.sync_policy import SyncError
from ..life_time import storage_time
from . import explorations, test_parties, test_retention_settlement, test_solo_settlement
from .analytics_models import CombatPartySettlement, CombatSoloSettlement
from .archive import append_checkpoint, archive_profile
from .facts import append
from .models import CombatEncounter, CombatFact, CombatProfile, Exploration
from .party_daily_automatic import automatic_batch as party_batch
from .party_models import AdventureEvent
from .retention_cleanup import cleanup_batch
from .retention_gate import inspect_statistics_backlog
from .solo_daily_backfill import automatic_batch as solo_batch, legacy_runs
from .solo_source_status import historical_gap_runs
from .sync import metadata, validate_source


class SoloSourceStatusTests(TestCase):
    setUp = test_parties.PartyServiceTests.setUp
    start = test_parties.PartyServiceTests.start
    join = test_parties.PartyServiceTests.join
    force_clear = test_parties.PartyServiceTests.force_clear
    data = test_parties.PartyServiceTests.data
    finished_solo = test_solo_settlement.SoloSettlementTests.finished_solo
    finished_party = test_retention_settlement.PartySettlementArchiveTests.finished_party

    def archived_solo(self):
        run, _ = self.finished_solo()
        profile = CombatProfile.objects.get(pk=run.actor_id)
        append_checkpoint(profile)
        with patch('system_settings.agent_world.combat.archive.reject_legacy_archive'):
            outcome = archive_profile(profile, storage_time(self.now + timedelta(days=2)))
        self.assertGreater(outcome['archived'], 0)
        self.assertFalse(CombatFact.objects.filter(exploration_id=run.pk, kind='depart').exists())
        self.assertTrue(validate_source(self.data(), metadata(self.data())))
        return run

    def test_unstarted_terminal_requests_do_not_block_or_generate_summaries(self):
        for index, status in enumerate(('interrupted', 'recalled', 'failed')):
            run = explorations.request('admin', self.agents[index], f'cancel-{status}', {}, now=self.now)
            explorations.finish(run.pk, status, '准备阶段结束', self.now + timedelta(seconds=1))
            self.assertFalse(legacy_runs().filter(pk=run.pk).exists())
            self.assertTrue(Exploration.objects.filter(pk=run.pk).exists())
            self.assertTrue(CombatFact.objects.filter(exploration_id=run.pk, kind='terminal').exists())
        self.assertEqual(solo_batch(max_seconds=60)['created'], 0)
        self.assertTrue(inspect_statistics_backlog()['cleanup_coverage_complete'])
        profile = CombatProfile.objects.get(pk=self.agents[0].pk)
        append_checkpoint(profile)
        with patch('system_settings.agent_world.combat.archive.reject_legacy_archive'):
            archive_profile(profile, storage_time(self.now + timedelta(days=2)))
        self.assertFalse(CombatFact.objects.filter(exploration_id='cancel-interrupted').exists())
        self.assertFalse(legacy_runs().filter(pk='cancel-interrupted').exists())
        self.assertTrue(inspect_statistics_backlog()['cleanup_coverage_complete'])

    def test_uncertain_empty_completed_history_is_still_blocking(self):
        Exploration.objects.create(pk='uncertain', owner_id='admin', actor_id=self.agents[0].pk,
            actor_name=self.agents[0].name, catalog_id=self.catalog.version, status='completed', ended_at=self.now)
        status = inspect_statistics_backlog()
        self.assertEqual(status['legacy_solo_runs'], 1)
        self.assertEqual(status['historical_solo_gaps'], 0)
        self.assertFalse(status['cleanup_coverage_complete'])

    def test_legacy_gap_is_retained_and_other_complete_party_can_be_cleaned(self):
        from system_settings.tests import MemoryStorageClient
        from utils.sync_manager import SyncManager
        from . import retention_cleanup

        old = self.archived_solo()
        original_run = Exploration.objects.values().get(pk=old.pk)
        original_encounters = list(CombatEncounter.objects.filter(exploration_id=old.pk).values())
        party, _ = self.finished_party()
        self.assertEqual(party_batch(max_seconds=60)['settlement_created'], 1)
        status = inspect_statistics_backlog()
        self.assertFalse(status['basic_coverage_complete'])
        self.assertTrue(status['cleanup_coverage_complete'], status)
        self.assertEqual(status['historical_solo_gap_ids'], [old.pk])
        for _ in range(2):
            result = solo_batch(max_seconds=60)
            self.assertEqual((result['created'], result['failures'], result['has_more']), (0, [], False))
        before_counts = (CombatFact.objects.count(), AdventureEvent.objects.count())
        delete_rows = retention_cleanup._delete_rows

        def interrupted_delete(model, ids):
            delete_rows(model, ids)
            raise RuntimeError('interrupt cleanup')

        with patch.object(retention_cleanup, '_delete_rows', side_effect=interrupted_delete):
            with self.assertRaisesMessage(RuntimeError, 'interrupt cleanup'):
                cleanup_batch(now=self.now + timedelta(days=8))
        self.assertEqual((CombatFact.objects.count(), AdventureEvent.objects.count()), before_counts)
        self.assertNotIn('archive', CombatPartySettlement.objects.get(pk=party.pk).content)
        cleaned = cleanup_batch(now=self.now + timedelta(days=8))
        self.assertEqual(cleaned['cleaned'], 1)
        self.assertIn('archive', CombatPartySettlement.objects.get(pk=party.pk).content)
        self.assertFalse(CombatSoloSettlement.objects.filter(pk=old.pk).exists())
        self.assertEqual(Exploration.objects.values().get(pk=old.pk), original_run)
        self.assertEqual(list(CombatEncounter.objects.filter(exploration_id=old.pk).values()), original_encounters)
        self.assertEqual(cleanup_batch(now=self.now + timedelta(days=8))['cleaned'], 0)
        source = self.data()
        self.assertTrue(validate_source(source, metadata(source)))
        manager = SyncManager(MemoryStorageClient(), '/test-source-gap')
        snapshot = manager.publish_v2_snapshot(source='test', data_list=manager.build_snapshot_data(), revisions={})
        restored = manager.get_v2_snapshot(snapshot['meta']['snapshot_id'])
        for _ in range(2):
            manager.apply_snapshot_data(copy.deepcopy(restored['data']), remote_meta=restored['meta'], full_overwrite=True)
            status = inspect_statistics_backlog()
            self.assertEqual(status['historical_solo_gap_ids'], [old.pk])
            self.assertTrue(status['cleanup_coverage_complete'])
            self.assertFalse(CombatFact.objects.filter(exploration_id=old.pk, kind='depart').exists())
            self.assertFalse(CombatSoloSettlement.objects.filter(pk=old.pk).exists())
            self.assertIn('archive', CombatPartySettlement.objects.get(pk=party.pk).content)
            self.assertTrue(validate_source(manager.build_snapshot_data()))

    def test_duplicate_departure_is_not_isolated(self):
        run, _ = self.finished_solo()
        depart = CombatFact.objects.get(exploration_id=run.pk, kind='depart')
        append(CombatProfile.objects.get(pk=run.actor_id), 'duplicate-departure', 'depart', copy.deepcopy(depart.payload), run)
        self.assertFalse(historical_gap_runs().filter(pk=run.pk).exists())
        self.assertFalse(inspect_statistics_backlog()['cleanup_coverage_complete'])
        result = solo_batch(max_seconds=60)
        self.assertEqual(result['created'], 0)
        self.assertIn('缺少唯一真实出发时间', result['failures'][0]['reason'])

    def test_restoring_the_exact_original_departure_reenables_normal_backfill(self):
        run, _ = self.finished_solo()
        departure = CombatFact.objects.get(exploration_id=run.pk, kind='depart')
        with suspend_tracking():
            CombatFact.objects.filter(pk=departure.pk).delete()
        self.assertTrue(historical_gap_runs().filter(pk=run.pk).exists())
        self.assertEqual(solo_batch(max_seconds=60)['created'], 0)
        # Recover the exact saved record, including its original sequence and
        # digest; never synthesize a replacement timestamp or a new chain event.
        departure.save(force_insert=True)
        self.assertFalse(historical_gap_runs().filter(pk=run.pk).exists())
        result = solo_batch(max_seconds=60)
        self.assertEqual((result['created'], result['failures']), (1, []))
        self.assertTrue(inspect_statistics_backlog()['basic_coverage_complete'])

    def test_invalid_saved_summary_and_raw_chain_damage_still_prevent_cleanup(self):
        old = self.archived_solo()
        party, _ = self.finished_party()
        party_batch(max_seconds=60)
        marker = CombatPartySettlement.objects.get(pk=party.pk)
        CombatPartySettlement.objects.filter(pk=party.pk).update(digest='broken')
        self.assertTrue(cleanup_batch(now=self.now + timedelta(days=8))['blocked'])
        CombatPartySettlement.objects.filter(pk=party.pk).update(digest=marker.digest)
        before = (CombatFact.objects.count(), AdventureEvent.objects.count())
        # A missing departure is not permission to ignore corruption elsewhere
        # in its resident's retained chain or to delete the gap's source.
        fact = CombatFact.objects.filter(actor_id=old.actor_id, kind='checkpoint').first()
        with suspend_tracking():
            CombatFact.objects.filter(pk=fact.pk).update(payload={'corrupted': True})
        with self.assertRaises(SyncError):
            cleanup_batch(now=self.now + timedelta(days=8))
        self.assertEqual((CombatFact.objects.count(), AdventureEvent.objects.count()), before)
        self.assertNotIn('archive', CombatPartySettlement.objects.get(pk=party.pk).content)

    def test_read_only_command_exposes_gaps_and_does_not_change_sources(self):
        old = self.archived_solo()
        before = self.data()
        output = StringIO()
        call_command('inspect_combat_retention', stdout=output)
        report = json.loads(output.getvalue())
        self.assertEqual(report['statistics']['historical_solo_gap_ids'], [old.pk])
        self.assertFalse(report['cleanup_ready'])
        self.assertEqual(self.data(), before)
