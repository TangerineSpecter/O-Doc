"""One market session shared by structured decisions, text and the single-operation helper."""
from system_settings.agent_role import role_text
import hashlib
import json
import time
from django.core.serializers.json import DjangoJSONEncoder
from system_settings.agent_prompts import build_agent_system_prompt
from system_settings.agent_task_models import task_model_id
from utils.token_usage import usage_scope
from .market_models import MarketSession
from .market_sessions import owner_for, invalid_reason, close_session
from .market_tools import MARKET_TOOLS, KINDS, call_market_tool
from .market_model_context import DETAIL_TOOL, MARKET_DETAIL_TOPICS, READ_TOOLS, compact_messages, model_context, observe, projection
from .run_diagnostics import progress
from .market_shopping import SEED_GUIDANCE
from .market_narrative import public_leave_reason

RULES = '''你获得一次市场机会。可选择不去；进入扣5体力，仅一次。最多5分钟、20次市场调用、24次工具执行。
以真实成交为准，不必花光钱。采购前查看当前实时预算与商品格额度；后续活动预留不能擅自动用。
市场操作包括购买、回收出售、上架、管理自己的挂牌和离场，应按偏好、库存与实际需求选择。查看已有可交易物品，区分留用、立即回收与挂牌等待；不能把逛市场当成必须购买，也不能为凑操作强制出售。种子、肥料和饲料按现有规则不能回收或挂牌，纪念品可挂牌但不能商店回收。
每次交易使用唯一request_id，重试同一操作必须复用；成交后不要重复购买。常驻饲料和肥料不占格，肥料报价每小时变化，不保证下次降价。挂牌溢价未成交不算收入。
采购只需判断想买什么、已有多少、商品作用、价格、库存和可买数量；肥料只看作用与需求，不制定施肥组合或比较作物概率、预期收益。
初始状态已提供当前预算、背包首屏、自有挂牌首屏、空地、成熟作物及种子总量，足够判断时不重复查询。仅为具体买卖补查必要细节；分页详情不把第一页当作全部。
买种子不要求修改种植队列。无货可等待，不额外启动第二次市场。
完成后leave_market。结束说明用简短自然中文，说清已做的操作或离场原因，不展示工具名、字段名或提示词中的规则。摘要只陈述真实操作。''' + '\n' + SEED_GUIDANCE
WRITE_TOOLS = {*KINDS, 'adjust_life_budget', 'update_farm_queue'}


class MarketFinished(Exception):
    expected_tool_stop = True


class ComplexStepFinished(Exception):
    expected_tool_stop = True


