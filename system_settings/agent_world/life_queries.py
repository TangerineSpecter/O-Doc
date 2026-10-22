"""生活日程的只读摘要，不生成计划或改变执行状态。"""
from django.db.models import Min

from .life_models import LifeConfig, LifeItem
from .life_time import local_time


def next_activity_times(owner_id, actor_ids):
    if owner_id is None:
        return {}
    paused = LifeConfig.objects.filter(pk=owner_id).values_list('paused_agents', flat=True).first() or []
    rows = (LifeItem.objects.filter(owner_id=owner_id, actor_id__in=actor_ids,
                                    status__in=('pending', 'deferred'))
            .exclude(actor_id__in=paused).exclude(activity='rest')
            .values('actor_id').annotate(next_at=Min('scheduled_at')))
    return {row['actor_id']: local_time(row['next_at']).isoformat() for row in rows}
