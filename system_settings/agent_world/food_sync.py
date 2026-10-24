"""Cross-domain validation of immutable food departure facts; never replays consumption."""
from decimal import Decimal
from copy import deepcopy

from . import food_effects
from .cooking_catalog import DEFAULT_RULES

RUN = 'system_settings.exploration'
FACT = 'system_settings.combatfact'


def validate_import(data: list[dict], meta: dict | None) -> None:
    """Food consumption cannot be repaired by accepting an incomplete snapshot."""
    from utils.sync_manager import SyncError
    has_food = any(row['model'] == RUN and ('food_version' in row['fields'].get('snapshot', {}) or
                   (row['fields'].get('snapshot', {}).get('prepared_plan') or {}).get('food')) for row in data)
    if has_food and (not meta or meta.get('combat_schema_version', 0) not in (7, 8, 9, 10, 11, 12, 13, 14) or
                     meta.get('cooking_schema_version', 0) != 4):
        raise SyncError('美食冒险快照缺少新版战斗或烹饪同步协议')
    validate_source(data, meta, require_manifest=has_food)


def metadata(data: list[dict] | None = None) -> dict:
    if data is None:
        from .combat.models import Exploration
        ids = list(Exploration.objects.filter(snapshot__food_version=1).values_list('pk', flat=True))
    else:
        ids = [str(row['pk']) for row in data if row['model'] == RUN
               and 'food_version' in (row['fields'].get('snapshot') or {})]
    return {'food_explorations': sorted(ids), 'food_rules': {'1': deepcopy(food_effects.BASE_EFFECTS)}}


def validate_source(data: list[dict], meta: dict | None = None, *, require_manifest: bool = False) -> None:
    from utils.sync_manager import SyncError
    runs = {str(row['pk']): row['fields'] for row in data if row['model'] == RUN}
    facts = [row['fields'] for row in data if row['model'] == FACT]
    expected = metadata(data)
    if require_manifest and (not meta or any(meta.get(key) != value for key, value in expected.items())):
        raise SyncError('美食冒险清单或效果规则缺失或不一致')
    try:
        for fact in facts:
            if fact['kind'] != 'depart':
                continue
            snapshot = runs.get(fact['exploration_id'], {}).get('snapshot') or {}
            if ('food_version' in fact['payload']) != ('food_version' in snapshot):
                raise ValueError('出发美食版本缺失')
        for identity, run in runs.items():
            snapshot = run['snapshot']
            for plan in (snapshot.get('prepared_plan'), snapshot.get('plan')):
                if plan:
                    food_effects.validate_selection(plan.get('food'), plan['duration_seconds'])
            if 'food_version' not in snapshot:
                if snapshot.get('food') or run['state'].get('food') or run['result'].get('food'):
                    raise ValueError('美食效果缺少版本')
                continue
            if type(snapshot['food_version']) is not int or snapshot['food_version'] != food_effects.VERSION:
                raise ValueError('美食效果版本无效')
            departures = [fact for fact in facts if fact['exploration_id'] == identity and fact['kind'] == 'depart']
            if len(departures) != 1:
                raise ValueError('美食出发缺少唯一事实')
            departure = departures[0]
            payload = departure['payload']
            if (departure['owner_id'] != run['owner_id'] or departure['actor_id'] != run['actor_id'] or
                    payload.get('food_version') != snapshot['food_version'] or payload['plan'] != snapshot['plan'] or
                    snapshot['plan']['duration_seconds'] != run['duration_seconds']):
                raise ValueError('美食出发归属或计划不一致')
            food = snapshot['food']
            if any('food' not in frame or frame['food'] != food for frame in (payload, run['state'], run['result'])):
                raise ValueError('美食效果与出发事实不一致')
            if not isinstance(snapshot['food_adjustment'], str) or any(
                    frame.get('food_adjustment') != snapshot['food_adjustment'] for frame in (payload, run['result'])):
                raise ValueError('美食库存调整不一致')
            selection = snapshot['plan'].get('food')
            if food is None:
                if selection is not None:
                    raise ValueError('未消耗美食却保存加成')
                continue
            if set(food) != {'recipe_id', 'stars', 'quantity', 'version', 'name', 'effects', 'summary', 'consumed'}:
                raise ValueError('美食快照字段无效')
            food_effects.validate_selection(selection, run['duration_seconds'])
            if not selection or any(food[key] != value for key, value in selection.items()):
                raise ValueError('美食快照与选择不一致')
            effects = food_effects.effects_for(food['recipe_id'], food['stars'], food['version'])
            if (food['effects'] != effects or food['summary'] != food_effects.describe(effects) or
                    food['name'] != DEFAULT_RULES[food['recipe_id']]['name']):
                raise ValueError('冻结美食效果不一致')
            total, seen = 0, set()
            for allocation in food['consumed']:
                if (not isinstance(allocation['inventory_id'], str) or not allocation['inventory_id'] or
                        allocation['inventory_id'] in seen or allocation['owner_id'] != run['owner_id'] or
                        allocation['actor_id'] != run['actor_id'] or allocation['sku'] != 'dish.' + food['recipe_id'] or
                        type(allocation['stars']) is not int or allocation['stars'] != food['stars'] or
                        type(allocation['quantity']) is not int or allocation['quantity'] < 1):
                    raise ValueError('美食消费来源或星级无效')
                seen.add(allocation['inventory_id'])
                if not allocation['lots'] or any(type(lot['quantity']) is not int or lot['quantity'] < 1 or
                        not Decimal(lot['price']).is_finite() or Decimal(lot['price']) < 0 for lot in allocation['lots']):
                    raise ValueError('美食消费价格批次无效')
                if sum(lot['quantity'] for lot in allocation['lots']) != allocation['quantity']:
                    raise ValueError('美食消费批次数量不一致')
                total += allocation['quantity']
            if total != food['quantity']:
                raise ValueError('美食消费数量不一致')
    except (ValueError, KeyError, TypeError, ArithmeticError) as exc:
        raise SyncError('美食冒险消费或效果快照缺失或不一致') from exc
