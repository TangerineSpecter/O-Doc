"""Validate complete forge receipts without rerolling historical equipment."""
import hashlib
from collections import defaultdict
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime
from decimal import Decimal

from django.db import transaction
from django.db.models.signals import post_delete, post_save

from .blacksmith_integrity import (ACTION, CATALOG, INTEGRITY, OPERATION, GOAL,
    database_data, fingerprints, fingerprints_source, owners_for)
from .blacksmith_rolls import validate_snapshot

SCHEMA_VERSION = 2
PHASES = {'band', 'slot', 'type', 'commit', 'continue', 'done', 'choose_goal', 'goal_count'}
_checkpoint_owners = ContextVar('blacksmith_checkpoint_owners', default=None)


def fail(message: str):
    from utils.sync_manager import SyncError
    raise SyncError('铁匠铺：' + message)


def validate_version(meta: dict | None) -> None:
    if not meta:
        return
    version = meta.get('blacksmith_schema_version', 0)
    if type(version) is not int or not 0 <= version <= SCHEMA_VERSION:
        fail('快照版本过新或无效，请升级所有设备')
    if meta.get('blacksmith_operations') and meta.get('combat_schema_version', 0) < 12:
        fail('锻造装备需要新版战斗同步协议，请升级所有设备')


def checkpoint(owner: str) -> None:
    from .blacksmith_models import BlacksmithIntegrity
    BlacksmithIntegrity.objects.update_or_create(pk=owner, defaults={'hashes': fingerprints(owner)})


def request_checkpoint(owner: str) -> None:
    owners = _checkpoint_owners.get()
    if owners is None:
        checkpoint(owner)
    else:
        owners.add(owner)


@contextmanager
def batch_checkpoints():
    """Coalesce only forge hashes; facts and hashes still commit or roll back together."""
    parent = _checkpoint_owners.get()
    owners = set()
    token = _checkpoint_owners.set(owners)
    try:
        with transaction.atomic():
            yield
            if parent is None:
                for owner in sorted(owners):
                    checkpoint(owner)
        if parent is not None:
            parent.update(owners)
    finally:
        # Failed savepoints discard their own owners without poisoning later work.
        _checkpoint_owners.reset(token)


def checkpoint_all() -> None:
    from .blacksmith_models import BlacksmithCatalog
    for owner in BlacksmithCatalog.objects.values_list('pk', flat=True):
        checkpoint(owner)


def changed(sender, instance, **kwargs):
    from system_settings.sync_state import is_tracking_suspended
    from .blacksmith_models import BlacksmithCatalog
    if is_tracking_suspended() or kwargs.get('raw'):
        return
    if sender is BlacksmithCatalog:
        owner = instance.pk
    elif sender.__name__ == 'WorldAction':
        snapshot = instance.snapshot or {}
        owner = snapshot.get('owner_id') if snapshot.get('blacksmith') or snapshot.get('blacksmith_energy') else None
    else:
        owner = instance.owner_id
    if owner and BlacksmithCatalog.objects.filter(pk=owner).exists():
        request_checkpoint(owner)


def register_signals() -> None:
    from system_settings.models import WorldAction
    from .blacksmith_models import BlacksmithCatalog, BlacksmithOperation, BlacksmithGoal
    for model in (BlacksmithCatalog, BlacksmithOperation, BlacksmithGoal, WorldAction):
        for signal in (post_save, post_delete):
            signal.connect(changed, sender=model, weak=False, dispatch_uid=f'blacksmith:{model.__name__}:{signal}')


def metadata(data: list[dict] | None = None) -> dict:
    data = database_data() if data is None else data
    return {'blacksmith_schema_version': SCHEMA_VERSION,
        'blacksmith_owners': sorted(owners_for(data)),
        'blacksmith_operations': sorted(str(row['pk']) for row in data if row['model'] == OPERATION),
        'blacksmith_goals': sorted(str(row['pk']) for row in data if row['model'] == GOAL),
        'blacksmith_actions': sorted(str(row['pk']) for row in data if row['model'] == ACTION
                                   and row['fields'].get('snapshot', {}).get('blacksmith'))}


