"""Structured, sequential choices used by exploration preparation."""
from __future__ import annotations

import hashlib
import time
from decimal import Decimal

from django.db import transaction

from .models import CombatProfile, EquipmentInstance, Exploration, CombatRuntime
from .profiles import equip, preview_equipment
from .store import current
from . import equipment_effective
from ..farm_gate import farm_gate
from ..inventory_stock import stock_quantity
from ..market_spending import spending_context

QUESTION_TIMEOUT_SECONDS = 45


def _character(agent, profile, catalog, *, include_mbti: bool) -> dict:
    role = getattr(agent, 'role_profile', {}) or {}
    job_id = profile.progression['job']
    profession = catalog.row('professions', job_id)
    result = {
        'personality': role.get('personality', ''),
        'profession': {'id': job_id, 'name': profession.get('name', job_id)},
        'level': profile.progression['level'],
    }
    if include_mbti:
        result['mbti'] = role.get('mbti', '')
    return result


def _choice(run, agent, question_id, state, choices, fallback, instructions, *, scene='combat_preparation', check=None):
    """Use the enabled decision connection; a provider outage never blocks departure."""
    if check:
        check()
    if not choices:
        raise ValueError('探索准备没有合法候选')
    if len(choices) == 1:
        selected = next(iter(choices))
        return selected, {'choice': selected, 'source': 'single_candidate', 'confidence': 1.0}
    from ..life_models import LifeItem
    from ..life_activities import is_interleaved
    item = LifeItem.objects.filter(pk=run.life_item_id).first()
    if item and is_interleaved(item):
        from ..life_interleaving_choices import checkpoint_choice
        selected = checkpoint_choice(item, agent, question_id, scene, state, choices)
        return selected, {'choice': selected, 'source': 'decision_model', 'confidence': None}
    from system_settings.decision.routing import choose_scene
    try:
        result = choose_scene(
            run.owner_id, agent, scene, state, choices,
            deadline=time.monotonic() + QUESTION_TIMEOUT_SECONDS,
            question_id=question_id, instructions=instructions,
            include_role=False, max_probability=True, return_confidence=True,
        )
    except TimeoutError:
        result = None
    if check:
        check()
    if result is None:
        selected = fallback
        source, confidence = 'code_fallback', None
    else:
        selected, confidence = result
        source = 'decision_model'
    if selected not in choices:
        selected = fallback
        source, confidence = 'code_fallback', None
    return selected, {'choice': selected, 'source': source, 'confidence': confidence}


def _record_choice(trace, key, record):
    trace[key] = record


def _gear_decision_key(run_id, equipment_id, action):
    suffix = hashlib.sha256(equipment_id.encode()).hexdigest()[:16]
    return f'{run_id}:gear-choice:{suffix}:{action}'


def decided_for_sale_or_listing(actor_id: str) -> set[str]:
    from .equipment_market import preparation_intents
    return set(preparation_intents(actor_id))


def _record_gear_decision(run, item, action, source, target_slot='') -> bool:
    with farm_gate(), transaction.atomic():
        locked_run = Exploration.objects.select_for_update().get(pk=run.pk)
        if (locked_run.status != 'preparing' or
                not CombatRuntime.objects.filter(pk=run.pk, authorized=True).exists()):
            return False
        profile = CombatProfile.objects.select_for_update().get(pk=run.actor_id)
        gear = EquipmentInstance.objects.select_for_update().filter(
            pk=item.pk, owner_id=run.owner_id, actor_id=run.actor_id, sold=False).first()
        if not gear:
            return False
        equipped_in_target_slot = target_slot and profile.loadout.get(target_slot) == gear.pk
        if action == 'replace':
            if not equipped_in_target_slot:
                return False
        elif gear.pk in profile.loadout.values():
            return False
        if action in ('sell', 'list') and (gear.bound or gear.locked):
            return False
        if action in ('sell', 'list') and gear.pk in decided_for_sale_or_listing(profile.pk):
            return False
        payload = {'equipment_id': gear.pk, 'action': action,
                   'decision_source': source, 'target_slot': target_slot}
        from .facts import append
        append(profile, _gear_decision_key(run.pk, gear.pk, action), 'gear_prepare', payload, locked_run)
        return True


