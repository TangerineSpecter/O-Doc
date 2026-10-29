"""Isolated tournament rules, lifecycle, assets and read-only API contracts."""
import copy
import json
from datetime import timedelta
from unittest.mock import patch
from pathlib import Path
from tempfile import TemporaryDirectory
from django.apps import apps
from django.contrib.auth.models import User
from django.core import serializers
from django.test import TestCase, SimpleTestCase
from rest_framework.test import APIClient
from system_settings.models import Agent, AIProvider, AIModel, WorldActionRuntime
from system_settings.sync_state import LOCAL_ONLY_MODEL_LABELS
from .combat.models import CombatProfile, EquipmentInstance, CombatFact
from .combat.profiles import ensure
from .combat.store import install
from .combat.sync import validate_source as validate_combat, metadata as combat_metadata
from .life_time import local_time, storage_time
from .tournament_rules import draw, key, at_two, next_sunday
from .tournament_models import Tournament, TournamentRound, TournamentMatch, TournamentReward, TournamentRuntime
from .tournament_service import create_due, advance, match_input, commit_match
from .tournament_rewards import prepare, roll, grant, templates
from .tournament_sync import checkpoint_all, validate_source, metadata, validate_conflicts


class TournamentRuleTests(SimpleTestCase):
    def test_draw_is_seeded_complete_and_fair_to_previous_byes(self):
        for count in (2, 3, 5, 10, 32, 64, 65, 129):
            actors = [str(i) for i in range(count)]
            pairs = draw(actors, {actors[0]: 1}, 'seed')
            self.assertEqual(draw(actors, {actors[0]: 1}, 'seed'), pairs)
            self.assertCountEqual([a for pair in pairs for a in pair if a], actors)
            self.assertEqual(len(pairs), (count + 1) // 2)
            if count % 2:
                self.assertNotEqual(pairs[0][0], actors[0])

    def test_first_sunday_is_strictly_future(self):
        sunday = local_time().date()
        sunday += timedelta(days=(6 - sunday.weekday()) % 7)
        self.assertEqual(next_sunday(sunday), sunday + timedelta(days=7))


class TournamentTests(TestCase):
    def setUp(self):
        directory = TemporaryDirectory(prefix='odoc-tournament-test-')
        self.addCleanup(directory.cleanup)
        root = Path(directory.name).resolve()
        self.enterContext(self.settings(MEDIA_ROOT=root / 'media', SYSTEM_LOG_DIR=str(root / 'logs'),
                                        ODOC_WORLD_LOCK_PATH=str(root / 'world.lock')))
        install()
        self.provider = AIProvider.objects.create(name='fixture', type='OpenAi', base_url='https://example.invalid')
        self.model = AIModel.objects.create(name='fixture', type='chat', provider=self.provider)
        self.user = User.objects.create_user('tournament-owner', password='fixture-only')
        from types import SimpleNamespace
        from utils.drf_utils import get_current_user_identifier
        self.owner = get_current_user_identifier(SimpleNamespace(user=self.user))
        self.sunday = next_sunday(local_time().date())
        self.agents = []

    def actors(self, count):
        for i in range(len(self.agents), count):
            actor = Agent.objects.create(id=f'tournament-actor-{i}', name=f'选手{i}', model=self.model)
            ensure(self.owner, actor)
            self.agents.append(actor)
        return self.agents

    def event(self, count=4):
        self.actors(count)
        create_due(self.owner, at_two(self.sunday - timedelta(days=3)))
        return create_due(self.owner, at_two(self.sunday))

    def finish(self, event):
        for _ in range(20):
            row = event.rounds.filter(status='pending').first()
            if not row:
                break
            for match in row.matches.select_related('round__tournament'):
                report, result = match_input(match)
                commit_match(match.pk, report, result, now=row.scheduled_at)
            advance(row.pk, row.scheduled_at)
        event.refresh_from_db()
        return event

    def exported(self):
        checkpoint_all()
        objects = [obj for model in apps.get_app_config('system_settings').get_models()
                   if model._meta.label_lower not in LOCAL_ONLY_MODEL_LABELS for obj in model.objects.all()]
        return json.loads(serializers.serialize('json', objects))

    def test_zero_and_one_do_not_award(self):
        for count in (0, 1):
            with self.subTest(count=count):
                self.sunday += timedelta(days=7)
                event = self.event(count)
                self.assertEqual(event.status, 'skipped')
                self.assertFalse(event.rounds.exists())
                self.assertFalse(event.rewards.exists())

    def test_missing_sunday_not_created_retroactively(self):
        self.actors(2)
        create_due(self.owner, at_two(self.sunday - timedelta(days=3)))
        self.assertIsNone(create_due(self.owner, at_two(self.sunday + timedelta(days=1))))
        self.assertFalse(Tournament.objects.exists())

    def test_all_population_sizes_finish_by_saturday_and_preliminaries_stay_sunday(self):
        self.actors(129)
        for count in (5, 10, 32, 64, 65, 129):
            with self.subTest(count=count):
                self.sunday += timedelta(days=7)
                included = [a.pk for a in self.agents[:count]]
                Agent.objects.all().update(archived_at=storage_time(local_time()))
                Agent.objects.filter(pk__in=included).update(archived_at=None)
                event = self.finish(self.event(count))
                self.assertEqual(event.status, 'completed')
                self.assertEqual(len(event.result['podium']), 3)
                self.assertLessEqual(event.rounds.order_by('-number').first().scheduled_at.date(), self.sunday + timedelta(days=6))
                if count > 64:
                    for row in event.rounds.filter(phase='preliminary'):
                        self.assertEqual(row.scheduled_at.date(), self.sunday)
                if count == 64:
                    self.assertEqual(event.rounds.get(phase='final').scheduled_at.date(), self.sunday + timedelta(days=6))
        validate_source(self.exported())

    def test_three_people_have_early_final_and_one_bronze(self):
        event = self.finish(self.event(3))
        self.assertEqual(event.status, 'completed')
        self.assertEqual(event.rounds.count(), 2)
        self.assertEqual(event.rounds.get(number=2).scheduled_at.date(), self.sunday + timedelta(days=2))
        self.assertEqual(set(event.result['podium']), {'1', '2', '3'})
        self.assertEqual(len(set(event.result['podium'].values())), 3)
        self.assertFalse(TournamentMatch.objects.filter(kind='bronze').exists())

    def test_four_people_have_bronze_match_and_two_have_no_bronze(self):
        event = self.finish(self.event(4))
        self.assertEqual(TournamentMatch.objects.filter(round__tournament=event, kind='bronze').count(), 1)
        self.assertEqual(event.rewards.count(), 3)
        self.sunday += timedelta(days=7)
        self.agents[2].archived_at = storage_time(local_time())
        self.agents[2].save()
        self.agents[3].delete()
        event = self.finish(self.event(2))
        self.assertEqual(set(event.result['podium']), {'1', '2'})

    def test_archive_during_match_is_withdrawal(self):
        event = self.event(2)
        match = event.rounds.first().matches.first()
        report, result = match_input(match)
        Agent.objects.filter(pk=result['winner_id']).update(archived_at=storage_time(local_time()))
        commit_match(match.pk, report, result, now=match.round.scheduled_at)
        match.refresh_from_db()
        self.assertEqual(match.result['reason'], 'withdrawal')
        self.assertFalse(match.report)
        advance(match.round_id, match.round.scheduled_at)
        event.refresh_from_db()
        self.assertEqual(len(event.result['podium']), 1)

    def test_repeat_progress_and_grant_do_not_duplicate_assets(self):
        event = self.finish(self.event())
        before = list(CombatProfile.objects.values('id', 'hp', 'mp', 'progression', 'loadout', 'recovered_at'))
        with patch('system_settings.agent_world.tournament_decision.choose_scene', side_effect=TimeoutError):
            for reward in event.rewards.all():
                roll(reward.pk)
                grant(reward.pk)
                roll(reward.pk)
                grant(reward.pk)
        self.assertEqual(list(CombatProfile.objects.values('id', 'hp', 'mp', 'progression', 'loadout', 'recovered_at')), before)
        self.assertEqual(EquipmentInstance.objects.filter(bound=False).count(), 2)
        self.assertEqual(CombatFact.objects.filter(kind='tournament_reward').count(), 2)
        from .travel_models import AgentInventoryItem
        potions = list(AgentInventoryItem.objects.filter(source__sku__startswith='elixir.'))
        self.assertEqual(sum(p.quantity for p in potions), 3)
        self.assertTrue(all(p.source['stars'] == 1 for p in potions))
        data = self.exported()
        validate_source(data, metadata(data))
        validate_combat(data, combat_metadata(data))
        from .alchemy_quality_sync import validate_source as validate_alchemy, metadata as alchemy_metadata
        validate_alchemy(data, alchemy_metadata(data))

    def test_reward_grant_is_atomic_on_failure(self):
        event = self.finish(self.event(2))
        reward = event.rewards.get(place=1)
        roll(reward.pk)
        with patch('system_settings.agent_world.tournament_rewards.append', side_effect=ValueError('fixture')):
            with self.assertRaises(ValueError):
                grant(reward.pk)
        reward.refresh_from_db()
        self.assertEqual(reward.status, 'rolled')
        self.assertFalse(EquipmentInstance.objects.filter(pk=reward.result['equipment_id']).exists())
        grant(reward.pk)

    def test_used_and_sold_rewards_keep_valid_provenance(self):
        event = self.finish(self.event())
        for reward in event.rewards.all():
            roll(reward.pk)
            grant(reward.pk)
        from .inventory_stock import take_stock
        from .alchemy_sync import checkpoint
        bronze = event.rewards.get(place=3)
        for potion in bronze.result['potions']:
            take_stock(bronze.actor_id, self.owner, 'elixir.' + potion['recipe_id'], 1)
        checkpoint(self.owner)
        from .market_sessions import enter
        from .market_service import trade
        from system_settings.models import SystemSetting
        # Use the public equipment-sale domain so the money and provenance facts agree.
        winner = event.rewards.get(place=1)
        actor = Agent.objects.get(pk=winner.actor_id)
        profile = CombatProfile.objects.get(pk=actor.pk)
        SystemSetting.objects.update_or_create(pk='system_mcp_config', defaults={'value': {'enabled': True}})
        session = enter(self.owner, actor, 'reward-sale-session')
        trade(session, actor, 'reward-sale', {'kind': 'sell_combat_equipment', 'equipment_id': winner.result['equipment_id'], 'quantity': 1})
        self.assertTrue(EquipmentInstance.objects.get(pk=winner.result['equipment_id']).sold)
        data = self.exported()
        validate_source(data)
        validate_combat(data, combat_metadata(data))

    def test_overtime_disables_all_healing_and_uses_both_resident_actions(self):
        from .tournament_battle import participant, simulate
        self.actors(2)
        inputs = [participant(CombatProfile.objects.get(pk=a.pk), a.name) for a in self.agents]
        calls = []
        def action(catalog, actor, opponent, carried, tick, style, rng):
            calls.append((actor['name'], tick, catalog.overtime))
            self.assertEqual(carried, {})
            return []
        original = copy.deepcopy([item[0] for item in inputs])
        with patch('system_settings.agent_world.tournament_battle.engine.player_action', side_effect=action):
            report = simulate(*inputs, 'overtime-fixture')
        self.assertEqual(len(report['rounds']), 250)
        self.assertEqual(report['reason'], 'overtime_draw')
        self.assertEqual(len(calls), 500)
        self.assertEqual({actor for actor, _, _ in calls}, {a.pk for a in self.agents})
        self.assertEqual([item[0] for item in inputs], original)

    def test_profession_skills_work_for_both_sides_and_overtime_filters_healing(self):
        from .combat import attributes, engine
        from .combat.catalog import bundled
        from .tournament_battle import DuelCatalog, simulate
        catalog = bundled()[0]
        inputs = []
        for job in ('job.mage', 'job.priest'):
            progress = attributes.initial()
            progress.update(job=job, level=20, skills=catalog.learned(job, 20))
            stats = attributes.attributes(catalog, progress, [])
            entity = engine.fighter(stats, job, 20, skills=progress['skills'],
                                    passives=attributes.passives(catalog, progress['skills'], []))
            inputs.append((entity, catalog, {'actor_id': job}))
        actions = {job: set() for job in ('job.mage', 'job.priest')}
        for seed in range(8):
            report = simulate(*inputs, str(seed))
            for row in report['rounds']:
                for event in row['events']:
                    if event['actor'] in actions:
                        actions[event['actor']].add(event['action'])
        self.assertIn('魔力弹', actions['job.mage'])
        self.assertIn('治愈术', actions['job.priest'])
        _, regular = DuelCatalog(catalog).skill('skill.player.010', 1)
        _, overtime = DuelCatalog(catalog, True).skill('skill.player.010', 1)
        self.assertTrue(any(e['code'] == 'heal' for e in regular))
        self.assertFalse(any(e['code'] in ('heal', 'hot') for e in overtime))

    def test_snapshot_semantics_reject_reassigned_winners_even_with_fresh_digest(self):
        event = self.finish(self.event(4))
        data = self.exported()
        from utils.sync_manager import SyncError
        for row in data:
            if row['model'] == 'system_settings.tournament' and row['pk'] == event.pk:
                podium = row['fields']['result']['podium']
                podium['1'], podium['2'] = podium['2'], podium['1']
            if row['model'] == 'system_settings.tournamentreward' and row['fields']['tournament'] == event.pk:
                row['fields']['actor_id'] = event.result['podium']['2' if row['fields']['place'] == 1 else '1' if row['fields']['place'] == 2 else '3']
        with self.assertRaises(SyncError):
            validate_source(data, check_digest=False)

    def test_revoked_execution_cannot_commit_match_or_reward(self):
        event = self.event(2)
        match = event.rounds.first().matches.first()
        report, result = match_input(match)
        def revoked():
            raise ValueError('revoked')
        with self.assertRaisesMessage(ValueError, 'revoked'):
            commit_match(match.pk, report, result, revoked, match.round.scheduled_at)
        self.assertEqual(TournamentMatch.objects.get(pk=match.pk).status, 'pending')
        event = self.finish(event)
        reward = event.rewards.get(place=1)
        roll(reward.pk)
        with self.assertRaisesMessage(ValueError, 'revoked'):
            grant(reward.pk, revoked)
        self.assertFalse(EquipmentInstance.objects.filter(pk=TournamentReward.objects.get(pk=reward.pk).result['equipment_id']).exists())

    def test_rewards_can_be_unwearable_and_levels_stay_within_bounds(self):
        event = self.finish(self.event(2))
        reward = event.rewards.get(place=1)
        for level in (1, 20, 99):
            profile = CombatProfile.objects.get(pk=reward.actor_id)
            profile.progression['level'] = level
            profile.save()
            reward.plan = {}
            reward.save()
            value = prepare(reward.pk)
            self.assertTrue(max(1, level - 5) <= value.plan['level'] <= min(99, level + 5))
            self.assertEqual(set(value.plan['wearing'][0]), {'slot', 'quality'})
            if level == 99:
                self.assertNotIn('weapon', value.plan['slots'])

    def test_reward_decision_has_minimal_context_and_illegal_choice_falls_back(self):
        event = self.finish(self.event(2))
        reward = event.rewards.get(place=1)
        with patch('system_settings.agent_world.tournament_decision.choose_scene', return_value='illegal') as ask:
            roll(reward.pk)
        self.assertEqual(set(ask.call_args.args[3]), {'equipment', 'reward_quality', 'available_slots'})
        self.assertFalse(ask.call_args.kwargs['include_role'])
        reward.refresh_from_db()
        self.assertEqual(reward.result['source'], 'code_fallback')

    def test_corrupt_and_conflicting_snapshots_are_rejected(self):
        event = self.finish(self.event(2))
        data = self.exported()
        damaged = [r for r in copy.deepcopy(data) if r['model'] != 'system_settings.tournamentreward']
        from utils.sync_manager import SyncError
        with self.assertRaises(SyncError):
            validate_source(damaged, metadata(data))
        remote = copy.deepcopy(data)
        row = next(r for r in remote if r['model'] == 'system_settings.tournamentmatch' and r['fields']['report'])
        row['fields']['result']['reason'] = 'different'
        with self.assertRaises(SyncError):
            validate_conflicts(data, remote)

    def test_full_snapshot_round_trip_preserves_awards_and_revokes_local_execution(self):
        from utils.sync_manager import SyncManager
        from system_settings.tests import MemoryStorageClient
        from .life_config import config_for
        event = self.finish(self.event(4))
        config_for(self.owner)
        for reward in event.rewards.all():
            roll(reward.pk)
            grant(reward.pk)
        manager = SyncManager(MemoryStorageClient(), '/backup')
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        self.assertEqual(meta['tournament_schema_version'], 2)
        self.assertEqual(meta['combat_schema_version'], 17)
        self.assertFalse(any(r['model'] == 'system_settings.tournamentruntime' for r in data))
        before = list(event.rewards.order_by('place').values('id', 'result', 'status'))
        for _ in range(2):
            TournamentRuntime.objects.update_or_create(pk='tournament-runner', defaults={'token': 'fixture'})
            manager.apply_snapshot_data(copy.deepcopy(data), meta, full_overwrite=True)
            self.assertEqual(TournamentRuntime.objects.get(pk='tournament-runner').token, '')
            self.assertEqual(list(event.rewards.order_by('place').values('id', 'result', 'status')), before)
            self.assertEqual(EquipmentInstance.objects.filter(bound=False).count(), 2)

    def test_read_api_is_account_isolated_and_does_not_create(self):
        client = APIClient()
        client.force_authenticate(self.user)
        base = '/api/settings/agent-world/tournaments/'
        self.assertEqual(client.get(base + 'current/').status_code, 200)
        self.assertFalse(TournamentRuntime.objects.exists())
        event = self.finish(self.event(2))
        response = client.get(base + event.pk + '/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('participantCount', response.json()['data'])
        self.assertEqual(client.get(base, {'page': 0}).status_code, 400)
        other = User.objects.create_user('other', password='fixture-only')
        client.force_authenticate(other)
        self.assertEqual(client.get(base + event.pk + '/').status_code, 404)
        client.force_authenticate(None)
        self.assertIn(client.get(base).status_code, (401, 403))

    def test_runner_follows_world_switch_and_replays_existing_rounds(self):
        from .tournament_runner import run
        event = self.event(3)
        WorldActionRuntime.objects.update_or_create(pk='world', defaults={'enabled': False})
        run(at_two(self.sunday + timedelta(days=6)))
        self.assertFalse(TournamentMatch.objects.filter(status='done').exists())
        WorldActionRuntime.objects.filter(pk='world').update(enabled=True)
        run(at_two(self.sunday + timedelta(days=6)))
        event.refresh_from_db()
        self.assertEqual(event.status, 'completed')
        self.assertFalse(event.rewards.exclude(status='granted').exists())
