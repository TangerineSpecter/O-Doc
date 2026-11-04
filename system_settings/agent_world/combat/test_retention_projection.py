"""Prepared archives retain outcomes and compactly bridge original chains."""
import copy

from django.test import TestCase
from utils.sync_policy import SyncError

from . import test_parties, test_retention_settlement, test_solo_settlement
from .party_daily import FACT
from .party_sync import EVENT, PARTY
from .retention_projection import prepare_party, prepare_solo, validate_archive
from .retention_replay import personal_outcomes
from .retention_segments import verify_personal, verify_shared
from .retention_sync import archive_index

CHAIN = 'system_settings.combatintegrity'


class RetentionProjectionTests(TestCase):
    setUp = test_parties.PartyServiceTests.setUp
    start = test_parties.PartyServiceTests.start
    join = test_parties.PartyServiceTests.join
    force_clear = test_parties.PartyServiceTests.force_clear
    data = test_parties.PartyServiceTests.data
    finished_party = test_retention_settlement.PartySettlementArchiveTests.finished_party
    finished_solo = test_solo_settlement.SoloSettlementTests.finished_solo

    def assert_personal_chains(self, source, archive):
        run_actors = ({row['exploration_id']: row['actor_id'] for row in archive['runs']}
                      if archive['archive']['kind'] == 'party'
                      else {archive['run']['exploration_id']: archive['run']['actor_id']})
        for actor in set(run_actors.values()):
            facts = [{'id': str(row['pk']), **row['fields']} for row in source
                     if row['model'] == FACT and row['fields']['actor_id'] == actor]
            facts.sort(key=lambda row: row['sequence'])
            retained = [row for row in facts if not (row['kind'] == 'round'
                        and row['exploration_id'] in run_actors)]
            chain = next(row['fields'] for row in source if row['model'] == CHAIN and row['pk'] == actor)
            gaps = [row for row in archive['archive']['personal_ranges'] if row['stream_id'] == actor]
            verify_personal(retained, chain, actor=actor, owner='admin', ranges=gaps)

    def assert_outcomes_match_raw(self, source, content):
        runs = ({row['exploration_id'] for row in content['runs']} if content['archive']['kind'] == 'party'
                else {content['run']['exploration_id']})
        expected = {}
        for row in source:
            fields = row['fields']
            if row['model'] != FACT or fields['kind'] != 'round' or fields['exploration_id'] not in runs:
                continue
            kills = [event for event in fields['payload'].get('events', []) if event.get('kind') == 'kill']
            if kills:
                expected[(fields['actor_id'], fields['sequence'], str(row['pk']))] = (
                    kills, fields['payload'].get('progression_after'), fields['payload'].get('equipment_after', {}))
        rebuilt = {(row['actor_id'], row['sequence'], row['id']): (
            row['payload']['events'], row['payload']['progression_after'], row['payload']['equipment_after'])
                   for row in personal_outcomes(content) if row['kind'] == 'round'}
        self.assertEqual(rebuilt, expected)

    def test_completed_party_rounds_can_be_replaced_by_compact_ranges(self):
        party, source = self.finished_party()
        content = prepare_party(source, party.pk)
        self.assertEqual(validate_archive(content)['kind'], 'party')
        self.assert_personal_chains(source, content)
        self.assert_outcomes_match_raw(source, content)
        party_row = next({'id': str(row['pk']), **row['fields']} for row in source
                         if row['model'] == PARTY and row['pk'] == party.pk)
        events = sorted(({'id': str(row['pk']), **row['fields']} for row in source
                         if row['model'] == EVENT and row['fields']['party_id'] == party.pk
                         and row['fields']['kind'] != 'round'), key=lambda item: item['sequence'])
        verify_shared(events, party_row, ranges=content['archive']['shared_ranges'])
        from .party_daily import project_party
        from .party_daily_sync import records, settlement_record
        from .sync import metadata, validate_source
        run_ids = {row['exploration_id'] for row in content['runs']}
        compact = [row for row in source if not (
            row['model'] == FACT and row['fields']['kind'] == 'round'
            and row['fields']['exploration_id'] in run_ids) and not (
            row['model'] == EVENT and row['fields']['kind'] == 'round'
            and row['fields']['party_id'] == party.pk)] + records(project_party(source, party.pk)) + [settlement_record(content)]
        from .retention_compaction import strip_replays
        compact, _ = strip_replays(compact, [content], verify_original=True)
        indexed = archive_index(compact, {'combat_schema_version': 20})
        self.assertIn(party.pk, indexed['parties'])
        self.assertEqual(metadata(compact)['combat_schema_version'], 20)
        self.assertTrue(validate_source(compact, metadata(compact)))
        self.assertEqual(sum(len(items) for items in indexed['outcomes'].values()),
                         len(personal_outcomes(content)))
        with self.assertRaisesMessage(SyncError, '需要战斗同步20'):
            archive_index(compact, {'combat_schema_version': 19})
        damaged = copy.deepcopy(compact)
        run = next(row for row in damaged if row['model'] == 'system_settings.exploration'
                   and str(row['pk']) in run_ids)
        run['fields']['result']['experience'] += 1
        with self.assertRaisesMessage(SyncError, '与保留的结算或来源不一致'):
            archive_index(damaged, {'combat_schema_version': 20})
        changed = copy.deepcopy(content)
        changed['kills'][0]['participants'][0]['experience'] += 1
        with self.assertRaisesMessage(ValueError, '结算或范围指纹不一致'):
            validate_archive(changed)

    def test_completed_legacy_solo_rounds_can_be_replaced_by_compact_ranges(self):
        run, source = self.finished_solo()
        content = prepare_solo(source, run.pk)
        self.assertEqual(validate_archive(content)['kind'], 'solo')
        self.assert_personal_chains(source, content)
        self.assert_outcomes_match_raw(source, content)
        self.assertEqual(content['run']['experience'], run.result['experience'])
        self.assertEqual(content['run']['rewards'], run.result['rewards'])
        from .solo_settlement import record
        from .sync import metadata, validate_source
        compact = [row for row in source if not (row['model'] == FACT
                   and row['fields']['kind'] == 'round' and row['fields']['exploration_id'] == run.pk)] + [record(content)]
        self.assertIn(run.pk, archive_index(compact, {'combat_schema_version': 20})['solos'])
        self.assertEqual(metadata(compact)['combat_schema_version'], 20)
        self.assertTrue(validate_source(compact, metadata(compact)))
        changed = copy.deepcopy(content)
        changed['archive']['personal_ranges'][0]['exploration_id'] = 'other'
        with self.assertRaisesMessage(ValueError, '居民或探索不一致'):
            validate_archive(changed)
