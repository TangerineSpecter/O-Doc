"""把旧播种记录对齐到上传校验使用的开工窗口，不放宽 validate_queue。

日程页只看安排和操作是否成功。手动上传会先把时间截到毫秒，再要求
播种快照时间落在 [activated_at, cutoff) 内。库里的完整时间可以仍在窗口内，
或与开工标记差一整段时区，校验仍会报「播种不在已激活计划的活动时段内」。
"""
import json
import math
from datetime import datetime

from django.conf import settings
from django.core import serializers
from django.utils import timezone

from system_settings.models import WorldAction
from utils.sync_datetime import SyncJSONEncoder

from .farm_models import AgentFarm, FarmCatalog, FarmOperation
from .life_models import LifeItem
from .life_time import SHANGHAI, local_time
from .market_models import MarketSession, MarketTransaction


def wire_timestamp(value) -> float:
    """上传快照里的播种时间：与 validate_queue 解析序列化结果的方式相同。"""
    if isinstance(value, str):
        text = value
    else:
        text = SyncJSONEncoder().default(value)
    occurred = datetime.fromisoformat(text)
    return local_time(occurred).timestamp()


def storage_instant(timestamp: float) -> datetime:
    """写成库时，让 local_time 再读回同一上海时刻。"""
    aware = datetime.fromtimestamp(timestamp, SHANGHAI)
    if settings.USE_TZ:
        return aware
    return aware.replace(tzinfo=None)


def activation_mark(earliest_wire: float, cutoff: float) -> float | None:
    """取不晚于最早播种、且严格早于截止的整秒。整秒经 JSON 往返后仍稳定。"""
    if not earliest_wire < cutoff:
        return None
    mark = float(math.floor(earliest_wire))
    if mark < cutoff:
        return mark
    return None


def instant_before(cutoff: float, floor: float) -> datetime | None:
    """找一个写回后仍落在 [floor, cutoff) 的时刻，从截止前 1 毫秒向前试。"""
    timestamp = cutoff - 0.001
    for _ in range(8):
        if timestamp < floor:
            return None
        candidate = storage_instant(timestamp)
        wire = wire_timestamp(candidate)
        if floor <= wire < cutoff:
            return candidate
        timestamp -= 0.001
    return None


def plant_operations(farm: AgentFarm, plan_id: str) -> list[FarmOperation]:
    keys = set(farm.state.get('operation_keys') or [])
    rows = FarmOperation.objects.filter(farm_id=farm.pk, pk__in=keys)
    return [op for op in rows if op.result.get('planting_plan_id') == plan_id and op.operation.get('kind') == 'plant']


def _gap_text(delta: float) -> str:
    if delta < 0.001:
        return '上传快照把时间截到毫秒后，比开工早了不到 1 毫秒；库内完整时间仍贴着开工，日程不会显示失败'
    if delta >= 3600:
        return f'快照时间比开工早 {delta / 3600:.1f} 小时；日程仍按成功的播种记录显示，常见于同一时刻被记成两套钟'
    return f'快照时间比开工早 {delta:.3f} 秒；日程只看任务是否失败，不比较这个窗口'


def _activation_actions(actions: list, plan_id: str, old) -> list:
    owned = [row for row in actions if row.snapshot.get('planting_plan_id') == plan_id]
    if old:
        matched = [row for row in owned if row.snapshot.get('activated_at') == old]
        if matched:
            return matched
    if len(owned) == 1:
        return owned
    return []


def propose(farm: AgentFarm, plan: dict, actions: list) -> dict | None:
    """返回一份修复；没有越界播种时返回 None。不能安全修复时 ok 为 False。"""
    pid = plan.get('id')
    where = f"居民{farm.pk}的{plan.get('day', '未知日期')}计划"
    try:
        plants = [(op, wire_timestamp(op.created_at)) for op in plant_operations(farm, pid)]
        activated = plan.get('activated_at') or None
        cutoff = plan['cutoff']
    except (TypeError, ValueError, KeyError) as exc:
        return {'ok': False, 'where': where, 'farm_id': farm.pk, 'plan_id': pid, 'day': plan.get('day'),
                'reason': f'无法读取播种时间或截止时间：{exc}', 'problems': [], 'clamps': []}

    def outside(timestamp: float) -> bool:
        if not activated:
            return True
        return not activated <= timestamp < cutoff

    offenders = [(op, timestamp) for op, timestamp in plants if outside(timestamp)]
    if not offenders:
        return None
    early = [(op, timestamp) for op, timestamp in offenders if timestamp < cutoff and (not activated or timestamp < activated)]
    late = [(op, timestamp) for op, timestamp in offenders if timestamp >= cutoff]
    problems = []
    for op, timestamp in early:
        if not activated:
            detail = '计划没有开工时间，但这笔播种已经写入；日程不因此显示失败'
        else:
            detail = _gap_text(activated - timestamp)
        problems.append({'op_id': op.pk, 'detail': detail})
    for op, timestamp in late:
        problems.append({'op_id': op.pk, 'detail': f'快照时间不早于截止（超出 {timestamp - cutoff:.3f} 秒）'})

    mark = activated
    if early:
        mark = activation_mark(min(timestamp for _, timestamp in early), cutoff)
    elif not activated:
        mark = activation_mark(cutoff - 1, cutoff)
    if mark is None or not mark < cutoff:
        return {'ok': False, 'where': where, 'farm_id': farm.pk, 'plan_id': pid, 'day': plan.get('day'),
                'reason': '开工时间无法落到截止之前', 'problems': problems, 'clamps': []}
    clamps = []
    for op, _timestamp in late:
        revised = instant_before(cutoff, mark)
        if revised is None:
            return {'ok': False, 'where': where, 'farm_id': farm.pk, 'plan_id': pid, 'day': plan.get('day'),
                    'reason': f'播种 {op.pk} 无法收到截止之前，且不能删除（删除会拆掉进度和在田来源）',
                    'problems': problems, 'clamps': []}
        clamps.append({'op_id': op.pk, 'created_at': revised, 'old': op.created_at})
    changed_activation = mark != activated
    targets = _activation_actions(actions, pid, activated) if changed_activation else []
    if changed_activation and not targets:
        return {'ok': False, 'where': where, 'farm_id': farm.pk, 'plan_id': pid, 'day': plan.get('day'),
                'reason': '没有唯一可对齐的开工记录，不能另造一条 WorldAction', 'problems': problems, 'clamps': []}
    return {
        'ok': True, 'where': where, 'farm_id': farm.pk, 'plan_id': pid, 'day': plan.get('day'),
        'problems': problems, 'old_activated_at': activated, 'new_activated_at': mark if changed_activation else None,
        'action_ids': [row.pk for row in targets], 'clamps': clamps, 'reason': '',
    }


