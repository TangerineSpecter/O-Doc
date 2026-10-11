"""One market session shared by text decisions, JEV and the single-operation helper."""
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
from .market_model_context import DETAIL_TOOL, READ_TOOLS, compact_messages, model_context, observe, projection
from .run_diagnostics import progress
from .market_shopping import SEED_GUIDANCE
from .market_narrative import public_leave_reason

RULES = '''你获得一次市场机会。可选择不去；进入扣5体力，仅一次。最多5分钟、20次市场调用、24次工具执行。
以真实成交为准，不必花光钱。采购前查看spending的实时预算、商品格额度；不足时调整生活预算、减少数量或离场。后续活动预留不能擅自动用。
市场操作包括购买、回收出售、上架、管理自己的挂牌和离场，应按偏好、库存与实际需求选择。查看已有可交易物品，区分留用、立即回收与挂牌等待；不能把逛市场当成必须购买，也不能为凑操作强制出售。种子、肥料和饲料按现有规则不能回收或挂牌，纪念品可挂牌但不能商店回收。
每次交易使用唯一request_id，重试同一操作必须复用；成交后不要重复购买。常驻饲料和肥料不占格，肥料报价每小时变化，不保证下次降价。挂牌溢价未成交不算收入。
采购只需判断想买什么、已有多少、商品作用、价格、库存和可买数量；肥料只看作用与需求，不制定施肥组合或比较作物概率、预期收益。
初始状态已提供当前预算、背包首屏、自有挂牌首屏、空地、成熟作物及种子总量，足够判断时不重复查询。仅为具体买卖补查必要细节；没有食材采购或成品出售需求时不用查询食谱，也不用为离场核对历史成交。详情按需分页，不把第一页当作全部。
买种子不要求修改种植队列。只有主动调整已有播种安排时，才使用提供的计划ID和版本修改尚未播种的项目，保留已播种事实；没有当天安排时无需做这一步。无货可等待，不额外启动第二次市场。
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
                      'planting': '种子与肥料', 'farm': '农场畜牧', 'combat': '装备物资',
                      'cooking': '食谱列表', 'recipe': '食谱详情', 'life': '生活安排', 'experiences': '历史经历'}
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
        tools = [{'type': 'function', 'function': {'name': t['name'], 'description': t['description'], 'parameters': t['inputSchema']}}
                 for t in MARKET_TOOLS if (t['name'] != 'update_farm_queue' or context['farm_queue'])
                 and (not selected or t['name'] in READ_TOOLS | {'leave_market', selected['tool']})]
        tools.append(DETAIL_TOOL)
        from .life_scope import CURRENT
        if CURRENT.get() and not selected:
            from .life_budget import BUDGET_TOOL
            tools.append(BUDGET_TOOL)
        self.phase = phase
        progress(self.record, phase)
        prompt = RULES + '\n' + build_agent_system_prompt(f'当前 Agent：{self.agent.name}\n{self.agent.prompt}', conversation=False) + '\n' + self.memory
        if helper:
            prompt += '\n本次仅协助一个复杂操作。可查询必要细节、进入现有市场；成功完成一次交易/预算修改/队列修改后立即返回决策流程。不要连续提交多个写操作。'
        payload = {'market_state': context, '经营偏好': self.task.prompt,
                   'session': projection(self.session_payload()), 'completed_operations': self.effects, 'objective': objective}
        if selected:
            payload['selected_operation'] = selected
            prompt += '\nJEV已选定挂牌操作、物品和数量或挂牌版本，只需决定unit_price并提交selected_operation指定操作；不能改变其arguments，不能改买其他商品。也可选择离场。'
        else:
            from .market_decision_candidates import candidates
            from .market_decision_options import action_options
            payload['available_actions'] = action_options(candidates(self.owner, self.agent))
        self.helper, self.helper_completed = helper, False
        self.helper_failure = None
        allowed = {t['function']['name'] for t in tools}

        def execute(name: str, arguments: dict) -> dict:
            self.check()
            if selected:
                if name not in allowed:
                    return {'error': '定价子流程只能查询、提交指定挂牌操作或离场'}
                if not isinstance(arguments, dict):
                    return {'error': '挂牌操作参数须为对象'}
                if name == selected['tool'] and any(arguments.get(k) != v for k, v in selected['arguments'].items()):
                    return {'error': '不能改变JEV已选定的操作参数，请使用selected_operation.arguments'}
            result = self.execute(name, arguments)
            if selected and name == selected['tool'] and 'error' in result:
                self.helper_failure = result
                raise ComplexStepFinished('挂牌操作失败，返回JEV刷新真实状态')
            return result

        try:
            with usage_scope(owner_id=self.owner, agent=self.agent, task=self.task, record=self.record, purpose='task', phase=phase):
                ai_service.chat_completion_messages_with_tools(
                    [{'role': 'system', 'content': prompt}, {'role': 'user', 'content': json.dumps(payload, cls=DjangoJSONEncoder, ensure_ascii=False)}],
                    tools, execute, model_id=task_model_id(self.task, self.agent), max_rounds=min(24 - self.tool_count, 6 if helper else 24),
                    deadline=self.deadline, message_transform=compact_messages, disable_thinking=True)
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
        if self.task.market_config.get('decision_enabled', False) is not True:
            return self.text(ai_service)
        from system_settings.decision.jev import DecisionUnavailable
        from .market_decision_loop import decide
        try:
            if self.task.market_config.get('decision_provider', 'jev') != 'jev':
                raise DecisionUnavailable('决策服务配置不可用')
            return decide(self, ai_service)
        except DecisionUnavailable as exc:
            self.check()  # Expired/stopped sessions must never be revived by fallback.
            progress(self.record, 'JEV 回退文本模型', str(exc), 'info')
            return self.text(ai_service, phase='市场决策回退', objective='JEV不可用；从当前真实状态继续，已完成操作不得重复。')
