"""职业增产：具体 SKU 独立累计，收获事实记录精确余量。"""
from decimal import Decimal
from system_settings.models import Agent
from .farm_models import AgentFarm


def yield_bonus(agent: Agent | None) -> dict:
    profession = agent.profession if agent else None
    return {'profession_id': profession.pk if profession else None,
            'profession_name': profession.name if profession else '',
            'percentage': str(profession.farm_yield_percentage) if profession and profession.enabled else '0'}


def calculate_yield(base: int, percentage: str, remainder: str) -> tuple[int, str]:
    percent, previous = Decimal(percentage), Decimal(remainder)
    if type(base) is not int or base <= 0 or not percent.is_finite() or percent < 0 or not previous.is_finite() or not 0 <= previous < 1:
        raise ValueError('农场增产依据无效')
    accumulated = base * percent / 100 + previous
    extra = int(accumulated)
    return base + extra, str(accumulated-extra)


def add_production(farm: AgentFarm, sku: str, base: int, name: str, kind: str, price: int, key: str, bonus: dict) -> dict:
    from .inventory_stock import add_stock
    remainders = farm.state.setdefault('yield_remainders', {})
    keys = farm.state.setdefault('yield_bonus_keys', [])
    if key not in keys:
        keys.append(key)
    before = remainders.get(sku, '0')
    quantity, after = calculate_yield(base, bonus['percentage'], before)
    if Decimal(after):
        remainders[sku] = after
    else:
        remainders.pop(sku, None)
    add_stock(farm.pk, farm.owner_id, farm.actor_name, sku, quantity, name, kind, price, key)
    return {'sku': sku, 'name': name, 'base_quantity': base, 'quantity': quantity,
            'extra_quantity': quantity-base, 'remainder_before': before, 'remainder_after': after, **bonus}


def validate_bonus_chain(state: dict, operations: list) -> None:
    """恢复只验证不可变依据，不使用当前职业重新发放产物。"""
    from utils.sync_manager import SyncError
    remainders = {}
    try:
        keys = state.get('yield_bonus_keys', [])
        facts = [op.pk for op in operations if 'production_bonus' in op.result]
        if keys != facts:
            raise ValueError('增产经营依据缺失')
        for op in operations:
            for entry in op.result.get('production_bonus', []):
                sku = entry['sku']
                if op.operation['kind'] not in ('harvest', 'collect') or not sku.startswith(('crop.', 'product.')):
                    raise ValueError('增产操作无效')
                before = remainders.get(sku, '0')
                quantity, after = calculate_yield(entry['base_quantity'], entry['percentage'], before)
                if Decimal(entry['remainder_before']) != Decimal(before) or Decimal(entry['remainder_after']) != Decimal(after) or entry['quantity'] != quantity or entry['extra_quantity'] != quantity-entry['base_quantity']:
                    raise ValueError('增产事实不一致')
                if Decimal(after):
                    remainders[sku] = after
                else:
                    remainders.pop(sku, None)
        actual = {k: Decimal(v) for k, v in state.get('yield_remainders', {}).items()}
        if actual != {k: Decimal(v) for k, v in remainders.items()}:
            raise ValueError('增产余量不一致')
    except (ValueError, KeyError, TypeError, ArithmeticError) as exc:
        raise SyncError('农场职业增产事实或余量不一致，已拒绝恢复') from exc
