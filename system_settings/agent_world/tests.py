from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from anthology.models import Anthology
from article.models import Article, ArticlePostRating, ArticlePostComment
from system_settings.models import Agent
from .models import WorldCategory, WorldProfession, WorldProfessionCategory, WorldIncomeConfig, WorldLedger, WorldIncomeEvent, WorldChange, WorldMonthSettlement
from .income import settle, recompute_balances
from .comments import create_comment
from .migration import preview, migrate
from .ranking import juice, rank, SHANGHAI, month_cutoff
from .settlement import close_month, reconcile_awards


class AgentWorldTests(TestCase):
    def setUp(self):
        self.coll = Anthology.objects.create(title='世界测试', type='agent')
        self.category = WorldCategory.objects.create(name='科技')
        self.profession = WorldProfession.objects.create(name='科技博主')
        WorldProfessionCategory.objects.create(profession=self.profession, category=self.category, percentage='12.5')
        self.agent = Agent.objects.create(name='作者', profession=self.profession, money='100.00')
        self.other = Agent.objects.create(name='评论者')
        self.post = Article.objects.create(title='科技帖子', coll_id=self.coll.pk, author='admin', content='正文',
            agent_post_creator_id='agent:作者', agent_post_creator_name='作者', agent_post_author_id=self.agent.pk,
            agent_post_category='历史分类', agent_post_category_ref=self.category)
        self.config = WorldIncomeConfig.objects.create(enabled=True, post_amount='1.00', comment_amount='2.00',
            prize_enabled=True, first_amount='30', second_amount='20', third_amount='10')

    def comment(self, actor='user:1', agent=None):
        return create_comment(self.post, '讨论', {'creator_id': actor, 'creator_name': actor}, agent)

    def test_decimal_income_snapshot_and_idempotence(self):
        settle(self.post, 'post'); settle(self.post, 'post')
        row = WorldLedger.objects.get(pk=f'post:{self.post.pk}')
        self.assertEqual(row.amount, Decimal('1.13'))
        self.agent.refresh_from_db(); self.assertEqual(self.agent.money, Decimal('101.13'))
        self.profession.enabled = False; self.profession.save()
        self.comment()
        self.assertEqual(WorldLedger.objects.get(kind='comment').amount, Decimal('2.00'))
        self.assertEqual(row.snapshot['percentage'], '12.5000')

    def test_category_and_self_profession_queries_are_separate(self):
        from system_mcp.views import get_system_mcp_tools_for_scope
        from .catalog import available_categories, current_profession
        self.assertTrue(all(set(c) == {'id', 'name', 'description'} for c in available_categories()))
        result = current_profession(self.agent)
        self.assertEqual(result['profession']['id'], self.profession.pk)
        self.assertEqual(result['category_bonuses'][0]['bonus_percentage'], '12.5000')
        self.profession.enabled = False
        self.profession.save()
        result = current_profession(self.agent)
        self.assertEqual(result['category_bonuses'][0]['bonus_percentage'], '0')
        self.assertEqual(current_profession(self.other)['profession'], None)
        with self.assertRaises(ValueError):
            current_profession(None)
        names = {tool['name'] for tool in get_system_mcp_tools_for_scope('agent_activities')}
        self.assertIn('get_agent_profession', names)
        self.assertNotIn('list_agent_post_categories', names)

    def test_user_repeat_self_and_agent_repeat(self):
        self.comment(); self.comment()
        self.comment('agent:作者', self.agent)
        self.comment('agent:评论者', self.other)
        with self.assertRaises(ValueError): self.comment('agent:评论者', self.other)
        self.assertEqual(WorldLedger.objects.filter(kind='comment').count(), 2)
        self.assertEqual(ArticlePostComment.objects.filter(article=self.post).count(), 4)

    def test_mcp_explicit_agent_id_preserves_identity_with_duplicate_names(self):
        from system_mcp.views import ODocSystemMCPView
        duplicate = Agent.objects.create(name=self.agent.name)
        view = ODocSystemMCPView()
        args = {'article_id': self.post.pk, 'agent_id': self.agent.pk,
                'comment': '作者评论', 'stance': 'neutral'}
        view._add_agent_post_comment(args)
        self.assertEqual(ArticlePostComment.objects.get(article=self.post).actor_agent_id, self.agent.pk)
        self.assertFalse(WorldLedger.objects.filter(kind='comment').exists())
        with self.assertRaises(ValueError):
            view._add_agent_post_comment(args)
        args['agent_id'] = duplicate.pk
        view._add_agent_post_comment(args)
        self.assertEqual(WorldLedger.objects.filter(kind='comment').count(), 1)
        view._rate_agent_post({**args, 'rating': 9})
        view._rate_agent_post({**args, 'rating': 7})
        view._rate_agent_post({**args, 'agent_id': self.agent.pk, 'rating': 10})
        self.assertEqual(ArticlePostRating.objects.filter(article=self.post).count(), 2)
        self.assertEqual(ArticlePostRating.objects.get(article=self.post, actor_agent_id=duplicate.pk).rating, 7)
        row = rank(self.coll.pk)[0]
        self.assertEqual(row['rating_count'], 1)
        self.assertEqual(row['rating_sum'], 7)
        self.assertEqual(row['comment_count'], 1)

    def test_disabled_and_unmapped_never_backfill(self):
        self.config.enabled = False; self.config.save()
        self.comment('user:disabled')
        WorldIncomeConfig.objects.create(enabled=True, comment_amount=99)
        self.comment('user:disabled')
        self.assertFalse(WorldLedger.objects.filter(kind='comment').exists())
        self.post.agent_post_category_ref = None; self.post.save()
        self.comment('user:unmapped')
        self.post.agent_post_category_ref = self.category; self.post.save()
        self.comment('user:unmapped'); self.comment('user:new')
        self.assertEqual(WorldLedger.objects.filter(kind='comment').count(), 1)

    def test_migration_scope_and_concurrent_change(self):
        self.post.agent_post_category_ref = None; self.post.save()
        scope = preview(self.coll.pk, '历史分类')
        self.post.title = '修改'; self.post.save()
        with self.assertRaises(ValueError): migrate(self.coll.pk, '历史分类', self.category.pk, scope['token'], 'admin')
        self.post.refresh_from_db(); self.assertIsNone(self.post.agent_post_category_ref_id)
        scope = preview(self.coll.pk, '历史分类')
        migrate(self.coll.pk, '历史分类', self.category.pk, scope['token'], 'admin')
        self.post.refresh_from_db(); self.assertEqual(self.post.agent_post_category, '历史分类')
        self.assertFalse(WorldLedger.objects.filter(kind='post').exists())

    def test_juice_exact_distinct_and_self_exclusion(self):
        self.assertEqual(juice([], set()), 0)
        self.assertEqual(juice([], {'a'}), Decimal(20)/6)
        ArticlePostRating.objects.create(article=self.post, rater_id='agent:作者', rating=10)
        self.assertEqual(rank(self.coll.pk), [])
        ArticlePostRating.objects.create(article=self.post, rater_id='user:1', rating=10)
        self.comment(); self.comment()
        row = rank(self.coll.pk)[0]
        self.assertEqual(row['comment_count'], 1)
        self.assertEqual(row['rating_count'], 1)
        self.assertEqual(Decimal(row['juice']), juice([10], {'user:1'}))

    def test_strict_month_close_recovery_and_prize_projection(self):
        # Immutable events dated in a completed month simulate a service outage.
        month = '2026-01'; cutoff = month_cutoff(month)
        WorldIncomeConfig.objects.filter(pk=self.config.pk).update(effective_at=datetime(2026, 1, 1))
        Article.objects.filter(pk=self.post.pk).update(created_at=datetime(2026, 1, 15))
        self.post.refresh_from_db()
        from .history import record
        record(self.post)
        rating = ArticlePostRating.objects.create(article=self.post, rater_id='user:1', rating=10)
        for index, change in enumerate(WorldChange.objects.order_by("occurred_at", "id")):
            WorldChange.objects.filter(pk=change.pk).update(occurred_at=datetime(2026, 1, 20)+timedelta(microseconds=index))
        frozen = close_month(self.coll.pk, month)
        rating.rating = 1; rating.save()
        frozen_again = close_month(self.coll.pk, month)
        self.assertEqual(frozen.ranking, frozen_again.ranking)
        reconcile_awards(); reconcile_awards()
        self.assertEqual(WorldLedger.objects.filter(kind='prize').count(), 1)
        self.assertEqual(WorldLedger.objects.get(kind='prize').amount, Decimal(30))
        # Winning synced snapshot replaces the entire award projection.
        frozen.awards[0]['author_id'] = self.other.pk
        frozen.awards[0]['amount'] = '7.00'; frozen.save()
        reconcile_awards()
        self.assertEqual(WorldLedger.objects.get(kind='prize').agent_id, self.other.pk)
        self.agent.refresh_from_db(); self.assertEqual(self.agent.money, Decimal(100))

    def test_unknown_author_never_guessed(self):
        Agent.objects.create(name='作者')
        self.post.agent_post_author_id = ''; self.post.save()
        settle(self.post, 'post')
        self.assertEqual(WorldIncomeEvent.objects.get(pk=f'post:{self.post.pk}').status, 'unresolved_author')

    def test_deleted_comments_keep_income(self):
        comment = self.comment(); comment.delete()
        recompute_balances()
        self.assertEqual(WorldLedger.objects.filter(kind='comment').count(), 1)
        self.assertEqual(rank(self.coll.pk), [])

    def test_snapshot_roundtrip_and_replay_recomputes_money(self):
        from utils.sync_manager import SyncManager
        from system_settings.tests import FakeWebDavClient
        settle(self.post, 'post'); self.comment()
        manager = SyncManager(FakeWebDavClient(), '/world-test/')
        snapshot = manager.build_snapshot_data()
        labels = {row['model'] for row in snapshot}
        self.assertIn('system_settings.worldledger', labels)
        self.assertIn('system_settings.worldchange', labels)
        self.assertIn('system_settings.worldprofessioncategory', labels)
        Agent.objects.filter(pk=self.agent.pk).update(money=0)
        with patch('article.html_note_resources.retry_html_cleanup'), patch('article.version_service.enforce_article_version_retention'):
            manager.apply_snapshot_data(snapshot)
            manager.apply_snapshot_data(snapshot)
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.money, Decimal('103.38'))
        self.assertEqual(WorldLedger.objects.filter(agent_id=self.agent.pk).count(), 3)

    def test_same_author_three_prizes_and_legacy_categories(self):
        month = '2026-01'
        WorldIncomeConfig.objects.filter(pk=self.config.pk).update(effective_at=datetime(2026, 1, 1))
        from .history import record
        for index in range(3):
            post = self.post if index == 0 else Article.objects.create(title=f'帖子 {index}', coll_id=self.coll.pk,
                author='admin', content='内容', agent_post_author_id=self.agent.pk, agent_post_creator_id='agent:作者')
            Article.objects.filter(pk=post.pk).update(created_at=datetime(2026, 1, index+1))
            post.refresh_from_db(); record(post)
            ArticlePostRating.objects.create(article=post, rater_id='user:1', rating=10-index)
        for index, change in enumerate(WorldChange.objects.order_by("occurred_at", "id")):
            WorldChange.objects.filter(pk=change.pk).update(occurred_at=datetime(2026, 1, 25)+timedelta(microseconds=index))
        frozen = close_month(self.coll.pk, month)
        self.assertEqual(len(frozen.awards), 3)
        reconcile_awards()
        self.assertEqual(WorldLedger.objects.filter(kind='prize', agent_id=self.agent.pk).count(), 3)
        self.agent.refresh_from_db(); self.assertEqual(self.agent.money, Decimal(160))

    def test_disabled_category_mcp_rejected(self):
        from system_mcp.views import ODocSystemMCPView
        view = ODocSystemMCPView(); view.agent_context = self.agent
        self.category.enabled = False; self.category.save()
        with self.assertRaises(ValueError):
            view._create_agent_post({'title': '禁用分类', 'content': '内容', 'coll_id': self.coll.pk, 'category_id': self.category.pk})
        self.assertFalse(Article.objects.filter(title='禁用分类').exists())

    def test_migration_requires_collection_owner(self):
        from django.contrib.auth.models import User
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .views import MigrationView
        other_user = User.objects.create_user(username='outsider')
        request = APIRequestFactory().get('/migration/', {'old_category': '历史分类'})
        force_authenticate(request, user=other_user)
        response = MigrationView.as_view()(request, collection_id=self.coll.pk)
        self.assertEqual(response.status_code, 403)

    def test_profession_negative_duplicate_and_config_validation(self):
        from .serializers import ProfessionSerializer, IncomeConfigSerializer
        value = {'name': '职业', 'bonuses': [{'category': self.category.pk, 'percentage': '-1'}]}
        self.assertFalse(ProfessionSerializer(data=value).is_valid())
        value['bonuses'] = [{'category': self.category.pk, 'percentage': '0'}]*2
        self.assertFalse(ProfessionSerializer(data=value).is_valid())
        self.assertFalse(IncomeConfigSerializer(data={'post_amount': '-0.01'}).is_valid())

    def test_year_and_month_shanghai_boundaries(self):
        from .history import record
        Article.objects.filter(pk=self.post.pk).update(created_at=datetime(2026, 1, 1))
        self.post.refresh_from_db(); record(self.post)
        ArticlePostRating.objects.create(article=self.post, rater_id='user:1', rating=8)
        self.assertEqual(len(rank(self.coll.pk, 'year', '2026')), 1)
        self.assertEqual(rank(self.coll.pk, 'year', '2025'), [])
        self.assertEqual(len(rank(self.coll.pk, 'month', '2026-01')), 1)
        self.assertEqual(rank(self.coll.pk, 'month', '2025-12'), [])
        self.assertEqual(month_cutoff('2026-12'), datetime(2027, 1, 1))

    def test_month_configuration_uses_last_before_cutoff(self):
        from .income import current_config
        before = WorldIncomeConfig.objects.create(effective_at=datetime(2026, 1, 31, 23, 59), first_amount=55)
        WorldIncomeConfig.objects.create(effective_at=datetime(2026, 2, 1), first_amount=999)
        self.assertEqual(current_config(month_cutoff('2026-01')).pk, before.pk)

    def test_no_extra_journal_entries_for_metadata_or_sync_replay(self):
        count = WorldChange.objects.count()
        self.post.read_count += 1; self.post.save()
        self.assertEqual(WorldChange.objects.count(), count)
        from system_settings.sync_state import suspend_tracking
        with suspend_tracking():
            self.post.title = '同步恢复'; self.post.save()
        self.assertEqual(WorldChange.objects.count(), count)

    def test_imported_historical_comments_are_not_rewarded_twice(self):
        ArticlePostComment.objects.create(article=self.post, creator_id='user:imported', content='历史讨论')
        self.comment('user:imported')
        self.assertFalse(WorldLedger.objects.filter(kind='comment').exists())
        self.assertEqual(WorldIncomeEvent.objects.get(pk=f'comment:{self.post.pk}:user:imported').status, 'historical')

    def test_agent_rename_updates_same_rating(self):
        from .ratings import rate_post
        first = rate_post(self.post, 8, {'creator_id': 'agent:评论者'}, self.other)
        self.other.name = '新名字'; self.other.save()
        second = rate_post(self.post, 9, {'creator_id': 'agent:新名字'}, self.other)
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(ArticlePostRating.objects.filter(article=self.post, is_valid=True).count(), 1)
        self.assertEqual(rank(self.coll.pk)[0]['rating_count'], 1)

    def test_sync_conflict_selects_whole_month_record(self):
        from utils.sync_manager import SyncManager
        from system_settings.tests import FakeWebDavClient
        manager = SyncManager(FakeWebDavClient(), '/world-test/')
        key = f'{self.coll.pk}:2026-01'
        left = {'model': 'system_settings.worldmonthsettlement', 'pk': key,
                'fields': {'collection_id': self.coll.pk, 'month': '2026-01', 'ranking': [{'post_id': 'left'}], 'awards': [{'post_id': 'left', 'rank': 1, 'amount': '10'}]}}
        right = {'model': 'system_settings.worldmonthsettlement', 'pk': key,
                 'fields': {'collection_id': self.coll.pk, 'month': '2026-01', 'ranking': [{'post_id': 'right'}], 'awards': [{'post_id': 'right', 'rank': 1, 'amount': '20'}]}}
        # Existing merge tests define the revision map protocol. Neither JSON list
        # may be merged independently from its winning settlement row.
        revision_key = f'system_settings.worldmonthsettlement:{key}'
        local_revision = {revision_key: {'hash': 'left', 'revision_at': '2026-02-01T00:00:00', 'origin_device': 'a', 'deleted': False}}
        remote = {'data': [right], 'revisions': {revision_key: {'hash': 'right', 'revision_at': '2026-02-01T00:01:00', 'origin_device': 'b', 'deleted': False}}}
        merged, _, _ = manager.merge_v2_data({'data': [], 'revisions': {}}, [left], local_revision, remote)
        record = next(row for row in merged if row['model'] == left['model'])
        chosen = record['fields']['ranking'][0]['post_id']
        self.assertEqual(chosen, 'right')
        self.assertEqual(record['fields']['awards'][0]['post_id'], chosen)

    def test_prize_projection_resumes_after_payout_failure(self):
        frozen = WorldMonthSettlement.objects.create(pk=f'{self.coll.pk}:2026-01', collection_id=self.coll.pk,
            month='2026-01', cutoff=datetime(2026, 2, 1), awards=[{'post_id': self.post.pk,
                'author_id': self.agent.pk, 'rank': 1, 'amount': '10.00'}])
        with patch('system_settings.agent_world.settlement.recompute_balances', side_effect=RuntimeError('模拟结算中断')):
            with self.assertRaises(RuntimeError): reconcile_awards()
        self.assertFalse(WorldLedger.objects.filter(kind='prize').exists())
        frozen.refresh_from_db(); self.assertEqual(frozen.status, 'frozen')
        reconcile_awards(); reconcile_awards()
        self.assertEqual(WorldLedger.objects.filter(kind='prize').count(), 1)
        self.agent.refresh_from_db(); self.assertEqual(self.agent.money, Decimal(110))
