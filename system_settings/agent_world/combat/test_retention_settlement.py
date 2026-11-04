"""Rebuild combat statistics from compact outcomes, without deleting sources."""
import copy
import json
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase

from . import explorations, test_parties
from .party_daily import FACT, RUN, project_party
from .party_settlement_archive import project_settlement, validate_settlement
from .party_sync import EVENT, PARTY
from .party_tick import tick
from .store import digest


class PartySettlementArchiveTests(TestCase):
    setUp = test_parties.PartyServiceTests.setUp
    start = test_parties.PartyServiceTests.start
    join = test_parties.PartyServiceTests.join
    force_clear = test_parties.PartyServiceTests.force_clear
    data = test_parties.PartyServiceTests.data

    def finished_party(self):
        def loot(catalog, enemy, runs, count, rng):
            return [(runs[0].actor_id, {'kind': 'material',
                'item': {'id': 'material.test', 'name': '测试材料', 'sale_price': 1}, 'quantity': 2}, [])]
        with patch('system_settings.agent_world.combat.party_rewards.loot', side_effect=loot):
            run, party = self.start()
            self.force_clear(party, self.now + timedelta(seconds=15))
            self.join(self.agents[1], 'archive-join', party)
            tick(party.pk, now=self.now + timedelta(seconds=45))
            self.force_clear(party, self.now + timedelta(seconds=53))
            explorations.finish(run.pk, now=self.now + timedelta(seconds=55))
            explorations.finish('archive-join', now=self.now + timedelta(seconds=55))
        party.refresh_from_db()
        self.assertEqual(party.status, 'completed')
        return party, self.data()

    def test_settlement_rebuilds_daily_counts_and_keeps_outcomes_without_combat_actions(self):
        party, source = self.finished_party()
        events = sorted((row for row in source if row['model'] == EVENT
                         and row['fields']['party_id'] == party.pk), key=lambda row: row['fields']['sequence'])
        kill_events = [row for row in events if row['fields']['kind'] == 'round'
                       and any(action.get('kind') == 'kill'
                               for actions in row['fields']['payload']['personal'].values() for action in actions)]
        split = kill_events[1]['fields']['sequence']
        for event in events:
            event['fields']['created_at'] = ('2026-10-24T23:59:59' if event['fields']['sequence'] < split
                                             else '2026-10-25T00:00:00')
        original = copy.deepcopy(source)
        settlement = project_settlement(source, party.pk)
        self.assertEqual(source, original)
        self.assertEqual(validate_settlement(settlement), project_party(source, party.pk)['days'])
        self.assertEqual([item['date'] for item in settlement['day_bounds']], ['2026-10-24', '2026-10-25'])
        self.assertGreater(len(settlement['kills']), 0)
        self.assertGreater(sum(len(person['rewards']) for kill in settlement['kills']
                               for person in kill['participants']), 0)
        self.assertTrue(all(set(kill) == {'unit_id', 'monster', 'occurred_at', 'event_sequence',
                                         'shared_event_id', 'participants'} for kill in settlement['kills']))
        self.assertNotIn('action_order', json.dumps(settlement, ensure_ascii=False))
        self.assertNotIn('loot_roll', json.dumps(settlement, ensure_ascii=False))
        self.assertEqual(project_settlement(source, party.pk), settlement)
        self.assertEqual(project_settlement(list(reversed(source)), party.pk), settlement)

    def test_inconsistent_experience_or_rewards_are_rejected(self):
        party, source = self.finished_party()
        settlement = project_settlement(source, party.pk)
        changed_xp = copy.deepcopy(settlement)
        changed_xp['kills'][0]['participants'][0]['experience'] += 1
        with self.assertRaisesMessage(ValueError, '数量、经验或掉落'):
            validate_settlement(changed_xp)
        missing_reward = copy.deepcopy(settlement)
        participant = next(person for kill in missing_reward['kills'] for person in kill['participants']
                           if person['rewards'])
        participant['rewards'].pop()
        with self.assertRaisesMessage(ValueError, '数量、经验或掉落'):
            validate_settlement(missing_reward)
        changed_monster = copy.deepcopy(settlement)
        changed_monster['kills'][0]['monster']['name'] = '错误魔物'
        with self.assertRaisesMessage(ValueError, '原日期统计指纹不一致'):
            validate_settlement(changed_monster)
        changed_outcome = copy.deepcopy(source)
        run = next(row for row in changed_outcome if row['model'] == RUN
                   and row['fields']['snapshot'].get('party_id') == party.pk)
        run['fields']['result']['kills'] += 1
        with self.assertRaisesMessage(ValueError, '数量、经验或掉落'):
            project_settlement(changed_outcome, party.pk)

    def test_retention_preview_checks_compact_outcomes_and_leaves_raw_rows_intact(self):
        from .models import CombatFact, Exploration
        from .party_models import AdventureEvent
        from .retention_preview import inspect_party

        party, source = self.finished_party()
        before = (CombatFact.objects.count(), AdventureEvent.objects.count())
        expected = project_settlement(source, party.pk)
        preview = inspect_party('admin', party.pk, now=self.now + timedelta(days=8))
        self.assertTrue(preview['shared_source_verified'])
        self.assertEqual(preview['compact_settlement']['kills'], len(expected['kills']))
        self.assertEqual(preview['compact_settlement']['explorations'], 2)
        self.assertTrue(preview['compact_settlement']['verified'])
        self.assertFalse(preview['cleanup_ready'])
        run = Exploration.objects.filter(snapshot__party_id=party.pk).first()
        broken = copy.deepcopy(run.result)
        broken['experience'] += 1
        Exploration.objects.filter(pk=run.pk).update(result=broken)
        invalid = inspect_party('admin', party.pk, now=self.now + timedelta(days=8))
        self.assertTrue(invalid['shared_source_verified'])
        self.assertFalse(invalid['compact_settlement']['verified'])
        self.assertTrue(any('数量、经验或掉落' in reason for reason in invalid['blockers']))
        self.assertFalse(invalid['cleanup_ready'])
        self.assertEqual((CombatFact.objects.count(), AdventureEvent.objects.count()), before)

    def test_background_saves_compact_settlement_and_backup_restores_it(self):
        from system_settings.tests import MemoryStorageClient
        from system_settings.sync_state import canonical_hash
        from utils.sync_manager import SyncManager
        from utils.sync_merge import item_identity, revision_key
        from utils.sync_policy import SyncError
        from .analytics_models import CombatPartyCoverage, CombatPartySettlement
        from .migration_guard import PROTECTION_ENV
        from .models import CombatFact
        from .party_daily_automatic import automatic_batch
        from .party_daily_backfill import backfill
        from .party_daily_sync import COVERAGE, DAY, SETTLEMENT
        from .party_models import AdventureEvent
        from .retention_gate import inspect_statistics_backlog
        from .sync import metadata, validate_source

        party, _ = self.finished_party()
        raw_counts = CombatFact.objects.count(), AdventureEvent.objects.count()
        with patch.dict('os.environ', {PROTECTION_ENV: '1'}):
            backfill('admin', party.pk)
        self.assertEqual(metadata(self.data())['combat_schema_version'], 18)
        self.assertEqual(inspect_statistics_backlog()['missing_settlements'], 1)
        with patch.dict('os.environ', {PROTECTION_ENV: '0'}):
            manager = SyncManager(MemoryStorageClient(), '/test-backup')
            older = manager.build_snapshot_data()
            older_meta = manager.build_snapshot_meta(data_list=older)
            first = automatic_batch(max_seconds=60)
            again = automatic_batch(max_seconds=60)
            self.assertEqual((first['created'], first['settlement_created'], len(first['failures'])), (0, 1, 0))
            self.assertEqual((again['created'], again['settlement_created']), (0, 0))
            stored = CombatPartySettlement.objects.get(pk=party.pk)
            expected = copy.deepcopy(stored.content)
            self.assertEqual(stored.digest, digest(expected))
            self.assertEqual((CombatFact.objects.count(), AdventureEvent.objects.count()), raw_counts)
            self.assertTrue(inspect_statistics_backlog()['basic_coverage_complete'])
            bad_content = copy.deepcopy(expected)
            bad_content['kills'][0]['participants'][0]['experience'] += 1
            CombatPartySettlement.objects.filter(pk=party.pk).update(content=bad_content, digest=digest(bad_content))
            blocked = inspect_statistics_backlog()
            self.assertEqual(blocked['invalid_settlements'], 1)
            self.assertFalse(blocked['basic_coverage_complete'])
            CombatPartySettlement.objects.filter(pk=party.pk).update(content=expected, digest=digest(expected))
            data = manager.build_snapshot_data()
            meta = metadata(data)
            self.assertEqual(meta['combat_schema_version'], 19)
            self.assertTrue(validate_source(data, meta))
            with self.assertRaisesMessage(SyncError, '需要战斗同步19'):
                validate_source(data, {**meta, 'combat_schema_version': 18})
            corrupted = copy.deepcopy(data)
            record = next(row for row in corrupted if row['model'] == SETTLEMENT)
            record['fields']['content']['kills'][0]['participants'][0]['experience'] += 1
            record['fields']['digest'] = digest(record['fields']['content'])
            with self.assertRaises(SyncError):
                validate_source(corrupted, metadata(corrupted))
            with self.assertRaisesMessage(SyncError, '缺少每日来源覆盖'):
                validate_source([row for row in data if row['model'] not in (COVERAGE, DAY)])

            def revisions(items):
                return {revision_key(row['model'], item_identity(row)): {
                    'hash': canonical_hash(row['fields']), 'revision_at': '2026-11-03T12:00:00',
                    'origin_device': 'single-device', 'deleted': False} for row in items}

            merged, _, _ = manager.merge_v2_data(None, data, revisions(data), {
                'data': older, 'meta': older_meta, 'revisions': revisions(older)})
            self.assertTrue(validate_source(merged, metadata(merged)))
            self.assertEqual(sum(row['model'] == SETTLEMENT for row in merged), 1)
            snapshot = manager.publish_v2_snapshot(source='test', data_list=data, revisions={})
            remote = manager.get_v2_snapshot(snapshot['meta']['snapshot_id'])
            self.assertEqual(remote['meta']['combat_schema_version'], 19)
            for _ in range(2):
                manager.apply_snapshot_data(copy.deepcopy(remote['data']), remote_meta=remote['meta'], full_overwrite=True)
                self.assertEqual(CombatPartyCoverage.objects.count(), 1)
                self.assertEqual(CombatPartySettlement.objects.get(pk=party.pk).content, expected)

    def test_non_kill_rounds_do_not_expand_settlement_with_round_count(self):
        party, source = self.finished_party()

        def expanded(number):
            data = copy.deepcopy(source)
            events = sorted((row for row in data if row['model'] == EVENT
                             and row['fields']['party_id'] == party.pk), key=lambda row: row['fields']['sequence'])
            split = next(index for index, row in enumerate(events) if row['fields']['kind'] == 'leave')
            template = next(row for row in reversed(events[:split]) if row['fields']['kind'] == 'round')
            actors = template['fields']['payload']['personal']
            templates = {actor: next(row for row in data if row['model'] == FACT
                and row['fields']['actor_id'] == actor
                and row['fields']['payload'].get('shared_event_id') == template['pk']) for actor in actors}
            simulated = []
            for index in range(number):
                event = copy.deepcopy(template)
                event['pk'] = f'synthetic-event-{index}'
                event['fields']['payload']['personal'] = {actor: [] for actor in actors}
                event['fields']['payload']['events'] = []
                simulated.append(event)
                for actor, original in templates.items():
                    receipt = copy.deepcopy(original)
                    receipt['pk'] = f'synthetic-receipt-{actor}-{index}'
                    receipt['fields']['sequence'] = 100000 + index
                    receipt['fields']['payload'] = {'shared_event_id': event['pk'], 'events': []}
                    data.append(receipt)
            ordered = [*events[:split], *simulated, *events[split:]]
            previous = ''
            for sequence, event in enumerate(ordered, 1):
                fields = event['fields']
                fields['created_at'] = '2026-10-24T12:00:00'
                fields['sequence'], fields['previous_hash'] = sequence, previous
                content = {key: fields[key] for key in ('party_id', 'owner_id', 'sequence', 'kind', 'payload', 'previous_hash')}
                fields['digest'] = previous = digest(content)
            data.extend(simulated)
            party_row = next(row for row in data if row['model'] == PARTY and row['pk'] == party.pk)
            party_row['fields']['head'], party_row['fields']['digest'] = len(ordered), previous
            return project_settlement(data, party.pk)

        few, many = expanded(1), expanded(200)
        self.assertEqual(few['kills'], many['kills'])
        self.assertEqual(few['runs'], many['runs'])
        self.assertLess(len(json.dumps(many)), len(json.dumps(few)) + 100)