class MarketExecution:
    def __init__(self, task, agent, record, key: str, mode: str):
        self.task, self.agent, self.record = task, agent, record
        self.owner, self.key, self.mode = owner_for(agent), key, mode
        self.deadline = time.monotonic() + 300
        self.tool_count = 0
        self.phase = '模型市场决策'
        self.blocked = None
        self.effects = []
        self.effect_keys = set()
        self.helper = False
        self.helper_completed = False
        self.helper_failure = None
        from .memory.recall import memory_context
        self.memory = memory_context(agent, '市场 采购 买卖 ' + task.prompt)

    def session(self):
        return MarketSession.objects.filter(record=self.record).first()

    def check(self):
        if time.monotonic() >= self.deadline:
            raise MarketFinished('市场任务达到执行时限')
        if self.tool_count >= 24:
            raise MarketFinished('市场任务达到执行上限')
        session = self.session()
        if session:
            reason = invalid_reason(session)
            if reason:
                close_session(session, reason)
                raise MarketFinished(reason)
        elif self.mode != 'manual':
            self.task.refresh_from_db()
            from .life_scope import check_current_authorization, allowed
            from system_settings.models import WorldActionRuntime
            check_current_authorization()
            if not self.task.enabled or not allowed(self.task, self.agent.pk) or not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
                raise MarketFinished('市场任务或本机执行已停止')

    def execute(self, name: str, arguments: dict) -> dict:
        self.check()
        if self.helper and self.helper_completed and name in WRITE_TOOLS:
            raise ComplexStepFinished('当前复杂操作已完成')
        self.tool_count += 1
        self.phase = f'市场工具 {name}'
        query = ''
        if name == 'observe_market_detail':
            labels = {'inventory': '背包', 'inventory_lots': '逐批成本', 'listing_history': '挂牌历史',
                      'planting': '种子与肥料', 'farm': '农场畜牧', 'combat': '装备物资'}
            query = f"查询：{labels.get(arguments.get('topic'), '未知主题')}；第{arguments.get('page', 1)}页"
        progress(self.record, self.phase, query)
        if name == 'enter_market':
            entry = 'opportunity:' + self.key
            arguments = {**arguments, 'request_id': entry if len(entry) <= 64 else hashlib.sha256(entry.encode()).hexdigest()}
        if name == 'leave_market' and isinstance(arguments.get('reason'), str):
            arguments = {**arguments, 'reason': public_leave_reason(arguments['reason'], self.summary())}
        try:
            if name == 'adjust_life_budget':
                from .life_budget import budget_tool
                from .market_spending import spending_context
                result = {**budget_tool(arguments), 'spending': spending_context(self.owner, self.agent.pk)}
            elif name == 'observe_market_detail':
                # Private observation consumes the same read allowance as a context query.
                call_market_tool('get_market_context', {}, self.agent, task=self.task, record=self.record, mode=self.mode)
                result = observe(self.owner, self.agent, arguments)
            else:
                result = call_market_tool(name, arguments, self.agent, task=self.task, record=self.record, mode=self.mode)
                if name == 'get_market_context':
                    result = model_context(self.owner, self.agent)
            from system_settings.agent_activity import update_work_activity
            update_work_activity(self.record, self.agent, status='running', current_action={
                'enter_market': '进入市场', 'leave_market': '离开市场'}.get(name, '正在市场交易'))
            if name in WRITE_TOOLS:
                identity = (name, arguments.get('request_id'))
                if identity[1] is None or identity not in self.effect_keys:
                    self.effects.append({'tool': name, 'arguments': arguments, 'result': projection(result)})
                    self.effect_keys.add(identity)
                if self.helper:
                    self.helper_completed = True
            session = self.session()
            if name == 'leave_market' or (session and session.status != 'active'):
                raise MarketFinished(result.get('reason') or '市场会话已结束')
            if self.helper and name in WRITE_TOOLS:
                raise ComplexStepFinished('当前复杂操作已完成')
            # AIService's tool serializer expects plain JSON, including dated query rows.
            encoded = json.dumps(projection(result), cls=DjangoJSONEncoder, ensure_ascii=False)
            if name == 'observe_market_detail':
                progress(self.record, '市场详情返回', f'{query}；返回{len(encoded)}字符（非Token数）', 'info')
            return json.loads(encoded)
        except ValueError as exc:
            from .market_spending import MarketPurchaseBlocked, spending_context
            if isinstance(exc, MarketPurchaseBlocked):
                fingerprint = (exc.result['code'], exc.result['spending'])
                if fingerprint == self.blocked:
                    raise MarketFinished('采购条件未变化仍重复尝试，已停止本次市场活动：' + str(exc))
                self.blocked = fingerprint
                return exc.result
            progress(self.record, self.phase + '失败', str(exc), 'failed')
            return {'error': str(exc), 'spending': spending_context(self.owner, self.agent.pk)}

    def text(self, ai_service, *, phase='模型市场决策', helper=False, objective='', selected: dict | None = None) -> str:
        self.check()
        if selected and not helper:
            raise ValueError('指定挂牌定价须使用单步子流程')
        context = model_context(self.owner, self.agent)
        from .market_decision_candidates import candidates
        from .market_decision_options import action_options
        candidate_rows = [] if selected else candidates(self.owner, self.agent)
        from .life_scope import CURRENT
        budget_adjustment = bool(CURRENT.get()) and not selected
        detail_topics = list(MARKET_DETAIL_TOPICS)
        if selected:
            allowed = {'list_market_listings', 'leave_market', selected['tool']}
            detail_topics = ['listing_history'] if selected['tool'] == 'reprice_market_listing' else []
            if detail_topics:
                allowed.add('observe_market_detail')
        else:
            allowed = READ_TOOLS | {'enter_market', 'leave_market'}
            # A sale can fund a purchase and a new listing can be repriced in
            # this same tool loop. Transaction services check live feasibility.
            allowed.update(KINDS)
            if budget_adjustment:
                allowed.add('adjust_life_budget')
            if context['farm_queue']:
                allowed.add('update_farm_queue')
        tools = [{'type': 'function', 'function': {'name': t['name'], 'description': t['description'], 'parameters': t['inputSchema']}}
                 for t in MARKET_TOOLS if t['name'] in allowed]
        if 'observe_market_detail' in allowed:
            detail_tool = json.loads(json.dumps(DETAIL_TOOL))
            detail_tool['function']['parameters']['properties']['topic']['enum'] = detail_topics
            tools.append(detail_tool)
        from .life_scope import CURRENT
        if budget_adjustment:
            from .life_budget import BUDGET_TOOL
            tools.append(BUDGET_TOOL)
        self.phase = phase
        progress(self.record, phase)
        prompt = RULES
        prompt += ('\n资金不足时可减少数量、放弃，或先说明理由调整本项预算。' if budget_adjustment
                   else '\n资金不足时减少数量或放弃；无法满足则离场。')
        if 'update_farm_queue' in allowed:
            prompt += '\n只有主动调整已有播种安排时，才使用计划ID和版本修改尚未播种的项目，并保留已播种事实。'
        prompt += '\n' + role_text(self.agent, 'market')
        if self.memory:
            prompt += '\n' + self.memory
        if helper:
            prompt += '\n本次仅协助一个复杂操作。可查询必要细节、进入现有市场；成功完成一次交易/预算修改/队列修改后立即返回决策流程。不要连续提交多个写操作。'
        payload = {'market_state': context,
                   'session': projection(self.session_payload())}
        if self.task.prompt and self.task.prompt.strip():
            payload['经营偏好'] = self.task.prompt.strip()
        if self.effects:
            payload['completed_operations'] = self.effects
        if objective and objective.strip():
            payload['objective'] = objective.strip()
        if selected:
            payload['selected_operation'] = selected
            prompt += '\n结构化决策模型已选定挂牌操作、物品和数量或挂牌版本，只需决定unit_price并提交selected_operation指定操作；不能改变其arguments，不能改买其他商品。也可选择离场。'
        else:
            payload['available_actions'] = action_options(candidate_rows)
        self.helper, self.helper_completed = helper, False
        self.helper_failure = None

        prior_effects = []
        def execute(name: str, arguments: dict) -> dict:
            self.check()
            if name not in allowed:
                return {'error': '当前市场决策阶段未开放该工具'}
            if not isinstance(arguments, dict):
                return {'error': '市场工具参数须为对象'}
            if name == 'observe_market_detail':
                if arguments.get('topic') not in detail_topics:
                    return {'error': '当前市场阶段不开放该详情主题'}
            if selected:
                if name == selected['tool'] and any(arguments.get(k) != v for k, v in selected['arguments'].items()):
                    return {'error': '不能改变结构化决策模型已选定的操作参数，请使用selected_operation.arguments'}
            for effect in prior_effects:
                if effect['tool'] == name and {k:v for k,v in effect.get('arguments', {}).items() if k not in ('request_id', 'reason')} == {k:v for k,v in arguments.items() if k not in ('request_id', 'reason')}:
                    return {**effect['result'], 'already_completed': True}
            from system_settings.decision.routing import MODEL_ERRORS, ToolOperationFailure
            try:
                result = self.execute(name, arguments)
            except MODEL_ERRORS as exc:
                raise ToolOperationFailure('市场工具执行失败，须核实当前状态后重试') from exc
            if selected and name == selected['tool'] and 'error' in result:
                self.helper_failure = result
                raise ComplexStepFinished('挂牌操作失败，返回结构化决策模型刷新真实状态')
            return result

        try:
            with usage_scope(owner_id=self.owner, agent=self.agent, task=self.task, record=self.record, purpose='task', phase=phase):
                from system_settings.decision.routing import run_models
                def invoke(config):
                    nonlocal prior_effects
                    self.check()
                    prior_effects = list(self.effects)
                    payload['market_state'] = model_context(self.owner, self.agent)
                    if self.effects:
                        payload['completed_operations'] = self.effects
                    else:
                        payload.pop('completed_operations', None)
                    payload['session'] = projection(self.session_payload())
                    return ai_service.chat_completion_messages_with_tools(
                    [{'role': 'system', 'content': prompt}, {'role': 'user', 'content': json.dumps(payload, cls=DjangoJSONEncoder, ensure_ascii=False)}],
                    tools, execute, model_id=config['model_id'], max_rounds=min(24 - self.tool_count, 6 if helper else 24),
                    deadline=self.deadline, message_transform=compact_messages, disable_thinking=True)
                run_models(self.agent, invoke, task=self.task, decision=True, owner=self.owner, deadline=self.deadline, scene=phase, check=self.check)
                return self.summary()
        except ComplexStepFinished as exc:
            return str(exc)
        finally:
            self.helper = False

    def session_payload(self) -> dict:
        session = self.session()
        return {'id': session.pk, 'status': session.status, 'calls_remaining': max(0, 20 - session.call_count),
                'expires_at': session.expires_at} if session else {'status': 'not_entered'}

    def summary(self) -> str:
        trades = [e for e in self.effects if KINDS.get(e['tool'], '').startswith(('buy', 'sell'))]
        detail = '；'.join(f"{e['result'].get('name', e['tool'])} ×{e['result'].get('quantity', 1)}" for e in trades)
        changes = {'adjust_life_budget': '调整生活预算', 'update_farm_queue': '调整种植队列',
                   'create_market_listing': '上架商品（尚未成交）', 'reprice_market_listing': '调整挂牌价格',
                   'withdraw_market_listing': '撤回挂牌'}
        other = [changes[e['tool']] for e in self.effects if e['tool'] in changes]
        return f'本次完成{len(trades)}笔交易' + ('：' + detail if detail else '，未成交') + ('；' + '；'.join(other) if other else '')

    def run(self, ai_service) -> str:
        from system_settings.decision.routing import jev_enabled
        if not jev_enabled(self.owner, 'market'):
            return self.text(ai_service)
        from system_settings.decision.jev import DecisionUnavailable
        from .market_decision_loop import decide
        try:
            return decide(self, ai_service)
        except DecisionUnavailable as exc:
            self.check()  # Expired/stopped sessions must never be revived by fallback.
            progress(self.record, '决策模型回退文本模型', str(exc), 'info')
            return self.text(ai_service, phase='市场决策回退', objective='结构化决策连接不可用；从当前真实状态继续，已完成操作不得重复。')