def validate_equipment_fact(rows: dict, fact: dict) -> None:
    payload = fact['payload']
    operation_id = payload.get('operation_id')
    operation = rows.get((OPERATION, operation_id))
    result = (operation or {}).get('result', {})
    frozen = payload.get('equipment_after', {}).get(payload.get('equipment_id'), {})
    if (not operation or operation['owner_id'] != fact['owner_id'] or operation['actor_id'] != fact['actor_id']
            or fact['id'] != 'blacksmith:' + operation_id
            or payload.get('recipe_id') != operation['recipe_id']
            or payload.get('catalog_id') != operation['snapshot']['catalog_id']
            or payload.get('materials') != operation['snapshot']['materials']
            or payload.get('equipment_id') != result.get('equipment_id')
            or frozen.get('snapshot') != result.get('item') or frozen.get('rules') != result.get('rules')):
        fail('装备来源与单件打造事实不一致')


def _validate_operation(identity: str, operation: dict, rows: dict) -> None:
    from .combat.equipment_snapshot import validate as validate_gear
    from utils.sync_datetime import normalize_datetime_fraction
    snapshot, result = operation['snapshot'], operation['result']
    index, activity = operation['piece_index'], operation['opportunity_id']
    if (type(index) is not int or not 0 <= index < 3 or identity != f'{activity}:{index}'
            or not operation['owner_id'] or not operation['actor_id']):
        fail('单件操作身份或序号无效')
    validate_snapshot(snapshot, operation['recipe_id'])
    item = result['item']
    validate_gear(item, result['rules'])
    if (item['template_id'] != snapshot['template_id'] or item['slot'] != snapshot['rule']['slot']
            or not snapshot['level_min'] <= item['level'] <= snapshot['level_max']
            or item['quality'] not in ('white', 'blue', 'gold')
            or result.get('equipment_id') != hashlib.sha256(f'blacksmith-equipment:{identity}'.encode()).hexdigest()
            or result.get('catalog_id') != snapshot['catalog_id']
            or result.get('quantity') != 1 or result.get('energy_cost') != 2
            or result.get('level') != item['level'] or result.get('quality') != item['quality']
            or Decimal(str(result['value'])) != Decimal(str(item['value']))):
        fail('成品与冻结的等级、类型或规则不一致')
    cost = sum((Decimal(str(row['price'])) * row['quantity'] for row in snapshot['materials']), Decimal(0))
    if Decimal(str(result['ingredient_value'])) != cost:
        fail('材料消耗价值与批次不一致')
    action = rows.get((ACTION, activity))
    if (not action or action['actor_id'] != operation['actor_id']
            or action['snapshot'].get('owner_id') != operation['owner_id']
            or not action['snapshot'].get('blacksmith')):
        fail('制作事实缺少所属打造活动')
    decisions = {row.get('phase'): row.get('choice') for row in action['snapshot'].get('decisions', [])
                 if isinstance(row, dict) and row.get('piece_index') == index}
    if action['snapshot'].get('version') == 2:
        goal_id = result.get('goal_id')
        goal = rows.get((GOAL, goal_id))
        if (not goal or goal['status'] != 'completed' or goal['operation_id'] != identity
                or goal['owner_id'] != operation['owner_id'] or goal['actor_id'] != operation['actor_id']
                or goal['recipe_id'] != operation['recipe_id']
                or goal['template_id'] != snapshot['template_id']):
            fail('目标与已完成装备不一致')
    elif (decisions.get('band') != snapshot['rule']['band_id'] or decisions.get('slot') != operation['recipe_id']
          or decisions.get('type') != snapshot['template_id']
          or (index and decisions.get('continue') != 'continue')):
        fail('已完成装备缺少对应的逐步决策')
    energy = rows.get((ACTION, hashlib.sha256(f'blacksmith-energy:{identity}'.encode()).hexdigest()))
    if (not energy or energy['actor_id'] != operation['actor_id'] or energy['status'] != 'success'
            or Decimal(str(energy['energy_cost'])) != 2 or energy['result'].get('operation_id') != identity
            or energy['snapshot'] != {'blacksmith_energy': True, 'owner_id': operation['owner_id']}
            or normalize_datetime_fraction(energy['consumed_at']) != normalize_datetime_fraction(operation['created_at'])):
        fail('单件体力消费事实缺失或不一致')
    fact = rows.get(('system_settings.combatfact', 'blacksmith:' + identity))
    if not fact or fact['kind'] != 'forge':
        fail('装备缺少锻造来源事实')
    validate_equipment_fact(rows, fact)


