"""Avatar snapshots preserve resource references in supported URL forms."""
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from article.models import Article, ArticleAnnotation, ArticleAnnotationComment, ArticlePostComment, ArticlePostRating, Image, ImageReview
from system_settings.models import Agent, AgentActivity
from utils.resource_assets import is_asset_used_by_agent


class AgentReferenceCompatibilityTests(TestCase):
    def test_avatar_and_snapshot_fields_keep_canonical_and_absolute_urls(self):
        article = Article.objects.create(title='帖子', content='正文', coll_id='test')
        annotation = ArticleAnnotation.objects.create(article=article, selected_text='正', start_offset=0, end_offset=1)
        image = Image.objects.create(title='图片', image_url='external.png', coll_id='test')
        objects = [
            (Agent.objects.create(name='头像测试'), 'avatar'),
            (Agent.objects.create(name='全身测试'), 'full_body_image'),
            (Agent.objects.create(name='立绘测试'), 'loadout_portrait'),
            (article, 'agent_post_creator_avatar'),
            (ArticlePostComment.objects.create(article=article, content='评论'), 'creator_avatar'),
            (ArticlePostRating.objects.create(article=article, rating=8), 'rater_avatar'),
            (annotation, 'creator_avatar'),
            (ArticleAnnotationComment.objects.create(annotation=annotation, content='评论'), 'creator_avatar'),
            (ImageReview.objects.create(image=image, agent_key='reviewer', agent_name='居民', commentary='好',
                score_theme=8, score_composition=8, score_idea=8, score_light=8, score_color=8, score_focus=8, overall=8),
             'agent_avatar'),
        ]
        for index, (obj, field) in enumerate(objects):
            for suffix, template in enumerate(('/api/resource/view/{}', 'http://testserver/api/resource/download/{}?size=small')):
                resource_id = f'avatar-check-{index}-{suffix}'
                with self.subTest(field=field, resource_id=resource_id):
                    setattr(obj, field, template.format(resource_id))
                    obj.save(update_fields=[field])
                    self.assertTrue(is_asset_used_by_agent(resource_id))
                    setattr(obj, field, template.format(resource_id + '-other'))
                    obj.save(update_fields=[field])
                    self.assertFalse(is_asset_used_by_agent(resource_id))

    def test_activity_snapshot_and_battle_appearance_keep_references(self):
        activity = AgentActivity.objects.create(event_key='avatar-snapshot-check', activity_type='work', title='动态',
            metadata={'agentSnapshot': {'avatar': 'http://testserver/api/resource/download/snapshot-id?size=small'}})
        self.assertTrue(is_asset_used_by_agent('snapshot-id'))
        activity.metadata = {'agentSnapshot': {'avatar': '/api/resource/view/snapshot-id-other'}}
        activity.save(update_fields=['metadata'])
        self.assertFalse(is_asset_used_by_agent('snapshot-id'))
        for field in ('source_asset_id', 'cutout_asset_id', 'head_asset_id', 'character_asset_id'):
            with self.subTest(field=field):
                agent = Agent.objects.create(name=f'形象-{field}', battle_appearance={field: f'appearance-{field}'})
                self.assertTrue(is_asset_used_by_agent(f'appearance-{field}'))
                agent.battle_appearance = {}
                agent.save(update_fields=['battle_appearance'])

    def test_unreferenced_resource_checks_each_avatar_source_once(self):
        with CaptureQueriesContext(connection) as queries:
            self.assertFalse(is_asset_used_by_agent('no-avatar-reference'))
        for table in ('sys_agent', 'sys_agent_activity', 'article_post_comments', 'article_post_ratings',
                      'article_annotations', 'article_annotation_comments', 'image_reviews'):
            statements = [query['sql'] for query in queries if f'FROM "{table}"' in query['sql']]
            self.assertEqual(len(statements), 1, (table, statements))
