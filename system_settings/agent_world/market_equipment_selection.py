"""Pure rules for a provisional shopping loadout; no trades or model calls."""
from copy import deepcopy
from decimal import Decimal

from .market_equipment_candidates import SLOTS

KEY = 'equipment_selection'
VERSION = 1
POOLS = (*SLOTS[2:], 'one_handed', 'two_handed', 'offhand')


def group(row: dict) -> str:
    if 'weapon' in row['slots']:
        return 'two_handed' if row['rules'].get('grip') == 'two_handed' else 'one_handed'
    return row['slots'][0]


def market_rows(rows) -> list[dict]:
    return list({row['equipment_id']: row for row in rows if row and row.get('listing_id')}.values())


def price(rows) -> Decimal:
    return sum((Decimal(row['price']) for row in market_rows(rows)), Decimal(0))


def reserved(pools: dict) -> Decimal:
    """Hand alternatives are mutually exclusive, so reserve the larger total."""
    ordinary = [row for slot, row in pools.items() if slot not in ('one_handed', 'two_handed', 'offhand')]
    return price(ordinary) + max(price([pools.get('one_handed'), pools.get('offhand')]),
                                 price([pools.get('two_handed')]))


def options(row: dict) -> dict[str, str]:
    if group(row) == 'ring_1':
        return {'ring_1': '暂选到戒指位1，替换该位装备',
                'ring_2': '暂选到戒指位2，替换该位装备', 'no': '保留暂选，不选这件'}
    return {'buy': '用这件替换同部位暂选，暂不付款', 'no': '保留暂选，不选这件'}


def replace(pools: dict, row: dict, choice: str) -> tuple[dict, list[dict]]:
    updated = deepcopy(pools)
    slot = choice if choice in ('ring_1', 'ring_2') else group(row)
    displaced = updated.get(slot)
    # One instance can never occupy both ring slots, including owned inventory.
    for key, item in list(updated.items()):
        if item['equipment_id'] == row['equipment_id']:
            updated.pop(key)
    updated[slot] = row
    return updated, market_rows([displaced])


def hand_options(pools: dict, current: dict) -> dict[str, dict]:
    one = {slot: pools[key] for slot, key in (('weapon', 'one_handed'), ('offhand', 'offhand')) if key in pools}
    two = {'weapon': pools['two_handed']} if pools.get('two_handed') else {}
    original = {slot: row for slot, row in current.items() if slot in ('weapon', 'offhand')}
    result, identities = {}, set()
    for key, rows in (('one_handed', one), ('two_handed', two), ('current', original)):
        # Empty hands are only a useful explicit fallback when another option exists.
        if not rows and key != 'current':
            continue
        identity = tuple(sorted((slot, row['equipment_id']) for slot, row in rows.items()))
        if identity not in identities:
            result[key] = rows
            identities.add(identity)
    return result


def finish(pools: dict, hands: dict) -> tuple[dict, list[dict]]:
    selection = {slot: row for slot, row in pools.items()
                 if slot not in ('one_handed', 'two_handed', 'offhand')}
    selection.update(hands)
    kept = {row['equipment_id'] for row in selection.values()}
    rejected = [row for row in market_rows(pools.values()) if row['equipment_id'] not in kept]
    return selection, rejected


def validate(state: dict) -> None:
    """Validate the synced format without requiring historical quotes to stay active."""
    if (not isinstance(state, dict) or type(state.get('version')) is not int or state['version'] != VERSION or
            state.get('phase') not in ('collect', 'hands', 'ready', 'done') or
            not isinstance(state.get('id'), str) or not state['id'] or
            not isinstance(state.get('basis'), str) or
            not isinstance(state.get('seen'), list) or
            any(not isinstance(item, str) for item in state['seen']) or
            not isinstance(state.get('pending'), list) or
            not isinstance(state.get('pools'), dict) or
            not isinstance(state.get('current'), dict) or
            not isinstance(state.get('selection'), dict)):
        raise ValueError('装备暂选进度格式无效或版本过新，请升级')
    if len(set(state['seen'])) != len(state['seen']):
        raise ValueError('装备比较候选实例重复')
    if state['phase'] != 'collect' and state['pending']:
        raise ValueError('装备比较尚未完成，不能进入组合或成交阶段')
    for row in [*state['pending'], *state['pools'].values(), *state['current'].values(), *state['selection'].values()]:
        _validate_reference(row)
    for field, allowed in (('pools', POOLS), ('current', SLOTS), ('selection', SLOTS)):
        rows = state[field]
        if any(slot not in allowed for slot in rows):
            raise ValueError('装备暂选部位无效')
        identities = [row.get('equipment_id') for row in rows.values() if isinstance(row, dict)]
        if len(identities) != len(rows) or len(set(identities)) != len(identities):
            raise ValueError('装备暂选实例重复')
        for slot, row in rows.items():
            legal = group(row)
            expected = 'weapon' if legal in ('one_handed', 'two_handed') else legal
            if not (slot == legal or slot == expected or slot == 'ring_2' and legal == 'ring_1'):
                raise ValueError('装备暂选与部位不一致')
        if 'weapon' in rows and rows['weapon'].get('rules', {}).get('grip') == 'two_handed' and 'offhand' in rows:
            raise ValueError('双手装备暂选不能包含副手')
    for row in [*state['pending'], *state['pools'].values(), *state['selection'].values()]:
        if row['listing_id'] and row['equipment_id'] not in state['seen']:
            raise ValueError('装备暂选缺少比较批次来源')
    if state['phase'] in ('ready', 'done'):
        sources = [*state['pools'].values(), *state['current'].values()]
        if any(row not in sources for row in state['selection'].values()):
            raise ValueError('最终装备方案不属于已比较暂选')
    if state['phase'] == 'done' and market_rows([*state['pools'].values(), *state['selection'].values()]):
        raise ValueError('装备暂选尚未成交，不能标为完成')


def _validate_reference(row: dict) -> None:
    if (not isinstance(row, dict) or not isinstance(row.get('equipment_id'), str) or
            not row['equipment_id'] or not isinstance(row.get('snapshot'), dict) or
            not isinstance(row.get('rules'), dict) or not isinstance(row.get('slots'), list) or
            not row['slots'] or any(slot not in SLOTS for slot in row['slots']) or
            not isinstance(row.get('listing_id'), str) or type(row.get('version')) is not int):
        raise ValueError('装备暂选缺少实例快照或挂牌版本')
    from .combat.equipment_snapshot import slot_matches, validate as validate_snapshot
    validate_snapshot(row['snapshot'], row['rules'])
    if any(not slot_matches(row['snapshot'], row['rules'], slot) for slot in row['slots']):
        raise ValueError('装备暂选穿戴位置无效')
    try:
        value = Decimal(row['price'])
        if (not value.is_finite() or value < 0 or
                not row['listing_id'] and (value != 0 or row['version'] != 0)):
            raise ValueError('装备暂选价格无效')
    except (KeyError, TypeError, ArithmeticError) as exc:
        raise ValueError('装备暂选价格无效') from exc
