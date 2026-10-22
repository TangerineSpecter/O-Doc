from system_settings.agent_role import role_text
"""A structured decision connection selects live choices; text handles complex steps."""
import hashlib
import json
import time
import uuid
from decimal import Decimal
from django.core.serializers.json import DjangoJSONEncoder
from utils.token_usage import usage_scope
from system_settings.decision.routing import choose_connections as choose
from .market_decision_candidates import candidates, quantities
from .market_model_context import model_context
from .market_model_execution import MarketFinished
from .market_decision_options import action_options, for_action
from .run_diagnostics import progress
from .market_shopping import SEED_GUIDANCE


def process_preparation_equipment(runtime, ai_service, *, fact_ids=None, report=None) -> list[dict]:
    """Resolve durable gear sale/list intents whenever the resident enters the market."""
    from .combat.equipment_market import pending_preparation_actions
    from .combat.models import CombatProfile
    from .combat.store import current
    from system_settings.decision.routing import jev_enabled, choose_scene

    intents = pending_preparation_actions(runtime.owner, runtime.agent.pk)
    if fact_ids is not None:
        intents = [row for row in intents if row['fact_id'] in fact_ids]
    if not intents:
        return []
    profile = CombatProfile.objects.get(pk=runtime.agent.pk, owner_id=runtime.owner)
    catalog = current(profile.catalog_id)
    role = runtime.agent.role_profile if isinstance(runtime.agent.role_profile, dict) else {}
    job = catalog.row('professions', profile.progression['job'])
    character = {'personality': role.get('personality', ''),
                 'profession': {'id': profile.progression['job'], 'name': job.get('name', profile.progression['job'])},
                 'level': profile.progression['level']}

    completed = []

    def notify(title, detail, status='info'):
        if report:
            report(title, detail, status)
        else:
            progress(runtime.record, title, detail, status)
    for intent in intents:
        runtime.check()
        item = intent['item']
        item.refresh_from_db()
        stable = 'combat-preparation-market:' + hashlib.sha256(
            f'{runtime.owner}:{runtime.agent.pk}:{item.pk}:{intent["fact_id"]}:{intent["action"]}'.encode()).hexdigest()
        if intent['action'] == 'sell':
            result = runtime.execute('sell_combat_equipment', {
                'request_id': stable + ':sell', 'equipment_id': item.pk})
        else:
            state = {'character': character, 'equipment': {
                'id': item.pk, 'name': item.snapshot.get('name', ''),
                'slot': item.snapshot.get('slot', ''), 'level': item.snapshot.get('level', 0),
                'quality': item.snapshot.get('quality', ''), 'stats': item.snapshot.get('stats', {}),
                'shop_sell_price': str(item.value)}}
            choices = {}
            for percent in (10, 20, 30, 40, 50):
                amount = (Decimal(item.value) * Decimal(percent) / Decimal(100)).quantize(Decimal('.01'))
                amount = max(Decimal('.01'), amount)
                choices[f'{percent}%'] = {'percent': percent, 'unit_price': str(amount)}
            if jev_enabled(runtime.owner, 'combat_listing_price'):
                try:
                    if hasattr(runtime, 'listing_choice'):
                        selected = runtime.listing_choice(intent, state, choices)
                    else:
                        selected = choose_scene(runtime.owner, runtime.agent, 'combat_listing_price', state, choices,
                            deadline=min(runtime.deadline, time.monotonic() + 45),
                            question_id='combat_listing_price:' + item.pk,
                            instructions='根据角色性格、职业、等级和装备情况，在商店回收价的10%、20%、30%、40%、50%中选择一个挂牌价格。挂牌会进入居民集市供其他居民购买。',
                            include_role=False, max_probability=True)
                except TimeoutError:
                    selected = None
                if selected is None:
                    notify('探索装备挂牌定价', f'{item.snapshot.get("name", "装备")} 暂缓挂牌：决策模型当前不可用', 'warning')
                    continue
                arguments = {'request_id': stable + ':list', 'equipment_id': item.pk,
                             'unit_price': choices[selected]['unit_price']}
                result = runtime.execute('list_combat_equipment', arguments)
            elif ai_service is not None:
                before = len(runtime.effects)
                runtime.text(ai_service, phase='探索装备挂牌定价', helper=True,
                    objective='为这件已决定上架的冒险装备确定居民集市挂牌价格。以商店回收价为价格基准，只完成这一次挂牌，不调整其他资产。',
                    selected={'tool': 'list_combat_equipment',
                              'arguments': {'request_id': stable + ':list', 'equipment_id': item.pk},
                              'detail': state['equipment'] | {'character': character}})
                if runtime.helper_failure:
                    result = runtime.helper_failure
                elif len(runtime.effects) > before:
                    result = runtime.effects[-1]['result']
                else:
                    notify('探索装备挂牌定价', f'{item.snapshot.get("name", "装备")} 暂缓挂牌：文本模型未提交有效挂牌', 'warning')
                    continue
            else:
                continue
        if 'error' in result:
            notify('探索装备市场处理失败', result['error'], 'warning')
            continue
        completed.append({'action': intent['action'], 'equipment_id': item.pk,
                          'name': result.get('name', item.snapshot.get('name', '装备')),
                          'unit_price': result.get('unit_price'), 'total': result.get('total'),
                          'listing_id': result.get('listing_id')})
        notify('探索装备市场处理',
                 f"{result.get('name', item.snapshot.get('name', '装备'))}：" +
                 ('按商店回收价出售' if intent['action'] == 'sell' else
                  f"挂牌 {result.get('unit_price', '')}，等待居民购买"), 'info')
    return completed


