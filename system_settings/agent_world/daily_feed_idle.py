"""Display idle runs from their durable schedule without changing retry ownership."""
from .life_models import LifeItem
from .life_time import local_time


def waiting_runs(owner: str, record_ids: list[str]) -> dict[str, dict]:
    if not record_ids:
        return {}
    items = LifeItem.objects.filter(
        owner_id=owner, status__in=('deferred', 'paused'),
        context__interleaving__selection_record_id__in=record_ids,
    ).prefetch_related('revisions')
    result = {}
    for item in items:
        revisions = sorted(item.revisions.all(), key=lambda row: row.created_at, reverse=True)
        reason = next((row.reason for row in revisions if row.reason), '')
        label = '等待重试' if item.status == 'deferred' else '已暂停'
        detail = reason or '本轮执行已暂停，保留原活动安排'
        if item.status == 'deferred':
            detail += f'；计划于 {local_time(item.scheduled_at):%m/%d %H:%M} 重试'
        result[item.context['interleaving']['selection_record_id']] = {
            'status': item.status, 'title': f'自由活动 · {label}', 'detail': detail,
        }
    return result
