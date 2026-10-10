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


def propose(agent, context: dict, ask: Callable) -> dict:
    choice = ask(agent,
        '今天有slots中的这些行动机会。根据自己的角色性格、兴趣、目标和近期经历，'
        '决定各次机会想做什么，也可以rest。不需要平均分配活动或为了职业强选某项。'
        '现在只选择意向，不计算预算，不生成种植、路线、交易或创作细节；'
        '资金和可行性会在选定活动后单独处理。farm每天最多安排一次开工。'
        '返回 {"plans":[{"id":"时间点ID","activity":"activities中的kind或rest",'
        '"reason":"想做这件事的原因"}],"goal_updates":[]}。'
        '目标完成须引用真实evidence_record_id；允许放弃失效目标并说明原因。',
        selection_context(context))
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
        response = ask(agent,
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
        farming = {key: deepcopy(context[key]) for key in
                   ('farm', 'inventory', 'planting', 'balance', 'farm_queue', 'farm_queue_rules') if key in context}
        farming['slots'] = [{**row, 'time': slots[row['id']]['time']} for row in farms]
        response = ask(agent,
            '已选择农场开工，现在单独准备种植队列，不得换活动。'
            '按地块、在田作物、周期及截止估算，不保证全部种完；没有种子也可提出采购需求。'
            '返回 {"plans":[{"id":"时间点ID","farm_plan":{"entries":'
            '[{"sku":"种子SKU","quantity":当天目标数量,"fertilizer_mode":'
            '"none或optional或required","fertilizer":"quality或yield或null"}],'
            '"procurement_limit":"采购上限"}}]}。允许空队列。'
            '采购由独立每日市场预算承担，不在开工日程重复预留。'
            '已固化的队列普通修订不会重建。', farming)
        specifications = indexed_rows(response.get('plans'), {row['id'] for row in farms}, '种植计划')
        for row in farms:
            row['farm_plan'] = specifications[row['id']].get('farm_plan')
    return proposal