def _validate_decisions(state: dict) -> None:
    scenes = {'band': 'blacksmith_level_band', 'slot': 'blacksmith_slot',
              'type': 'blacksmith_type', 'continue': 'blacksmith_continue'}
    expected_phase, expected_index = 'band', 0
    if len(state['decisions']) > 11:
        fail('决策次数超出三件上限')
    selected = {}
    for row in state['decisions']:
        if (not isinstance(row, dict) or row.get('phase') != expected_phase
                or row.get('scene') != scenes.get(expected_phase)
                or type(row.get('piece_index')) is not int or row['piece_index'] != expected_index
                or not isinstance(row.get('choice'), str) or not row['choice']
                or row.get('source') not in ('model', 'system')
                or not isinstance(row.get('reason'), str)):
            fail('已保存决策的阶段、顺序或所属件无效')
        selected[(expected_index, expected_phase)] = row['choice']
        if expected_phase == 'band':
            expected_phase = 'slot'
        elif expected_phase == 'slot':
            expected_phase = 'type'
        elif expected_phase == 'type':
            expected_index += 1
            expected_phase = 'continue' if expected_index < 3 else None
        else:
            if row['choice'] not in ('continue', 'finish'):
                fail('是否继续的选择无效')
            expected_phase = 'band' if row['choice'] == 'continue' else None
    phase, cursor, current = state['phase'], state['cursor'], state['current']
    if phase in ('band', 'slot', 'type', 'continue') and (phase, cursor) != (expected_phase, expected_index):
        fail('决策检查点与当前执行阶段不一致')
    if phase == 'commit' and (expected_phase, expected_index) != ('continue' if cursor < 2 else None, cursor + 1):
        fail('当前件尚未完成全部合法选择')
    if phase in ('slot', 'type', 'commit') and current.get('band_id') != selected.get((cursor, 'band')):
        fail('当前等级档与已确认选择不一致')
    if phase in ('type', 'commit') and (current.get('recipe_id') != selected.get((cursor, 'slot'))
            or current['rule'].get('id') != current['recipe_id']):
        fail('当前部位配方与已确认选择不一致')
    if phase == 'commit' and current['snapshot']['template_id'] != selected.get((cursor, 'type')):
        fail('当前装备类型与已确认选择不一致')


