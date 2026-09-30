"""帖子和朋友圈共用收件箱、讨论上下文及连续回应限制。"""
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone
from .identity import actor_key
from .life_schedule import stable_id
from .social_models import SocialInbox, MomentComment


def user_actor(owner):
    return f'user:{owner}'


def post_owner(post):
    from anthology.models import Anthology
    return Anthology.objects.filter(pk=post.coll_id).values_list('user_id', flat=True).first()


def post_author(post, owner):
    if post.agent_post_author_id:
        return f'agent-id:{post.agent_post_author_id}'
    creator = post.agent_post_creator_id
    if creator.startswith(('agent-id:', 'agent:', 'user:')):
        # 旧的按名称身份只保留原标识，不重新绑定后来创建的同名居民。
        return creator
    from anthology.models import Anthology
    if creator or post.agent_post_creator_name or post.agent_post_creator_avatar or Anthology.objects.filter(pk=post.coll_id, type='agent').exists():
        return f'historical-post-author:{post.pk}'
    return user_actor(owner) if owner else ''


def user_notifications(owner):
    """按实际评论目标校验历史通知，在分页和未读计数之前排除旧误归属。"""
    from article.models import Article, ArticlePostComment
    from anthology.models import Anthology
    actor = user_actor(owner)
    agent_collections = Anthology.objects.filter(type='agent').values('pk')
    user_posts = Article.objects.filter(agent_post_author_id='').filter(
        Q(agent_post_creator_id=actor) |
        (Q(agent_post_creator_id='', agent_post_creator_name='', agent_post_creator_avatar='') &
         ~Q(coll_id__in=agent_collections))
    ).values('pk')
    owned_collections = Anthology.objects.filter(user_id=owner).values('pk')
    comments = ArticlePostComment.objects.filter(pk=OuterRef('source_id'),
        article_id=OuterRef('content_id'), is_valid=True, article__is_valid=True,
        article__coll_id__in=owned_collections).filter(
        Q(reply_to_actor_id=actor) |
        Q(reply_to_actor_id='', article_id__in=user_posts)
    )
    return SocialInbox.objects.filter(owner_id=owner, target_id=actor).exclude(status='invalid').annotate(
        valid_post_target=Exists(comments),
    ).filter(~Q(source_kind='post') | Q(valid_post_target=True))


def enqueue(owner, target, sender, kind, comment_id, content_id, root_id, identity):
    if not owner or not target or target == sender: return
    SocialInbox.objects.get_or_create(pk=stable_id(owner, kind, comment_id, target), defaults={
        'owner_id': owner, 'target_id': target, 'sender_id': sender, 'source_kind': kind,
        'source_id': comment_id, 'content_id': content_id, 'root_id': root_id, 'identity': identity})


def enqueue_post(post, comment):
    owner = post_owner(post)
    enqueue(owner, comment.reply_to_actor_id or post_author(post, owner),
            actor_key(comment.actor_agent_id, comment.creator_id) if comment.actor_agent_id else user_actor(comment.creator_id),
            'post', comment.pk, post.pk, comment.root_comment_id or comment.pk,
            {'name': comment.creator_name, 'avatar': comment.creator_avatar})


def invalidate(owner, kind, content_id):
    SocialInbox.objects.filter(owner_id=owner, source_kind=kind, content_id=content_id,
                              status__in=['pending', 'deferred']).update(status='invalid', updated_at=timezone.now())


def thread_context(inbox):
    if inbox.source_kind == 'post':
        from article.models import ArticlePostComment
        source = ArticlePostComment.objects.select_related('article').filter(pk=inbox.source_id, is_valid=True, article__is_valid=True).first()
        if not source or post_owner(source.article) != inbox.owner_id: return None
        rows = ArticlePostComment.objects.filter(article=source.article, is_valid=True).filter(
            Q(pk=inbox.root_id) | Q(root_comment_id=inbox.root_id)).order_by('created_at', 'pk')
        entries = [{'id': c.pk, 'actor_id': f'agent-id:{c.actor_agent_id}' if c.actor_agent_id else user_actor(c.creator_id),
                    'content': c.content, 'name': c.creator_name} for c in rows]
        return {'title': source.article.title, 'content': source.article.content[:60000], 'source': source.content, 'entries': entries[-30:],
                'version': source.article.updated_at.isoformat(), 'comment_version': source.updated_at.isoformat()}
    source = MomentComment.objects.select_related('moment').filter(pk=inbox.source_id, is_valid=True, moment__is_valid=True, moment__owner_id=inbox.owner_id).first()
    if not source: return None
    rows = MomentComment.objects.filter(moment=source.moment, is_valid=True).filter(Q(pk=inbox.root_id) | Q(root_id=inbox.root_id)).order_by('created_at', 'pk')
    return {'content': source.moment.content, 'source': source.content,
            'entries': [{'id': c.pk, 'actor_id': c.actor_id, 'name': c.identity.get('name', ''), 'content': c.content} for c in rows][-30:],
            'version': source.moment.updated_at.isoformat(), 'comment_version': source.updated_at.isoformat()}


def auto_reply_count(context):
    count = 0
    for entry in context['entries']:
        count = count + 1 if entry['actor_id'].startswith('agent-id:') else 0
    # 根评论属于开场，不计入六条自动回复。
    return max(0, count - 1) if context['entries'] and all(e['actor_id'].startswith('agent-id:') for e in context['entries']) else count
