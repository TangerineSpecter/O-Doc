"""历史 Agent 作者身份不能降级为文集所属用户。"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from anthology.models import Anthology
from article.models import Article, ArticlePostComment
from system_settings.models import Agent
from .social_discussion import enqueue_post, post_author, user_actor
from .social_models import SocialInbox


class HistoricalPostIdentityTests(TestCase):
    def setUp(self):
        self.owner = 'admin'
        self.user = User.objects.create_superuser('admin', password='test')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.collection = Anthology.objects.create(title='历史帖子', type='agent', user_id=self.owner)
        self.agent = Agent.objects.create(name='猫猫')

    def post(self, **kwargs):
        return Article.objects.create(title='历史帖子', coll_id=self.collection.pk, author=self.owner, **kwargs)

    def comment(self, post, **kwargs):
        return ArticlePostComment.objects.create(article=post, content='评论', creator_id=f'agent-id:{self.agent.pk}',
            creator_name=self.agent.name, actor_agent_id=self.agent.pk, **kwargs)

    def inbox(self):
        response = self.client.get('/api/settings/agent-world/social/inbox/')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data['data']

    def test_legacy_agent_author_is_not_user_or_new_namesake(self):
        post = self.post(agent_post_creator_id='agent:旧作者', agent_post_creator_name='旧作者')
        Agent.objects.create(name='旧作者')
        self.assertEqual(post_author(post, self.owner), 'agent:旧作者')
        enqueue_post(post, self.comment(post))
        self.assertFalse(SocialInbox.objects.filter(target_id=user_actor(self.owner)).exists())
        self.assertEqual(self.inbox()['unread'], 0)

    def test_completely_missing_agent_author_is_not_user(self):
        post = self.post()
        self.assertEqual(post_author(post, self.owner), f'historical-post-author:{post.pk}')
        enqueue_post(post, self.comment(post))
        self.assertEqual(self.inbox()['items'], [])

    def test_deleted_agent_id_still_targets_historical_agent(self):
        old = Agent.objects.create(name='旧作者', avatar='旧头像')
        post = self.post(agent_post_author_id=old.pk, agent_post_creator_id=f'agent-id:{old.pk}')
        identity = old.pk
        old.delete()
        post.refresh_from_db()
        self.assertEqual(post.agent_post_author_id, identity)
        self.assertEqual(post.agent_post_creator_name, '旧作者')
        self.assertEqual(post.agent_post_creator_avatar, '旧头像')
        enqueue_post(post, self.comment(post))
        self.assertEqual(SocialInbox.objects.get().target_id, f'agent-id:{identity}')
        self.assertEqual(self.inbox()['unread'], 0)

    def test_existing_wrong_notifications_are_filtered_before_limit_and_count(self):
        post = self.post(agent_post_creator_id='agent:旧作者')
        for index in range(101):
            comment = self.comment(post)
            SocialInbox.objects.create(pk=f'wrong-{index}', owner_id=self.owner, target_id=user_actor(self.owner),
                sender_id=f'agent-id:{self.agent.pk}', source_kind='post', source_id=comment.pk, content_id=post.pk)
        # Agent 帖子里的直接回复用户仍然属于“与我有关”。
        parent = ArticlePostComment.objects.create(article=post, creator_id=self.owner, creator_name='我', content='用户评论')
        reply = self.comment(post, parent_comment_id=parent.pk, root_comment_id=parent.pk, reply_to_actor_id=user_actor(self.owner))
        enqueue_post(post, reply)
        response = self.inbox()
        self.assertEqual(response['unread'], 1)
        self.assertEqual(len(response['items']), 1)
        self.assertEqual(response['items'][0]['source_id'], reply.pk)
        self.assertIn(f'#comment-{reply.pk}', response['items'][0]['content_url'])
        self.assertNotIn('valid_post_target', response['items'][0])
        self.assertEqual(SocialInbox.objects.count(), 102)

    def test_ordinary_user_article_comment_still_notifies_user(self):
        collection = Anthology.objects.create(title='我的文章', type='article', user_id=self.owner)
        post = Article.objects.create(title='我的文章', coll_id=collection.pk, author=self.owner)
        self.assertEqual(post_author(post, self.owner), user_actor(self.owner))
        enqueue_post(post, self.comment(post))
        self.assertEqual(self.inbox()['unread'], 1)
