"""删除 Agent 前固化公开历史作者资料；历史身份键不随删除清空。"""
from django.db.models import Q
from django.db.models.signals import pre_delete, pre_save
from django.dispatch import receiver

from article.models import (
    Article, ArticleAnnotation, ArticleAnnotationComment, ArticlePostComment,
    ArticlePostRating, ImageReview,
)
from .models import Agent, AgentActivity
from .sync_state import is_tracking_suspended


def snapshot(agent):
    return {'id': agent.pk, 'name': agent.name, 'avatar': agent.avatar}


def _save_identity(queryset, fields):
    # 逐条 save 触发同步修订信号；批量 update 不会记录快照变化。
    for record in queryset.iterator():
        changed = []
        for field, value in fields.items():
            if getattr(record, field) != value:
                setattr(record, field, value)
                changed.append(field)
        if changed:
            record.save(update_fields=changed)


@receiver(pre_save, sender=Agent)
def stabilize_legacy_authors_before_rename(sender, instance, using, **kwargs):
    if kwargs.get('raw') or instance._state.adding:
        return
    previous = Agent.objects.using(using).filter(pk=instance.pk).first()
    if not previous or previous.name == instance.name:
        return
    if Agent.objects.using(using).filter(name=previous.name).exclude(pk=instance.pk).exists():
        return
    legacy_key = f'agent:{previous.name}'
    for model in (ArticleAnnotation, ArticleAnnotationComment):
        _save_identity(model.objects.using(using).filter(creator_type='agent', creator_id=legacy_key), {
            'creator_id': f'agent-id:{instance.pk}',
        })
    _save_identity(Article.objects.using(using).filter(
        agent_post_author_id='', agent_post_creator_id=legacy_key,
    ), {'agent_post_author_id': instance.pk})
    _save_identity(ArticlePostComment.objects.using(using).filter(
        actor_agent_id='', creator_id=legacy_key,
    ), {'actor_agent_id': instance.pk})
    _save_identity(ArticlePostRating.objects.using(using).filter(
        actor_agent_id='', rater_id=legacy_key,
    ), {'actor_agent_id': instance.pk})


@receiver(pre_save, sender=AgentActivity)
def capture_activity_author(sender, instance, **kwargs):
    if not instance.agent_id or kwargs.get('raw'):
        return
    agent = Agent.objects.filter(pk=instance.agent_id).first()
    if agent:
        metadata = instance.metadata if isinstance(instance.metadata, dict) else {}
        instance.metadata = {**metadata, 'agentSnapshot': snapshot(agent)}
        # 部分更新不包含 metadata 时，由删除前的固化确保最终资料完整。


