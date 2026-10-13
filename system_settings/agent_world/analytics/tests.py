from datetime import datetime, timedelta
from decimal import Decimal
from django.contrib.auth.models import User
from django.test import TestCase, SimpleTestCase
from rest_framework.test import APIClient
from anthology.models import Anthology
from article.models import Article, ArticlePostComment, ArticleAnnotation, ArticleAnnotationComment
from system_settings.models import Agent, AgentActivity, AgentTask, AgentRunRecord
from ..life_models import LifeProfile
from ..life_time import SHANGHAI, storage_time
from ..models import WorldLedger
from ..farm_models import AgentFarm, FarmOperation
from ..travel_models import TravelJourney
from ..social_models import Moment, MomentComment
from ..combat.models import CombatFact, CombatEncounter, Exploration
from .views import AnalyticsParams


class RangeTests(SimpleTestCase):
    def test_validation(self):
        for start, end, expected in [('2026-01-01', '2027-01-01', True), ('2026-01-01', '2027-01-02', False),
                                      ('2026-02-02', '2026-02-01', False), ('bad', '2026-01-01', False),
                                      ('9999-12-31', '9999-12-31', False)]:
            with self.subTest(start=start, end=end):
                self.assertEqual(AnalyticsParams(data={'start_date': start, 'end_date': end}).is_valid(), expected)


class AnalyticsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser('admin', password='test')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.a = Agent.objects.create(name='居民甲')
        self.b = Agent.objects.create(name='居民乙')
        for agent in (self.a, self.b): LifeProfile.objects.create(pk=agent.pk, owner_id='admin')
        self.at = storage_time(datetime(2026, 10, 1, 12, tzinfo=SHANGHAI))
        self.coll = Anthology.objects.create(title='居民作品', type='agent', user_id='admin')
        self.post = Article.objects.create(title='作品', content='测试', coll_id=self.coll.pk,
            agent_post_author_id=self.a.pk, agent_post_creator_name=self.a.name, created_at=self.at)

    def fetch(self, actor='', **params):
        response = self.client.get('/api/settings/agent-world/analytics/', {
            'start_date': '2026-10-01', 'end_date': '2026-10-02', 'actor_id': actor, **params})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data['data']

    def activity(self, **values):
        return AgentActivity.objects.create(event_key=values.pop('event_key', 'event'), agent=self.a,
            title='活动', occurred_at=self.at, artifact_coll_id=self.coll.pk, **values)

    def test_ledger_endpoint_returns_visible_resident_entries(self):
        WorldLedger.objects.create(pk='ledger-detail', agent_id=self.a.pk, kind='income',
                                   amount=Decimal('12.50'), created_at=self.at)
        response = self.client.get('/api/settings/agent-world/analytics/ledger/', {
            'start_date': '2026-10-01', 'end_date': '2026-10-02', 'actor_id': self.a.pk,
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data['data']['items']), 1)
        self.assertEqual(response.data['data']['items'][0]['id'], 'ledger-detail')

    def test_publication_dedup_and_failed_events(self):
        self.activity(activity_type='publication', artifact_kind='agentPost', artifact_id=self.post.pk, artifact_article_id=self.post.pk)
        self.activity(event_key='duplicate', activity_type='publication', artifact_kind='agentPost', artifact_id=self.post.pk)
        self.activity(event_key='failed', activity_type='publication', status='failed', artifact_id='failed')
        result = self.fetch()
        self.assertEqual(result['overview']['publications'], 1)
        self.assertEqual(sum(day['behaviors'] for day in result['daily']), 1)
        self.assertEqual(result['daily'][1]['behaviors'], 0)
        self.assertEqual(result, self.fetch())

    def test_native_received_and_legacy_name_not_rebound(self):
        comment = ArticlePostComment.objects.create(article=self.post, content='回复', creator_id='agent:居民乙', actor_agent_id=self.b.pk)
        ArticlePostComment.objects.filter(pk=comment.pk).update(created_at=self.at)
        self.activity(event_key='comment:'+comment.pk, activity_type='interaction', action='comment',
            artifact_kind='articleComment', artifact_id=comment.pk, artifact_article_id=self.post.pk,
            counterpart_id='agent:居民甲', counterpart_type='agent')
        result = self.fetch(self.a.pk)
        self.assertEqual(result['overview']['received'], 1)
        self.assertEqual(self.fetch(self.b.pk)['overview']['interactions'], 1)
        self.assertEqual(result['peers'][0]['id'], self.b.pk)

    def test_user_interaction_received_without_resident_activity(self):
        row = ArticlePostComment.objects.create(article=self.post, content='用户评论', creator_id='user:admin', creator_name='用户')
        ArticlePostComment.objects.filter(pk=row.pk).update(created_at=self.at)
        result = self.fetch(self.a.pk)
        self.assertEqual(result['overview']['received'], 1)
        self.assertEqual(result['overview']['interactions'], 0)

    def test_money_boundaries_and_double_sided_flow(self):
        for key, actor, kind, amount, at in [('opening', self.a, 'opening', '10000', self.at),
            ('in', self.a, 'market', '0.10', self.at), ('out', self.b, 'market', '-0.10', self.at),
            ('last', self.a, 'post', '0.20', self.at.replace(day=2, hour=23, minute=59)),
            ('excluded', self.a, 'post', '9.99', self.at.replace(day=3, hour=0))]:
            WorldLedger.objects.create(pk=key, agent_id=actor.pk, kind=kind, amount=Decimal(amount), created_at=at)
        result = self.fetch()
        self.assertEqual(result['overview']['income'], '0.30')
        self.assertEqual(result['overview']['expense'], '0.10')
        self.assertEqual(result['overview']['net'], '0.20')
        self.assertEqual(sum(Decimal(row['income']) for row in result['daily']), Decimal('0.30'))
        self.assertEqual(sum(Decimal(row['income']) for row in result['comparison']), Decimal('0.30'))
        self.assertEqual(self.fetch(self.b.pk)['overview']['expense'], '0.10')

    def test_business_success_and_cross_day_outcomes(self):
        farm = AgentFarm.objects.create(pk=self.a.pk, owner_id='admin', actor_name=self.a.name)
        for key, kind, result in [('harvest', 'harvest', {}), ('collect', 'collect', {}), ('failed', 'harvest', {'success': False})]:
            FarmOperation.objects.create(pk=key, farm=farm, opportunity_id=key, operation={'kind': kind}, result=result, created_at=self.at)
        TravelJourney.objects.create(pk='journey', actor_id=self.a.pk, owner_id='admin', status='completed',
            departed_at=self.at-timedelta(days=1), returned_at=self.at, destination_id='city')
        run = Exploration.objects.create(pk='adventure', actor_id=self.a.pk, actor_name=self.a.name, owner_id='admin',
            catalog_id='test', status='completed', created_at=self.at-timedelta(days=1), ended_at=self.at)
        CombatFact.objects.create(pk='depart', actor_id=self.a.pk, owner_id='admin', exploration_id=run.pk,
            sequence=1, kind='depart', digest='test', created_at=self.at-timedelta(days=1))
        CombatEncounter.objects.create(pk='battle', actor_id=self.a.pk, owner_id='admin', exploration_id=run.pk,
            number=1, started_at=self.at-timedelta(days=1), ended_at=self.at, result={'killed': True})
        result = self.fetch()
        self.assertEqual(result['outcomes'], {'harvests': 1, 'collections': 1, 'journeys': 1, 'destinations': 1, 'explorations': 1, 'wins': 1})
        counts = {row['key']: row['count'] for row in result['categories']}
        self.assertEqual(counts['farm'], 2)
        self.assertEqual(counts['travel'], 0)
        self.assertEqual(counts['exploration'], 0)

    def test_deleted_resident_and_same_name_are_distinct(self):
        original_id = self.a.pk
        name = self.a.name
        self.a.delete()
        replacement = Agent.objects.create(name=name)
        LifeProfile.objects.create(pk=replacement.pk, owner_id='admin')
        result = self.fetch(original_id)
        identities = {row['id']: row for row in result['residents']}
        self.assertTrue(identities[original_id]['departed'])
        self.assertFalse(identities[replacement.pk]['departed'])
        self.assertEqual(result['overview']['publications'], 1)
        self.assertEqual(self.fetch(replacement.pk)['overview']['publications'], 0)

    def test_other_account_and_hidden_collection(self):
        private = Anthology.objects.create(title='私有', type='agent', user_id='elsewhere', permission='private')
        Article.objects.create(title='隐藏', content='test', coll_id=private.pk, agent_post_author_id=self.a.pk, created_at=self.at)
        stranger = Agent.objects.create(name='别人居民')
        LifeProfile.objects.create(pk=stranger.pk, owner_id='elsewhere')
        # Use a regular account to exercise document visibility as well as actor ownership.
        user = User.objects.create_user('reader', password='test')
        self.client.force_authenticate(user)
        response = self.client.get('/api/settings/agent-world/analytics/', {'start_date': '2026-10-01', 'end_date': '2026-10-02', 'actor_id': self.a.pk})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.fetch()['overview']['publications'], 0)

    def test_custom_work_not_builtin_double_count(self):
        custom = AgentTask.objects.create(name='自定义', task_kind='custom', agent=self.b)
        builtin = AgentTask.objects.create(name='旅行', task_kind='travel', agent=self.b)
        AgentRunRecord.objects.create(task=custom, task_name='自定义', agent=self.b, started_at=self.at)
        AgentRunRecord.objects.create(task=builtin, task_name='旅行', agent=self.b, started_at=self.at)
        result = self.fetch(self.b.pk)
        self.assertEqual(next(row['count'] for row in result['categories'] if row['key']=='work'), 1)

    def test_social_read_logs_do_not_count_and_comments_do(self):
        moment = Moment.objects.create(pk='moment', owner_id='admin', actor_id='agent-id:'+self.a.pk,
            identity={'name': self.a.name}, content='分享', created_at=self.at)
        MomentComment.objects.create(pk='reply', moment=moment, actor_id='agent-id:'+self.b.pk,
            identity={'name': self.b.name}, content='留言', created_at=self.at)
        AgentActivity.objects.create(event_key='social-log', agent=self.b, title='浏览', activity_type='interaction',
            action='social_read', occurred_at=self.at, metadata={'owner_id': 'admin', 'result': {}})
        result = self.fetch()
        self.assertEqual(result['overview']['publications'], 2)
        self.assertEqual(result['overview']['interactions'], 1)
        self.assertEqual(result['overview']['received'], 1)
        self.assertEqual(result['overview']['activeResidents'], 2)
        self.assertEqual(result['overview']['activeDays'], 2)


    def test_unassigned_resident_is_selectable_without_other_accounts_assets(self):
        free = Agent.objects.create(name='尚未安排生活')
        result = self.fetch(free.pk)
        self.assertEqual(result['overview']['activeResidents'], 0)
        self.assertTrue(any(row['id'] == free.pk for row in result['residents']))

    def test_multi_resident_work_starts_and_failures(self):
        task = AgentTask.objects.create(name='协作', task_kind='custom', agent=self.a)
        AgentRunRecord.objects.create(task=task, task_name='协作', agent=self.a, started_at=self.at,
            agent_runs=[{'agent': self.a.pk}, {'agent': self.b.pk}])
        AgentRunRecord.objects.create(task=task, task_name='失败', agent=self.a, started_at=self.at, status='failed')
        result = self.fetch()
        self.assertEqual(next(row['count'] for row in result['categories'] if row['key'] == 'work'), 2)

    def test_actor_permission_and_window_bounded_query_count(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        foreign = Agent.objects.create(name='其他账号')
        LifeProfile.objects.create(pk=foreign.pk, owner_id='elsewhere')
        response = self.client.get('/api/settings/agent-world/analytics/', {
            'start_date': '2026-10-01', 'end_date': '2026-10-02', 'actor_id': foreign.pk})
        self.assertEqual(response.status_code, 403)
        with CaptureQueriesContext(connection) as short:
            self.fetch()
        with CaptureQueriesContext(connection) as long:
            self.fetch(start_date='2026-01-01', end_date='2026-10-02')
        self.assertEqual(len(short), len(long))
        added = [Agent(id=f'extra-{index}', name=f'额外居民{index}') for index in range(12)]
        Agent.objects.bulk_create(added)
        LifeProfile.objects.bulk_create([LifeProfile(id=agent.pk, owner_id='admin') for agent in added])
        with CaptureQueriesContext(connection) as populated:
            self.fetch()
        self.assertEqual(len(short), len(populated))

    def test_legacy_counterpart_does_not_assign_received_to_same_name(self):
        self.activity(activity_type='interaction', action='comment', counterpart_type='agent',
            counterpart_id='agent:'+self.b.name, counterpart_name=self.b.name)
        self.assertEqual(self.fetch(self.b.pk)['overview']['received'], 0)

    def test_daily_and_resident_totals_remain_consistent_after_repeat_restore(self):
        self.activity(activity_type='interaction', action='comment', counterpart_id='agent-id:'+self.b.pk)
        first = self.fetch()
        AgentActivity.objects.update_or_create(event_key='event', defaults={'status': 'success'})
        second = self.fetch()
        self.assertEqual(first, second)
        self.assertEqual(sum(row['activeDays'] for row in second['comparison']), second['overview']['activeDays'])
        self.assertEqual(sum(row['publications'] for row in second['comparison']), second['overview']['publications'])
        self.assertEqual(sum(row['interactions'] for row in second['comparison']), second['overview']['interactions'])


    def test_annotations_initial_comment_and_reply_are_not_duplicated(self):
        annotation = ArticleAnnotation.objects.create(article=self.post, selected_text='测试', start_offset=0,
            end_offset=2, creator_type='agent', creator_id='agent-id:'+self.b.pk, creator_name=self.b.name)
        first = ArticleAnnotationComment.objects.create(annotation=annotation, content='第一条',
            creator_type='agent', creator_id='agent-id:'+self.b.pk, creator_name=self.b.name)
        reply = ArticleAnnotationComment.objects.create(annotation=annotation, content='用户回复', creator_id='user:admin')
        ArticleAnnotation.objects.filter(pk=annotation.pk).update(created_at=self.at)
        ArticleAnnotationComment.objects.filter(pk=first.pk).update(created_at=self.at)
        ArticleAnnotationComment.objects.filter(pk=reply.pk).update(created_at=self.at+timedelta(minutes=1))
        self.assertEqual(self.fetch(self.b.pk)['overview']['interactions'], 1)
        self.assertEqual(self.fetch(self.a.pk)['overview']['received'], 2)

    def test_authentication_and_invalid_dates(self):
        self.assertEqual(self.client.get('/api/settings/agent-world/analytics/', {'start_date': 'bad', 'end_date': '2026-10-02'}).status_code, 400)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get('/api/settings/agent-world/analytics/').status_code, (401, 403))


