import time
"""先决定生活意向，再为选定活动分配资金和准备领域计划。"""
from copy import deepcopy
from collections.abc import Callable

from .life_budget import money
from .life_budget_policy import allows_spending


def selection_context(context: dict) -> dict:
    """选择阶段只带角色与连续性生活背景，不加载执行合同或费用表。"""
    keys = ('actor_id', 'actor_name', 'role', 'profession', 'preferences', 'direction',
            'goals', 'ongoing_travel', 'stamina')
    value = {key: deepcopy(context[key]) for key in keys if key in context}
    value['activities'] = [
        {key: row[key] for key in ('kind', 'task_id', 'preference') if key in row}
        for row in context.get('activities', [])
    ]
    value['slots'] = [{key: row[key] for key in ('id', 'time', 'current_activity') if key in row}
                      for row in context['slots']]
    value['recent_experiences'] = deepcopy(context.get('recent_experiences', [])[:8])
    value['today'] = [{key: row[key] for key in ('activity', 'status', 'intent') if key in row}
                      for row in context.get('today', [])]
    value['recent_social'] = [
        {'created_at': row.get('created_at'), 'action': row.get('result', {}).get('action')}
        for row in context.get('recent_social', [])[:5]
    ]
    return value


def indexed_rows(rows: object, expected: set[str], label: str) -> dict[str, dict]:
    if (not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows)
            or any(not isinstance(row.get('id'), str) for row in rows)
            or len(rows) != len(expected) or {row['id'] for row in rows} != expected):
        raise ValueError(f'{label}必须为本次每个时间点指定且仅指定一次')
    return {row['id']: row for row in rows}


def farm_planning_context(context: dict, farms: list[dict], slots: dict[str, dict]) -> dict:
    """Project only the current farm facts needed to choose today's planting queue."""
    value = {}
    farm = context.get('farm')
    if isinstance(farm, dict):
        plots = []
        for plot in farm.get('plots', []):
            crop = plot.get('crop')
            if not crop:
                plots.append(None)
                continue
            rules = crop.get('rules') or {}
            growth = rules.get('growth_seconds')
            grown = crop.get('grown', 0)
            remaining = max(0, growth - grown) if isinstance(growth, (int, float)) and isinstance(grown, (int, float)) else None
            plots.append({'name': rules.get('name'), 'remaining_seconds': remaining})
        value['farm'] = {'plots': plots}

    planting = context.get('planting') or {}
    crops = []
    for crop in planting.get('crop_comparisons', []):
        quantity = crop.get('seed_quantity', 0)
        if type(quantity) is not int or quantity <= 0:
            continue
        row = {key: crop[key] for key in ('name', 'seed_sku', 'seed_quantity', 'growth_seconds') if key in crop}
        base = crop.get('without_fertilizer') or {}
        row['without_fertilizer'] = {key: base[key] for key in ('expected_quantity', 'expected_revenue') if key in base}
        row['fertilizers'] = {}
        for kind, option in (crop.get('fertilizers') or {}).items():
            row['fertilizers'][kind] = {key: option[key] for key in (
                'expected_quantity', 'expected_revenue', 'additional_net_revenue',
                'inventory_additional_net_revenue') if key in option}
        crops.append(row)

    fertilizers = {}
    for kind, stock in (planting.get('fertilizers') or {}).items():
        quote = stock.get('quote') or {}
        fertilizers[kind] = {
            'quantity': stock.get('quantity', 0),
            'next_inventory_cost': stock.get('next_inventory_cost'),
            'market_price': quote.get('price'),
        }
    value['planting'] = {'crops': crops, 'fertilizers': fertilizers}
    if 'balance' in context:
        value['balance'] = context['balance']

    queue = context.get('farm_queue')
    if queue is None:
        value['farm_queue'] = None
    else:
        value['farm_queue'] = {
            key: queue[key] for key in ('day', 'status', 'procurement_limit') if key in queue
        }
        value['farm_queue']['entries'] = [
            {key: entry[key] for key in ('sku', 'quantity', 'remaining', 'fertilizer_mode', 'fertilizer') if key in entry}
            for entry in queue.get('entries', [])
        ]

    rules = context.get('farm_queue_rules') or {}
    if rules.get('cutoff'):
        value['cutoff'] = rules['cutoff']
    value['slots'] = [
        {key: slots[row['id']][key] for key in ('id', 'time') if key in slots[row['id']]}
        | ({'reason': row['reason']} if row.get('reason') else {})
        for row in farms
    ]
    return value


def normalize_slot_time_aliases(rows: object, farms: list[dict], slots: dict[str, dict]) -> object:
    """Accept the exact slot timestamp when a model confuses it with the internal item ID."""
    if not isinstance(rows, list):
        return rows
    counts = {}
    for row in farms:
        at = slots[row['id']]['time']
        counts[at] = counts.get(at, 0) + 1
    aliases = {slots[row['id']]['time']: row['id'] for row in farms
               if counts[slots[row['id']]['time']] == 1}
    return [({**row, 'id': aliases[row['id']]}
             if isinstance(row, dict) and isinstance(row.get('id'), str) and row['id'] in aliases else row)
            for row in rows]