def decide(runtime, ai_service) -> str:
    visited = 0
    def question(state, criteria):
        nonlocal visited
        runtime.check()
        if len(criteria) == 1:
            selection = next(iter(criteria))
            progress(runtime.record, '系统选择说明', f'唯一合法候选：{selection}', 'info')
            return selection
        from system_settings.decision.routing import jev_enabled
        if not jev_enabled(runtime.owner, 'market'):
            from system_settings.decision.jev import DecisionUnavailable
            raise DecisionUnavailable('世界设置已关闭或排除市场决策连接，转普通模型继续当前状态')
        visited += 1
        if visited > 64:
            raise MarketFinished('市场决策达到执行上限')
        runtime.phase = '决策模型市场选择'
        state = json.loads(json.dumps(state, cls=DjangoJSONEncoder, ensure_ascii=False))
        criteria = json.loads(json.dumps(criteria, cls=DjangoJSONEncoder, ensure_ascii=False))
        with usage_scope(owner_id=runtime.owner, agent=runtime.agent, task=runtime.task, record=runtime.record, purpose='task', phase=runtime.phase):
            try:
                selection, confidence = choose(runtime.owner, state, criteria, deadline=runtime.deadline, scene='market')
            except TimeoutError:
                raise MarketFinished('市场任务达到执行时限') from None
        runtime.check()
        progress(runtime.record, runtime.phase, f'候选 {selection}，置信度 {confidence:.3f}', 'info')
        return selection

    resident = {'shopping_guidance': SEED_GUIDANCE}
    persona = role_text(runtime.agent, 'market')
    if persona:
        resident['persona'] = persona
    if runtime.task.prompt and runtime.task.prompt.strip():
        resident['preferences'] = runtime.task.prompt.strip()
    if runtime.memory:
        resident['memory'] = runtime.memory
    state = {'resident': resident,
             'market': model_context(runtime.owner, runtime.agent),
             'available_actions': action_options(candidates(runtime.owner, runtime.agent))}
    entering = question(state, {'enter': '进入市场扣5体力，按需购买、回收出售、上架或管理挂牌；不必购买', 'wait': '本次不逛市场'})
    if entering == 'wait':
        return '本次未进入市场，未成交'
    state.pop('available_actions')
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
                 'other': '需要预算调整、种植队列调整或候选外操作，请文本模型处理一步'}
        if action is None:
            action = question(state, {**action_options(available), **exits})
        if action in ('wait', 'leave'):
            runtime.execute('leave_market', {'reason': runtime.summary()})
        if action == 'other':
            runtime.text(ai_service, phase='市场复杂操作', helper=True, objective='根据当前需求处理一个复杂操作；也可选择离场。')
            if not runtime.helper_completed:
                raise MarketFinished(runtime.summary() + '；未提出新的可执行操作')
            action, page, failed = None, 0, None
            continue
        available = for_action(available, action)
        page = min(page, max(0, (len(available) - 1) // 20))
        visible = available[page * 20:(page + 1) * 20]
        criteria = {row['id']: {k: v for k, v in row.items() if k not in ('tool', 'arguments')} for row in visible}
        criteria.update(exits)
        criteria['change_action'] = '返回选择购买、回收出售、上架或管理挂牌'
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
        quantity = None
        if action != 'manage':
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
        if quantity and candidate['tool'] != 'sell_combat_equipment':
            arguments['quantity'] = int(quantity)
        if candidate['tool'] in ('create_market_listing', 'reprice_market_listing'):
            runtime.text(ai_service, phase='市场复杂操作', helper=True,
                         objective='为选定挂牌操作决定价格，只提交一次；上架不等于成交。',
                         selected={'tool': candidate['tool'], 'arguments': arguments, 'detail': candidate['detail']})
            if not runtime.helper_completed and not runtime.helper_failure:
                raise MarketFinished(runtime.summary() + '；未提交挂牌操作')
            result = runtime.helper_failure or {}
        else:
            result = runtime.execute(candidate['tool'], arguments)
        if 'error' in result:
            fingerprint = {'tool': candidate['tool'], 'arguments': candidate['arguments'], 'error': result['error'], 'spending': result.get('spending')}
            if fingerprint == failed:
                raise MarketFinished(runtime.summary() + '；交易条件未变化，停止重复尝试')
            failed = fingerprint
        else:
            failed = None
        action, page = None, 0
