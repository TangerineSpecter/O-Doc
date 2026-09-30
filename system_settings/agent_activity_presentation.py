"""只读动态投影：同次执行对同一帖子的评论和评分共用一张卡片。"""
from django.db.models import Exists, OuterRef, Q, Subquery

from .models import AgentActivity


def grouped_activities(queryset):
    # 无执行记录的历史事实无法可靠归组，保留独立展示。
    peers = AgentActivity.objects.filter(
        activity_type='interaction', run_record_id=OuterRef('run_record_id'),
        agent_id=OuterRef('agent_id'), artifact_article_id=OuterRef('artifact_article_id'),
        artifact_coll_id=OuterRef('artifact_coll_id'),
    )
    eligible = Q(activity_type='interaction', run_record_id__isnull=False,
                 agent_id__isnull=False) & ~Q(artifact_article_id='')
    return queryset.annotate(
        paired_comment=Exists(peers.filter(action='comment')),
        paired_rating=Subquery(peers.filter(action='rate').order_by('-occurred_at', '-id')
                              .values('score_delta_basis')[:1]),
    ).exclude(eligible & Q(action='rate', paired_comment=True))


def activity_title(activity):
    if activity.action == 'rate':
        from .agent_history import historical_activity_author
        name = activity.agent.name if activity.agent else historical_activity_author(activity).get('name', '居民')
        return f'{name}评分了《{activity.artifact_title}》'
    return activity.title


def activity_rating(activity) -> int | None:
    if activity.activity_type != 'interaction':
        return None
    if activity.action == 'rate':
        value = activity.score_delta_basis
    elif activity.action == 'comment' and activity.run_record_id and activity.agent_id:
        value = getattr(activity, 'paired_rating', None)
    else:
        return None
    try:
        rating = int(value)
    except (ValueError, TypeError):
        return None
    return rating if 1 <= rating <= 10 else None
