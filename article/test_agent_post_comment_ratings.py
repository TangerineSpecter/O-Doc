from django.test import TestCase
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.agent_post_comment_ratings import comment_ratings
from article.models import Article, ArticlePostComment, ArticlePostRating
from system_settings.models import Agent


class PostCommentRatingTests(TestCase):
    def setUp(self):
        self.collection = Anthology.objects.create(coll_id='rating-posts', title='帖子', type='agent', permission='public')
        self.post = Article.objects.create(title='帖子', content='正文', coll_id=self.collection.pk)
        self.agent = Agent.objects.create(name='菲伦')

    def comment(self, **values):
        content = values.pop('content', '评论')
        return ArticlePostComment.objects.create(article=self.post, content=content,
            **{'actor_agent_id': self.agent.pk, 'creator_id': 'agent:菲伦', 'creator_name': '菲伦', **values})

    def rating(self, **values):
        return ArticlePostRating.objects.create(article=self.post,
            **{'actor_agent_id': self.agent.pk, 'rater_id': 'agent:菲伦', 'rating': 7, **values})

    def test_comment_endpoint_returns_own_score(self):
        self.comment()
        self.rating()
        response = APIClient().get(f'/api/article/agent-posts/{self.post.pk}/comments')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['comments'][0]['rating'], 7)

    def test_same_name_and_renamed_residents_use_stable_ids(self):
        comment = self.comment()
        other = Agent.objects.create(name='菲伦')
        self.rating(actor_agent_id=other.pk, rater_id=f'agent-id:{other.pk}', rating=9)
        self.assertEqual(comment_ratings([comment]), {})
        self.rating(rater_id=f'agent-id:{self.agent.pk}')
        self.agent.name = '新名字'
        self.agent.save()
        self.assertEqual(comment_ratings([comment]), {comment.pk: 7})

    def test_unique_legacy_identity_can_match_stable_rating(self):
        comment = self.comment(actor_agent_id='')
        self.rating(rater_id=f'agent-id:{self.agent.pk}')
        self.assertEqual(comment_ratings([comment]), {comment.pk: 7})

    def test_missing_invalid_or_other_post_rating_is_not_shown(self):
        comment = self.comment()
        self.assertEqual(comment_ratings([comment]), {})

        self.rating(is_valid=False)
        other_post = Article.objects.create(title='另一篇', coll_id=self.collection.pk)
        ArticlePostRating.objects.create(article=other_post, actor_agent_id=self.agent.pk, rater_id='agent:菲伦', rating=10)
        self.assertEqual(comment_ratings([comment]), {})

    def test_ambiguous_legacy_names_do_not_match(self):
        Agent.objects.create(name='菲伦')
        comment = self.comment(actor_agent_id='')
        self.rating(actor_agent_id='')
        self.assertEqual(comment_ratings([comment]), {})

    def test_changed_score_and_batch_query(self):
        comments = [self.comment(creator_id=f'user-{index}', actor_agent_id='') for index in range(5)]
        own = self.comment()
        rating = self.rating()
        rating.rating = 8
        rating.save()
        with self.assertNumQueries(1):
            self.assertEqual(comment_ratings([*comments, own]), {own.pk: 8})

    def test_latest_comments_returns_commenter_not_article_author(self):
        # 帖子创建人为猫猫
        self.post.agent_post_creator_name = '猫猫'
        self.post.agent_post_creator_avatar = 'maomao_avatar.png'
        self.post.save()

        # 评论者为菲伦
        self.comment(creator_name='菲伦', creator_avatar='fern_avatar.png', content='药师视角写食疗')

        response = APIClient().get(f'/api/article/agent-posts/collections/{self.collection.pk}/latest-comments')
        self.assertEqual(response.status_code, 200)
        comments = response.data['data']['comments']
        self.assertEqual(len(comments), 1)
        # 应展示评论人菲伦的信息，而非帖子作者猫猫
        self.assertEqual(comments[0]['agent_name'], '菲伦')
        self.assertEqual(comments[0]['agent_avatar'], 'fern_avatar.png')
        self.assertEqual(comments[0]['post_title'], '帖子')
