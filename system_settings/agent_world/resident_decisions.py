"""Read-only resident decisions from saved schedule revisions and combat facts."""
from datetime import datetime

from .combat.models import CombatCatalog, CombatFact
from .daily_feed import _event, _window
from .life_models import LifeRevision
from .life_time import local_time


ACTIVITY_NAMES = {
    'blacksmith': '铁匠铺打造', 'fishing': '钓鱼', 'lottery': '大乐透购票',
    'post_interaction': '阅读互动', 'post_publish': '自主发帖',
    'exploration': '迷宫探索', 'cooking': '美食制作', 'alchemy': '炼金制作',
    'farm': '农场经营', 'travel': '旅行', 'investment': '股票投资',
    'market': '市场交易',
}


def _job_name(version: str, job_id: str, cache: dict[str, dict[str, str]]) -> str:
    if version not in cache:
        tables = CombatCatalog.objects.filter(pk=version).values_list('tables', flat=True).first() or {}
        cache[version] = {row['id']: row['name'] for row in tables.get('professions', [])
                          if isinstance(row, dict) and row.get('id') and row.get('name')}
    return cache[version].get(job_id, job_id)


def decision_events(owner: str, actor_id: str, day, names: dict[str, str]) -> list[dict]:
    """Only committed choices are shown; a generated explanation is never called model reasoning."""
    start, end = _window(day)
    events = []
    revisions = LifeRevision.objects.filter(
        item__owner_id=owner, item__actor_id=actor_id,
        created_at__gte=start, created_at__lt=end,
    ).select_related('item')
    for row in revisions:
        before, after = row.before or {}, row.after or {}
        activity = after.get('activity')
        reason = after.get('intent')
        if (after.get('status') != 'pending' or activity in ('unplanned', 'rest', None)
                or not isinstance(reason, str) or not reason.strip()
                or (before.get('activity'), before.get('intent')) == (activity, reason)):
            continue
        choice_only = reason.startswith('系统选择说明：')
        event = _event('decision', 'life-decision', row.pk, row.created_at, actor_id,
                       names.get(actor_id), f"选择了{ACTIVITY_NAMES.get(activity, activity)}",
                       '' if choice_only else reason.strip()[:1200],
                       target={'kind': 'life', 'id': row.item_id})
        event['decisionBasis'] = 'choice_only' if choice_only else 'model_reason'
        scheduled = after.get('scheduled_at')
        if isinstance(scheduled, str):
            try:
                event['decisionSlot'] = local_time(datetime.fromisoformat(scheduled)).isoformat()
            except ValueError:
                pass
        events.append(event)

    catalog_cache: dict[str, dict[str, str]] = {}
    facts = CombatFact.objects.filter(owner_id=owner, actor_id=actor_id, kind='promote',
                                      created_at__gte=start, created_at__lt=end)
    for row in facts:
        payload = row.payload if isinstance(row.payload, dict) else {}
        job_id = payload.get('arguments')
        if not isinstance(job_id, str) or not job_id:
            continue
        version = payload.get('catalog_id') or ''
        job_name = _job_name(version, job_id, catalog_cache)
        reason = payload.get('reason') if isinstance(payload.get('reason'), str) else ''
        level = (payload.get('progression_after') or {}).get('level')
        title = f"转职为{job_name}" if not isinstance(level, int) else f"Lv.{level} 转职为{job_name}"
        event = _event('decision', 'combat-promotion', row.pk, row.created_at, actor_id,
                       names.get(actor_id), title, reason.strip(),
                       target={'kind': 'exploration', 'id': row.exploration_id} if row.exploration_id else None)
        event['decisionBasis'] = 'model_reason' if reason.strip() else 'choice_only'
        events.append(event)
    return sorted(events, key=lambda event: (event['occurredAt'], event['id']), reverse=True)


def latest_decision_day(owner: str, actor_id: str, before: datetime):
    """Find a resident's previous decision date without scanning other residents' history."""
    candidates = []
    revisions = LifeRevision.objects.filter(item__owner_id=owner, item__actor_id=actor_id,
                                             created_at__lt=before)
    facts = CombatFact.objects.filter(owner_id=owner, actor_id=actor_id, kind='promote',
                                      created_at__lt=before)
    for queryset in (revisions, facts):
        when = queryset.order_by('-created_at').values_list('created_at', flat=True).first()
        if when:
            candidates.append(when)
    return local_time(max(candidates)).date() if candidates else None
