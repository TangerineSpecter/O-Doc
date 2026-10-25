"""Read-only checks at model boundary, before proposal application."""
from decimal import Decimal
from .life_plan_proposal import indexed_rows, normalize_slot_time_aliases
from .life_budget import money


def validate_life_output(value, instruction, context):
    offer = context.get('exploration_offer')
    if offer and 'exploration_intent' in value:
        from .combat.reservation_planning import validate_intent
        validate_intent(value['exploration_intent'], offer['dungeons'])
    slots = context.get('slots', [])
    ids = {row['id'] for row in slots}
    if 'activities' in context:
        if context.get('input_version') == 2 and context.get('daily_planning'):
            from .life_main_validation import repair_conflicts
            value = repair_conflicts(value, context)
        rows = indexed_rows(value.get('plans'), ids, '活动选择')
        allowed = {row['kind'] for row in context['activities']}
        farm_days = set(context.get('existing_farm_days', []))
        selected_farms = {}
        if context.get('daily_planning'):
            for slot in slots:
                if rows[slot['id']].get('activity') == 'farm':
                    day = slot['time'][:10]
                    if day in selected_farms or day in farm_days:
                        raise ValueError('每日农场活动重复')
                    selected_farms[day] = slot['id']
        travel_total = Decimal(0)
        for identity, row in rows.items():
            slot = next(slot for slot in slots if slot['id'] == identity)
            slot_allowed = slot.get('allowed_activities', list(allowed))
            if context.get('input_version') == 2:
                slot_allowed = [*slot_allowed, 'rest']
            if context.get('daily_planning') and selected_farms.get(slot['time'][:10], identity) != identity:
                slot_allowed = [kind for kind in slot_allowed if kind != 'farm']
            if context.get('daily_planning') and not slot_allowed:
                slot_allowed = ['rest']
            if row.get('activity') not in slot_allowed or not isinstance(row.get('reason'), str) or not 0 < len(row['reason'].strip()) <= 2000:
                raise ValueError('活动或选择原因无效')
            if context.get('daily_planning') and row['activity'] == 'travel':
                destination = next((c for c in context.get('travel', {}).get('candidates', [])
                                    if c['id'] == row.get('destination_id')), None)
                if destination is None:
                    raise ValueError('旅行目的地必须属于本次报价')
                travel_total += money(destination['required_budget'])
            if row['activity'] == 'farm':
                day = next(slot['time'][:10] for slot in slots if slot['id'] == identity)
                if day in farm_days:
                    raise ValueError('每日农场活动重复')
                farm_days.add(day)
        if context.get('daily_planning') and travel_total > money(context['travel_budget_ceiling']):
            raise ValueError('当天旅行预算总额超过可用额度，请调整日程')
    elif 'planting' in context and slots:
        from .farm_plan_inventory import inventory_plan
        rows = normalize_slot_time_aliases(value.get('plans'), slots, {row['id']: row for row in slots})
        for row in indexed_rows(rows, ids, '种植计划').values():
            inventory_plan(row.get('farm_plan'), context['planting'].get('crops', []))
    elif slots and 'budgets' in instruction:
        rows = indexed_rows(value.get('budgets'), ids, '预算分配')
        total = Decimal(0)
        for identity, row in rows.items():
            budget = money(row.get('budget'))
            slot = next(slot for slot in slots if slot['id'] == identity)
            if budget < money(slot.get('spent', '0')) or ('activity' in row and row['activity'] != slot['activity']) or type(row.get('needs_market', False)) is not bool:
                raise ValueError('预算、活动或补给状态无效')
            total += budget - money(slot.get('spent', '0'))
        if total > money(context.get('balance', '0')):
            raise ValueError('预算超过余额')
    if 'goal_updates' in value:
        updates = value['goal_updates']
        if not isinstance(updates, list) or len(updates) > 20:
            raise ValueError('目标更新须为最多20项的列表')
        goals = {goal['id'] for goal in context.get('goals', [])}
        for update in updates:
            if not isinstance(update, dict) or update.get('id') not in goals or update.get('status', 'active') not in ('active', 'paused', 'completed', 'abandoned'):
                raise ValueError('目标更新引用或状态无效')
            if update.get('status', 'active') != 'active' and (not isinstance(update.get('reason'), str) or not update['reason'].strip()):
                raise ValueError('结束或暂停目标须说明原因')
            if update.get('status') == 'completed' and not isinstance(update.get('evidence_record_id'), str):
                raise ValueError('完成目标必须引用真实记录')
    return value
