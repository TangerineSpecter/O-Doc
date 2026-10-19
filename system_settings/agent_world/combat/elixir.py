"""炼金药水的携带、冻结、自动使用与结算返还；不修改战斗内容包。"""
import copy
from decimal import Decimal

from ..alchemy_catalog import DEFAULT_RULES
from ..alchemy_limits import CARRY_CAP, SHARED_COOLDOWN_ROUNDS
from ..alchemy_materials import consume as consume_materials  # noqa: F401  (kept for import symmetry)
from ..cooking_materials import split_lots
from ..elixir_effects import VERSION, describe, effects_for, heal_amount, validate_carried
from ..inventory_stock import inventory_items

PRIORITY = {'healing': 0, 'focus': 1, 'aegis': 2, 'iron': 3, 'regen': 4,
            'purify': 5, 'fury': 6, 'arcane': 7, 'ember': 8, 'star': 9}
STAT_KEYS = ('physical_attack', 'magic_attack', 'physical_defense', 'magic_defense',
             'critical', 'critical_damage', 'fire_power')


def candidates(actor_id: str, owner: str) -> list[dict]:
    counts = {}
    for item in inventory_items(actor_id, owner).filter(source__sku__startswith='elixir.'):
        recipe_id = item.source['sku'][7:]
        stars = item.source.get('stars', 1)
        if recipe_id not in DEFAULT_RULES or type(stars) is not int or not 1 <= stars <= 5:
            continue
        counts[(recipe_id, stars)] = counts.get((recipe_id, stars), 0) + item.quantity
    return [{'recipe_id': recipe_id, 'name': DEFAULT_RULES[recipe_id]['name'], 'stars': stars,
             'owned': owned, 'effects': effects_for(recipe_id, stars),
             'summary': describe(effects_for(recipe_id, stars))}
            for (recipe_id, stars), owned in sorted(counts.items())]


def auto_plan(actor_id: str, owner: str, cap: int = CARRY_CAP) -> list[dict]:
    rows = candidates(actor_id, owner)
    rows.sort(key=lambda row: (PRIORITY.get(row['recipe_id'], 99), -row['stars']))
    planned, total = [], 0
    for row in rows:
        if total >= cap:
            break
        count = min(row['owned'], cap - total)
        if count < 1:
            continue
        planned.append({'recipe_id': row['recipe_id'], 'stars': row['stars'], 'count': count})
        total += count
    return planned


def consume(run, entries: list[dict] | None) -> list[dict]:
    """Exact-star FIFO deduction inside departure's transaction."""
    entries = validate_carried(entries, CARRY_CAP)
    frozen = []
    for entry in entries:
        sku = 'elixir.' + entry['recipe_id']
        rows = [row for row in inventory_items(run.actor_id, run.owner_id).filter(source__sku=sku).select_for_update()
                if row.source.get('stars', 1) == entry['stars']]
        if sum(row.quantity for row in rows) < entry['count']:
            raise ValueError('出发时所选炼金药水库存不足')
        remaining, allocations = entry['count'], []
        for row in rows:
            used = min(remaining, row.quantity)
            if not used:
                continue
            lots = copy.deepcopy(row.source.get('lots') or [{'quantity': row.quantity, 'price': str(row.value)}])
            if (any(type(lot['quantity']) is not int or lot['quantity'] < 1 or
                    not Decimal(str(lot['price'])).is_finite() or Decimal(str(lot['price'])) < 0 for lot in lots) or
                    sum(lot['quantity'] for lot in lots) != row.quantity):
                raise ValueError('炼金药水库存批次不一致')
            taken, kept = split_lots(lots, used)
            allocations.append({'inventory_id': row.pk, 'sku': sku, 'stars': entry['stars'],
                                'quantity': used, 'lots': taken})
            row.quantity -= used
            if row.quantity:
                row.source = {**row.source, 'lots': kept}
                row.value = Decimal(kept[0]['price'])
                row.save(update_fields=['quantity', 'source', 'value'])
            else:
                row.delete()
            remaining -= used
        effects = effects_for(entry['recipe_id'], entry['stars'])
        from ..alchemy_quality import unit_value
        frozen.append({'recipe_id': entry['recipe_id'], 'sku': sku, 'name': DEFAULT_RULES[entry['recipe_id']]['name'],
                       'stars': entry['stars'], 'count': entry['count'], 'remaining': entry['count'],
                       'unit_price': str(unit_value(DEFAULT_RULES[entry['recipe_id']]['sale_price'], entry['stars'])),
                       'version': VERSION, 'effects': effects, 'summary': describe(effects),
                       'trigger': _trigger(entry['recipe_id']), 'consumed': allocations})
    return frozen


def _trigger(recipe_id: str) -> dict:
    from ..elixir_effects import TRIGGERS
    return dict(TRIGGERS[recipe_id])


def unused_lots(entry: dict) -> list[dict]:
    """Use carried bottles FIFO, returning the untouched tail at its original prices."""
    lots = [lot for allocation in entry['consumed'] for lot in allocation['lots']]
    count, remaining = entry['count'], entry['remaining']
    if (type(remaining) is not int or not 0 <= remaining <= count
            or sum(lot['quantity'] for lot in lots) != count):
        raise ValueError('炼金药水返还数量与原批次不一致')
    _, kept = split_lots(lots, count - remaining)
    return kept


