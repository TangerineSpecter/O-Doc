from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from decimal import Decimal
from time import monotonic, sleep
from unittest import skipUnless
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import connection, connections, transaction
from django.test import TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Article
from system_settings.models import Agent, AgentActivity
from ..life_models import LifeProfile
from ..models import WorldLedger
from ..lottery_models import LotteryRound, LotteryTicket
from .archive import identity
from .archive_worker import process_one
from .models import ResidentAnalyticsDay, ResidentAnalyticsWork
from .views import AnalyticsView


@skipUnless(connection.vendor == 'postgresql', 'Daily archive uses PostgreSQL transactional revisions')
class DailyReportTests(TransactionTestCase):
    url = '/api/settings/agent-world/analytics/'
    first = date(2026, 10, 1)
    last = date(2026, 10, 2)

    def setUp(self):
        self.user = User.objects.create_superuser('admin', password='local-test')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.agent = Agent.objects.create(name='居民')
        LifeProfile.objects.create(pk=self.agent.pk, owner_id='admin')
        self.collection = Anthology.objects.create(title='测试', type='agent', user_id='another', permission='public')
        self.at = datetime.combine(self.first, datetime.min.time()) + timedelta(hours=12)
        self.article = Article.objects.create(title='测试', coll_id=self.collection.pk, agent_post_author_id=self.agent.pk,
                                              created_at=self.at)
        self.params = {'start_date': str(self.first), 'end_date': str(self.last)}

    def drain(self):
        ResidentAnalyticsWork.objects.filter(dirty=True).update(after=timezone.now())
        for _ in range(32):
            if not process_one():
                break
        self.assertFalse(ResidentAnalyticsWork.objects.filter(dirty=True).exists(),
                         list(ResidentAnalyticsWork.objects.filter(dirty=True).values_list('day', 'error')))

    def test_first_open_and_repeat_only_read_archive_after_backfill(self):
        self.params['end_date'] = '2026-10-30'
        WorldLedger.objects.create(pk='money', agent_id=self.agent.pk, amount=Decimal('0.19'),
                                   kind='income', created_at=self.at)
        AgentActivity.objects.create(event_key='mirror', activity_type='publication', action='publish',
            title='同一作品', status='success', agent=self.agent, artifact_id=self.article.pk,
            artifact_coll_id=self.collection.pk, occurred_at=self.at + timedelta(days=1))
        lottery = LotteryRound.objects.create(pk='round', owner_id='admin', sequence=1, opens_at=self.at,
            closes_at=self.at+timedelta(days=2), draws_at=self.at+timedelta(days=2), rules={})
        for ordinal in (0, 1):
            LotteryTicket.objects.create(pk=f'ticket{ordinal}', owner_id='admin', round=lottery, actor_id=self.agent.pk,
                actor_name='居民', life_item_id='batch', purchase_key='batch', ordinal=ordinal,
                numbers=[1, 2, 3], created_at=self.at+timedelta(days=ordinal))
        with CaptureQueriesContext(connection) as cold:
            response = self.client.get(self.url, self.params)
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data['data']['totalDays'], 30)
        self.assertFalse(any('FROM "system_settings_combatfact"' in q['sql'] for q in cold))
        self.drain()
        for actor in ('', self.agent.pk):
            params = {**self.params, 'actor_id': actor}
            with patch.object(AnalyticsView, 'uses_daily_archive', return_value=False):
                expected = self.client.get(self.url, params).data['data']
            with CaptureQueriesContext(connection) as queries:
                response = self.client.get(self.url, params)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['data'], expected)
            self.assertIn('daily_archive', response.headers['Server-Timing'])
            for sql in (row['sql'] for row in queries):
                for table in ('articles', 'sys_agent_activity', 'system_settings_combatfact', 'system_settings_worldledger',
                              'system_settings_lotteryticket', 'system_settings_fishingevent', 'system_settings_farmoperation'):
                    self.assertNotIn(f'"{table}"', sql)
        LotteryRound.objects.filter(pk=lottery.pk).update(status='settled', result={'winning_numbers': [1, 2, 3]})
        self.drain()
        self.assertEqual(self.client.get(self.url, self.params).data['data']['lotteryStatistics']['overview']['winningTickets'], 2)

    def test_permission_retraction_rollback_and_missing_local_proof(self):
        self.client.get(self.url, self.params)
        self.drain()
        ready = self.client.get(self.url, self.params).data['data']
        self.assertEqual(ready['overview']['publications'], 1)
        with transaction.atomic():
            Anthology.objects.filter(pk=self.collection.pk).update(permission='private')
            self.assertEqual(self.client.get(self.url, self.params).status_code, 202)
            transaction.set_rollback(True)
        self.assertEqual(self.client.get(self.url, self.params).status_code, 200)
        Anthology.objects.filter(pk=self.collection.pk).update(permission='private')
        self.assertEqual(self.client.get(self.url, self.params).status_code, 202)
        self.drain()
        self.assertEqual(self.client.get(self.url, self.params).data['data']['overview']['publications'], 0)
        # Imported summaries without local proof do not become readable.
        ResidentAnalyticsWork.objects.all().delete()
        self.assertEqual(ResidentAnalyticsDay.objects.count(), 2)
        self.assertEqual(self.client.get(self.url, self.params).status_code, 202)
        self.drain()
        self.assertEqual(ResidentAnalyticsDay.objects.count(), 2)
        WorldLedger.objects.create(pk='new', agent_id=self.agent.pk, kind='income', amount=3, created_at=self.at)
        self.assertTrue(ResidentAnalyticsWork.objects.get(pk=identity('admin', self.first)).dirty)
        self.assertFalse(ResidentAnalyticsWork.objects.get(pk=identity('admin', self.last)).dirty)

    def test_sync_proof_validation_missing_summary_and_late_worker(self):
        from django.core import serializers
        import json
        from utils.sync_models import SnapshotModels
        from utils.sync_policy import SyncError
        from .archive import publish
        from .archive_sync import validate
        self.client.get(self.url, self.params)
        self.drain()
        data = json.loads(serializers.serialize('json', ResidentAnalyticsDay.objects.all()))
        validate(data, {'resident_analytics_version': 1})
        with self.assertRaises(SyncError):
            validate(data, {'resident_analytics_version': 3})
        data[0]['fields']['owner_id'] = 'other'
        with self.assertRaises(SyncError):
            validate(data)
        models = SnapshotModels(['system_settings'])
        self.assertNotIn(ResidentAnalyticsWork, set(models.iter_target_models()))
        self.assertIn(ResidentAnalyticsDay, set(models.iter_target_models()))
        self.assertFalse(models.drop_local_only_settings([{'model': ResidentAnalyticsWork._meta.label_lower}]))
        work = ResidentAnalyticsWork.objects.get(pk=identity('admin', self.first))
        old_day = ResidentAnalyticsDay.objects.get(pk=work.pk)
        old_day.delete()
        self.assertEqual(self.client.get(self.url, self.params).status_code, 202)
        self.drain()
        latest = ResidentAnalyticsWork.objects.get(pk=work.pk)
        Anthology.objects.filter(pk=self.collection.pk).update(permission='private')
        publish(latest, old_day.contribution)
        self.assertEqual(self.client.get(self.url, self.params).status_code, 202)
        self.drain()
        self.assertEqual(self.client.get(self.url, self.params).data['data']['overview']['publications'], 0)

    def test_invalid_trip_does_not_hide_another_residents_report(self):
        from ..fishing.models import FishingTrip, FishingEvent
        other = Agent.objects.create(name='其他居民')
        LifeProfile.objects.create(pk=other.pk, owner_id='admin')
        trip = FishingTrip.objects.create(pk='trip', owner_id='admin', actor_id=other.pk, actor_name=other.name,
                                         life_item_id='trip', departed_at=self.at)
        FishingEvent.objects.create(pk='event', trip=trip, sequence=1, kind='cast', created_at=self.at, data=[])
        self.client.get(self.url, self.params)
        with patch('system_logs.capture.capture'):
            self.drain()
        self.assertEqual(self.client.get(self.url, self.params).status_code, 409)
        self.assertEqual(self.client.get(self.url, {**self.params, 'actor_id': other.pk}).status_code, 409)
        self.assertEqual(self.client.get(self.url, {**self.params, 'actor_id': self.agent.pk}).status_code, 200)

    def test_task_transfer_revokes_the_previous_accounts_report(self):
        from system_settings.models import AgentTask
        # A foreign profile excludes this resident from the global directory.
        LifeProfile.objects.filter(pk=self.agent.pk).update(owner_id='other')
        task = AgentTask.objects.create(agent=self.agent, task_kind='fishing', fishing_config={'owner_id': 'admin'})
        params = {**self.params, 'actor_id': self.agent.pk}
        self.client.get(self.url, params)
        self.drain()
        self.assertEqual(self.client.get(self.url, params).status_code, 200)
        AgentTask.objects.filter(pk=task.pk).update(fishing_config={'owner_id': 'other'})
        self.assertEqual(self.client.get(self.url, params).status_code, 202)
        self.drain()
        self.assertEqual(self.client.get(self.url, params).status_code, 403)

    def test_historical_activity_identity_changes_revoke_other_days(self):
        from .archive import enqueue
        def metadata(owner, actor):
            return {'owner_id': owner, 'agentSnapshot': {'id': actor, 'name': actor}}
        event = AgentActivity.objects.create(event_key='history', metadata=metadata('admin', 'retired'),
                                             occurred_at=self.at, title='历史', activity_type='work')
        params = {'start_date': self.last, 'end_date': self.last, 'actor_id': 'retired'}
        self.client.get(self.url, params)
        self.drain()
        self.assertEqual(self.client.get(self.url, params).status_code, 200)
        for owner in ('other', 'third'):
            enqueue(owner, [self.last])
            ResidentAnalyticsWork.objects.filter(owner_id=owner).update(verified_digest='ready', dirty=False)
        AgentActivity.objects.filter(pk=event.pk).update(metadata=metadata('other', 'retired'))
        self.assertEqual(self.client.get(self.url, params).status_code, 202)
        self.assertEqual(ResidentAnalyticsWork.objects.get(owner_id='other').verified_digest, '')
        self.assertEqual(ResidentAnalyticsWork.objects.get(owner_id='third').verified_digest, 'ready')
        self.drain()
        self.assertEqual(self.client.get(self.url, params).status_code, 403)
        AgentActivity.objects.filter(pk=event.pk).update(metadata=metadata('admin', 'retired'))
        self.drain()
        self.assertEqual(self.client.get(self.url, params).status_code, 200)
        AgentActivity.objects.filter(pk=event.pk).update(metadata=metadata('admin', 'replacement'))
        self.assertEqual(self.client.get(self.url, params).status_code, 202)
        self.drain()
        self.assertEqual(self.client.get(self.url, params).status_code, 403)

    def test_completed_fingerprint_and_live_backlog_outside_report_range(self):
        from ..combat.party_models import AdventureParty
        from ..combat.analytics_models import CombatPartyCoverage
        self.client.get(self.url, self.params)
        self.drain()
        after = self.at + timedelta(days=10)
        party = AdventureParty.objects.create(pk='later', owner_id='admin', status='completed',
                                             created_at=after, ends_at=after)
        def has_backlog():
            response = self.client.get(self.url, self.params)
            self.assertEqual(response.status_code, 200)
            return any('战斗历史统计已生成' in note for note in response.data['data']['notes'])
        self.assertTrue(has_backlog())
        CombatPartyCoverage.objects.create(pk=party.pk, owner_id='admin')
        self.assertFalse(has_backlog())
        for field, value in [('head', 1), ('digest', 'new'), ('frame', 'v2'), ('frame_version', 2)]:
            with self.subTest(field=field):
                ResidentAnalyticsWork.objects.filter(owner_id='admin').update(verified_digest='old', dirty=False)
                AdventureParty.objects.filter(pk=party.pk).update(**{field: value})
                self.assertFalse(ResidentAnalyticsWork.objects.filter(owner_id='admin').exclude(verified_digest='').exists())
                self.assertEqual(self.client.get(self.url, self.params).status_code, 202)

    def assert_work_lock_waiting(self, mode):
        with connection.cursor() as cursor:
            deadline = monotonic() + 5
            while monotonic() < deadline:
                cursor.execute("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE relation=to_regclass(%s)"
                               " AND mode=%s AND NOT granted)", [ResidentAnalyticsWork._meta.db_table, mode])
                if cursor.fetchone()[0]:
                    return
                sleep(.02)
        self.fail(f'no pending {mode} on the archive work table')

    def test_first_enqueue_waits_for_uncommitted_visibility_change(self):
        from .archive import enqueue
        from user.models import UserProfile
        UserProfile.objects.update_or_create(user=self.user, defaults={'userid': 'admin'})

        def first_build():
            try:
                enqueue('admin', [self.first])
                return process_one()
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=1) as pool:
            with transaction.atomic():
                Anthology.objects.filter(pk=self.collection.pk).update(permission='private')
                future = pool.submit(first_build)
                self.assert_work_lock_waiting('ShareRowExclusiveLock')
            self.assertTrue(future.result(timeout=10))
        response = self.client.get(self.url, {**self.params, 'end_date': self.first})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['overview']['publications'], 0)

    def test_source_waiting_on_first_enqueue_revokes_the_new_proof(self):
        from .archive import enqueue

        def change_visibility():
            try:
                Anthology.objects.filter(pk=self.collection.pk).update(permission='private')
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=1) as pool:
            with transaction.atomic():
                enqueue('admin', [self.first])
                ResidentAnalyticsWork.objects.update(dirty=False, verified_digest='old')
                future = pool.submit(change_visibility)
                self.assert_work_lock_waiting('RowExclusiveLock')
            future.result(timeout=10)
        self.assertEqual(ResidentAnalyticsWork.objects.get(owner_id='admin').verified_digest, '')

    def test_reordered_ledger_yields_identical_digest(self):
        from types import SimpleNamespace
        from .day_projection import project_day
        from .queries import load_facts
        from system_settings.sync_state import canonical_hash
        for kind, value in [('bonus', '1.00'), ('bonus', '-3.00'), ('sale', '2.00')]:
            WorldLedger.objects.create(pk=f'{kind}:{value}', agent_id=self.agent.pk, amount=Decimal(value),
                                       kind=kind, created_at=self.at)
        def reverse_ledger(*args, **kwargs):
            facts = load_facts(*args, **kwargs)
            facts.ledger = list(reversed(list(facts.ledger)))
            return facts
        args = (SimpleNamespace(user=self.user), 'admin', self.first, True)
        before = project_day(*args)
        with patch('system_settings.agent_world.analytics.day_projection.load_facts', side_effect=reverse_ledger):
            after = project_day(*args)
        self.assertEqual(len(before['ledger']), 3)
        self.assertEqual(canonical_hash(before), canonical_hash(after))

    def test_private_combat_writes_only_dirty_the_affected_accounts(self):
        from ..combat.models import CombatFact
        from .archive import enqueue
        for owner in ('admin', 'other', 'third'):
            enqueue(owner, [self.first])
        tasks = ResidentAnalyticsWork.objects.all()
        tasks.update(dirty=False, verified_digest='ready')
        fact = CombatFact.objects.create(pk='round', kind='round', owner_id='admin', actor_id=self.agent.pk,
                                         sequence=1, digest='test', created_at=self.at)
        self.assertEqual(list(tasks.filter(dirty=True).values_list('owner_id', flat=True)), ['admin'])
        tasks.update(dirty=False)
        CombatFact.objects.filter(pk=fact.pk).update(owner_id='other')
        self.assertEqual(set(tasks.filter(dirty=True, verified_digest='').values_list('owner_id', flat=True)),
                         {'admin', 'other'})
        self.assertEqual(tasks.get(owner_id='third').verified_digest, 'ready')

    def test_removed_owner_work_is_cleared_without_retry_or_touching_other_owners(self):
        from .archive import enqueue
        enqueue('removed', [self.first, self.last])
        enqueue('admin', [self.first])
        ResidentAnalyticsWork.objects.filter(owner_id='admin').update(after=timezone.now()+timedelta(hours=1))
        with patch('system_settings.agent_world.analytics.archive_worker.logger.exception') as log:
            self.assertTrue(process_one())
            log.assert_not_called()
        self.assertFalse(ResidentAnalyticsWork.objects.filter(owner_id='removed').exists())
        self.assertTrue(ResidentAnalyticsWork.objects.filter(owner_id='admin', dirty=True).exists())
        self.assertFalse(process_one())

    def test_cross_day_article_mirror_only_counts_within_selected_range(self):
        from article.models import ArticlePostComment
        Article.objects.filter(pk=self.article.pk).update(agent_post_author_id='')
        comment = ArticlePostComment.objects.create(article=self.article, creator_id='reader', creator_name='读者')
        ArticlePostComment.objects.filter(pk=comment.pk).update(created_at=self.at)
        self.client.get(self.url, self.params)
        self.drain()
        # A later mirror must repair the two-day report even when the first
        # day was already published and never dirtied by that insert.
        AgentActivity.objects.create(event_key='publish-mirror', activity_type='publication', action='publish',
            status='success', agent=self.agent, artifact_id=self.article.pk, artifact_article_id=self.article.pk,
            artifact_coll_id=self.collection.pk, occurred_at=self.at+timedelta(days=1))
        self.drain()
        for start, end, received in ((self.first, self.last, 1), (self.first, self.first, 0), (self.last, self.last, 0)):
            params = {'start_date': str(start), 'end_date': str(end)}
            with patch.object(AnalyticsView, 'uses_daily_archive', return_value=False):
                expected = self.client.get(self.url, params).data['data']
            response = self.client.get(self.url, params)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['data'], expected)
            self.assertEqual(expected['overview']['received'], received)
            if start != end:
                self.assertEqual([d['behaviors'] for d in expected['daily']], [1, 0])


