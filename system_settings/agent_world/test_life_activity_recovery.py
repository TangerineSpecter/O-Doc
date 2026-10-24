"""Recovery is bounded, idempotent, model-free, and preserves synchronized facts."""
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch
from django.test import TestCase, override_settings
from system_settings.models import AgentExecutionLease, WorldAction
from .fishing import tests as fishing_fixtures
from .combat import test_services as combat_fixtures
from .life_models import LifeItem
from .life_occupancy import occupied
from .life_activity_recovery import reconcile, requeue_busy_failures, BUSY_REASON
from . import test_life_daily as planning_fixtures
PLAN_NOW = planning_fixtures.NOW


@override_settings(USE_TZ=True)
class FishingRecoveryTests(TestCase):
    setUp = fishing_fixtures.FishingTests.setUp
    buy = fishing_fixtures.FishingTests.buy
    trip = fishing_fixtures.FishingTests.trip
    prepared = fishing_fixtures.FishingTests.prepared
    cast_at = fishing_fixtures.FishingTests.cast_at
    king_trip = fishing_fixtures.FishingTests.king_trip

    def test_revoked_and_paused_trips_expire_without_provider_and_return_once(self):
        from .fishing.models import FishingRuntime, FishingEvent
        from .fishing.worker import advance
        from .fishing.sync import checkpoint_all, validate_source, database_data
        from .inventory_stock import stock_quantity
        from system_settings.agent_relation import relation_graph
        trip = self.prepared()
        self.cast_at(trip, minutes=1)
        trip.refresh_from_db()
        FishingRuntime.objects.filter(pk=trip.pk).update(authorized=False)
        node = next(row for row in relation_graph('admin')['nodes'] if row['id'] == self.agent.pk)
        self.assertIn('出钓暂停', node['current_action'])
        before = WorldAction.objects.count()
        with patch('django.utils.timezone.now', return_value=fishing_fixtures.NOW + timedelta(days=1)), \
             patch('system_settings.agent_world.fishing.worker.threading.Thread') as thread, \
             patch('system_settings.agent_world.fishing.decisions.choose_scene', side_effect=AssertionError('不得请求模型')):
            advance(); advance()
        thread.assert_not_called()
        trip.refresh_from_db()
        self.assertIsNotNone(trip.ended_at)
        self.assertEqual(trip.state['casts'], 1)
        self.assertEqual(WorldAction.objects.count(), before)
        self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'bait.worm'), 11)
        self.assertEqual(FishingEvent.objects.filter(trip=trip, kind='return').count(), 1)
        self.assertFalse(occupied(SimpleNamespace(pk='main', actor_id=self.agent.pk)))
        checkpoint_all(); validate_source(database_data())

    def test_paused_trip_with_live_lease_still_has_hard_deadline(self):
        from .fishing.models import FishingRuntime
        trip = self.prepared()
        trip.status = 'paused'; trip.save()
        from system_settings.models import WorldActionRuntime
        WorldActionRuntime.objects.filter(pk='world').update(enabled=False)
        now = fishing_fixtures.NOW + timedelta(days=1)
        FishingRuntime.objects.filter(pk=trip.pk).update(until=now + timedelta(minutes=10), token='stalled')
        with patch('django.utils.timezone.now', return_value=now):
            reconcile(now)
        trip.refresh_from_db()
        self.assertIsNotNone(trip.ended_at)
        self.assertFalse(FishingRuntime.objects.get(pk=trip.pk).authorized)

    def test_late_duel_response_cannot_revive_a_settled_trip(self):
        from .fishing.runner import duel
        from .fishing.models import FishingEvent
        from .fishing.sync import checkpoint_all, validate_source, database_data
        from .life_time import local_time
        trip = self.king_trip()
        self.cast_at(trip, minutes=1, kind='king')
        before = WorldAction.objects.count()
        def late_choice(*args, **kwargs):
            at = local_time(trip.deadline) + timedelta(minutes=6)
            with patch('django.utils.timezone.now', return_value=at):
                reconcile(at)
            return 'rock'
        with patch('system_settings.agent_world.fishing.decisions.choose', side_effect=late_choice):
            duel(trip.pk)
        trip.refresh_from_db()
        self.assertIsNotNone(trip.ended_at)
        self.assertEqual(FishingEvent.objects.filter(trip=trip, kind='duel_round').count(), 0)
        self.assertEqual(WorldAction.objects.count(), before)
        checkpoint_all(); validate_source(database_data())

    def test_stalled_free_trip_yields_to_main_but_healthy_trip_does_not(self):
        from .fishing.models import FishingRuntime
        trip = self.prepared()
        item = LifeItem.objects.get(pk=trip.life_item_id)
        item.context = {'interleaving': {'version': 1, 'expires_at': (fishing_fixtures.NOW + timedelta(hours=1)).isoformat()}}
        item.save()
        main = LifeItem.objects.create(pk='main', owner_id='admin', actor_id=self.agent.pk,
            scheduled_at=fishing_fixtures.NOW, original_at=fishing_fixtures.NOW)
        reconcile(fishing_fixtures.NOW)
        trip.refresh_from_db(); self.assertIsNone(trip.ended_at)
        FishingRuntime.objects.filter(pk=trip.pk).update(authorized=False)
        reconcile(fishing_fixtures.NOW)
        trip.refresh_from_db(); main.refresh_from_db()
        self.assertIsNotNone(trip.ended_at)
        self.assertEqual(main.status, 'pending')
        self.assertFalse(occupied(main))

    def test_revoked_preparation_expires(self):
        from .fishing.models import FishingRuntime
        trip = self.trip()
        FishingRuntime.objects.filter(pk=trip.pk).update(authorized=False)
        with patch('django.utils.timezone.now', return_value=trip.created_at + timedelta(minutes=31)):
            reconcile()
        trip.refresh_from_db()
        self.assertEqual(trip.status, 'cancelled')
        self.assertFalse(occupied(SimpleNamespace(pk='main', actor_id=self.agent.pk)))


