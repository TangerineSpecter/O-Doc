from django.db import transaction
from article.models import Article, ArticlePostComment
from .identity import actor_key, resolve_agent
from .income import settle
from .models import WorldIncomeEvent
from .farm_gate import guarded


@guarded
@transaction.atomic
def create_comment(post, content: str, identity: dict, agent=None, parent_comment_id="", reply_to_actor_id=""):
    post = Article.objects.select_for_update().get(pk=post.pk)
    if not post.is_valid: raise ValueError('帖子已删除，不能继续讨论')
    agent = agent or resolve_agent('', identity['creator_id'])
    stable = agent.pk if agent else ''
    key = actor_key(stable, identity['creator_id'])
    parent = None
    if parent_comment_id:
        parent = ArticlePostComment.objects.filter(pk=parent_comment_id, article=post, is_valid=True).first()
        if not parent: raise ValueError('回复对象不存在')
        target = f'agent-id:{parent.actor_agent_id}' if parent.actor_agent_id else f'user:{parent.creator_id}'
        if reply_to_actor_id and reply_to_actor_id != target: raise ValueError('回复对象与父评论不一致')
    elif reply_to_actor_id: raise ValueError('回复须指定父评论')
    prior = any(actor_key(previous.actor_agent_id, previous.creator_id) == key
                for previous in ArticlePostComment.objects.filter(article=post, parent_comment_id="").only('actor_agent_id', 'creator_id'))
    if prior and agent and not parent:
        raise ValueError('Agent 已评论过该帖子，可以修改评分，但不能重复评论')
    if prior and not parent:
        WorldIncomeEvent.objects.get_or_create(pk=f'comment:{post.pk}:{key}', defaults={'status': 'historical', 'snapshot': {'post_id': post.pk, 'actor': key}})
    comment = ArticlePostComment.objects.create(article=post, content=content, actor_agent_id=stable,
        creator_id=identity['creator_id'], creator_name=identity.get('creator_name', ''),
        creator_avatar=identity.get('creator_avatar', ''), parent_comment_id=parent.pk if parent else '',
        root_comment_id=(parent.root_comment_id or parent.pk) if parent else '', reply_to_actor_id=target if parent else '')
    if not parent: settle(post, 'comment', comment)
    from .social_discussion import enqueue_post
    enqueue_post(post, comment)
    return comment
