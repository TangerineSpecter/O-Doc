"""从场次事实投影活动，不为检索失败复制居民动态或讨论记录。"""
from .life_time import local_time
from .social_models import SocialTheatreEvent


def theatre_feed(owner: str, start, end) -> list[dict]:
    rows = SocialTheatreEvent.objects.filter(owner_id=owner, updated_at__gte=start,
                                           updated_at__lt=end).exclude(status='deleted').order_by('updated_at', 'pk')
    events, empty = [], None
    for row in rows:
        topic = (row.snapshot or {}).get('topic') or {}
        if not row.transcript and not (row.status == 'running' and topic):
            if row.status in ('skipped', 'failed', 'expired', 'completed'):
                empty = row
            continue
        people = row.participants or []
        names = '、'.join(str(person.get('name', '')) for person in people if person.get('name'))
        title = topic.get('title') or row.source.get('title') or '新闻话题'
        heading = f'{names}正在热议【{title}】' if row.status == 'running' else (
            f'{names}聊了聊【{title}】' if row.status == 'completed' else f'【{title}】的讨论暂时中断')
        events.append({
            'id': f'theatre:{row.pk}', 'source': 'theatre', 'category': 'interaction',
            'actorId': '', 'actorIds': [str(person['id']) for person in people],
            'actorName': names or '居民小剧场', 'occurredAt': local_time(row.updated_at).isoformat(),
            'title': heading, 'detail': f'已保存{len(row.transcript)}条发言。' + (
                '可以继续查看讨论。' if row.status == 'running' else
                '发言已保留，可从中断处继续。' if row.status == 'failed' else ''),
            'status': 'running' if row.status == 'running' else 'success' if row.status == 'completed' else 'paused',
            'amount': None, 'currentAction': '小剧场', 'target': {'kind': 'theatre', 'id': row.pk},
        })
    if empty:
        failed = empty.status == 'failed'
        events.append({
            'id': f'theatre-notice:{empty.business_date.isoformat()}', 'source': 'theatre-notice',
            'category': 'interaction', 'actorId': '', 'actorIds': [], 'actorName': '居民小剧场',
            'occurredAt': local_time(empty.updated_at).isoformat(),
            'title': '本次小剧场暂未开始' if failed else '本次没有发起新的讨论',
            'detail': '模型暂未完成回应，可稍后继续。' if failed else (
                '大家这次没有继续聊。' if empty.status == 'completed' else '本次未选出适合讨论的事件，未生成讨论内容。'),
            'status': 'paused' if failed else 'success', 'amount': None, 'currentAction': '小剧场',
            'target': {'kind': 'theatre', 'id': empty.pk} if failed else None,
        })
    return events