class ExplorationRecoveryTests(TestCase):
    setUp = combat_fixtures.ExplorationTests.setUp
    run_trip = combat_fixtures.ExplorationTests.run_trip
    data = combat_fixtures.ExplorationTests.data

    def test_foreign_or_missing_permit_never_blocks_expiry_or_replays_rounds(self):
        from .combat.models import CombatRuntime, CombatFact
        from .combat.sync import validate_source
        from .combat.recovery import deadline
        run = self.run_trip()
        end = deadline(run)
        CombatRuntime.objects.filter(pk=run.pk).delete()
        count = WorldAction.objects.count()
        reconcile(end + timedelta(minutes=1)); reconcile(end + timedelta(minutes=2))
        run.refresh_from_db()
        self.assertIsNotNone(run.ended_at)
        self.assertEqual(run.status, 'completed')
        self.assertEqual(run.elapsed_seconds, 0)
        self.assertEqual(WorldAction.objects.count(), count)
        self.assertEqual(CombatFact.objects.filter(exploration_id=run.pk, kind='terminal').count(), 1)
        self.assertFalse(occupied(SimpleNamespace(pk='main', actor_id=self.agent.pk)))
        validate_source(self.data())

    def test_expiry_preserves_polling_tolerance_and_completes_active_or_paused_runs(self):
        from .combat.models import CombatFact, CombatRuntime
        from .combat.recovery import deadline
        for status in ('active', 'paused'):
            with self.subTest(status=status):
                run = self.run_trip(key='expiry-' + status)
                run.status = status
                run.save(update_fields=['status'])
                if status == 'paused':
                    CombatRuntime.objects.filter(pk=run.pk).update(authorized=False)
                end = deadline(run)
                reconcile(end + timedelta(seconds=5), domain='exploration')
                run.refresh_from_db()
                self.assertIsNone(run.ended_at)
                reconcile(end + timedelta(seconds=6), domain='exploration')
                run.refresh_from_db()
                self.assertEqual(run.status, 'completed')
                terminal = CombatFact.objects.get(exploration_id=run.pk, kind='terminal')
                self.assertEqual(terminal.payload['status'], 'completed')

    def test_stalled_exploration_returning_before_deadline_is_still_recalled(self):
        from .combat.models import CombatFact, CombatRuntime
        run = self.run_trip()
        item = LifeItem.objects.create(pk='free-exploration', owner_id='admin', actor_id=self.agent.pk,
            activity='exploration', status='running', original_at=self.now, scheduled_at=self.now,
            context={'interleaving': {'version': 1}})
        run.life_item_id, run.status = item.pk, 'paused'
        run.save(update_fields=['life_item_id', 'status'])
        CombatRuntime.objects.filter(pk=run.pk).update(authorized=False)
        LifeItem.objects.create(pk='due-main', owner_id='admin', actor_id=self.agent.pk,
            original_at=self.now, scheduled_at=self.now)
        reconcile(self.now + timedelta(minutes=1), domain='exploration')
        run.refresh_from_db(); item.refresh_from_db()
        self.assertEqual(run.status, 'recalled')
        self.assertEqual(item.status, 'completed')
        terminal = CombatFact.objects.get(exploration_id=run.pk, kind='terminal')
        self.assertEqual(terminal.payload['status'], 'recalled')

    def test_preparing_without_authorization_has_finite_lifetime(self):
        from .combat.explorations import request
        from .combat.models import CombatRuntime
        run = request('admin', self.agent, 'prep', {}, now=self.now)
        CombatRuntime.objects.filter(pk=run.pk).update(authorized=False)
        reconcile(run.created_at + timedelta(minutes=31))
        run.refresh_from_db()
        self.assertEqual(run.status, 'interrupted')
        self.assertFalse(occupied(SimpleNamespace(pk='main', actor_id=self.agent.pk)))