class HistoryQueueTests(TransactionTestCase):
    def test_recent_only_and_complete_ranges_do_not_load_historical_days(self):
        from .archive import days_between, enqueue
        from .archive_history import enqueue_history
        today = date(2026, 11, 17)
        last = today - timedelta(days=30)
        with self.assertNumQueries(0):
            enqueue_history('owner', last + timedelta(days=1), today)
        first = last - timedelta(days=365)
        enqueue('owner', days_between(first, last))
        with CaptureQueriesContext(connection) as queries:
            enqueue_history('owner', first, today)
        self.assertEqual(len(queries), 1)
        self.assertIn('COUNT(', queries[0]['sql'])

    def test_fill_newest_gaps_before_older_ones_until_complete(self):
        from .archive import days_between, enqueue
        from .archive_history import enqueue_history
        today = date(2026, 11, 17)
        last = today - timedelta(days=30)
        first = last - timedelta(days=38)
        days = days_between(first, last)
        enqueue('other', days)
        enqueue('owner', days[1::2])
        missing = days[::2]
        work = ResidentAnalyticsWork.objects.filter(owner_id='owner')
        enqueue_history('owner', first, today)
        self.assertEqual(set(work.values_list('day', flat=True)), set(days[1::2] + missing[-15:]))
        enqueue_history('owner', first, today)
        self.assertEqual(set(work.values_list('day', flat=True)), set(days))
