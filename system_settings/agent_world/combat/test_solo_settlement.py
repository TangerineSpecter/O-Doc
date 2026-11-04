"""Legacy solo outcomes remain accurate without retaining every attack."""
import copy
import json
from datetime import datetime, time, timedelta
from unittest.mock import patch

from django.test import TestCase

from . import explorations, test_parties
from .party_daily import FACT
from .solo_settlement import ENCOUNTER, project, validate_settlement


class SoloSettlementTests(TestCase):
    setUp = test_parties.PartyServiceTests.setUp
    data = test_parties.PartyServiceTests.data

    def finished_solo(self):
        def clear(catalog, state, style, number, rng, *, waiting=False):
            state = copy.deepcopy(state)
            state['enemy']['hp'] = 0
            return state, [{'kind': 'attack', 'damage': 20}]

        def drops(catalog, identity, level, progress, rng, bonuses):
            return [{'kind': 'material', 'item': {'id': 'material.test', 'name': '测试材料', 'sale_price': 1},
                     'quantity': 2}]

        with patch('system_settings.agent_world.combat.party_sessions.modern', return_value=False), \
             patch('system_settings.agent_world.combat.engine.step', side_effect=clear), \
             patch('system_settings.agent_world.combat.rewards.drops', side_effect=drops):
            run = explorations.request('admin', self.agents[0], 'legacy-solo', {}, now=self.now)
            run = explorations.depart(run.pk, self.plan, now=self.now)
            explorations.tick(run.pk, now=self.now + timedelta(seconds=15))
            explorations.finish(run.pk, now=self.now + timedelta(seconds=16))
        run.refresh_from_db()
        self.assertNotIn('party_id', run.snapshot)
        self.assertEqual(run.result['kills'], 1)
        return run, self.data()

    def test_legacy_solo_preserves_exact_kill_experience_and_loot(self):
        run, source = self.finished_solo()
        original = copy.deepcopy(source)
        outcome = project(source, run.pk)
        self.assertEqual(source, original)
        self.assertEqual(project(list(reversed(source)), run.pk), outcome)
        self.assertEqual(sum(validate_settlement(outcome).values()), run.result['kills'])
        self.assertEqual(outcome['kills'][0]['experience'], run.result['experience'])
        self.assertEqual(outcome['kills'][0]['rewards'], run.result['rewards'])
        self.assertEqual(outcome['kills'][0]['monster'], next(
            row['fields']['monster'] for row in source if row['model'] == ENCOUNTER))
        self.assertNotIn('attack', json.dumps(outcome, ensure_ascii=False))
        self.assertNotIn('damage', json.dumps(outcome, ensure_ascii=False))

    def test_missing_or_inconsistent_solo_evidence_never_becomes_a_summary(self):
        run, source = self.finished_solo()
        damaged = copy.deepcopy(source)
        encounter = next(row for row in damaged if row['model'] == ENCOUNTER)
        encounter['fields']['result']['experience'] += 1
        with self.assertRaisesMessage(ValueError, '击杀与遭遇结果不一致'):
            project(damaged, run.pk)
        missing = [row for row in source if not (row['model'] == FACT
                   and row['fields']['exploration_id'] == run.pk and row['fields']['kind'] == 'depart')]
        with self.assertRaisesMessage(ValueError, '缺少唯一真实出发时间'):
            project(missing, run.pk)
        outcome = project(source, run.pk)
        outcome['kills'][0]['experience'] += 1
        with self.assertRaisesMessage(ValueError, '数量、经验或掉落'):
            validate_settlement(outcome)

    def test_non_kill_rounds_do_not_make_the_summary_grow_per_round(self):
        run, source = self.finished_solo()
        template = next(row for row in source if row['model'] == FACT
                        and row['fields']['exploration_id'] == run.pk and row['fields']['kind'] == 'round')

        def more_rounds(count):
            data = copy.deepcopy(source)
            for index in range(count):
                row = copy.deepcopy(template)
                row['pk'] = f'ordinary-solo-{index}'
                row['fields']['sequence'] = 100000 + index
                row['fields']['payload'] = {'events': [{'kind': 'attack', 'damage': 999}], 'consumption': []}
                data.append(row)
            return project(data, run.pk)

        few, many = more_rounds(1), more_rounds(200)
        self.assertEqual(few['kills'], many['kills'])
        self.assertEqual(few['run'], many['run'])
        self.assertLess(len(json.dumps(many)), len(json.dumps(few)) + 100)

    def test_background_backfill_and_backup_restore_preserve_solo_outcome(self):
        from system_settings.tests import MemoryStorageClient
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        from ..analytics.combat_kills import load_combat_kills
        from ..life_time import SHANGHAI, storage_time
        from utils.sync_manager import SyncManager
        from utils.sync_policy import SyncError
        from .analytics_models import CombatSoloSettlement
        from .migration_guard import PROTECTION_ENV
        from .models import CombatEncounter, CombatFact
        from .retention_gate import inspect_statistics_backlog
        from .solo_daily_backfill import automatic_batch
        from .solo_settlement import SETTLEMENT
        from .store import digest
        from .sync import metadata, validate_source

        run, _ = self.finished_solo()
        before = CombatFact.objects.count(), CombatEncounter.objects.count()
        self.assertEqual(inspect_statistics_backlog()['legacy_solo_runs'], 1)
        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            first = automatic_batch(max_seconds=60)
            again = automatic_batch(max_seconds=60)
            self.assertEqual((first['created'], first['failures'], again['created']), (1, [], 0))
            saved = CombatSoloSettlement.objects.get(pk=run.pk)
            expected = copy.deepcopy(saved.content)
            self.assertEqual(saved.digest, digest(expected))
            self.assertEqual((CombatFact.objects.count(), CombatEncounter.objects.count()), before)
            status = inspect_statistics_backlog()
            self.assertEqual(status['legacy_solo_runs'], 0)
            self.assertTrue(status['basic_coverage_complete'], status)
            CombatSoloSettlement.objects.filter(pk=run.pk).update(owner_id='other')
            wrong_owner = inspect_statistics_backlog()
            self.assertEqual(wrong_owner['legacy_solo_runs'], 1)
            self.assertEqual(wrong_owner['invalid_legacy_solo_summaries'], 1)
            self.assertFalse(wrong_owner['basic_coverage_complete'])
            CombatSoloSettlement.objects.filter(pk=run.pk).update(owner_id=run.owner_id)
            start = storage_time(datetime.combine(self.now.date(), time.min, SHANGHAI))
            end = start + timedelta(days=2)
            raw = list(load_combat_kills('admin', start=start, end=end, actor_ids=[run.actor_id]))
            with CaptureQueriesContext(connection) as queries:
                compact = list(load_combat_kills('admin', start=start, end=end, actor_ids=[run.actor_id], include_daily=True))
            self.assertEqual(compact, raw)
            # The candidate subquery uses encounter timestamps, but a covered
            # run must not fetch raw encounter rows into the application.
            def encounter_rows(row):
                sql = row['sql'].lstrip().lower()
                if sql.startswith('declare '):
                    sql = sql.partition(' for ')[2]
                return sql.startswith('select "system_settings_combatencounter".')
            self.assertFalse(any(encounter_rows(row) for row in queries.captured_queries))
            non_daily_start = start + timedelta(hours=1)
            with CaptureQueriesContext(connection) as queries:
                non_daily = list(load_combat_kills('admin', start=non_daily_start, end=end,
                                                   actor_ids=[run.actor_id], include_daily=True))
            self.assertEqual(non_daily, list(load_combat_kills(
                'admin', start=non_daily_start, end=end, actor_ids=[run.actor_id])))
            self.assertTrue(any(encounter_rows(row) for row in queries.captured_queries), queries.captured_queries)
            manager = SyncManager(MemoryStorageClient(), '/test-backup')
            data = manager.build_snapshot_data()
            meta = metadata(data)
            self.assertEqual(meta['combat_schema_version'], 19)
            self.assertTrue(validate_source(data, meta))
            with self.assertRaisesMessage(SyncError, '需要战斗同步19'):
                validate_source(data, {**meta, 'combat_schema_version': 18})
            damaged = copy.deepcopy(data)
            row = next(item for item in damaged if item['model'] == SETTLEMENT)
            row['fields']['content']['kills'][0]['experience'] += 1
            row['fields']['digest'] = digest(row['fields']['content'])
            with self.assertRaises(SyncError):
                validate_source(damaged, metadata(damaged))
            snapshot = manager.publish_v2_snapshot(source='test', data_list=data, revisions={})
            remote = manager.get_v2_snapshot(snapshot['meta']['snapshot_id'])
            for _ in range(2):
                manager.apply_snapshot_data(copy.deepcopy(remote['data']), remote_meta=remote['meta'], full_overwrite=True)
                self.assertEqual(CombatSoloSettlement.objects.get(pk=run.pk).content, expected)

    def test_damaged_solo_sources_remain_uncovered_until_repaired(self):
        from .analytics_models import CombatSoloSettlement
        from .migration_guard import PROTECTION_ENV
        from .models import CombatFact
        from .solo_daily_backfill import automatic_batch

        run, _ = self.finished_solo()
        fact = CombatFact.objects.filter(exploration_id=run.pk, kind='round').first()
        original = copy.deepcopy(fact.payload)
        CombatFact.objects.filter(pk=fact.pk).update(payload={'damaged': True})
        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            result = automatic_batch(max_seconds=60)
            self.assertEqual((result['created'], len(result['failures'])), (0, 1))
            self.assertFalse(CombatSoloSettlement.objects.exists())
            CombatFact.objects.filter(pk=fact.pk).update(payload=original)
            repaired = automatic_batch(max_seconds=60)
        self.assertEqual((repaired['created'], repaired['failures']), (1, []))

    def test_unfinished_solo_is_ignored_until_it_finishes(self):
        from .analytics_models import CombatSoloSettlement
        from .migration_guard import PROTECTION_ENV
        from .solo_daily_backfill import automatic_batch

        with patch('system_settings.agent_world.combat.party_sessions.modern', return_value=False):
            run = explorations.request('admin', self.agents[0], 'legacy-active', {}, now=self.now)
            explorations.depart(run.pk, self.plan, now=self.now)
            with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
                pending = automatic_batch(max_seconds=60)
            self.assertEqual(pending['created'], 0)
            self.assertFalse(CombatSoloSettlement.objects.exists())
            explorations.finish(run.pk, now=self.now + timedelta(seconds=1))
        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            finished = automatic_batch(max_seconds=60)
        self.assertEqual((finished['created'], finished['failures']), (1, []))