def _validate_goal_decisions(identity: str, state: dict, parts: list[dict], rows: dict) -> set[str]:
    scenes = {'goal_count': 'blacksmith_goal_count', 'band': 'blacksmith_level_band',
              'slot': 'blacksmith_slot', 'type': 'blacksmith_type',
              'goal_priority': 'blacksmith_goal_priority'}
    expected, remaining, registered, sequence = None, 0, 0, 0
    band = recipe = None
    last_index = 0
    stopped = False
    goal_ids = set()
    priorities = {}
    if len(state['decisions']) > 20:
        fail('目标决策次数超出本次上限')
    for decision in state['decisions']:
        if (not isinstance(decision, dict) or decision.get('scene') != scenes.get(decision.get('phase'))
                or type(decision.get('piece_index')) is not int
                or not last_index <= decision['piece_index'] <= state['cursor']
                or not isinstance(decision.get('choice'), str) or not decision['choice']
                or decision.get('source') not in ('model', 'system')
                or not isinstance(decision.get('reason'), str) or stopped):
            fail('目标决策阶段、顺序或所属件无效')
        last_index = decision['piece_index']
        phase, choice = decision['phase'], decision['choice']
        if phase == 'goal_priority':
            if expected or last_index in priorities:
                fail('材料争用选择顺序无效')
            priorities[last_index] = choice
            continue
        if phase == 'goal_count':
            if expected or remaining or type(choice) is not str or not choice.isdigit():
                fail('目标登记数量选择顺序无效')
            remaining = int(choice)
            if not 0 <= remaining <= 3 - registered:
                fail('目标登记数量超出本轮上限')
            sequence += 1
            expected = 'band' if remaining else None
            stopped = remaining == 0
        elif phase == 'band' and expected == 'band':
            band = choice
            expected = 'slot'
        elif phase == 'slot' and expected == 'slot':
            if choice.split(':', 1)[0] != band:
                fail('目标部位不属于已选等级档')
            recipe = choice
            expected = 'type'
        elif phase == 'type' and expected == 'type':
            goal_id = decision.get('goal_id')
            expected_id = hashlib.sha256(
                f'blacksmith-goal:{state["owner_id"]}:{rows[(ACTION, identity)]["actor_id"]}:{identity}:{sequence}:{registered}'.encode()
            ).hexdigest()
            goal = rows.get((GOAL, goal_id))
            if (goal_id != expected_id or not goal or goal_id in goal_ids
                    or goal['recipe_id'] != recipe or goal['template_id'] != choice
                    or goal['owner_id'] != state['owner_id']
                    or goal['actor_id'] != rows[(ACTION, identity)]['actor_id']):
                fail('目标登记事实与逐步选择不一致')
            goal_ids.add(goal_id)
            registered += 1
            sequence += 1
            remaining -= 1
            expected = 'band' if remaining else None
        else:
            fail('目标逐步选择顺序无效')
    if (state['registered_count'] != registered or state['goal_sequence'] != sequence
            or state['remaining_registrations'] != remaining):
        fail('目标登记计数与选择事实不一致')
    phase = state['phase']
    if (phase in ('band', 'slot', 'type') and (phase != expected or last_index != state['cursor'])):
        fail('目标选择检查点与决策不一致')
    # Cancellation and exhausted retries keep the saved choices for audit,
    # even when registration did not reach a type/goal. Live work must finish it.
    terminated = phase == 'done' and rows[(ACTION, identity)]['status'] in ('success', 'failed', 'skipped')
    if phase in ('choose_goal', 'goal_count', 'commit', 'done') and expected and not terminated:
        fail('目标登记尚未完成却进入打造阶段')
    if phase == 'commit':
        current = state['current']
        goal = rows.get((GOAL, current.get('goal_id')))
        if (not goal or goal['recipe_id'] != current.get('recipe_id')
                or goal['template_id'] != current['snapshot']['template_id']
                or priorities.get(state['cursor'], current['goal_id']) != current['goal_id']):
            fail('待提交装备与已登记目标不一致')
    for index, goal_id in priorities.items():
        chosen = next((row['result'].get('goal_id') for row in parts if row['piece_index'] == index),
                      state['current'].get('goal_id') if phase == 'commit' and state['cursor'] == index else None)
        if goal_id != chosen:
            fail('材料争用选择与实际打造目标不一致')
    return goal_ids


