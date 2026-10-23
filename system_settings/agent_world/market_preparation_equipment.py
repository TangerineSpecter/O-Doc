"""Bridge durable exploration intents into the existing hourly market session.

The original processor owns sale/list semantics. This adapter supplies batch trades
and finite price checkpoints, and never supplies a text model to that processor.
"""
import time

from django.db import transaction
from .market_plan_models import MarketPlan


def pending_actions(owner, actor_id):
    from .combat.equipment_market import pending_preparation_actions
    from system_settings.decision.routing import jev_enabled
    from system_settings.decision.failover import attempt_plan
    intents = pending_preparation_actions(owner, actor_id)
    can_price = (any(row['action'] == 'list' for row in intents)
                 and jev_enabled(owner, 'combat_listing_price') and bool(attempt_plan(owner)[0]))
    return [{'equipment_id': row['equipment_id'], 'action': row['action'], 'fact_id': row['fact_id']}
            for row in intents if row['action'] == 'sell' or can_price]


class BatchEquipmentRuntime:
    def __init__(self, owner, agent, session, plan, trade):
        self.owner, self.agent, self.session = owner, agent, session
        self.plan, self.trade = plan, trade
        self.deadline = time.monotonic() + 300
        self.done, self.failed, self.messages = [], [], []

    def check(self):
        from .market_sessions import invalid_reason
        from system_settings.models import WorldActionRuntime
        reason = invalid_reason(self.session)
        if not reason and not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
            reason = '本机自动执行已关闭'
        if not reason and time.monotonic() >= self.deadline:
            reason = '市场会话达到五分钟上限'
        if reason:
            raise ValueError(reason)

    def report(self, title, detail, status='info'):
        self.messages.append({'title': title, 'detail': detail, 'status': status})

    def listing_choice(self, intent, state, choices):
        from system_settings.decision.routing import choose_scene
        self.check()
        identity = 'combat_listing_price:' + intent['fact_id']
        self.plan.refresh_from_db()
        checkpoint = dict((self.plan.context or {}).get('answers') or {})
        selected = checkpoint.get(identity)
        if selected is None:
            # A failed transaction in an earlier hour keeps its confirmed price.
            previous = MarketPlan.objects.filter(owner_id=self.owner, actor_id=self.agent.pk,
                context__answers__has_key=identity).order_by('-plan_date', '-created_at').first()
            if previous:
                selected = previous.context['answers'][identity]
        if selected not in choices:
            selected = choose_scene(self.owner, self.agent, 'combat_listing_price', state, choices,
                deadline=min(self.deadline, time.monotonic() + 45),
                question_id='combat_listing_price:' + intent['equipment_id'],
                instructions='这件装备已决定上架，不重新判断用途。只从商店回收价的10%、20%、30%、40%、50%中选择一个挂牌价格。',
                include_role=False, max_probability=True)
        self.check()
        if selected in choices:
            with transaction.atomic():
                locked = MarketPlan.objects.select_for_update().get(pk=self.plan.pk,
                    owner_id=self.owner, actor_id=self.agent.pk)
                answers = dict((locked.context or {}).get('answers') or {})
                answers[identity] = selected
                locked.context = {**(locked.context or {}), 'answers': answers}
                locked.save(update_fields=['context', 'updated_at'])
            return selected
        return None

    def execute(self, name, arguments):
        from .market_tools import request_key
        operation = {key: value for key, value in arguments.items() if key != 'request_id'}
        operation['kind'] = name
        try:
            self.check()
            result = self.trade(self.session, self.agent,
                request_key(self.agent.pk, arguments['request_id']), operation)
        except Exception as exc:
            self.failed.append({'operation': operation, 'reason': str(exc)[:300]})
            return {'error': str(exc)[:300]}
        self.done.append(operation)
        return result


def execute_actions(owner, agent, session, plan, actions, trade):
    from .market_decision_loop import process_preparation_equipment
    runtime = BatchEquipmentRuntime(owner, agent, session, plan, trade)
    process_preparation_equipment(runtime, None,
        fact_ids={row['fact_id'] for row in actions}, report=runtime.report)
    finished = {row.get('equipment_id') for row in runtime.done}
    failed = {row.get('operation', {}).get('equipment_id') for row in runtime.failed}
    return {'done': runtime.done, 'failed': runtime.failed, 'messages': runtime.messages,
            'skipped': [row for row in actions if row['equipment_id'] not in finished | failed]}
