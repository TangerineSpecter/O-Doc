"""JEV selects from finite live choices; text handles one complex step at a time."""
import json
import uuid
from django.core.serializers.json import DjangoJSONEncoder
from utils.token_usage import usage_scope
from system_settings.decision.jev import choose
from .market_decision_candidates import candidates, quantities
from .market_model_context import model_context
from .market_model_execution import MarketFinished
from .run_diagnostics import progress


def decide(runtime, ai_service) -> str:
    visited = 0
    def question(state, criteria):
        nonlocal visited
        runtime.check()
        visited += 1
        if visited > 64:
            raise MarketFinished('市场决策达到执行上限')
        runtime.phase = 'JEV 市场选择'
        state = json.loads(json.dumps(state, cls=DjangoJSONEncoder, ensure_ascii=False))
        criteria = json.loads(json.dumps(criteria, cls=DjangoJSONEncoder, ensure_ascii=False))
        with usage_scope(owner_id=runtime.owner, agent=runtime.agent, task=runtime.task, record=runtime.record, purpose='task', phase=runtime.phase):
            try:
                selection, confidence = choose(runtime.owner, state, criteria, deadline=runtime.deadline)
            except TimeoutError:
                raise MarketFinished('市场任务达到执行时限') from None
        runtime.check()
        progress(runtime.record, runtime.phase, f'候选 {selection}，置信度 {confidence:.3f}', 'info')
        return selection

    state = {'resident': {'name': runtime.agent.name, 'persona': runtime.agent.prompt,
                         'preferences': runtime.task.prompt, 'memory': runtime.memory},
             'market': model_context(runtime.owner, runtime.agent)}
    entering = question(state, {'enter': '进入市场扣5体力，按实际需要买卖或调整经营计划', 'wait': '本次不逛市场'})
    if entering == 'wait':
        return '本次未进入市场，未成交'
    result = runtime.execute('enter_market', {'request_id': 'jev-entry'})
    if 'error' in result:
        raise MarketFinished(result['error'])
    page = 0
    action = None
    failed = None
    while True:
        runtime.check()
        available = candidates(runtime.owner, runtime.agent)
        state['market'] = model_context(runtime.owner, runtime.agent)
        state['session'] = runtime.session_payload()
        state['completed_operations'] = runtime.effects
        state['last_failure'] = failed
        exits = {'wait': '等待下次机会并结束本次市场', 'leave': '现在离开市场',
                 'other': '需要自由定价、上架、改价、撤单、预算调整、种植队列调整或其他方案，请文本模型处理一步'}
        if action is None:
            actions = {**exits}
            for kind, label in [('buy', '购买所需商品'), ('sell', '回收出售已有物品')]:
                count = sum(row['tool'].startswith(kind + '_') for row in available)
                if count:
                    actions[kind] = {'label': label, 'feasible_items': count}
            action = question(state, actions)
        if action in ('wait', 'leave'):
            runtime.execute('leave_market', {'reason': runtime.summary()})
        if action == 'other':
            runtime.text(ai_service, phase='市场复杂操作', helper=True, objective='根据当前需求处理一个复杂操作；也可选择离场。')
            if not runtime.helper_completed:
                raise MarketFinished(runtime.summary() + '；未提出新的可执行操作')
            action, page, failed = None, 0, None
            continue
        available = [row for row in available if row['tool'].startswith(action + '_')]
        page = min(page, max(0, (len(available) - 1) // 20))
        visible = available[page * 20:(page + 1) * 20]
        criteria = {row['id']: {k: v for k, v in row.items() if k not in ('tool', 'arguments')} for row in visible}
        criteria.update(exits)
        criteria['change_action'] = '返回选择买卖动作'
        if page:
            criteria['previous_page'] = '查看上一页可行交易'
        if (page + 1) * 20 < len(available):
            criteria['next_page'] = '查看下一页可行交易'
        # JSON values include timestamps; wire state must be plain JSON.
        wire_state = json.loads(json.dumps(state, cls=DjangoJSONEncoder, ensure_ascii=False))
        selection = question(wire_state, criteria)
        if selection in ('previous_page', 'next_page'):
            page += 1 if selection == 'next_page' else -1
            continue
        if selection == 'change_action':
            action, page = None, 0
            continue
        if selection in ('wait', 'leave'):
            runtime.execute('leave_market', {'reason': runtime.summary()})
        if selection == 'other':
            runtime.text(ai_service, phase='市场复杂操作', helper=True, objective='根据当前需求处理一个复杂操作；也可选择离场。')
            if not runtime.helper_completed:
                raise MarketFinished(runtime.summary() + '；未提出新的可执行操作')
            action, page, failed = None, 0, None
            continue
        candidate = next(row for row in visible if row['id'] == selection)
        quantity = question({'resident': state['resident'], 'market': state['market'], 'candidate': candidate}, quantities(candidate))
        if quantity in ('wait', 'leave'):
            runtime.execute('leave_market', {'reason': runtime.summary()})
        if quantity == 'other':
            runtime.text(ai_service, phase='市场复杂操作', helper=True, objective='为这个交易选择其他数量或方案：' + json.dumps(candidate, cls=DjangoJSONEncoder, ensure_ascii=False))
            if not runtime.helper_completed:
                raise MarketFinished(runtime.summary() + '；未提出新的可执行操作')
            action, page, failed = None, 0, None
            continue
        arguments = {**candidate['arguments'], 'request_id': 'jev:' + uuid.uuid4().hex}
        if candidate['tool'] != 'sell_combat_equipment':
            arguments['quantity'] = int(quantity)
        result = runtime.execute(candidate['tool'], arguments)
        if 'error' in result:
            fingerprint = {'tool': candidate['tool'], 'arguments': candidate['arguments'], 'error': result['error'], 'spending': result.get('spending')}
            if fingerprint == failed:
                raise MarketFinished(runtime.summary() + '；交易条件未变化，停止重复尝试')
            failed = fingerprint
        else:
            failed = None
        action, page = None, 0