def propose(agent, context: dict, ask: Callable, ask_detail: Callable | None = None) -> dict:
    ask_detail = ask_detail or ask
    from .life_activity_decision import select_activities
    selection_input = selection_context(context)
    selection_input['_request_deadline'] = time.monotonic() + 180
    slot_ids = {row['id'] for row in context['slots']}
    selection_input['existing_farm_days'] = sorted({row['time'][:10] for row in context.get('upcoming', []) if row.get('activity') == 'farm' and row.get('id') not in slot_ids})
    choice = select_activities(agent, selection_input, ask)
    if choice is None:
        choice = ask(agent,
            '今天有slots中的这些行动机会。根据自己的角色性格、兴趣、目标和近期经历，'
            '决定各次机会想做什么，也可以rest。不需要平均分配活动或为了职业强选某项。'
            '现在只选择意向，不计算预算，不生成种植、路线、交易或创作细节；'
            '资金和可行性会在选定活动后单独处理。farm每天最多安排一次开工。'
            '返回 {"plans":[{"id":"时间点ID","activity":"activities中的kind或rest",'
            '"reason":"想做这件事的原因"}],"goal_updates":[]}。'
            '目标完成须引用真实evidence_record_id；允许放弃失效目标并说明原因。',
            selection_input)
    slots = {row['id']: row for row in context['slots']}
    selected = indexed_rows(choice.get('plans'), set(slots), '活动选择')
    allowed = {row['kind'] for row in context.get('activities', [])} | {'rest'}
    plans = []
    farm_days = set()
    for identity, row in selected.items():
        if row.get('activity') not in allowed:
            raise ValueError('活动未开放或配置缺失')
        reason = row.get('reason')
        if not isinstance(reason, str) or not reason.strip() or len(reason) > 2000:
            raise ValueError('生活规划须说明原因')
        if row['activity'] == 'farm':
            day = slots[identity]['time'][:10]
            if day in farm_days:
                raise ValueError('每位居民每天最多安排一次农场队列开工')
            farm_days.add(day)
        # 不接受选择阶段提前塞入的预算、补给或领域计划。
        plans.append({'id': identity, 'activity': row['activity'], 'reason': reason,
                      'budget': slots[identity]['spent'], 'needs_market': False})
    proposal = {'plans': plans, 'goal_updates': choice.get('goal_updates', [])}
    paid = [row for row in plans if allows_spending(row['activity']) and row['activity'] != 'farm']
    if paid:
        funds = {key: deepcopy(context[key]) for key in
                 ('balance', 'goals') if key in context}
        # 本轮安排由slots统一分配，不能再当作其他承诺重复预留。
        funds['upcoming'] = [deepcopy(row) for row in context.get('upcoming', [])
                             if row['id'] not in slots]
        if any(row['activity'] == 'travel' for row in paid):
            funds['travel_costs'] = deepcopy(context.get('travel_costs'))
        funds['slots'] = [{**row, 'time': slots[row['id']]['time'],
                           'spent': slots[row['id']]['spent']} for row in paid]
        response = ask_detail(agent,
            '活动已经选定，只为slots中的活动提供总预算，不得换活动。'
            '结合真实余额及其他安排预留分配，预算不能小于已支出，总预留不能超过余额。'
            '预算只是预留，不是扣款；目的地和具体操作在执行对应活动时再决定。'
            '返回 {"budgets":[{"id":"时间点ID","budget":"总预算",'
            '"needs_market":false}]}。如需调整其他安排，可另返回'
            'budget_allocations:[{id,budget}]和budget_reason说明原因。', funds)
        budgets = indexed_rows(response.get('budgets'), {row['id'] for row in paid}, '预算分配')
        for row in paid:
            entry = budgets[row['id']]
            if 'activity' in entry and entry['activity'] != row['activity']:
                raise ValueError('预算阶段不能更换活动')
            row['budget'] = str(money(entry.get('budget')))
            row['needs_market'] = entry.get('needs_market', False)
        for key in ('budget_allocations', 'budget_reason'):
            if key in response:
                proposal[key] = response[key]
    farms = [row for row in plans if row['activity'] == 'farm']
    if farms:
        farming = farm_planning_context(context, farms, slots)
        response = ask_detail(agent,
            '已选择农场开工，现在单独准备种植队列，不得换活动。'
            '只从planting.crops中选择有库存的seed_sku，数量不能超过seed_quantity；'
            '结合空地、在田作物剩余时间、作物周期和cutoff估算，不保证全部种完。没有可用种子必须返回空entries，'
            '根据种子与肥料的估算产量、收益和库存决定是否施肥；optional表示缺肥时不阻塞，required表示缺肥时等待。'
            '保留采购上限作为补给意向，具体作物和数量等市场实际买到种子后再确定。'
            '返回 {"plans":[{"id":"slots中对应的id","farm_plan":{"entries":'
            '[{"sku":"种子SKU","quantity":当天目标数量,"fertilizer_mode":'
            '"none或optional或required","fertilizer":"quality或yield或null"}],'
            '"procurement_limit":"采购上限"}}]}。允许空队列。'
            'id必须逐字复制slots[].id；slots[].time仅用于判断开工时间，不能作为id。'
            '采购由独立每日市场预算承担，不在开工日程重复预留。'
            '已固化的队列普通修订不会重建。', farming)
        specifications = indexed_rows(normalize_slot_time_aliases(response.get('plans'), farms, slots),
                                      {row['id'] for row in farms}, '种植计划')
        from .farm_plan_inventory import inventory_plan
        for row in farms:
            row['farm_plan'] = inventory_plan(specifications[row['id']].get('farm_plan'),
                                             context.get('planting', {}).get('crop_comparisons', []))
    return proposal
