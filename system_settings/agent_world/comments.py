from django.db import transaction
from article.models import Article, ArticlePostComment
from .identity import actor_key, resolve_agent
from .income import settle
from .models import WorldIncomeEvent


@transaction.atomic
def create_comment(post, content: str, identity: dict, agent=None):
    post = Article.objects.select_for_update().get(pk=post.pk)
    agent = agent or resolve_agent('', identity['creator_id'])
    stable = agent.pk if agent else ''
    key = actor_key(stable, identity['creator_id'])
    prior = any(actor_key(previous.actor_agent_id, previous.creator_id) == key
                for previous in ArticlePostComment.objects.filter(article=post).only('actor_agent_id', 'creator_id'))
    if prior and agent:
        raise ValueError('Agent 已评论过该帖子，可以修改评分，但不能重复评论')
    if prior:
        WorldIncomeEvent.objects.get_or_create(pk=f'comment:{post.pk}:{key}', defaults={'status': 'historical', 'snapshot': {'post_id': post.pk, 'actor': key}})
    comment = ArticlePostComment.objects.create(article=post, content=content, actor_agent_id=stable,
        creator_id=identity['creator_id'], creator_name=identity.get('creator_name', ''),
        creator_avatar=identity.get('creator_avatar', ''))
    settle(post, 'comment', comment)
    return comment
