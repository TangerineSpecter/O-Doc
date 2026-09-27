from unittest.mock import patch

from django.test import TestCase, RequestFactory
from django.contrib.auth.models import AnonymousUser
from django.db import transaction

from anthology.models import Anthology
from article.models import Article, ArticleAnnotation, ArticleAnnotationComment, ArticlePostComment, ArticlePostRating, Image, ImageReview
from article.photo_observation import photo_review_id
from assets.models import Asset
from assets.views import can_read_asset
from .sync_state import suspend_tracking
from .models import Agent, AgentActivity, SyncEntityState
from .serializers import AgentActivitySerializer
from utils.resource_assets import get_resource_view_url, is_asset_used_by_agent


class AgentHistoryTests(TestCase):
    def setUp(self):
        self.agent = Agent.objects.create(name='原名', avatar='🐱')
        coll = Anthology.objects.create(title='历史', type='agent')
        self.post = Article.objects.create(title='旧作品', coll_id=coll.pk,
            agent_post_author_id=self.agent.pk, agent_post_creator_id=f'agent:{self.agent.pk}',
            agent_post_creator_name='原名', agent_post_creator_avatar='🐱')
        self.comment = ArticlePostComment.objects.create(article=self.post,
            actor_agent_id=self.agent.pk, creator_id=f'agent:{self.agent.pk}',
            creator_name='原名', creator_avatar='🐱', content='旧评论')
        self.rating = ArticlePostRating.objects.create(article=self.post, rating=8,
            actor_agent_id=self.agent.pk, rater_id=f'agent:{self.agent.pk}', rater_name='原名', rater_avatar='🐱')
        self.annotation = ArticleAnnotation.objects.create(article=self.post, selected_text='旧作品', start_offset=0, end_offset=3,
            creator_type='agent', creator_id=f'agent-id:{self.agent.pk}', creator_name='原名', creator_avatar='🐱')
        self.reply = ArticleAnnotationComment.objects.create(annotation=self.annotation,
            creator_type='agent', creator_id=f'agent-id:{self.agent.pk}', creator_name='原名', creator_avatar='🐱', content='回复')
        image = Image.objects.create(title='照片', image_url='unused.png', coll_id=coll.pk)
        self.review = ImageReview.objects.create(image=image, review_id=photo_review_id(image.pk, self.agent.pk),
            agent_key=self.agent.pk, agent_name='原名', commentary='评价', overall=8,
            score_theme=8, score_composition=8, score_idea=8, score_light=8, score_color=8, score_focus=8)
        self.activity = AgentActivity.objects.create(agent=self.agent, event_key='history-test',
            activity_type='publication', title='作品', artifact_kind='agentPost',
            artifact_article_id=self.post.pk)

    def test_delete_freezes_final_identity_and_preserves_all_history(self):
        agent_id = self.agent.pk
        self.agent.name = '最后的名字'
        self.agent.avatar = '🌙'
        self.agent.save()
        self.assertEqual(AgentActivitySerializer(self.activity).data['agent']['name'], '最后的名字')
        self.agent.delete()
        self.activity.refresh_from_db()
        self.assertIsNone(self.activity.agent_id)
        self.assertEqual(AgentActivitySerializer(self.activity).data['agent'], {
            'id': '', 'name': '最后的名字', 'avatar': '🌙',
        })
        for record, name_field, avatar_field in (
            (self.post, 'agent_post_creator_name', 'agent_post_creator_avatar'),
            (self.comment, 'creator_name', 'creator_avatar'),
            (self.rating, 'rater_name', 'rater_avatar'),
            (self.annotation, 'creator_name', 'creator_avatar'),
            (self.reply, 'creator_name', 'creator_avatar'),
            (self.review, 'agent_name', 'agent_avatar'),
        ):
            record.refresh_from_db()
            self.assertEqual(getattr(record, name_field), '最后的名字')
            self.assertEqual(getattr(record, avatar_field), '🌙')
        self.assertEqual(self.review.agent_key, agent_id)
        self.assertFalse(SyncEntityState.objects.get(
            model_label='article.imagereview', object_pk=self.review.pk).is_deleted)
        namesake = Agent.objects.create(name='最后的名字', avatar='🔥')
        namesake.delete()
        self.annotation.refresh_from_db()
        self.assertEqual(self.annotation.creator_avatar, '🌙')

    def test_queryset_delete_also_freezes_avatar_and_protects_asset(self):
        self.agent.avatar = get_resource_view_url('history-avatar')
        self.agent.save()
        Agent.objects.filter(pk=self.agent.pk).delete()
        self.assertTrue(is_asset_used_by_agent('history-avatar'))

    def test_legacy_annotation_survives_rename_then_delete(self):
        self.annotation.creator_id = 'agent:原名'
        self.annotation.save()
        self.reply.creator_id = 'agent:原名'
        self.reply.save()
        self.agent.name = '改名'
        self.agent.avatar = '🌙'
        self.agent.save()
        self.agent.delete()
        for record in (self.annotation, self.reply):
            record.refresh_from_db()
            self.assertEqual(record.creator_name, '改名')
            self.assertEqual(record.creator_avatar, '🌙')
            self.assertTrue(record.creator_id.startswith('agent-id:'))

    def test_failure_rolls_back_freeze_and_delete(self):
        self.agent.name = '改名'
        self.agent.save()
        with patch('system_settings.agent_history._save_identity', side_effect=RuntimeError('failed')):
            with self.assertRaises(RuntimeError):
                with transaction.atomic():
                    self.agent.delete()
        self.assertTrue(Agent.objects.filter(pk=self.agent.pk).exists())
        self.activity.refresh_from_db()
        self.assertEqual(self.activity.metadata['agentSnapshot']['name'], '原名')

    def test_unlinked_legacy_publication_uses_recorded_author(self):
        legacy = AgentActivity.objects.create(event_key='legacy-test', activity_type='publication',
            title='作品', artifact_kind='agentPost', artifact_article_id=self.post.pk)
        self.assertEqual(AgentActivitySerializer(legacy).data['agent']['name'], '原名')
        unknown = AgentActivity.objects.create(event_key='unknown-test', title='未知', activity_type='work')
        self.assertEqual(AgentActivitySerializer(unknown).data['agent']['name'], '历史作者未关联')

    def test_sync_cleanup_preserves_imported_author_snapshots(self):
        with suspend_tracking():
            for record, fields in (
                (self.post, {'agent_post_creator_name': '云端新名', 'agent_post_creator_avatar': '🌙'}),
                (self.comment, {'creator_name': '云端新名', 'creator_avatar': '🌙'}),
                (self.annotation, {'creator_name': '云端新名', 'creator_avatar': '🌙'}),
                (self.review, {'agent_name': '云端新名', 'agent_avatar': '🌙'}),
            ):
                for field, value in fields.items():
                    setattr(record, field, value)
                record.save(update_fields=list(fields))
            self.activity.agent = None
            self.activity.metadata = {'agentSnapshot': {'name': '云端新名', 'avatar': '🌙'}}
            self.activity.save()
            self.agent.delete()
        self.post.refresh_from_db()
        self.comment.refresh_from_db()
        self.annotation.refresh_from_db()
        self.review.refresh_from_db()
        self.activity.refresh_from_db()
        self.assertEqual(self.post.agent_post_creator_name, '云端新名')
        self.assertEqual(self.comment.creator_name, '云端新名')
        self.assertEqual(self.annotation.creator_name, '云端新名')
        self.assertEqual(self.review.agent_avatar, '🌙')
        self.assertEqual(AgentActivitySerializer(self.activity).data['agent']['name'], '云端新名')

    def test_private_historical_avatar_is_protected_but_not_publicly_readable(self):
        asset = Asset.objects.create(id='private-avatar', name='avatar', original_name='avatar',
            file_size=1, file_path='unused', file_type='image', file_extension='png', mime_type='image/png', uploader='owner')
        url = get_resource_view_url(asset.pk)
        self.post.permission = 'private'
        self.post.content_format = 'html'
        self.post.author = 'owner'
        self.post.save()
        self.annotation.creator_avatar = url
        self.annotation.creator_type = 'user'
        self.annotation.save()
        # 动态位于公开文集中，但其关联文章仍是私有的。
        self.activity.agent = None
        self.activity.artifact_coll_id = self.post.coll_id
        self.activity.metadata = {'agentSnapshot': {'name': '作者', 'avatar': url}}
        self.activity.save()
        request = RequestFactory().get('/api/resource/view/private-avatar')
        request.user = AnonymousUser()
        self.assertTrue(is_asset_used_by_agent(asset.pk))
        self.assertFalse(can_read_asset(request, asset))
        self.post.permission = 'public'
        self.post.save()
        self.assertTrue(can_read_asset(request, asset))

    def test_live_agent_avatar_remains_publicly_readable(self):
        asset = Asset.objects.create(id='live-avatar', name='avatar', original_name='avatar',
            file_size=1, file_path='unused', file_type='image', file_extension='png', mime_type='image/png', uploader='owner')
        self.agent.avatar = get_resource_view_url(asset.pk)
        self.agent.save()
        request = RequestFactory().get('/api/resource/view/live-avatar')
        request.user = AnonymousUser()
        self.assertTrue(can_read_asset(request, asset))
