"""Forge visits register intentions, then commit ready goals without reselecting gear."""
import copy
from collections import Counter

from django.db import transaction

from system_settings.models import WorldAction
from .farm_gate import farm_gate
from .blacksmith_catalog import MAX_PIECES
from .blacksmith_decisions import choose
from .blacksmith_goals import active, eligible, register, summary


def _save(action, agent, phase: str, current: dict | None = None, decision=None, **changes):
    from .blacksmith_runner import require_ready
    expected = action.updated_at
    with farm_gate(), transaction.atomic():
        locked = WorldAction.objects.select_for_update().get(pk=action.pk)
        if locked.status != 'claimed' or locked.updated_at != expected:
            raise ValueError('打造目标状态在决策期间变化，旧响应已丢弃')
        require_ready(locked, agent)
        if phase == 'commit':
            fresh = summary(locked.snapshot['owner_id'], agent.pk)
            goal = next((row for row in fresh['goals'] if row['id'] == current['goal_id']), None)
            live = eligible(locked.snapshot['owner_id'], agent.pk).get(current['recipe_id'])
            if (not goal or not goal['ready'] or not live
                    or live['rule'] != current['snapshot']['rule']
                    or current['snapshot']['template_id'] not in {
                        row['template_id'] for row in live['types']}):
                raise ValueError('决策期间打造目标、材料或配方已变化')
        state = copy.deepcopy(locked.snapshot)
        state.update(changes)
        state['phase'] = phase
        if current is not None:
            state['current'] = current
        if decision:
            state['decisions'] = [*state['decisions'], decision]
        locked.snapshot = state
        locked.save(update_fields=['snapshot', 'updated_at'])
    action.refresh_from_db()


def _context(action, agent, facts):
    from .blacksmith_runner import equipment_summary
    return {'job': facts['profile'].progression['job'],
            'character_level': facts['profile'].progression['level'],
            'equipment': equipment_summary(facts['profile']),
            'preferences': action.task.prompt or '',
            'goal_progress': summary(action.snapshot['owner_id'], agent.pk)}


def _ready(action, agent, facts):
    from .blacksmith_goals import active
    stock = Counter()
    for row in facts['pool']:
        stock[row['sku']] += row['quantity']
    rules = facts['rules']
    ready = [goal for goal in active(action.snapshot['owner_id'], agent.pk, invalidate=True)
             if all(stock[row['sku']] >= row['quantity'] for row in rules[goal.recipe_id]['ingredients'])]
    return ready, stock


def advance(action, agent, agent_token, world_token, scheduler=None):
    from .alchemy_materials import allocate
    from .blacksmith_runner import facts_for, finish, progress, require_ready
    from .blacksmith_service import commit_piece
    owner = action.snapshot['owner_id']
    while action.status == 'claimed':
        action.refresh_from_db()
        require_ready(action, agent)
        state = action.snapshot
        phase, cursor = state['phase'], state['cursor']
        if phase == 'done' or cursor >= MAX_PIECES:
            finish(action, scheduler, reason='本次铁匠铺活动结束。')
            return
        if phase == 'commit':
            current = state['current']
            progress(action.record, '正在打造目标装备', f'第 {cursor + 1}/{MAX_PIECES} 件')
            commit_piece(agent.pk, action.pk, cursor, current['recipe_id'], current['snapshot'],
                         current['reason'], action.task, agent_token, world_token)
            continue
        facts = facts_for(action, agent)
        if not facts['profile']:
            finish(action, scheduler, reason='尚未建立冒险档案。')
            return
        choices = eligible(owner, agent.pk)
        context = _context(action, agent, facts)
        if phase == 'choose_goal':
            ready, stock = _ready(action, agent, facts)
            if ready and facts['energy'] >= 2:
                combined = Counter()
                for goal in ready:
                    combined.update({row['sku']: row['quantity'] for row in facts['rules'][goal.recipe_id]['ingredients']})
                if len(ready) > 1 and any(combined[sku] > stock[sku] for sku in combined):
                    options = {goal.pk: {'recipe_id': goal.recipe_id, 'template_id': goal.template_id}
                               for goal in ready}
                    decision = choose(action, agent, 'goal_priority', context, options)
                    selected = next(row for row in ready if row.pk == decision['choice'])
                else:
                    selected, decision = ready[0], None
                rule = copy.deepcopy(facts['rules'][selected.recipe_id])
                template = next(row for row in choices[selected.recipe_id]['types']
                                if row['template_id'] == selected.template_id)
                snapshot = {'version': 1, 'rule': rule, 'catalog_id': facts['catalog'].version,
                            'template_id': template['template_id'], 'level_min': template['level_min'],
                            'level_max': template['level_max'], 'job': facts['profile'].progression['job'],
                            'materials': allocate(copy.deepcopy(facts['pool']), rule['ingredients']),
                            'quality_rules': {'version': 1, 'white': 70, 'blue': 25, 'gold': 5}}
                _save(action, agent, 'commit', {'goal_id': selected.pk, 'recipe_id': selected.recipe_id,
                    'snapshot': snapshot, 'reservation': {'ingredients': [
                        {'sku': row['sku'], 'quantity': row['quantity']} for row in rule['ingredients']]},
                    'reason': '系统说明：按已登记目标打造。'}, decision)
                continue
            free = 3 - len(active(owner, agent.pk, invalidate=True))
            if free > 0 and state['registered_count'] < 3 and choices:
                _save(action, agent, 'goal_count')
            else:
                _save(action, agent, 'done')
        elif phase == 'goal_count':
            free = min(3 - len(active(owner, agent.pk, invalidate=True)), 3 - state['registered_count'])
            if free <= 0 or not choices:
                _save(action, agent, 'done')
                continue
            options = {str(count): f'登记 {count} 件打造目标' for count in range(free + 1)}
            decision = choose(action, agent, 'goal_count', context, options)
            count = int(decision['choice'])
            _save(action, agent, 'band' if count else 'done', {}, decision,
                  remaining_registrations=count, goal_sequence=state['goal_sequence'] + 1)
        elif phase == 'band':
            bands = {row['rule']['band_id']: {'name': row['rule']['band_label']}
                     for row in choices.values()}
            decision = choose(action, agent, 'band', context, bands)
            _save(action, agent, 'slot', {'band_id': decision['choice']}, decision)
        elif phase == 'slot':
            options = {key: {k: value for k, value in entry['rule'].items() if k != 'ingredients'}
                       for key, entry in choices.items() if entry['rule']['band_id'] == state['current']['band_id']}
            if not options:
                raise ValueError('目标等级档的合法配方已失效')
            decision = choose(action, agent, 'slot', context, options)
            _save(action, agent, 'type', {**state['current'], 'recipe_id': decision['choice']}, decision)
        elif phase == 'type':
            recipe_id = state['current']['recipe_id']
            if recipe_id not in choices:
                raise ValueError('目标配方已失效')
            types = {row['template_id']: row for row in choices[recipe_id]['types']}
            decision = choose(action, agent, 'type', context, types)
            remaining = state['remaining_registrations'] - 1
            with transaction.atomic():
                goal = register(owner, agent.pk, recipe_id, decision['choice'],
                                f'{action.pk}:{state["goal_sequence"]}:{state["registered_count"]}')
                decision['goal_id'] = goal.pk
                _save(action, agent, 'band' if remaining else 'choose_goal', {}, decision,
                      remaining_registrations=remaining, registered_count=state['registered_count'] + 1,
                      goal_sequence=state['goal_sequence'] + 1)
        else:
            raise ValueError('未知打造目标阶段')