@override_settings(USE_TZ=True)
class BusyPlanningRecoveryTests(TestCase):
    setUp = planning_fixtures.DailyPlanningTests.setUp
    item = planning_fixtures.DailyPlanningTests.item

    def test_busy_wait_does_not_exhaust_attempts_and_recovers_old_busy_failures(self):
        from .life_runner import _plan_cycle
        item = self.item('busy-main')
        original = item.scheduled_at
        AgentExecutionLease.objects.create(agent=self.agent, token='busy', until=PLAN_NOW + timedelta(hours=2))
        with patch('system_settings.agent_world.life_runner.ensure_cycle'), patch('system_settings.agent_world.life_runner.ensure_daily_market'), \
             patch('system_settings.agent_world.life_runner.tasks_for', return_value=[]), patch('system_settings.agent_world.life_planner.ask') as ask:
            for index in range(5):
                at = PLAN_NOW + timedelta(minutes=index * 6)
                with patch('django.utils.timezone.now', return_value=at): _plan_cycle(self.config, None, at)
        item.refresh_from_db()
        self.assertEqual(item.attempts, 0)
        self.assertEqual(item.scheduled_at, original)
        self.assertEqual(item.status, 'deferred')
        self.assertEqual(item.revisions.count(), 1)
        ask.assert_not_called()
        item.status, item.attempts, item.result = 'failed', 3, {'reason': BUSY_REASON}
        item.save()
        requeue_busy_failures(self.config, PLAN_NOW); requeue_busy_failures(self.config, PLAN_NOW)
        item.refresh_from_db()
        self.assertEqual((item.status, item.attempts), ('pending', 0))

    def test_busy_resident_does_not_hold_up_another_residents_planning(self):
        from system_settings.models import Agent
        from .life_runner import _plan_cycle
        first = self.item('first-busy', hours=1)
        other = Agent.objects.create(name='另一位居民', model=self.agent.model)
        second = LifeItem.objects.create(pk='other-plan', owner_id='admin', actor_id=other.pk,
            original_at=PLAN_NOW + timedelta(hours=2), scheduled_at=PLAN_NOW + timedelta(hours=2))
        self.config.settings['agent_ids'].append(other.pk); self.config.save()
        AgentExecutionLease.objects.create(agent=self.agent, token='busy', until=PLAN_NOW + timedelta(hours=1))
        with patch('system_settings.agent_world.life_runner.ensure_cycle'), patch('system_settings.agent_world.life_runner.ensure_daily_market'), \
             patch('system_settings.agent_world.life_runner.tasks_for', return_value=[]), patch('system_settings.agent_world.life_runner.plan_items') as plan:
            _plan_cycle(self.config, None, PLAN_NOW)
        plan.assert_called_once()
        self.assertEqual(plan.call_args.args[1].pk, other.pk)
        self.assertEqual([item.pk for item in plan.call_args.args[2]], [second.pk])
        first.refresh_from_db(); self.assertEqual((first.status, first.attempts), ('deferred', 0))

    def test_busy_race_after_precheck_is_waiting_not_failure(self):
        from system_settings.agent_availability import AgentBusyError
        from .life_runner import _plan_cycle
        item = self.item('race')
        with patch('system_settings.agent_world.life_runner.ensure_cycle'), patch('system_settings.agent_world.life_runner.ensure_daily_market'), \
             patch('system_settings.agent_world.life_runner.tasks_for', return_value=[]), \
             patch('system_settings.agent_world.life_runner.plan_items', side_effect=AgentBusyError(BUSY_REASON)):
            _plan_cycle(self.config, None, PLAN_NOW)
        item.refresh_from_db()
        self.assertEqual((item.status, item.attempts), ('deferred', 0))

    def test_backoff_of_first_resident_does_not_block_other_due_items(self):
        from .life_runner import due_item
        first = self.item('first', hours=-1)
        first.context = {'planning_retry_at': (PLAN_NOW + timedelta(minutes=5)).isoformat()}; first.save()
        second = self.item('second', hours=-.5)
        self.assertEqual(due_item(self.config, PLAN_NOW).pk, second.pk)


class ExpiredMarketOccupancyTests(TestCase):
    def test_expired_session_is_not_a_permanent_busy_marker(self):
        from .market_models import MarketSession
        from .life_time import local_time, storage_time
        now = local_time()
        MarketSession.objects.create(pk='expired', owner_id='owner', actor_id='actor',
            actor_name='居民', mode='mcp', expires_at=storage_time(now - timedelta(minutes=1)))
        self.assertFalse(occupied(SimpleNamespace(pk='main', actor_id='actor')))