class CombatAnalyticsTests(AnalyticsTests):
    def exploration(self, key, actor, status='completed', owner='admin', departed=True, at=None, **values):
        run = Exploration.objects.create(pk=key, owner_id=owner, actor_id=actor.pk, actor_name=actor.name,
            catalog_id='test', status=status, elapsed_seconds=values.get('elapsed', 600),
            snapshot={'plan': {'dungeon_id': 'dungeon.moss_cave'}},
            result={'kills': values.get('kills', 5), 'experience': 100, 'energy': 4, 'potions_used': {'heal': 2}},
            ended_at=None if status in ('active', 'paused') else self.at)
        if departed:
            CombatFact.objects.create(pk=key+':depart', owner_id=owner, actor_id=actor.pk, exploration_id=key,
                kind='depart', sequence=CombatFact.objects.filter(actor_id=actor.pk).count()+1,
                digest='test', created_at=at or self.at)
        return run

    def test_departure_cohort_outcomes_dedup_and_actor_filter(self):
        run = self.exploration('complete', self.a)
        self.exploration('fallen', self.a, status='fallen', elapsed=300)
        self.exploration('active', self.a, status='active', elapsed=150)
        self.exploration('prepared-failed', self.a, status='failed', departed=False, kills=0)
        self.exploration('old-departure', self.a, at=self.at-timedelta(days=3))
        self.exploration('other-resident', self.b)
        CombatFact.objects.create(pk='duplicate-depart', owner_id='admin', actor_id=self.a.pk, exploration_id=run.pk,
            kind='depart', sequence=50, digest='test', created_at=self.at)
        CombatEncounter.objects.create(pk='boss-win', owner_id='admin', actor_id=self.a.pk, exploration_id=run.pk,
            number=1, monster={'id':'boss', 'name':'首领', 'rank':'boss', 'level':10}, result={'killed':True}, ended_at=self.at)
        result = self.fetch()
        row = next(row for row in result['combatComparison'] if row['id']==self.a.pk)
        self.assertEqual((row['explorations'],row['settled'],row['ongoing']), (3,2,1))
        self.assertEqual((row['successRate'],row['elapsedSeconds'],row['kills'],row['bossKills']), (50.0,1050,15,1))
        self.assertEqual((row['energy'],row['potions'],row['experience']), (12,6,300))
        self.assertEqual(row['monsters'][0]['highestLevel'],10)
        self.assertEqual(row['unclassifiedKills'],14)
        self.assertEqual(result['combatComparison'],self.fetch()['combatComparison'])
        self.assertEqual([row['id'] for row in self.fetch(self.b.pk)['combatComparison']],[self.b.pk])

    def test_empty_ongoing_and_foreign_owner_records(self):
        self.exploration('foreign', self.a, owner='other', kills=99)
        self.exploration('only-active', self.b, status='paused', kills=0, elapsed=0)
        rows = {row['id']:row for row in self.fetch()['combatComparison']}
        self.assertEqual(rows[self.a.pk]['explorations'],0)
        self.assertIsNone(rows[self.a.pk]['successRate'])
        self.assertEqual(rows[self.b.pk]['ongoing'],1)
        self.assertIsNone(rows[self.b.pk]['successRate'])
        self.assertIsNone(rows[self.b.pk]['killsPerHour'])
