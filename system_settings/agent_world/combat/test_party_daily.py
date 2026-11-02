import copy
import json
import os
from collections import Counter
from datetime import datetime, time, timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import TestCase, TransactionTestCase

from . import explorations, test_parties
from .party_daily import FACT, project_party
from .party_sync import EVENT
from .party_tick import tick
from utils.sync_manager import SyncError


class PartyDailyProjectionTests(TestCase):
    setUp = test_parties.PartyServiceTests.setUp
    start = test_parties.PartyServiceTests.start
    join = test_parties.PartyServiceTests.join
    force_clear = test_parties.PartyServiceTests.force_clear
    data = test_parties.PartyServiceTests.data

    def finished_party(self):
        run, party = self.start()
        self.force_clear(party, self.now+timedelta(seconds=15))
        self.join(self.agents[1], 'daily-join', party)
        tick(party.pk, now=self.now+timedelta(seconds=45))
        self.force_clear(party, self.now+timedelta(seconds=53))
        explorations.finish(run.pk, now=self.now+timedelta(seconds=55))
        explorations.finish('daily-join', now=self.now+timedelta(seconds=55))
        party.refresh_from_db()
        self.assertEqual(party.status, 'completed')
        return party, self.data()

    def test_projection_preserves_world_and_personal_kills_across_midnight(self):
        party, source = self.finished_party()
        events = sorted((row for row in source if row['model'] == EVENT
                         and row['fields']['party_id'] == party.pk), key=lambda row: row['fields']['sequence'])
        kills = [row for row in events if row['fields']['kind'] == 'round' and
                 any(action.get('kind') == 'kill' for actions in row['fields']['payload']['personal'].values()
                     for action in actions)]
        self.assertGreaterEqual(len(kills), 2)
        split = kills[1]['fields']['sequence']
        for row in events:
            row['fields']['created_at'] = ('2026-10-24T23:59:59' if row['fields']['sequence'] < split
                                           else '2026-10-25T00:00:00')
        original = copy.deepcopy(source)
        result = project_party(source, party.pk)
        self.assertEqual(source, original)
        self.assertEqual([day['date'] for day in result['days']], ['2026-10-24', '2026-10-25'])
        actual_world, actual_personal = 0, Counter()
        for day in result['days']:
            for group in day['groups']:
                actual_world += group['kills']
                for participant in group['participants']:
                    actual_personal[participant['actor_id']] += group['kills']
        units, expected_personal = set(), Counter()
        for row in kills:
            for actor, actions in row['fields']['payload']['personal'].items():
                for action in actions:
                    if action.get('kind') == 'kill':
                        units.add(action['monster']['unit_id'])
                        expected_personal[actor] += 1
        self.assertEqual(actual_world, len(units))
        self.assertEqual(actual_personal, expected_personal)
        self.assertNotIn('unit_id', json.dumps(result))
        self.assertFalse(result['cleanup_ready'])
        self.assertEqual(project_party(source, party.pk), result)

    def test_projection_rejects_missing_receipt_and_reversed_dates(self):
        party, source = self.finished_party()
        missing = copy.deepcopy(source)
        receipt = next(row for row in missing if row['model'] == FACT
                       and row['fields']['payload'].get('shared_event_id'))
        missing.remove(receipt)
        with self.assertRaises(SyncError):
            project_party(missing, party.pk)
        reversed_dates = copy.deepcopy(source)
        events = sorted((row for row in reversed_dates if row['model'] == EVENT
                         and row['fields']['party_id'] == party.pk), key=lambda row: row['fields']['sequence'])
        events[0]['fields']['created_at'] = '2026-10-26T00:00:00'
        events[-1]['fields']['created_at'] = '2026-10-25T00:00:00'
        with self.assertRaisesMessage(ValueError, '日期与序列顺序不一致'):
            project_party(reversed_dates, party.pk)

    def test_thirty_day_projection_does_not_store_each_ordinary_round(self):
        from .store import digest
        party, source = self.finished_party()

        def expanded(rounds_per_day):
            data = copy.deepcopy(source)
            events = sorted((row for row in data if row['model'] == EVENT
                             and row['fields']['party_id'] == party.pk), key=lambda row: row['fields']['sequence'])
            split = next(i for i, row in enumerate(events) if row['fields']['kind'] == 'leave')
            template = next(row for row in reversed(events[:split]) if row['fields']['kind'] == 'round')
            actors = template['fields']['payload']['personal']
            receipt_templates = {actor: next(row for row in data if row['model'] == FACT
                and row['fields']['actor_id'] == actor
                and row['fields']['payload'].get('shared_event_id') == template['pk']) for actor in actors}
            simulated = []
            for day in range(30):
                stamp = (datetime(2026, 10, 1)+timedelta(days=day)).isoformat()
                for index in range(rounds_per_day):
                    event = copy.deepcopy(template)
                    event['pk'] = f'synthetic-{day}-{index}'
                    event['fields']['created_at'] = stamp
                    event['fields']['payload']['personal'] = {actor: [] for actor in actors}
                    event['fields']['payload']['events'] = []
                    simulated.append(event)
                    for actor, original in receipt_templates.items():
                        receipt = copy.deepcopy(original)
                        receipt['pk'] = f'synthetic-{actor}-{day}-{index}'
                        receipt['fields']['sequence'] = 100000+day*rounds_per_day+index
                        receipt['fields']['payload'] = {'shared_event_id': event['pk'], 'events': []}
                        data.append(receipt)
            ordered = [*events[:split], *simulated, *events[split:]]
            for event in events[:split]:
                event['fields']['created_at'] = '2026-10-01T00:00:00'
            for event in events[split:]:
                event['fields']['created_at'] = '2026-10-30T00:00:00'
            previous = ''
            for sequence, event in enumerate(ordered, 1):
                fields = event['fields']
                fields['sequence'], fields['previous_hash'] = sequence, previous
                content = {key: fields[key] for key in ('party_id', 'owner_id', 'sequence', 'kind', 'payload', 'previous_hash')}
                fields['digest'] = previous = digest(content)
            data.extend(simulated)
            party_row = next(row for row in data if row['model'] == 'system_settings.adventureparty' and row['pk'] == party.pk)
            party_row['fields']['head'], party_row['fields']['digest'] = len(ordered), previous
            return project_party(data, party.pk)

        few, many = expanded(1), expanded(60)
        self.assertEqual(len(few['days']), 30)
        self.assertEqual(len(many['days']), 30)
        self.assertEqual([day['groups'] for day in few['days']], [day['groups'] for day in many['days']])
        self.assertLess(len(json.dumps(many)), len(json.dumps(few))+2000)
        self.assertNotIn('unit_id', json.dumps(many))
        self.assertFalse(many['cleanup_ready'])

    def test_bounded_preview_is_read_only_and_owner_scoped(self):
        from .models import CombatFact
        from .party_models import AdventureEvent
        from .party_daily_preview import preview
        party, source = self.finished_party()
        counts = CombatFact.objects.count(), AdventureEvent.objects.count()
        expected = project_party(source, party.pk)
        output = StringIO()
        call_command('preview_party_daily', '--owner', 'admin', '--party', party.pk, stdout=output)
        result = json.loads(output.getvalue())
        self.assertEqual(result['days'], expected['days'])
        self.assertFalse(result['cleanup_ready'])
        self.assertGreater(result['source_rows'], 1)
        with self.assertRaisesMessage(CommandError, '未找到'):
            call_command('preview_party_daily', '--owner', 'other', '--party', party.pk)
        with self.assertRaisesMessage(CommandError, '超过本次预览上限'):
            call_command('preview_party_daily', '--owner', 'admin', '--party', party.pk, '--max-source-rows', '1')
        self.assertEqual((CombatFact.objects.count(), AdventureEvent.objects.count()), counts)

        event = next(row for row in source if row['model'] == EVENT and row['fields']['kind'] == 'round')
        actor = next(iter(event['fields']['payload']['personal']))
        CombatFact.objects.create(pk='wrong-run-receipt', owner_id='admin', actor_id=actor,
            exploration_id='unexpected-run', sequence=999, kind='round', digest='broken',
            payload={'shared_event_id': event['pk'], 'events': event['fields']['payload']['personal'][actor]})
        with self.assertRaises(SyncError):
            preview('admin', party.pk)

    def test_retention_preview_uses_last_actual_end_and_never_authorizes_deletion(self):
        from .migration_guard import PROTECTION_ENV
        from .models import CombatFact, Exploration
        from .party_daily_backfill import backfill
        from .party_models import AdventureEvent, AdventureMember
        from .retention_preview import inspect_party

        party, _ = self.finished_party()
        before = CombatFact.objects.count(), AdventureEvent.objects.count()
        recent = inspect_party('admin', party.pk, now=self.now+timedelta(days=7, seconds=54))
        self.assertFalse(recent['age_ready'])
        old = inspect_party('admin', party.pk, now=self.now+timedelta(days=7, seconds=55))
        self.assertTrue(old['age_ready'])
        self.assertTrue(old['shared_source_verified'])
        self.assertFalse(old['daily_contribution_verified'])
        self.assertFalse(old['cleanup_ready'])
        self.assertGreater(old['observed']['shared_rounds'], 0)
        self.assertGreater(old['observed']['personal_rounds'], 0)
        if old['observed']['payload_bytes'] is not None:
            self.assertGreater(old['observed']['payload_bytes'], 0)
        member = AdventureMember.objects.filter(party_id=party.pk).first()
        member_run = Exploration.objects.get(pk=member.exploration_id)
        Exploration.objects.filter(pk=member_run.pk).update(ended_at=None)
        unfinished = inspect_party('admin', party.pk, now=self.now+timedelta(days=8))
        self.assertFalse(unfinished['age_ready'])
        self.assertTrue(any('缺少实际结束时间' in reason for reason in unfinished['blockers']))
        Exploration.objects.filter(pk=member_run.pk).update(ended_at=member_run.ended_at)
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            backfill('admin', party.pk)
        covered = inspect_party('admin', party.pk, now=self.now+timedelta(days=8))
        self.assertTrue(covered['daily_contribution_verified'])
        self.assertFalse(covered['cleanup_ready'])
        self.assertTrue(any('跨设备' in reason for reason in covered['blockers']))
        event = AdventureEvent.objects.filter(party_id=party.pk).order_by('sequence').first()
        AdventureEvent.objects.filter(pk=event.pk).update(digest='broken')
        damaged = inspect_party('admin', party.pk, now=self.now+timedelta(days=8))
        self.assertFalse(damaged['shared_source_verified'])
        self.assertFalse(damaged['daily_contribution_verified'])
        self.assertEqual((CombatFact.objects.count(), AdventureEvent.objects.count()), before)

    def test_protected_backfill_is_idempotent_and_synced_contributions_validate_against_source(self):
        from .analytics_models import CombatPartyCoverage, CombatPartyDay
        from .migration_guard import PROTECTION_ENV
        from .models import CombatFact
        from .party_daily_backfill import backfill
        from .party_daily_sync import COVERAGE, DAY, validate_conflicts
        from .party_models import AdventureEvent
        from .sync import metadata, validate_source

        party, _ = self.finished_party()
        raw_counts = (CombatFact.objects.count(), AdventureEvent.objects.count())
        with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
            with self.assertRaisesMessage(ValueError, '请先在本进程启用'):
                backfill('admin', party.pk)
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            first = backfill('admin', party.pk)
            again = backfill('admin', party.pk)
        self.assertTrue(first['created'])
        self.assertFalse(again['created'])
        self.assertFalse(first['cleanup_ready'])
        self.assertEqual((CombatFact.objects.count(), AdventureEvent.objects.count()), raw_counts)
        self.assertEqual(CombatPartyCoverage.objects.count(), 1)
        self.assertGreater(CombatPartyDay.objects.count(), 0)

        source = self.data()
        info = metadata(source)
        self.assertEqual(info['combat_schema_version'], 18)
        self.assertTrue(validate_source(source, info))
        with self.assertRaisesMessage(SyncError, '需要战斗同步18'):
            validate_source(source, {**info, 'combat_schema_version': 17})
        corrupted = copy.deepcopy(source)
        day = next(row for row in corrupted if row['model'] == DAY)
        day['fields']['groups'] = []
        with self.assertRaisesMessage(SyncError, '与原始来源'):
            validate_source(corrupted, metadata(corrupted))
        with self.assertRaisesMessage(SyncError, '不同设备'):
            validate_conflicts(source, corrupted)
        incomplete = [row for row in source if row['model'] != COVERAGE]
        with self.assertRaisesMessage(SyncError, '缺少来源覆盖'):
            validate_source(incomplete, metadata(incomplete))

    def test_backfill_rejects_personal_chain_tampering_without_writing_or_deleting(self):
        from .analytics_models import CombatPartyCoverage
        from .migration_guard import PROTECTION_ENV
        from .models import CombatFact
        from .party_daily_backfill import backfill

        party, _ = self.finished_party()
        fact = CombatFact.objects.filter(actor_id=self.agents[0].pk).first()
        CombatFact.objects.filter(pk=fact.pk).update(payload={'tampered': True})
        count = CombatFact.objects.count()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}), self.assertRaises(ValueError):
            backfill('admin', party.pk)
        self.assertFalse(CombatPartyCoverage.objects.exists())
        self.assertEqual(CombatFact.objects.count(), count)

    def test_daily_contributions_survive_fake_webdav_publish_and_repeated_restore(self):
        from system_settings.tests import MemoryStorageClient
        from utils.sync_manager import SyncManager
        from .analytics_models import CombatPartyCoverage, CombatPartyDay
        from .migration_guard import PROTECTION_ENV
        from .party_daily_backfill import backfill

        party, _ = self.finished_party()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            backfill('admin', party.pk)
        with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
            manager = SyncManager(MemoryStorageClient(), '/test-backup')
            data = manager.build_snapshot_data()
            snapshot = manager.publish_v2_snapshot(source='test', data_list=data, revisions={})
            remote = manager.get_v2_snapshot(snapshot['meta']['snapshot_id'])
            self.assertEqual(remote['meta']['combat_schema_version'], 18)
            expected = list(CombatPartyDay.objects.order_by('day').values('day', 'groups'))
            for _ in range(2):
                manager.apply_snapshot_data(copy.deepcopy(remote['data']), remote_meta=remote['meta'], full_overwrite=True)
                self.assertEqual(CombatPartyCoverage.objects.count(), 1)
                self.assertEqual(list(CombatPartyDay.objects.order_by('day').values('day', 'groups')), expected)

    def test_two_devices_with_different_valid_event_times_do_not_overwrite_contributions(self):
        from django.utils.dateparse import parse_datetime
        from utils.sync_manager import SyncManager
        from .migration_guard import PROTECTION_ENV
        from .party_daily_backfill import backfill
        from .party_daily_sync import COVERAGE, DAY, records, source_slices
        from .sync import validate_source

        party, _ = self.finished_party()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            backfill('admin', party.pk)
        with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
            manager = SyncManager()
            local = manager.build_snapshot_data()
            remote = copy.deepcopy([row for row in local if row['model'] not in (COVERAGE, DAY)])
            for row in remote:
                if row['model'] == EVENT and row['fields']['party_id'] == party.pk:
                    row['fields']['created_at'] = (parse_datetime(row['fields']['created_at'])+timedelta(days=1)).isoformat()
            remote += records(project_party(source_slices(remote, {party.pk})[party.pk], party.pk))
            meta = manager.build_snapshot_meta(data_list=remote)
            self.assertTrue(validate_source(remote, meta))
            with self.assertRaisesMessage(SyncError, '不同设备'):
                manager.merge_v2_data(None, local, {}, {'data': remote, 'meta': meta, 'revisions': {}})
            unsummarized = [row for row in remote if row['model'] not in (COVERAGE, DAY)]
            older_meta = manager.build_snapshot_meta(data_list=unsummarized)
            self.assertEqual(older_meta['combat_schema_version'], 17)
            self.assertTrue(validate_source(unsummarized, older_meta))
            with self.assertRaisesMessage(SyncError, '不同设备'):
                manager.merge_v2_data(None, local, {}, {'data': unsummarized, 'meta': older_meta, 'revisions': {}})

    def test_backfill_batch_resumes_past_a_bad_session_without_deleting_sources(self):
        from .analytics_models import CombatPartyCoverage
        from .migration_guard import PROTECTION_ENV
        from .models import CombatFact
        from .party_daily_backfill import backfill_batch
        from .party_models import AdventureEvent, AdventureParty

        self.finished_party()
        run = explorations.request('admin', self.agents[2], 'bad-party', {'adventure_mode': 'solo'}, now=self.now)
        explorations.depart(run.pk, self.plan, now=self.now)
        other_party = AdventureParty.objects.get(leader_id=self.agents[2].pk)
        self.force_clear(other_party, self.now+timedelta(seconds=15))
        explorations.finish(run.pk, now=self.now+timedelta(seconds=20))
        bad_fact = CombatFact.objects.filter(actor_id=self.agents[2].pk).first()
        CombatFact.objects.filter(pk=bad_fact.pk).update(payload={'broken': True})
        before = (CombatFact.objects.count(), AdventureEvent.objects.count())
        with patch.dict(os.environ, {PROTECTION_ENV: '0'}), self.assertRaisesMessage(ValueError, '请先在本进程启用'):
            backfill_batch('admin')
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            first = backfill_batch('admin', limit=1, max_seconds=60)
            second = backfill_batch('admin', after=first['next_after'], limit=1, max_seconds=60)
            retry = backfill_batch('admin', limit=5, max_seconds=60)
        self.assertEqual(first['processed']+second['processed'], 2)
        self.assertEqual(first['created']+second['created'], 1)
        self.assertEqual(len(first['failures'])+len(second['failures']), 1)
        self.assertEqual(len(retry['failures']), 1)
        self.assertEqual(CombatPartyCoverage.objects.count(), 1)
        self.assertEqual((CombatFact.objects.count(), AdventureEvent.objects.count()), before)

    def test_streaming_frame_hash_matches_legacy_frame_including_checkpoint_rules(self):
        from .facts import frame, frame_digest
        from .models import CombatFact, CombatIntegrity, EquipmentInstance
        from .store import digest

        self.finished_party()
        actor = self.agents[0].pk
        equipment = EquipmentInstance.objects.filter(actor_id=actor).first()
        if equipment:
            EquipmentInstance.objects.filter(pk=equipment.pk).update(retained_for_adventure=True)
        self.assertEqual(frame_digest(actor), digest(frame(actor)))
        self.assertEqual(frame_digest('missing-居民'), digest(frame('missing-居民')))
        chain = CombatIntegrity.objects.get(pk=actor)
        CombatFact.objects.create(pk='test-checkpoint', actor_id=actor, owner_id='admin',
            sequence=chain.head + 1, kind='checkpoint', digest='test')
        self.assertEqual(frame_digest(actor), digest(frame(actor)))

    def test_grouped_sync_frames_preserve_legacy_order_and_contents(self):
        from .history_snapshot import ENCOUNTER, GEAR, PROFILE, RUN, aggregate_frame, frame_index, indexed

        _, source = self.finished_party()
        rows = indexed(source)
        groups = frame_index(rows)

        def legacy(actor):
            def select(row, keys):
                return {key: row[key] for key in keys.split()}
            return {
                'profile': select(rows[(PROFILE, actor)], 'id owner_id catalog_id progression loadout hp mp loot_progress'),
                'equipment': [{**select(row, 'id catalog_id template_id snapshot value bound locked sold rules'),
                    **({'retained_for_adventure': True} if row.get('retained_for_adventure') is True else {})}
                    for (kind, _), row in sorted(rows.items()) if kind == GEAR and row['actor_id'] == actor],
                'runs': [select(row, 'id catalog_id status phase elapsed_seconds revision snapshot state result')
                    for (kind, _), row in sorted(rows.items()) if kind == RUN and row['actor_id'] == actor],
                'encounters': [select(row, 'id exploration_id number monster result')
                    for (kind, _), row in sorted(rows.items()) if kind == ENCOUNTER and row['actor_id'] == actor],
            }

        for agent in self.agents:
            self.assertEqual(aggregate_frame(rows, agent.pk, frozen=True, index=groups), legacy(agent.pk))

    def test_batch_reuses_only_locked_verified_chains_and_separates_source_limits(self):
        from .migration_guard import PROTECTION_ENV
        from .party_daily_backfill import backfill, backfill_batch
        from .party_daily_preview import preview
        from .party_models import AdventureMember, AdventureParty
        from .history_snapshot import verify_chain

        first, _ = self.finished_party()
        now = self.now + timedelta(minutes=2)
        run = explorations.request('admin', self.agents[0], 'another-daily', {'adventure_mode': 'solo'}, now=now)
        run = explorations.depart(run.pk, self.plan, now=now)
        second = AdventureParty.objects.get(pk=run.snapshot['party_id'])
        self.force_clear(second, now + timedelta(seconds=15))
        explorations.finish(run.pk, now=now + timedelta(seconds=20))
        source_limit = max(preview('admin', party.pk)['source_rows'] for party in (first, second))
        actors = set(AdventureMember.objects.filter(party_id__in=[first.pk, second.pk]).values_list('actor_id', flat=True))
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            with self.assertRaisesMessage(ValueError, '个人链及状态共'):
                backfill('admin', first.pk, max_source_rows=source_limit, max_actor_rows=1)
            with patch('system_settings.agent_world.combat.party_daily_backfill.verify_chain', wraps=verify_chain) as checked:
                result = backfill_batch('admin', limit=5, max_seconds=60,
                                        max_source_rows=source_limit, max_actor_rows=500000)
        self.assertEqual(result['created'], 2, result['failures'])
        self.assertEqual([call.args[2] for call in checked.call_args_list].count(self.agents[0].pk), 1)
        self.assertEqual({call.args[2] for call in checked.call_args_list}, actors)

    def test_failed_party_savepoint_does_not_cache_released_actor_lock(self):
        from .history_snapshot import verify_chain
        from .migration_guard import PROTECTION_ENV
        from .party_daily_backfill import backfill_batch
        from .party_models import AdventureEvent, AdventureParty

        first, _ = self.finished_party()
        now = self.now + timedelta(minutes=2)
        run = explorations.request('admin', self.agents[0], 'another-bad-daily', {'adventure_mode': 'solo'}, now=now)
        run = explorations.depart(run.pk, self.plan, now=now)
        second = AdventureParty.objects.get(pk=run.snapshot['party_id'])
        self.force_clear(second, now + timedelta(seconds=15))
        explorations.finish(run.pk, now=now + timedelta(seconds=20))
        bad = min(first.pk, second.pk)
        event = AdventureEvent.objects.filter(party_id=bad).order_by('sequence').first()
        AdventureEvent.objects.filter(pk=event.pk).update(digest='broken')
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}), patch(
                'system_settings.agent_world.combat.party_daily_backfill.verify_chain', wraps=verify_chain) as checked:
            result = backfill_batch('admin', limit=5, max_seconds=60)
        self.assertEqual(result['created'], 1)
        self.assertEqual([failure['party_id'] for failure in result['failures']], [bad])
        self.assertEqual([call.args[2] for call in checked.call_args_list].count(self.agents[0].pk), 2)

    def test_batch_skips_malformed_wave_sources_and_continues(self):
        from .analytics_models import CombatPartyCoverage
        from .history_snapshot import verify_chain
        from .migration_guard import PROTECTION_ENV
        from .party_daily_backfill import backfill_batch
        from .party_facts import frame, serial
        from .party_models import AdventureEvent, AdventureParty, AdventureWave
        from .store import digest

        first, _ = self.finished_party()
        parties = [first]
        for index in range(2):
            now = self.now + timedelta(minutes=2 + index)
            run = explorations.request('admin', self.agents[0], f'malformed-wave-{index}',
                                       {'adventure_mode': 'solo'}, now=now)
            run = explorations.depart(run.pk, self.plan, now=now)
            party = AdventureParty.objects.get(pk=run.snapshot['party_id'])
            self.force_clear(party, now + timedelta(seconds=15))
            explorations.finish(run.pk, now=now + timedelta(seconds=20))
            parties.append(party)
        parties = sorted(parties, key=lambda party: party.pk)
        for party, field in zip(parties[:2], ('result', 'snapshot')):
            party.refresh_from_db()
            wave = AdventureWave.objects.filter(party_id=party.pk).order_by('number').first()
            if field == 'result':
                wave.result = []
            else:
                wave.snapshot = {**wave.snapshot, 'monsters': list(wave.snapshot['monsters'].values())}
            wave.save(update_fields=[field])
            party.frame = digest(serial(frame(party)))
            party.save(update_fields=['frame'])
        before = AdventureEvent.objects.count()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}), patch(
                'system_settings.agent_world.combat.party_daily_backfill.verify_chain', wraps=verify_chain) as checked:
            result = backfill_batch('admin', limit=5, max_seconds=60)
        self.assertEqual((result['processed'], result['created']), (3, 1))
        self.assertEqual([item['party_id'] for item in result['failures']], [party.pk for party in parties[:2]])
        self.assertIn('组队波次结算内容无效', result['failures'][0]['reason'])
        self.assertIn('values', result['failures'][1]['reason'])
        self.assertEqual(result['next_after'], parties[2].pk)
        self.assertFalse(result['has_more'])
        self.assertEqual(set(CombatPartyCoverage.objects.values_list('pk', flat=True)), {parties[2].pk})
        self.assertEqual(AdventureEvent.objects.count(), before)
        self.assertEqual([call.args[2] for call in checked.call_args_list].count(self.agents[0].pk), 3)

    def test_two_devices_merge_distinct_daily_sources_without_double_counting(self):
        from system_settings.sync_state import canonical_hash
        from utils.sync_manager import SyncManager
        from utils.sync_merge import item_identity, revision_key
        from .migration_guard import PROTECTION_ENV
        from .party_daily_backfill import backfill
        from .party_daily_sync import COVERAGE, DAY
        from .party_models import AdventureParty
        from .sync import metadata, validate_source

        first, _ = self.finished_party()
        run = explorations.request('admin', self.agents[2], 'second-party', {'adventure_mode': 'solo'}, now=self.now)
        explorations.depart(run.pk, self.plan, now=self.now)
        second = AdventureParty.objects.get(leader_id=self.agents[2].pk)
        self.force_clear(second, self.now+timedelta(seconds=15))
        explorations.finish(run.pk, now=self.now+timedelta(seconds=20))
        manager = SyncManager()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            backfill('admin', first.pk)
            local = manager.build_snapshot_data()
            backfill('admin', second.pk)
            remote = manager.build_snapshot_data()
        remote = [row for row in remote if not (row['model'] == COVERAGE and row['pk'] == first.pk)
                  and not (row['model'] == DAY and row['fields']['party_id'] == first.pk)]

        def revisions(data, device):
            return {revision_key(row['model'], item_identity(row)): {
                'hash': canonical_hash(row['fields']), 'revision_at': '2026-11-02T12:00:00',
                'origin_device': device, 'deleted': False} for row in data}

        self.assertTrue(validate_source(local, metadata(local)))
        self.assertTrue(validate_source(remote, metadata(remote)))
        with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
            merged, _, _ = manager.merge_v2_data(None, local, revisions(local, 'a'), {
                'data': remote, 'meta': manager.build_snapshot_meta(data_list=remote),
                'revisions': revisions(remote, 'b')})
        self.assertTrue(validate_source(merged, metadata(merged)))
        self.assertEqual({row['pk'] for row in merged if row['model'] == COVERAGE}, {first.pk, second.pk})
        expected_days = {row['pk']: row['fields'] for row in [*local, *remote] if row['model'] == DAY}
        merged_days = [row for row in merged if row['model'] == DAY]
        self.assertEqual(len(merged_days), len(expected_days))
        self.assertEqual({row['pk']: row['fields'] for row in merged_days}, expected_days)

    def test_publish_refuses_legacy_compaction_that_removes_a_summary_source(self):
        from system_settings.tests import MemoryStorageClient
        from utils.sync_manager import SyncManager
        from .migration_guard import PROTECTION_ENV
        from .party_daily_backfill import backfill

        party, _ = self.finished_party()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            backfill('admin', party.pk)
        with patch.dict(os.environ, {PROTECTION_ENV: '0'}):
            client = MemoryStorageClient()
            manager = SyncManager(client, '/test-backup')
            data = manager.build_snapshot_data()
            receipt = next(row for row in data if row['model'] == FACT
                           and row['fields']['payload'].get('shared_event_id'))
            actor = receipt['fields']['actor_id']
            chain = next(row for row in data if row['model'] == 'system_settings.combatintegrity' and row['pk'] == actor)
            chain['fields']['archive_sequence'] = receipt['fields']['sequence']
            chain['fields']['archive_digest'] = receipt['fields']['digest']
            with self.assertRaises(SyncError):
                manager.publish_v2_snapshot(source='test', data_list=data, revisions={})
            self.assertEqual(client.files, {})

    def test_daily_and_raw_combat_statistics_agree_with_mixed_sources_and_filters(self):
        from ..analytics.combat_kills import load_combat_kills
        from ..analytics.combat_statistics import load_combat_statistics
        from ..life_time import SHANGHAI, storage_time
        from .analytics_models import CombatPartyDay
        from .migration_guard import PROTECTION_ENV
        from .party_daily_backfill import backfill
        from .party_models import AdventureParty

        party, _ = self.finished_party()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            backfill('admin', party.pk)
        other = explorations.request('admin', self.agents[2], 'unsummarized', {'adventure_mode': 'solo'}, now=self.now)
        explorations.depart(other.pk, self.plan, now=self.now)
        other_party = AdventureParty.objects.get(leader_id=self.agents[2].pk)
        self.force_clear(other_party, self.now+timedelta(seconds=15))
        explorations.finish(other.pk, now=self.now+timedelta(seconds=20))
        start = storage_time(datetime.combine(self.now.date(), time.min, SHANGHAI))
        end = start+timedelta(days=1)
        residents = {agent.pk: {'id': agent.pk, 'name': agent.name, 'avatar': '', 'departed': False,
                                'professionName': None} for agent in self.agents[:3]}
        runs = list(explorations.Exploration.objects.filter(owner_id='admin').values_list('pk', flat=True))

        def counts(kills):
            personal = Counter()
            world = {}
            for kill in kills:
                personal[(kill.actor_id, kill.exploration_id, kill.monster.get('id'))] += kill.count
                world[kill.identity] = kill.count
            return personal, sum(world.values())

        for actors in (list(residents), [self.agents[1].pk]):
            for kwargs in ({'start': start, 'end': end}, {'exploration_ids': runs}):
                with self.subTest(actors=actors, kwargs=kwargs):
                    raw = list(load_combat_kills('admin', actor_ids=actors, **kwargs))
                    daily = list(load_combat_kills('admin', actor_ids=actors, include_daily=True, **kwargs))
                    self.assertEqual(counts(daily), counts(raw))
                    if self.agents[1].pk in actors:
                        self.assertTrue(any(kill.identity.startswith('daily:') for kill in daily))
            selected = {actor: residents[actor] for actor in actors}
            self.assertEqual(load_combat_statistics('admin', start, end, selected),
                             load_combat_statistics('admin', start, end, selected, include_daily=True))

        # An incomplete or altered contribution is never used in place of facts.
        CombatPartyDay.objects.filter(party_id=party.pk).update(groups=[])
        raw = list(load_combat_kills('admin', actor_ids=list(residents), start=start, end=end))
        fallback = list(load_combat_kills('admin', actor_ids=list(residents), start=start, end=end, include_daily=True))
        self.assertEqual(counts(fallback), counts(raw))
        self.assertFalse(any(kill.identity.startswith('daily:') for kill in fallback))


