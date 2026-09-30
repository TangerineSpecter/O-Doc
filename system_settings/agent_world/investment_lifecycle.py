"""投资执行阶段与终态收束；不重放模型或交易。"""
import json
from datetime import timedelta
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from system_settings.models import AgentRunRecord, WorldAction, AgentExecutionLease, AgentActivity
from system_settings.agent_activity import update_work_activity
from .farm_gate import farm_gate
from .investment_models import InvestmentDecision, InvestmentTrade, InvestmentCache
from .life_time import local_time


def append_step(record, title, detail='', status='info'):
    step = {'time': local_time().strftime('%Y-%m-%d %H:%M:%S'), 'status': status,
            'title': title, 'detail': str(detail)[:2000]}
    record.steps = [*(record.steps or []), step]
    record.agent_runs = [{**r, 'steps': [*(r.get('steps') or []), step]} for r in record.agent_runs]


def progress(record_id, title, detail='', status='info'):
    if not record_id:
        return
    with farm_gate(), transaction.atomic():
        record = AgentRunRecord.objects.select_for_update().get(pk=record_id)
        if record.status != 'running':
            raise ValueError('投资执行已结束，停止后续处理')
        append_step(record, title, detail, status)
        record.save(update_fields=['steps', 'agent_runs', 'updated_at'])
        WorldAction.objects.filter(record_id=record_id, status='claimed').update(updated_at=timezone.now())
        AgentActivity.objects.filter(run_record_id=record_id, activity_type='work', status='running').update(current_action=title, updated_at=timezone.now())


def finish(action_id, status, summary, *, recovery=False):
    with farm_gate(), transaction.atomic():
        action = WorldAction.objects.select_for_update().get(pk=action_id)
        decision = InvestmentDecision.objects.select_for_update().filter(pk=action_id).first()
        # 已完成的事务不能被迟到的模型结果或重复恢复覆盖。
        if action.effects_done and not (recovery and decision and decision.status == 'running'):
            return
        if action.status == 'failed' and not recovery:
            return
        record = AgentRunRecord.objects.select_for_update().get(pk=action.record_id)
        if record.status != 'running' and not recovery:
            return
        ended_at = record.updated_at if recovery and record.status != 'running' else timezone.now()
        has_trades = InvestmentTrade.objects.filter(decision_id=action_id).exists()
        if decision:
            decision.status = status
            decision.reason = str(summary)[:2000]
            decision.save(update_fields=['status', 'reason', 'updated_at'])
        action.status = 'success' if has_trades else 'failed' if status == 'failed' else 'skipped'
        action.effects_done = True
        action.result = {**action.result, 'reason': str(summary)[:2000], 'decision_id': decision.pk if decision else None}
        action.save(update_fields=['status', 'effects_done', 'result', 'updated_at'])
        record.status = status
        record.summary = str(summary)[:255]
        record.output = json.dumps(action.result, ensure_ascii=False)
        elapsed = max(0, int((ended_at - record.started_at).total_seconds()))
        record.duration = f'{elapsed // 60}分{elapsed % 60}秒' if elapsed >= 60 else f'{elapsed}秒'
        append_step(record, '执行中断' if recovery else '投资失败' if status == 'failed' else '投资完成', summary, status)
        record.agent_runs = [{**r, 'status': status, 'summary': record.summary,
                              'duration': record.duration, 'content': record.output} for r in record.agent_runs]
        record.save(update_fields=['status', 'summary', 'output', 'duration', 'steps', 'agent_runs', 'updated_at'])
        if not action.agent:
            AgentActivity.objects.filter(run_record_id=record.pk, activity_type='work').update(
                status=status, summary=record.summary, current_action='投资机会结束', updated_at=timezone.now())
        if action.agent:
            update_work_activity(record, action.agent, status=status, current_action='投资执行失败' if status == 'failed' else '投资机会结束', summary=record.summary, output=record.output)


def recover(action_id=None):
    stale = timezone.now() - timedelta(minutes=15)
    inconsistent = InvestmentDecision.objects.filter(status='running', record__status__in=('success', 'failed')).values('record_id')
    rows = WorldAction.objects.filter(snapshot__investment=True).filter(
        Q(status='claimed', updated_at__lt=stale) | Q(record_id__in=inconsistent) | Q(status='failed', effects_done=False)
    ).exclude(record_id=None).select_related('record')
    if action_id:
        rows = rows.filter(pk=action_id)
    for action in rows[:100]:
        with farm_gate(), transaction.atomic():
            current = WorldAction.objects.select_for_update().get(pk=action.pk)
            record = AgentRunRecord.objects.get(pk=action.record_id)
            if current.status == 'claimed' and current.updated_at >= stale and record.status == 'running':
                continue
            decision = InvestmentDecision.objects.filter(pk=action.pk).first()
            if current.effects_done and (not decision or decision.status != 'running'):
                continue
            if record.status == 'success':
                finish(action.pk, 'success', record.summary or '本次投资已完成', recovery=True)
                continue
            lease = InvestmentCache.objects.filter(pk='investment-execution:' + action.pk).first()
            if lease:
                AgentExecutionLease.objects.filter(agent_id=lease.payload.get('actor_id'), token=lease.payload.get('token')).update(token='', until=None)
                lease.delete()
            calls = decision.calls if decision else []
            last_tool = calls[-1].get('tool') if calls else None
            summary = '投资执行长时间未完成，已结束本次机会并保留已提交交易。'
            if last_tool:
                summary += f'最后已完成工具：{last_tool}（共 {len(calls)} 次）。'
            known_reason = current.result.get('reason') if current.status == 'failed' else ''
            summary += f'已保存失败原因：{known_reason}' if known_reason else '原执行未保存底层异常，无法确定是进程中断还是请求超时。'
            finish(action.pk, 'failed', summary, recovery=True)