@receiver(pre_delete, sender=Agent)
def freeze_agent_history(sender, instance, using, **kwargs):
    if is_tracking_suspended():
        return
    agent = instance
    identity = snapshot(agent)
    from .agent_world.social_models import SocialRelation
    _save_identity(SocialRelation.objects.using(using).filter(counterpart_id=f'agent-id:{agent.pk}'), {
        'counterpart_identity': identity,
    })
    activities = AgentActivity.objects.using(using).filter(agent_id=agent.pk)
    annotation_ids = list(activities.filter(artifact_kind='articleAnnotation').filter(
        Q(action='annotate') | Q(event_key__startswith='legacy:annotation:')
        | Q(event_key__startswith='annotation:'),
    ).values_list('artifact_id', flat=True))
    comment_ids = list(activities.filter(artifact_kind='articleComment').values_list('artifact_id', flat=True))
    reply_ids = [key.split('annotation-comment:', 1)[1] for key in activities.filter(
        event_key__contains='annotation-comment:',
    ).values_list('event_key', flat=True)]
    for activity in activities.iterator():
        metadata = activity.metadata if isinstance(activity.metadata, dict) else {}
        activity.metadata = {**metadata, 'agentSnapshot': identity}
        activity.save(using=using, update_fields=['metadata'])

    # 稳定身份优先；只有名称唯一时兼容旧的按名称身份。
    keys = [f'agent:{agent.pk}', f'agent-id:{agent.pk}']
    if not Agent.objects.using(using).filter(name=agent.name).exclude(pk=agent.pk).exists():
        keys.append(f'agent:{agent.name}')
    _save_identity(Article.objects.using(using).filter(
        Q(agent_post_author_id=agent.pk)
        | (Q(agent_post_author_id='') & Q(agent_post_creator_id__in=keys)),
    ), {'agent_post_creator_name': agent.name, 'agent_post_creator_avatar': agent.avatar,
        'agent_post_author_id': agent.pk})
    _save_identity(ArticlePostComment.objects.using(using).filter(
        Q(actor_agent_id=agent.pk) | (Q(actor_agent_id='') & (Q(creator_id__in=keys) | Q(pk__in=comment_ids))),
    ), {'creator_name': agent.name, 'creator_avatar': agent.avatar, 'actor_agent_id': agent.pk})
    _save_identity(ArticlePostRating.objects.using(using).filter(
        Q(actor_agent_id=agent.pk) | (Q(actor_agent_id='') & Q(rater_id__in=keys)),
    ), {'rater_name': agent.name, 'rater_avatar': agent.avatar, 'actor_agent_id': agent.pk})
    _save_identity(ArticleAnnotation.objects.using(using).filter(creator_type='agent').filter(
        Q(creator_id__in=keys) | Q(pk__in=annotation_ids),
    ), {'creator_name': agent.name, 'creator_avatar': agent.avatar, 'creator_id': f'agent-id:{agent.pk}'})
    _save_identity(ArticleAnnotationComment.objects.using(using).filter(creator_type='agent').filter(
        Q(creator_id__in=keys) | Q(pk__in=reply_ids),
    ), {'creator_name': agent.name, 'creator_avatar': agent.avatar, 'creator_id': f'agent-id:{agent.pk}'})
    _save_identity(ImageReview.objects.using(using).filter(agent_key=agent.pk), {
        'agent_name': agent.name, 'agent_avatar': agent.avatar,
    })


def historical_activity_author(activity):
    metadata = activity.metadata if isinstance(activity.metadata, dict) else {}
    stored = metadata.get('agentSnapshot')
    if isinstance(stored, dict) and stored.get('name'):
        return {'id': '', 'name': stored['name'], 'avatar': stored.get('avatar') or ''}
    # 旧动态没有快照时，只取关联作品的明确作者，不从标题猜人物。
    if activity.artifact_kind == 'agentPost' and activity.activity_type == 'publication':
        post = Article.objects.filter(pk=activity.artifact_article_id).first()
        if post and post.agent_post_creator_name:
            return {'id': '', 'name': post.agent_post_creator_name, 'avatar': post.agent_post_creator_avatar}
    if activity.artifact_kind == 'articleComment':
        comment = ArticlePostComment.objects.filter(pk=activity.artifact_id).first()
        if comment and comment.creator_name:
            return {'id': '', 'name': comment.creator_name, 'avatar': comment.creator_avatar}
    if activity.artifact_kind == 'articleAnnotation':
        if 'annotation-comment:' in activity.event_key:
            comment_id = activity.event_key.split('annotation-comment:', 1)[1]
            record = ArticleAnnotationComment.objects.filter(pk=comment_id).first()
        elif activity.action == 'annotate' or activity.event_key.startswith(('annotation:', 'legacy:annotation:')):
            record = ArticleAnnotation.objects.filter(pk=activity.artifact_id).first()
        else:
            record = None
        if record and record.creator_name:
            return {'id': '', 'name': record.creator_name, 'avatar': record.creator_avatar}
    if activity.activity_type == 'work' and activity.run_record_id:
        record = activity.run_record
        if record.agent_name and not record.agent_runs:
            return {'id': '', 'name': record.agent_name, 'avatar': ''}
    return {'id': '', 'name': '历史作者未关联', 'avatar': ''}