class AnalyticsSnapshotTests(TransactionTestCase):
    start = test_parties.PartyServiceTests.start
    join = test_parties.PartyServiceTests.join
    force_clear = test_parties.PartyServiceTests.force_clear
    data = test_parties.PartyServiceTests.data
    finished_party = PartyDailyProjectionTests.finished_party

    def setUp(self):
        from django.db import transaction
        with transaction.atomic():
            test_parties.PartyServiceTests.setUp(self)

    def test_endpoint_uses_consistent_daily_snapshot_and_matches_raw_results(self):
        from contextlib import contextmanager
        from django.contrib.auth.models import User
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        from rest_framework.test import APIClient
        from .migration_guard import PROTECTION_ENV
        from .party_daily_backfill import backfill

        party, _ = self.finished_party()
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            backfill('admin', party.pk)
        user = User.objects.create_superuser('admin', password='test')
        client = APIClient()
        client.force_authenticate(user)
        day = self.now.date().isoformat()
        with CaptureQueriesContext(connection) as queries:
            daily = client.get('/api/settings/agent-world/analytics/', {'start_date': day, 'end_date': day})
        self.assertEqual(daily.status_code, 200, daily.data)
        self.assertTrue(any('system_settings_combatpartyday' in query['sql'].lower() for query in queries))

        @contextmanager
        def raw_snapshot():
            yield False

        with patch('system_settings.agent_world.analytics.views.analytics_snapshot', raw_snapshot):
            raw = client.get('/api/settings/agent-world/analytics/', {'start_date': day, 'end_date': day})
        self.assertEqual(raw.status_code, 200, raw.data)
        self.assertEqual(daily.data['data'], raw.data['data'])

    def test_concurrent_backfill_does_not_mix_two_coverage_states(self):
        import threading
        from django.db import close_old_connections, connections
        from ..analytics.combat_kills import load_combat_kills
        from ..analytics.consistency import analytics_snapshot
        from ..life_time import SHANGHAI, storage_time
        from .migration_guard import PROTECTION_ENV
        from .party_daily_backfill import backfill

        party, _ = self.finished_party()
        start = storage_time(datetime.combine(self.now.date(), time.min, SHANGHAI))
        end = start+timedelta(days=1)
        failures = []

        def write_summary():
            close_old_connections()
            try:
                backfill('admin', party.pk)
            except Exception as exc:  # surfaced in the parent test thread
                failures.append(exc)
            finally:
                connections.close_all()

        with patch.dict(os.environ, {PROTECTION_ENV: '1'}), analytics_snapshot() as enabled:
            self.assertTrue(enabled)
            before = list(load_combat_kills('admin', start=start, end=end, include_daily=True))
            thread = threading.Thread(target=write_summary)
            thread.start()
            thread.join(timeout=30)
            self.assertFalse(thread.is_alive(), '回填线程未及时结束')
            self.assertEqual(failures, [])
            during = list(load_combat_kills('admin', start=start, end=end, include_daily=True))
        after = list(load_combat_kills('admin', start=start, end=end, include_daily=True))
        self.assertFalse(any(row.identity.startswith('daily:') for row in before))
        self.assertEqual(during, before)
        self.assertTrue(any(row.identity.startswith('daily:') for row in after))
        self.assertEqual(sum({row.identity: row.count for row in before}.values()),
                         sum({row.identity: row.count for row in after}.values()))
