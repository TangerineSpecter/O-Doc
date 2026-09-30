"""社交内容的授权验证与原子提交。"""
from django.db import transaction
from django.utils import timezone
from .life_schedule import stable_id
from .social_models import Moment, MomentComment, MomentLike
from .social_discussion import enqueue, invalidate
from .social_relations import apply_event


def text(value, limit=1000):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f'内容须为1至{limit}字文本')
    return value.strip()


def image_ids(owner, values, actor=None):
    from assets.models import Asset
    if not isinstance(values, list) or len(values) > 9 or any(not isinstance(i, str) for i in values):
        raise ValueError('最多选择九张图片')
    values = list(dict.fromkeys(values))
    allowed = set(Asset.objects.filter(pk__in=values, uploader=owner, file_type='image', is_valid=True).values_list('pk', flat=True))
    if actor and actor.startswith('agent-id:'):
        allowed.update(r['id'] for r in available_images(owner, actor[9:]))
    if not set(values).issubset(allowed):
        raise ValueError('图片不存在或不属于当前账号')
    return values


@transaction.atomic
def publish(owner, actor, identity, content, images=None, *, key=None, evidence=None):
    values = image_ids(owner, images or [], actor)
    row, _ = Moment.objects.get_or_create(pk=key or __import__('uuid').uuid4().hex, defaults={
        'owner_id': owner, 'actor_id': actor, 'identity': identity, 'content': '\n'.join(line for line in text(content, 3000).splitlines() if line.strip()),
        'images': values, 'evidence': evidence or []})
    if row.owner_id != owner or row.actor_id != actor: raise ValueError('发布身份不一致')
    return row


@transaction.atomic
def comment(owner, moment_id, actor, identity, content, parent_id='', reply_to=''):
    row = Moment.objects.select_for_update().get(pk=moment_id, owner_id=owner, is_valid=True)
    parent = None
    if parent_id:
        parent = MomentComment.objects.filter(pk=parent_id, moment=row, is_valid=True).first()
        if not parent: raise ValueError('回复对象不存在')
        if reply_to and reply_to != parent.actor_id: raise ValueError('回复对象与父评论不一致')
    elif reply_to: raise ValueError('回复须指定父评论')
    result = MomentComment.objects.create(moment=row, actor_id=actor, identity=identity, content=text(content),
        parent_id=parent.pk if parent else '', root_id=(parent.root_id or parent.pk) if parent else '',
        reply_to_actor_id=parent.actor_id if parent else '')
    enqueue(owner, result.reply_to_actor_id or row.actor_id, actor, 'moment', result.pk, row.pk,
            result.root_id or result.pk, identity)
    return result


@transaction.atomic
def like(owner, moment_id, actor, identity, active):
    if type(active) is not bool: raise ValueError('点赞状态须为布尔值')
    moment = Moment.objects.select_for_update().get(pk=moment_id, owner_id=owner, is_valid=True)
    row, _ = MomentLike.objects.get_or_create(pk=stable_id(moment.pk, actor), defaults={
        'moment': moment, 'actor_id': actor, 'identity': identity, 'is_valid': False})
    row.is_valid = active
    if active and not row.rewarded:
        if actor.startswith('agent-id:'):
            apply_event(owner, actor[9:], moment.actor_id, f'like:{row.pk}',
                        {'category': 'like', 'reason': '认可这条生活分享'}, moment.identity)
        row.rewarded = True
    row.save()
    return row


@transaction.atomic
def delete_moment(owner, key, actor):
    row = Moment.objects.select_for_update().get(pk=key, owner_id=owner, actor_id=actor, is_valid=True)
    row.is_valid = False
    row.save()
    invalidate(owner, 'moment', row.pk)


def moment_data(row, viewer):
    return {'id': row.pk, 'actor_id': row.actor_id, 'identity': row.identity, 'content': row.content,
            'images': row.images, 'image_state': {k: v for k, v in row.image_state.items() if k in ('status', 'error', 'task_id')},
            'can_retry_image': bool(row.image_state.get('request')), 'created_at': row.created_at, 'updated_at': row.updated_at,
            'like_count': row.likes.filter(is_valid=True).count(),
            'liked_by': [{'actor_id': like.actor_id, 'identity': like.identity} for like in row.likes.filter(is_valid=True).order_by('updated_at', 'pk')],
            'liked': row.likes.filter(actor_id=viewer, is_valid=True).exists(),
            'comment_count': row.comments.filter(is_valid=True).count(), 'can_delete': row.actor_id == viewer}


def comment_data(row):
    return {k: getattr(row, k) for k in ('id', 'actor_id', 'identity', 'content', 'parent_id', 'root_id', 'reply_to_actor_id', 'created_at')}


def available_images(owner, actor):
    """只给模型实际可引用的图片 ID；不把图片身份交给模型猜测。"""
    from assets.models import Asset
    ids = set()
    for row in Moment.objects.filter(owner_id=owner, actor_id=f'agent-id:{actor}', is_valid=True).order_by('-created_at')[:20]:
        ids.update(row.images)
    from .travel_models import TravelJourney
    from utils.resource_assets import extract_resource_ids_from_content
    from article.models import Article
    posts = TravelJourney.objects.filter(owner_id=owner, actor_id=actor).exclude(article_id='').values_list('article_id', flat=True)
    for row in Article.objects.filter(pk__in=posts, is_valid=True).only('content')[:20]:
        ids.update(extract_resource_ids_from_content(row.content))
    return list(Asset.objects.filter(pk__in=ids, file_type='image', is_valid=True).values('id', 'name')[:30])