def _validate(data: list[dict], meta: dict | None) -> None:
    from .blacksmith_catalog import DEFAULT_RULES, validate_rule
    rows = {}
    for row in data:
        key = row['model'], str(row['pk'])
        if key in rows and row['model'] in (ACTION, CATALOG, OPERATION, INTEGRITY, GOAL):
            fail('重复业务身份')
        rows[key] = {'id': str(row['pk']), **row['fields']}
    actual = metadata(data)
    meta = actual if meta is None else meta
    version = meta.get('blacksmith_schema_version', 0)
    if type(version) is not int or not 0 <= version <= SCHEMA_VERSION:
        fail('快照版本过新，请升级所有设备')
    owners = owners_for(data)
    if owners and version == 0:
        fail('打造数据缺少新版同步版本')
    if version < 2 and (actual['blacksmith_goals'] or any(
            row['model'] == ACTION and row['fields'].get('snapshot', {}).get('blacksmith')
            and row['fields']['snapshot'].get('version') == 2 for row in data)):
        fail('打造目标需要新版同步协议')
    if actual['blacksmith_operations'] and 'combat_schema_version' in meta and meta['combat_schema_version'] < 12:
        fail('锻造装备需要新版战斗同步协议，请升级所有设备')
    if version:
        keys = ('blacksmith_owners', 'blacksmith_operations', 'blacksmith_actions')
        if version >= 2:
            keys += ('blacksmith_goals',)
        for key in keys:
            values = meta.get(key)
            if (not isinstance(values, list) or any(not isinstance(value, str) for value in values)
                    or sorted(values) != actual[key] or len(values) != len(set(values))):
                fail('业务清单缺失或不一致')
    for owner in owners:
        catalog = rows.get((CATALOG, owner))
        integrity = rows.get((INTEGRITY, owner))
        if (not catalog or not integrity or type(catalog['version']) is not int or catalog['version'] < 1
                or set(catalog['rules']) != set(DEFAULT_RULES)):
            fail('配方目录或完整性记录缺失')
        for rule in catalog['rules'].values():
            validate_rule(rule, frozen=True)
        if integrity['hashes'] != fingerprints_source(data, owner):
            fail('配方、选择进度或单件制作事实不完整')
    grouped = defaultdict(list)
    for (label, identity), operation in rows.items():
        if label == OPERATION:
            _validate_operation(identity, operation, rows)
            grouped[operation['opportunity_id']].append(operation)
    registered_goals = set()
    for (label, identity), action in rows.items():
        if label != ACTION or not action.get('snapshot', {}).get('blacksmith'):
            continue
        state = action['snapshot']
        parts = sorted(grouped[identity], key=lambda row: row['piece_index'])
        if (state.get('version') not in (1, 2) or state.get('phase') not in PHASES
                or type(state.get('cursor')) is not int or not 0 <= state['cursor'] <= 3
                or [row['piece_index'] for row in parts] != list(range(state['cursor']))
                or not isinstance(state.get('decisions'), list)
                or not isinstance(state.get('current'), dict)):
            fail('逐件进度与已提交装备不一致')
        if any(row['actor_id'] != action['actor_id'] or row['owner_id'] != state['owner_id'] for row in parts):
            fail('活动与装备归属不一致')
        current, phase = state['current'], state['phase']
        if type(state.get('manual')) is not bool or not isinstance(state.get('life_item_id'), str):
            fail('执行来源或手动标识无效')
        if state['life_item_id']:
            item = rows.get(('system_settings.lifeitem', state['life_item_id']))
            if not item or item['actor_id'] != action['actor_id'] or item['owner_id'] != state['owner_id'] or item['activity'] != 'blacksmith':
                fail('打造活动关联日程或归属不一致')
        if 'retry_at' in state:
            retry_at = datetime.fromisoformat(state['retry_at'])
            if retry_at.utcoffset() is None:
                fail('重试时间缺少时区')
        failures = state.get('decision_failures', {})
        if not isinstance(failures, dict) or any(
                key not in {f'{index}:{phase}' for index in range(3) for phase in
                            ('band', 'slot', 'type', 'continue', 'goal_count', 'goal_priority')}
                or type(count) is not int or not 1 <= count <= 3 for key, count in failures.items()):
            fail('决策退避检查点无效')
        if phase == 'commit':
            validate_snapshot(current['snapshot'], current['recipe_id'])
            if state['version'] == 1 and current['snapshot']['rule'] != current['rule']:
                fail('当前件冻结规则与预留配方不一致')
        if state['version'] == 1 and phase in ('type', 'commit'):
            if (not current.get('rule') or current.get('reservation', {}).get('ingredients') != [
                    {'sku': row['sku'], 'quantity': row['quantity']} for row in current['rule']['ingredients']]):
                fail('当前件预留与配方不一致')
        elif state['version'] == 1 and current.get('reservation'):
            fail('非制作阶段存在无依据的预留')
        if state['version'] == 2 and phase == 'commit':
            if current.get('reservation', {}).get('ingredients') != [
                    {'sku': row['sku'], 'quantity': row['quantity']}
                    for row in current['snapshot']['rule']['ingredients']]:
                fail('目标单件冻结预留与当前配方不一致')
        elif state['version'] == 2 and current.get('reservation'):
            fail('目标非制作阶段存在无依据的材料预留')
        if state['cursor'] == 3 and phase != 'done':
            fail('完成三件后仍尝试继续')
        if state['version'] == 1 and phase == 'continue' and not 1 <= state['cursor'] < 3:
            fail('继续决策缺少前一件成品')
        if action['status'] != 'claimed' and (phase != 'done' or current):
            fail('已结束活动仍持有材料预留')
        if state['version'] == 1:
            _validate_decisions(state)
        else:
            if (type(state.get('goal_sequence')) is not int or state['goal_sequence'] < 0
                    or type(state.get('registered_count')) is not int
                    or not 0 <= state['registered_count'] <= 3
                    or type(state.get('remaining_registrations')) is not int
                    or not 0 <= state['remaining_registrations'] <= 3):
                fail('打造目标决策检查点无效')
            if phase == 'commit' and current.get('goal_id') not in {
                    key for label, key in rows if label == GOAL}:
                fail('正在打造的目标缺失')
            registered_goals.update(_validate_goal_decisions(identity, state, parts, rows))
    active_counts = defaultdict(int)
    for (label, identity), goal in rows.items():
        if label != GOAL:
            continue
        if (goal['status'] not in ('active', 'completed', 'invalid') or not goal['owner_id']
                or not goal['actor_id'] or not goal['recipe_id'] or not goal['template_id']):
            fail('打造目标身份或状态无效')
        if goal['status'] == 'active':
            active_counts[(goal['owner_id'], goal['actor_id'])] += 1
            if goal['operation_id']:
                fail('待打造目标已有完成操作')
        elif goal['status'] == 'completed' and (not goal['operation_id'] or
                (OPERATION, goal['operation_id']) not in rows):
            fail('已完成目标缺少打造操作')
        elif goal['status'] == 'invalid' and goal['operation_id']:
            fail('失效目标已有完成操作')
    if any(count > 3 for count in active_counts.values()):
        fail('待打造目标超过三件')
    if any(label == GOAL and identity not in registered_goals for label, identity in rows):
        fail('打造目标缺少铁匠铺登记决策')