def collect(agent: str | None = None, day: str | None = None, *, lock: bool = False) -> list[dict]:
    farms = AgentFarm.objects.all()
    if agent:
        farms = farms.filter(pk=agent)
    if lock:
        farms = farms.select_for_update().order_by('pk')
    found = []
    for farm in farms:
        actions = list(WorldAction.objects.filter(actor_id=farm.pk))
        for plan in (farm.state.get('planting_plans') or {}).values():
            if day and plan.get('day') != day:
                continue
            item = propose(farm, plan, actions)
            if item:
                found.append(item)
    return found


def render(found: list[dict], out) -> None:
    out.write('== 播种时间与开工窗口 ==')
    if not found:
        out.write('无越界播种。上传用的快照时间都落在开工与截止之间。')
        return
    for item in found:
        out.write(item['where'] + ('：可修复' if item['ok'] else '：不能安全修复'))
        for problem in item['problems']:
            out.write(f"  播种 {problem['op_id']}：{problem['detail']}")
        if not item['ok']:
            out.write(f"  未改数据：{item['reason']}")
            continue
        if item['new_activated_at'] is not None:
            out.write(f"  修复：开工时间 {item['old_activated_at']} → {item['new_activated_at']}，"
                      f"并同步开工记录 {', '.join(item['action_ids'])}。播种记录、进度、地块和库存不改。")
        for clamp in item['clamps']:
            out.write(f"  修复：播种 {clamp['op_id']} 的 created_at {clamp['old']} → {clamp['created_at']}（收到截止前）。不删除该播种。")


def apply_fixes(found: list[dict]) -> list[str]:
    """写入已确认可修复的项。调用方负责事务；这里不再重新判定安全性。"""
    lines = []
    for item in found:
        if item['new_activated_at'] is not None:
            farm = AgentFarm.objects.select_for_update().get(pk=item['farm_id'])
            plans = farm.state['planting_plans']
            plan = plans[item['plan_id']]
            plan['activated_at'] = item['new_activated_at']
            plans[item['plan_id']] = plan
            farm.state = {**farm.state, 'planting_plans': plans}
            farm.revision += 1
            farm.updated_at = timezone.now()
            farm.save(update_fields=['state', 'revision', 'updated_at'])
            actions = list(WorldAction.objects.select_for_update().filter(pk__in=item['action_ids'], actor_id=farm.pk))
            if len(actions) != len(item['action_ids']):
                raise ValueError(f"{item['where']} 的开工记录已变化，已停止")
            for action in actions:
                action.snapshot = {**action.snapshot, 'activated_at': item['new_activated_at']}
                action.save(update_fields=['snapshot', 'updated_at'])
            lines.append(f"已前移开工：{item['where']} → {item['new_activated_at']}")
        for clamp in item['clamps']:
            op = FarmOperation.objects.select_for_update().get(pk=clamp['op_id'], farm_id=item['farm_id'])
            op.created_at = clamp['created_at']
            op.save(update_fields=['created_at'])
            lines.append(f"已收拢播种时间：{item['where']} {op.pk}")
    return lines


def snapshot_data(farm_ids: list[str]) -> list:
    """只序列化这些农场的队列校验所需行，供修复后复查。"""
    farms = list(AgentFarm.objects.filter(pk__in=farm_ids))
    owners = {farm.owner_id for farm in farms}
    rows = [
        *farms,
        *FarmCatalog.objects.filter(pk__in=owners),
        *LifeItem.objects.filter(actor_id__in=farm_ids),
        *WorldAction.objects.filter(actor_id__in=farm_ids),
        *FarmOperation.objects.filter(farm_id__in=farm_ids),
        *MarketSession.objects.filter(actor_id__in=farm_ids),
        *MarketTransaction.objects.filter(actor_id__in=farm_ids),
    ]
    return json.loads(serializers.serialize('json', rows, cls=SyncJSONEncoder))


def recheck(farm_ids: list[str]) -> str | None:
    from utils.sync_manager import SyncError
    from .farm_queue_sync import validate_queue_source
    try:
        validate_queue_source(snapshot_data(farm_ids))
    except SyncError as exc:
        return str(exc)
    return None
