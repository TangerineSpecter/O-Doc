"""Validate frozen elixir carry facts; never replays consumption."""
from decimal import Decimal

from ..alchemy_catalog import DEFAULT_RULES
from ..alchemy_limits import CARRY_CAP
from ..elixir_effects import VERSION, describe, effects_for

RUN = 'system_settings.exploration'
FACT = 'system_settings.combatfact'
CARRY_KEYS = {'recipe_id', 'sku', 'name', 'stars', 'count', 'remaining', 'unit_price',
              'version', 'effects', 'summary', 'trigger', 'consumed'}


def metadata(data: list[dict] | None = None) -> dict:
    if data is None:
        from .models import Exploration
        ids = list(Exploration.objects.filter(snapshot__elixir_version=1).values_list('pk', flat=True))
    else:
        ids = [str(row['pk']) for row in data if row['model'] == RUN
               and 'elixir_version' in (row['fields'].get('snapshot') or {})]
    return {'elixir_explorations': sorted(ids), 'elixir_rules_version': VERSION}


def validate_source(data: list[dict], meta: dict | None = None, *, require_manifest: bool = False) -> None:
    from utils.sync_manager import SyncError
    expected = metadata(data)
    if require_manifest and (not meta or any(meta.get(key) != value for key, value in expected.items())):
        raise SyncError('炼金药水冒险清单缺失或不一致')
    runs = {str(row['pk']): row['fields'] for row in data if row['model'] == RUN}
    facts = [row['fields'] for row in data if row['model'] == FACT and row['fields'].get('kind') == 'depart']
    # 已归档探索不再携带出发事实，只保留携带与结算快照。
    archived = {str(row['pk']) for row in data if row['model'] == 'system_settings.combatintegrity'
                and int(row['fields'].get('archive_sequence') or 0)}
    retained = {str(fact.get('exploration_id')) for fact in facts}
    try:
        for identity, run in runs.items():
            snapshot = run.get('snapshot') or {}
            plan = snapshot.get('plan') or {}
            selection = plan.get('elixirs')
            if 'elixir_version' not in snapshot:
                if selection:
                    raise ValueError('炼金药水缺少版本')
                continue
            if snapshot['elixir_version'] != VERSION:
                raise ValueError('炼金药水版本无效')
            carried = snapshot.get('elixirs') or []
            if not isinstance(carried, list) or sum(int(row.get('count') or 0) for row in carried) > CARRY_CAP:
                raise ValueError('炼金携带数量无效')
            if not isinstance(selection, list) or [{k: row[k] for k in ('recipe_id', 'stars', 'count')} for row in carried] != selection:
                raise ValueError('炼金携带与计划不一致')
            selections = {(row['recipe_id'], row['stars']) for row in carried}
            if len(selections) != len(carried):
                raise ValueError('炼金携带重复')
            total = 0
            for row in carried:
                if set(row) != CARRY_KEYS:
                    raise ValueError('炼金冻结字段无效')
                recipe_id, stars, count = row['recipe_id'], row['stars'], row['count']
                if recipe_id not in DEFAULT_RULES or type(stars) is not int or not 1 <= stars <= 5:
                    raise ValueError('炼金冻结配方无效')
                if type(count) is not int or not 1 <= count <= CARRY_CAP or row.get('sku') != 'elixir.' + recipe_id:
                    raise ValueError('炼金冻结数量或 SKU 无效')
                if row.get('name') != DEFAULT_RULES[recipe_id]['name'] or row.get('version') != VERSION:
                    raise ValueError('炼金冻结名称或版本无效')
                effects = effects_for(recipe_id, stars)
                if row.get('effects') != effects or row.get('summary') != describe(effects):
                    raise ValueError('炼金冻结效果不一致')
                if type(row.get('remaining')) is not int or not 0 <= row['remaining'] <= count:
                    raise ValueError('炼金剩余数量无效')
                consumed = row.get('consumed') or []
                lots_total = 0
                for allocation in consumed:
                    if (allocation.get('sku') != 'elixir.' + recipe_id or allocation.get('stars') != stars or
                            type(allocation.get('quantity')) is not int or allocation['quantity'] < 1 or not allocation.get('lots')):
                        raise ValueError('炼金消费来源无效')
                    if any(type(lot['quantity']) is not int or lot['quantity'] < 1 or
                           not Decimal(str(lot['price'])).is_finite() or Decimal(str(lot['price'])) < 0 for lot in allocation['lots']):
                        raise ValueError('炼金消费批次无效')
                    if sum(lot['quantity'] for lot in allocation['lots']) != allocation['quantity']:
                        raise ValueError('炼金消费批次数量不一致')
                    lots_total += allocation['quantity']
                if lots_total != count:
                    raise ValueError('炼金消费数量不一致')
                total += count
            state = run.get('state') or {}
            state_rows = state.get('elixirs') or []
            if len(state_rows) != len(carried) or any(
                    (a.get('recipe_id'), a.get('stars'), a.get('count')) != (b.get('recipe_id'), b.get('stars'), b.get('count')) or
                    not 0 <= int(a.get('remaining') or 0) <= int(b.get('count') or 0)
                    for a, b in zip(state_rows, carried)):
                raise ValueError('炼金战斗状态与冻结清单不一致')
            result = run.get('result') or {}
            if result.get('elixirs_carried') is not None:
                if [{k: row[k] for k in ('recipe_id', 'stars', 'count')} for row in carried] != result['elixirs_carried']:
                    raise ValueError('炼金结算携带清单不一致')
            if run['actor_id'] in archived and identity not in retained:
                continue
            departures = [fact for fact in facts if str(fact.get('exploration_id')) == identity]
            if len(departures) != 1:
                raise ValueError('炼金出发缺少唯一事实')
            payload = departures[0].get('payload') or {}
            if payload.get('elixir_version') != VERSION or payload.get('elixirs') != carried:
                raise ValueError('炼金出发事实不一致')
            used = result.get('elixirs_used') or {}
            if sum(v for v in used.values() if type(v) is int and v > 0) > total:
                raise ValueError('炼金使用数量超过携带')
    except (ValueError, KeyError, TypeError, ArithmeticError) as exc:
        raise SyncError('炼金药水携带或效果快照缺失或不一致') from exc
