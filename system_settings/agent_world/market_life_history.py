"""从既有执行身份与扣款业务键关联生活采购，不新增同步字段。"""
from decimal import Decimal
from django.db.models import Q
from system_settings.models import WorldAction
from .life_models import LifeItem, LifeRevision
from .life_schedule import execution_key, stable_id
from .life_time import local_time
from .market_models import MarketTransaction


def budget_calls(owner: str, sessions: list[dict]) -> dict:
    if not sessions:
        return {}
    records = {row['record_id'] for row in sessions if row['record_id']}
    actions = dict(WorldAction.objects.filter(record_id__in=records).values_list('record_id', 'pk'))
    transactions = list(MarketTransaction.objects.filter(owner_id=owner,
        session_id__in=[row['id'] for row in sessions]).values('id', 'session_id', 'actor_id'))
    debit_sessions = {f"market:{row['id']}:{row['actor_id']}": row['session_id'] for row in transactions}
    # 已经执行过的安排会更新 updated_at；同时保留直接记录关联的兼容路径。
    items = list(LifeItem.objects.filter(owner_id=owner, actor_id__in={row['actor_id'] for row in sessions}).filter(
        Q(record_id__in=records) | Q(status='running') | Q(updated_at__gte=min(row['created_at'] for row in sessions))))
    final_actions = dict(WorldAction.objects.filter(record_id__in=[item.record_id for item in items if item.record_id])
        .values_list('record_id', 'pk'))
    linked = {}
    for item in items:
        keys = {item.pk, execution_key(item)}
        if item.record_id in final_actions:
            keys.add(final_actions[item.record_id])
        supply_keys = {stable_id(key, 'supplies') for key in keys}
        charged = {debit_sessions[key] for key in item.context.get('debit_keys', []) if key in debit_sessions}
        linked[item.pk] = [row for row in sessions if row['actor_id'] == item.actor_id and (
            (row['record_id'] and row['record_id'] == item.record_id) or
            actions.get(row['record_id']) in supply_keys or row['id'] in charged)]
    result = {}
    for revision in LifeRevision.objects.filter(item_id__in=[key for key, rows in linked.items() if rows]):
        before, after = revision.before.get('budget'), revision.after.get('budget')
        if before is None or after is None or Decimal(before) == Decimal(after):
            continue
        for row in linked[revision.item_id]:
            # 后续农场/投资阶段的调整不属于已离场的前置市场会话。
            if revision.created_at > (row['ended_at'] or row['expires_at']):
                continue
            result.setdefault(row['id'], []).append({
                'name': 'adjust_life_budget', 'at': local_time(revision.created_at).isoformat(), 'arguments': {},
                'result': {'budget_before': before, 'budget_after': after, 'reason': revision.reason}})
    return result