def _matches(entry: dict, player: dict, enemy: dict | None, state: dict) -> bool:
    trigger = entry.get('trigger') or {}
    kind = trigger.get('kind')
    recipe = entry.get('recipe_id')
    if kind == 'hp_below':
        if recipe == 'aegis' and any(s.get('code') == 'shield' for s in player.get('states', [])):
            return False
        if recipe == 'regen' and any(str(s.get('group') or '').startswith('elixir:regen') for s in player.get('states', [])):
            return False
        return player['hp'] / max(1, player['stats']['hp_max']) < float(trigger['value'])
    if kind == 'mp_below':
        return player['mp'] / max(1, player['stats']['mp_max']) < float(trigger['value'])
    if kind == 'elite_first':
        return (bool(enemy) and enemy.get('rank') in ('elite', 'boss')
                and int(state.get('round_in_encounter', 0)) == 0
                and state.get('elixir_used_encounter') != state.get('encounter'))
    if kind == 'debuff_count':
        count = sum(1 for s in player.get('states', []) if s.get('code') == 'dot' or (s.get('code') == 'modifier' and s.get('value', 0) < 0))
        return count >= int(trigger['value'])
    return False


def use(player: dict, enemy: dict | None, carried: list[dict], state: dict, tick: int) -> list[dict]:
    """Called before the regular action. Deterministic and snapshot-safe."""
    if tick < state.get('elixir_cooldown', 0) or not enemy:
        return []
    usable = [entry for entry in carried if entry.get('remaining', 0) > 0 and _matches(entry, player, enemy, state)]
    if not usable:
        return []
    usable.sort(key=lambda entry: (PRIORITY.get(entry['recipe_id'], 99), -entry['stars']))
    entry = usable[0]
    entry['remaining'] -= 1
    state['elixir_cooldown'] = tick + SHARED_COOLDOWN_ROUNDS
    if entry['trigger'].get('kind') == 'elite_first':
        state['elixir_used_encounter'] = state.get('encounter')
    return apply(player, entry, tick)


def apply(player: dict, entry: dict, tick: int) -> list[dict]:
    effects = entry['effects']
    events = []
    if effects.get('hp_restore'):
        before = player['hp']
        player['hp'] = min(player['stats']['hp_max'], before + heal_amount(effects['hp_restore'], player['stats']['hp_max']))
        events.append({'actor': player['name'], 'action': entry['name'], 'kind': 'elixir',
                       'elixir_id': entry['recipe_id'], 'healing': player['hp'] - before})
    if effects.get('mp_restore'):
        before = player['mp']
        player['mp'] = min(player['stats']['mp_max'], before + heal_amount(effects['mp_restore'], player['stats']['mp_max']))
        events.append({'actor': player['name'], 'action': entry['name'], 'kind': 'elixir',
                       'elixir_id': entry['recipe_id'], 'restored': player['mp'] - before})
    duration = int(effects.get('duration') or 0)
    group = 'elixir:' + entry['recipe_id']
    name = entry['name']
    if effects.get('shield'):
        player['states'] = [s for s in player['states'] if s.get('group') != group]
        player['states'].append({'code': 'shield', 'group': group, 'stat': 'hp_max',
                                 'value': effects['shield'], 'name': name,
                                 'remaining': int(player['stats']['hp_max'] * effects['shield']),
                                 'expires': tick + duration})
        events.append({'actor': player['name'], 'action': name, 'kind': 'elixir', 'elixir_id': entry['recipe_id'],
                       'duration': duration, 'group': group})
    if effects.get('hp_regen'):
        player['states'] = [s for s in player['states'] if s.get('group') != group]
        player['states'].append({'code': 'hot', 'group': group, 'stat': 'hp_max', 'value': effects['hp_regen'],
                                 'name': name, 'raw': player['stats']['hp_max'] * effects['hp_regen'],
                                 'remaining': duration, 'next_tick': tick + 1})
        events.append({'actor': player['name'], 'action': name, 'kind': 'elixir', 'elixir_id': entry['recipe_id'],
                       'duration': duration, 'group': group})
    modifiers = {key: effects[key] for key in STAT_KEYS if key in effects}
    if modifiers:
        player['states'] = [s for s in player['states']
                            if s.get('group') != group and not str(s.get('group') or '').startswith(group + ':')]
        player['states'].append({'code': 'modifier', 'group': group, 'stat': next(iter(modifiers)),
                                 'value': next(iter(modifiers.values())), 'name': name,
                                 'expires': tick + duration, 'modifiers': modifiers})
        # value() only reads a single stat; extra stats live in dedicated states.
        for key, value in list(modifiers.items())[1:]:
            player['states'].append({'code': 'modifier', 'group': f'{group}:{key}', 'stat': key,
                                     'value': value, 'name': name, 'expires': tick + duration})
        events.append({'actor': player['name'], 'action': name, 'kind': 'elixir', 'elixir_id': entry['recipe_id'],
                       'duration': duration, 'group': group})
    if effects.get('cleanse'):
        player['states'] = [s for s in player['states']
                            if not (s.get('code') == 'dot' or (s.get('code') == 'modifier' and s.get('value', 0) < 0))]
        immune = int(effects.get('immune_duration') or 0)
        if immune:
            player['states'].append({'code': 'immune', 'group': group + ':immune', 'stat': 'immune',
                                     'value': 0, 'name': name, 'expires': tick + immune})
        events.append({'actor': player['name'], 'action': name, 'kind': 'elixir', 'elixir_id': entry['recipe_id'],
                       'duration': immune})
    return events
