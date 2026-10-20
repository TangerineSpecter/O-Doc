"""装备实例级永久不买：记录、候选过滤与实例消失后的清理。"""
from decimal import Decimal

from .market_plan_models import MarketNoBuy, no_buy_id


def record(owner: str, actor_id: str, equipment_id: str, *, snapshot: dict | None = None,
           price: Decimal | str = 0, reason: str = '') -> MarketNoBuy:
    identity = no_buy_id(owner, actor_id, equipment_id)
    row, _ = MarketNoBuy.objects.update_or_create(
        pk=identity, defaults={
            'owner_id': owner, 'actor_id': actor_id, 'equipment_id': equipment_id,
            'snapshot': snapshot or {}, 'price': Decimal(str(price or 0)),
            'reason': (reason or '属性或价格不划算')[:300],
        })
    return row


def is_blocked(owner: str, actor_id: str, equipment_id: str) -> bool:
    return MarketNoBuy.objects.filter(
        owner_id=owner, actor_id=actor_id, equipment_id=equipment_id).exists()


def blocked_ids(owner: str, actor_id: str) -> set[str]:
    return set(MarketNoBuy.objects.filter(
        owner_id=owner, actor_id=actor_id).values_list('equipment_id', flat=True))


def clear_equipment(equipment_id: str) -> int:
    """实例真正消失（卖给商店/删除）时，所有居民对它的不买标记都失去意义。"""
    return MarketNoBuy.objects.filter(equipment_id=equipment_id).delete()[0]


def clear_actor(owner: str, actor_id: str) -> int:
    return MarketNoBuy.objects.filter(owner_id=owner, actor_id=actor_id).delete()[0]


def _wearable(snapshot: dict, rules: dict, job: str, level: int, slot: str) -> bool:
    """有穿戴规则快照时按规则判断职业、等级与部位，否则退回快照字段。"""
    if rules:
        try:
            from .combat.equipment_snapshot import permitted, slot_matches
            if slot and not slot_matches(snapshot, rules, slot):
                return False
            return permitted(snapshot, rules, job, level)
        except (KeyError, TypeError, ValueError):
            return False
    if int(snapshot.get('level') or 1) > level:
        return False
    job_levels = snapshot.get('job_levels') or {}
    if job and job_levels and (job not in job_levels or level < int(job_levels[job])):
        return False
    return True


def _improves(snapshot: dict, current: dict) -> bool:
    """候选装备至少有一项属性高于当前部位装备，否则不值得再问模型。"""
    stats = snapshot.get('stats') or {}
    baseline = current.get('stats') or {}
    if not stats:
        return False
    return any(float(value) > float(baseline.get(key, 0) or 0) for key, value in stats.items())


def filter_candidates(owner: str, actor_id: str, rows: list[dict], job: str, level: int, *,
                      slot: str = '', current: dict | None = None) -> list[dict]:
    """先剔除永久不买、不可穿戴与属性无提升的装备，只把值得比较的交给模型。"""
    blocked = blocked_ids(owner, actor_id)
    result = []
    for row in rows:
        equipment_id = str(row.get('equipment_id') or '')
        snapshot = row.get('snapshot') or {}
        if equipment_id and equipment_id in blocked:
            continue
        if not _wearable(snapshot, row.get('rules') or {}, job, level, slot):
            continue
        if current and not _improves(snapshot, current):
            continue
        result.append(row)
    return result