def validate_source(data: list[dict], meta: dict | None = None) -> None:
    try:
        _validate(data, meta)
    except (ValueError, KeyError, TypeError, IndexError, ArithmeticError) as exc:
        fail('快照字段或冻结规则无效：' + str(exc))


def reconcile() -> None:
    """Restoring progress never calls a model or grants a device an execution lease."""
    data = database_data()
    from .combat.models import CombatFact
    from .life_models import LifeItem
    import json
    from django.core import serializers
    data += json.loads(serializers.serialize('json', CombatFact.objects.filter(kind='forge')))
    data += json.loads(serializers.serialize('json', LifeItem.objects.filter(activity='blacksmith')))
    validate_source(data)
    from .blacksmith_authorization import reset_authorizations
    reset_authorizations()


def validate_conflicts(local: list[dict], remote: list[dict]) -> None:
    from .alchemy_integrity import hash_rows
    left = {str(row['pk']): row['fields'] for row in local if row['model'] == OPERATION}
    for row in remote:
        if row['model'] == OPERATION and str(row['pk']) in left:
            if hash_rows([left[str(row['pk'])]], ('created_at',)) != hash_rows([row['fields']], ('created_at',)):
                fail('同一件装备在两台设备产生不同结果，请选择完整设备快照')
    local_goals = {str(row['pk']): row['fields'] for row in local if row['model'] == GOAL}
    for row in remote:
        if row['model'] != GOAL or str(row['pk']) not in local_goals:
            continue
        before, after = local_goals[str(row['pk'])], row['fields']
        if ((before['recipe_id'], before['template_id']) != (after['recipe_id'], after['template_id'])
                or (before['status'] == after['status'] == 'completed'
                    and before['operation_id'] != after['operation_id'])):
            fail('同一打造目标在两台设备发生冲突')


def refresh_merged(data: list[dict], revisions: dict) -> None:
    """Only rebuild hashes after semantic validation; mixed activity forks stay invalid."""
    from system_settings.sync_state import canonical_hash
    import copy
    candidate = copy.deepcopy(data)
    for owner in owners_for(candidate):
        row = next((row for row in candidate if row['model'] == INTEGRITY and str(row['pk']) == owner), None)
        if row is None:
            fail('合并后缺少完整性记录')
        row['fields']['hashes'] = fingerprints_source(candidate, owner)
    validate_source(candidate)
    checks = {str(row['pk']): row for row in candidate if row['model'] == INTEGRITY}
    for row in data:
        if row['model'] == INTEGRITY:
            row['fields'] = checks[str(row['pk'])]['fields']
            key = INTEGRITY + ':' + str(row['pk'])
            if key in revisions:
                revisions[key] = {**revisions[key], 'hash': canonical_hash(row['fields'])}
