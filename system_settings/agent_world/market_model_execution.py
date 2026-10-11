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
from .market_model_context import DETAIL_TOOL, compact_messages, model_context, observe, projection
from .run_diagnostics import progress

RULES = '''你获得一次市场机会。可选择不去；进入扣5体力，仅一次。最多5分钟、20次市场调用、24次工具执行。
以真实成交为准，不必花光钱。采购前查看spending的实时预算、商品格额度；不足时调整生活预算、减少数量或离场。后续活动预留不能擅自动用。
每次交易使用唯一request_id，重试同一操作必须复用；成交后不要重复购买。常驻饲料和肥料不占格，肥料报价每小时变化，不保证下次降价。挂牌溢价未成交不算收入。
细节通过observe_market_detail按需分页查询，不能把第一页当作全部。先买到种子，再刷新get_market_context和详情，按真实种子库存调整当天未播种队列；保留已播种项目ID和事实，不能超过采购上限。不自动把所有种子加入队列，无货可等待，不额外启动第二次市场。
完成后leave_market。摘要只陈述真实操作，不虚构未执行结果。'''
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
        progress(self.record, self.phase)
        if name == 'enter_market':
            entry = 'opportunity:' + self.key
            arguments = {**arguments, 'request_id': entry if len(entry) <= 64 else hashlib.sha256(entry.encode()).hexdigest()}
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
            session = self.session()
            if name == 'leave_market' or (session and session.status != 'active'):
                raise MarketFinished(result.get('reason') or '市场会话已结束')
            if self.helper and name in WRITE_TOOLS:
                self.helper_completed = True
                raise ComplexStepFinished('当前复杂操作已完成')
            # AIService's tool serializer expects plain JSON, including dated query rows.
            return json.loads(json.dumps(projection(result), cls=DjangoJSONEncoder, ensure_ascii=False))
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

    def text(self, ai_service, *, phase='模型市场决策', helper=False, objective='') -> str:
        self.check()
        tools = [{'type': 'function', 'function': {'name': t['name'], 'description': t['description'], 'parameters': t['inputSchema']}} for t in MARKET_TOOLS]
        tools.append(DETAIL_TOOL)
        from .life_scope import CURRENT
        if CURRENT.get():
            from .life_budget import BUDGET_TOOL
            tools.append(BUDGET_TOOL)
        self.phase = phase
        progress(self.record, phase)
        prompt = RULES + '\n' + build_agent_system_prompt(f'当前 Agent：{self.agent.name}\n{self.agent.prompt}', conversation=False) + '\n' + self.memory
        if helper:
            prompt += '\n本次仅协助一个复杂操作。可查询必要细节、进入现有市场；成功完成一次交易/预算修改/队列修改后立即返回决策流程。不要连续提交多个写操作。'
        payload = {'market_state': model_context(self.owner, self.agent), '经营偏好': self.task.prompt,
                   'session': projection(self.session_payload()), 'completed_operations': self.effects, 'objective': objective}
        self.helper, self.helper_completed = helper, False
        try:
            with usage_scope(owner_id=self.owner, agent=self.agent, task=self.task, record=self.record, purpose='task', phase=phase):
                ai_service.chat_completion_messages_with_tools(
                    [{'role': 'system', 'content': prompt}, {'role': 'user', 'content': json.dumps(payload, cls=DjangoJSONEncoder, ensure_ascii=False)}],
                    tools, self.execute, model_id=task_model_id(self.task, self.agent), max_rounds=min(24 - self.tool_count, 6 if helper else 24),
                    deadline=self.deadline, message_transform=compact_messages)
                return self.summary()
        except ComplexStepFinished:
            return '当前复杂操作已完成'
        finally:
            self.helper = False

    def session_payload(self) -> dict:
        session = self.session()
        return {'id': session.pk, 'status': session.status, 'calls_remaining': max(0, 20 - session.call_count),
                'expires_at': session.expires_at} if session else {'status': 'not_entered'}

    def summary(self) -> str:
        trades = [e for e in self.effects if e['tool'] in KINDS]
        detail = '；'.join(f"{e['result'].get('name', e['tool'])} ×{e['result'].get('quantity', 1)}" for e in trades)
        changes = {'adjust_life_budget': '调整生活预算', 'update_farm_queue': '调整种植队列'}
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
