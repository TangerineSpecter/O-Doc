from django.contrib.auth.models import User
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from anthology.models import Anthology
from article.models import Article, ArticlePostComment, ArticlePostRating


class AgentPostRatingReadTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='rating-reader', password='password')
        self.other = User.objects.create_user(username='other-rating-reader', password='password')
        self.collection = Anthology.objects.create(
            coll_id='rating-reader-collection', title='帖子', type='agent', permission='public',
            user_id=f'user_{self.user.id}',
        )
        self.post = Article.objects.create(
            article_id='rating-reader-post', title='帖子', content='正文',
            coll_id=self.collection.pk, author=f'user_{self.user.id}', permission='public',
        )

    def test_rating_is_returned_for_current_user_in_detail_and_list(self):
        self.client.force_authenticate(self.user)
        result = self.client.post(f'/api/article/agent-posts/{self.post.pk}/rating', {'rating': 8}, format='json')
        self.assertEqual(result.data['data']['my_rating'], 8)
        detail = self.client.get(f'/api/article/detail/{self.post.pk}')
        listing = self.client.get('/api/article/list', {'coll_id': self.collection.pk})
        summary = self.client.get('/api/article/list', {'coll_id': self.collection.pk, 'summary': 1})
        self.assertEqual(detail.data['data']['my_agent_post_rating'], 8)
        self.assertEqual(listing.data['data'][0]['my_agent_post_rating'], 8)
        self.assertEqual(summary.data['data'][0]['my_agent_post_rating'], 8)
        self.assertEqual(detail.json()['data']['myAgentPostRating'], 8)
        self.client.force_authenticate(self.other)
        detail = self.client.get(f'/api/article/detail/{self.post.pk}')
        self.assertIsNone(detail.data['data']['my_agent_post_rating'])
        self.client.force_authenticate(user=None)
        detail = self.client.get(f'/api/article/detail/{self.post.pk}')
        self.assertIsNone(detail.data['data']['my_agent_post_rating'])

    def test_list_counts_valid_interactions_without_loading_comment_text(self):
        self.post.agent_post_creator_id = 'agent-id:author'
        self.post.save(update_fields=['agent_post_creator_id'])
        ArticlePostComment.objects.create(article=self.post, content='long comment', creator_id='reader')
        ArticlePostComment.objects.create(article=self.post, content='deleted', creator_id='other', is_valid=False)
        ArticlePostRating.objects.create(article=self.post, rater_id='reader', rating=8)
        ArticlePostRating.objects.create(article=self.post, rater_id='other', rating=3, is_valid=False)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/article/list', {'coll_id': self.collection.pk})
        item = response.data['data'][0]
        self.assertEqual(item['post_comment_count'], 1)
        self.assertEqual(item['agent_post_rating_count'], 1)
        comment_queries = [q['sql'] for q in queries if 'FROM "article_post_comments"' in q['sql']]
        self.assertEqual(len(comment_queries), 1)
        self.assertNotIn('"article_post_comments"."content"', comment_queries[0])