def _equipment_wire(item: EquipmentInstance, catalog_cache: dict | None = None) -> dict:
    snapshot = equipment_effective.for_instance(item, cache=catalog_cache) or {}
    return {
        'id': item.pk, 'name': snapshot.get('name', ''), 'slot': snapshot.get('slot', ''),
        'equipment_type': snapshot.get('equipment_type', ''), 'level': snapshot.get('level', 0),
        'quality': snapshot.get('quality', ''), 'stats': snapshot.get('stats', {}),
        'affixes': snapshot.get('affixes', []), 'shop_sell_price': str(item.value),
    }


def _wear_slots(catalog, item, profile):
    snapshot = item.snapshot or {}
    slot = snapshot.get('slot')
    if slot == 'accessory' and snapshot.get('equipment_type') == 'ring':
        possible = ['ring_1', 'ring_2']
    elif slot in {'weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'accessory'}:
        possible = [slot]
    else:
        return []
    try:
        from .equipment_snapshot import permitted as can_wear, slot_matches
        permitted = can_wear(snapshot, item.rules, profile.progression['job'], profile.progression['level'])
    except (ValueError, KeyError, TypeError):
        return []
    if not permitted:
        return []
    try:
        return [target for target in possible if slot_matches(snapshot, item.rules, target)]
    except (ValueError, KeyError, TypeError):
        return []


def _collect_loadout_changes(profile, before, changes):
    profile.refresh_from_db()
    for slot in before.keys() | profile.loadout.keys():
        if before.get(slot) != profile.loadout.get(slot):
            changes[slot] = profile.loadout.get(slot)


def _decide_old_equipment(run, agent, profile, catalog, item, character, trace, key, check, catalog_cache):
    if item.bound or item.locked or item.sold:
        return
    choices = {'sell': '出售：下次进入居民集市时按商店回收价自动出售',
               'list': '上架：下次进入居民集市时再决定挂牌价格'}
    state = {'character': character, 'displaced_equipment': _equipment_wire(item, catalog_cache)}
    selected, record = _choice(
        run, agent, key, state, choices, None,
        '这是刚被替换下来的旧装备。只判断将它出售还是上架，不判断新装备，也不处理探索方案。',
        check=check)
    _record_choice(trace, key + ':' + item.pk, record)
    if record['source'] == 'decision_model' and selected in ('sell', 'list'):
        _record_gear_decision(run, item, selected, record['source'])


def _process_equipment(run, agent, profile, catalog, trace, check, equipment_changes):
    character = _character(agent, profile, catalog, include_mbti=False)
    catalog_cache = {}
    processed = decided_for_sale_or_listing(profile.pk)
    equipped_at_start = set(profile.loadout.values())
    items = list(EquipmentInstance.objects.filter(
        owner_id=run.owner_id, actor_id=run.actor_id, sold=False, bound=False, locked=False
    ).exclude(pk__in=equipped_at_start).order_by('-created_at', 'pk'))

    for item in items:
        check()
        profile.refresh_from_db()
        if item.pk in profile.loadout.values() or item.pk in processed:
            continue
        snapshot = item.snapshot or {}
        level = int(snapshot.get('level', 0))
        if level > profile.progression['level']:
            continue  # Revisit after promotion; do not mark it as judged.

        candidate_slots = _wear_slots(catalog, item, profile)
        valid_slots = []
        if candidate_slots:
            for slot in candidate_slots:
                try:
                    preview_equipment(profile, {slot: item.pk})
                except (ValueError, KeyError, TypeError):
                    continue
                valid_slots.append(slot)

        empty = [slot for slot in valid_slots if not profile.loadout.get(slot)]
        if empty:
            slot = empty[0]
            before = dict(profile.loadout)
            try:
                equip(run.owner_id, agent, f'{run.pk}:auto-equip:{hashlib.sha256(item.pk.encode()).hexdigest()[:40]}',
                      {slot: item.pk}, preparing=run.pk)
            except (ValueError, KeyError, TypeError):
                continue
            _collect_loadout_changes(profile, before, equipment_changes)
            _record_choice(trace, 'equipment_auto:' + item.pk,
                           {'choice': 'equip', 'slot': slot, 'source': 'code'})
            for identity in set(before.values()) - set(profile.loadout.values()):
                old = EquipmentInstance.objects.filter(pk=identity, actor_id=profile.pk, sold=False).first()
                if old:
                    _decide_old_equipment(run, agent, profile, catalog, old, character,
                                          trace, f'displaced:{item.pk}:{identity}', check, catalog_cache)
            continue

        current_by_slot = {}
        for slot in valid_slots:
            identity = profile.loadout.get(slot)
            if identity:
                current = EquipmentInstance.objects.filter(pk=identity, actor_id=profile.pk, sold=False).first()
                if current:
                    current_by_slot[slot] = current
        if valid_slots and current_by_slot:
            choices = {}
            for slot, old in current_by_slot.items():
                key = 'replace' if len(current_by_slot) == 1 else 'replace:' + slot
                choices[key] = {'action': 'replace', 'slot': slot,
                                'current_equipment': _equipment_wire(old, catalog_cache),
                                'candidate_equipment': _equipment_wire(item, catalog_cache)}
            choices['sell'] = '出售候选装备：下次进入居民集市时按商店回收价自动出售'
            choices['list'] = '上架候选装备：下次进入居民集市时再决定挂牌价格'
            state = {'character': character, 'candidate_equipment': _equipment_wire(item, catalog_cache),
                     'current_slot_equipment': {slot: _equipment_wire(old, catalog_cache)
                                                for slot, old in current_by_slot.items()}}
            fallback = None
            question = 'equipment:' + item.pk
            selected, record = _choice(
                run, agent, question, state, choices, fallback,
                '按角色性格、职业和等级比较当前部位装备与候选装备。候选已满足等级；只能选择更换、出售或上架。',
                check=check)
            _record_choice(trace, question, record)
            if record['source'] != 'decision_model':
                continue
            if selected.startswith('replace'):
                slot = choices[selected]['slot']
                before = dict(profile.loadout)
                try:
                    equip(run.owner_id, agent,
                          f'{run.pk}:replace:{hashlib.sha256((item.pk+slot).encode()).hexdigest()[:40]}',
                          {slot: item.pk}, preparing=run.pk)
                except (ValueError, KeyError, TypeError):
                    continue
                _collect_loadout_changes(profile, before, equipment_changes)
                _record_gear_decision(run, item, 'replace', record['source'], slot)
                displaced = set(before.values()) - set(profile.loadout.values())
                for identity in displaced:
                    old = EquipmentInstance.objects.filter(pk=identity, actor_id=profile.pk, sold=False).first()
                    if old:
                        _decide_old_equipment(run, agent, profile, catalog, old, character,
                                              trace, f'displaced:{item.pk}:{identity}', check, catalog_cache)
            elif selected in ('sell', 'list'):
                if _record_gear_decision(run, item, selected, record['source']):
                    processed.add(item.pk)
            continue

        # This includes level-eligible equipment whose profession/mastery does not
        # permit wearing it. Such gear remains a sale/list decision candidate.
        choices = {'sell': '出售：下次进入居民集市时按商店回收价自动出售',
                   'list': '上架：下次进入居民集市时再决定挂牌价格'}
        question = 'equipment:' + item.pk
        state = {'character': character, 'candidate_equipment': _equipment_wire(item, catalog_cache)}
        selected, record = _choice(
            run, agent, question, state, choices, None,
            '角色当前不能穿戴这件装备。只判断出售或上架，不要选择更换。',
            check=check)
        _record_choice(trace, question, record)
        if record['source'] == 'decision_model' and selected in ('sell', 'list'):
            if _record_gear_decision(run, item, selected, record['source']):
                processed.add(item.pk)


def build_plan(run, agent, *, check) -> tuple[dict, dict]:
    """Ask one bounded question per stage and save only server-validated IDs."""
    profile = CombatProfile.objects.get(pk=run.actor_id)
    catalog = current(run.catalog_id)
    level = profile.progression['level']
    character = _character(agent, profile, catalog, include_mbti=True)
    constraints = run.snapshot.get('constraints') or {}
    trace = {}

    dungeons = [row for row in catalog.tables['dungeons']
                if row.get('enabled') == '1' and level >= int(row['recommended_level_min'])]
    if constraints.get('dungeon_id'):
        dungeons = [row for row in dungeons if row['id'] == constraints['dungeon_id']]
    dungeon_choices = {row['id']: {'name': row['name'], 'recommended_level':
                                   f"{row['recommended_level_min']}-{row['recommended_level_max']}"}
                       for row in dungeons}
    safe_dungeon = min(dungeons, key=lambda row: int(row['recommended_level_min']))['id'] if dungeons else None
    dungeon_id, record = _choice(
        run, agent, 'dungeon_id', {'character': character, 'constraints': constraints},
        dungeon_choices, safe_dungeon,
        '根据角色性格、MBTI、冒险职业和等级选择探索地点。只从候选地点中选择。',
        check=check)
    if dungeon_id is None:
        raise ValueError('当前等级没有可探索的地点')
    _record_choice(trace, 'dungeon_id', record)
    dungeon = catalog.row('dungeons', dungeon_id)

    duration_candidates = ([(constraints['duration_seconds'], f"加入{constraints['duration_seconds']//60}分钟")] if run.snapshot.get('target_party_id') or run.snapshot.get('reservation_id') else [(1800, '30分钟'), (3600, '60分钟'), (7200, '120分钟')])
    if constraints.get('duration_seconds') is not None:
        duration_candidates = [(seconds, label) for seconds, label in duration_candidates
                               if seconds == constraints['duration_seconds']]
    from ..life_models import LifeItem
    from ..life_interleaving_candidates import legal_durations
    item = LifeItem.objects.filter(pk=run.life_item_id).first()
    legal = legal_durations(item, [seconds for seconds, _ in duration_candidates], seconds=True)
    duration_choices = {str(seconds): label for seconds, label in duration_candidates if seconds in legal}
    duration_fallback = next(iter(duration_choices), None)
    duration, record = _choice(
        run, agent, 'duration_seconds',
        {'character': character, 'selected_dungeon': {'id': dungeon_id, 'name': dungeon['name']}},
        duration_choices, duration_fallback,
        '根据角色性格、职业、等级和已选地点选择探索时长。',
        check=check)
    if duration is None:
        raise ValueError('当前约束下没有合法探索时长')
    duration = int(duration)
    _record_choice(trace, 'duration_seconds', {**record, 'choice': duration})

    from .food import choose as choose_food, summary as food_summary
    food, record = choose_food(run, agent, duration, structured=True, check=check)
    _record_choice(trace, 'food', record)

    styles = [row for row in catalog.tables['styles'] if row.get('enabled') == '1']
    if constraints.get('style_id'):
        styles = [row for row in styles if row['id'] == constraints['style_id']]
    style_choices = {row['id']: {'name': row['name'], 'attack_weight': row['attack_weight'],
                                 'skill_weight': row['skill_weight'], 'heal_threshold': row['heal_threshold'],
                                 'mana_threshold': row['mana_threshold'], 'defend_factor': row['defend_factor']}
                     for row in styles}
    style_fallback = next((row['id'] for row in styles if row['id'] == 'style.balanced'),
                          styles[0]['id'] if styles else None)
    style_id, record = _choice(
        run, agent, 'style_id',
        {'character': character,
         'selected_dungeon': {'id': dungeon_id, 'name': dungeon['name']},
         'selected_duration_seconds': duration, 'selected_food': food_summary(food)},
        style_choices, style_fallback,
        '根据角色性格、职业、等级以及已选地点和时长选择探索风格。',
        check=check)
    if style_id is None:
        raise ValueError('当前约束下没有合法探索风格')
    _record_choice(trace, 'style_id', record)
    style = catalog.row('styles', style_id)

    cap = int(catalog.rules['potion_carry_cap'])
    potions = [row for row in catalog.tables['potions']
               if row.get('enabled') == '1' and int(row['required_level']) <= level]
    available_stock = {row['id']: stock_quantity(agent.pk, run.owner_id, 'combat.' + row['id'])
                       for row in potions}
    supplies = {'potions': [{'id': row['id'], 'name': row['name'], 'kind': row['kind'],
                             'restore_value': row['restore_value'], 'owned': available_stock[row['id']],
                             'purchase_price': row['purchase_price']} for row in potions],
                'purchase_funds': str(spending_context(run.owner_id, agent.pk)['spendable'])}
    from .potion_context import decision_state as potion_decision_state
    previous = {**potion_decision_state(run, profile, catalog), 'character': character,
                'selected_food': food_summary(food),
                'selected_dungeon': {'id': dungeon_id, 'name': dungeon['name']},
                'selected_duration_seconds': duration,
                'selected_style': {'id': style_id, 'name': style['name']},
                'supplies': supplies}
    quantity_choices = {str(value): f'{value}瓶' for value in range(cap + 1)}
    red_count, record = _choice(
        run, agent, 'red_potion_count', previous, quantity_choices, str(min(3, cap)),
        f'结合当前HP/上限、药剂恢复量与价格、本次时长和最近一次探索摘要选择红药数量，0至{cap}瓶。历史只是参考；仍有红药却倒地不等于携带不足，总回血量为null表示未知，不按时长机械外推。只选一个选项。',
        check=check)
    red_count = int(red_count)
    _record_choice(trace, 'red_potion_count', {**record, 'choice': red_count})
    red_id = None
    if red_count:
        from .potion_context import red_tier_choices
        tier_choices = red_tier_choices(potions, available_stock, red_count, supplies['purchase_funds'])
        if tier_choices:
            tier_fallback = max(tier_choices, key=lambda sid: tier_choices[sid]['restore_value'])
            red_id, record = _choice(
                run, agent, 'red_potion_id', {**previous, 'selected_red_potion_count': red_count},
                tier_choices, tier_fallback,
                '只选择本次红药档位。结合生命上限、单瓶恢复量、库存和本次数量的采购费用，权衡治疗溢出与价格。全部红药使用所选档位，不足时仅采购同档；最终买不起会缩减数量，不自动换档。',
                check=check)
        else:
            record = {'choice': None, 'source': 'unavailable', 'confidence': None}
        _record_choice(trace, 'red_potion_id', record)
    blue_limit = max(0, cap - red_count)
    blue_choices = {str(value): f'{value}瓶' for value in range(blue_limit + 1)}
    blue_count, record = _choice(
        run, agent, 'blue_potion_count', {**previous, 'selected_red_potion_count': red_count,
                            'selected_red_potion': {'id': red_id, **tier_choices[red_id]} if red_id else None},
        blue_choices, '0',
        f'根据角色和已选探索方案决定携带多少瓶蓝药。总携带上限为{cap}瓶，已选红药{red_count}瓶，因此蓝药只能选择0至{blue_limit}瓶。',
        check=check)
    blue_count = int(blue_count)
    _record_choice(trace, 'blue_potion_count', {**record, 'choice': blue_count})

    planned_potions, purchases = {}, {}
    for kind, target in (('heal', red_count), ('mana', blue_count)):
        remaining = target
        same_kind = sorted((row for row in potions if row['kind'] == kind
                            and (kind != 'heal' or row['id'] == red_id)),
                           key=lambda row: (int(row['restore_value']), int(row['required_level'])), reverse=True)
        for row in same_kind:
            use = min(remaining, available_stock[row['id']])
            if use:
                planned_potions[row['id']] = use
                remaining -= use
            if not remaining:
                break
        if remaining and same_kind:
            identity = same_kind[0]['id']
            planned_potions[identity] = planned_potions.get(identity, 0) + remaining
            purchases[identity] = purchases.get(identity, 0) + remaining

    equipment_changes = {}
    _process_equipment(run, agent, profile, catalog, trace, check, equipment_changes)
    return ({'dungeon_id': dungeon_id, 'duration_seconds': duration, 'style_id': style_id,
             'food': food,
             'equipment': equipment_changes, 'purchases': purchases, 'potions': planned_potions,
             'reason': '根据角色信息和逐步决策结果完成出发准备。'}, trace)
