"""原执行进程已退出时只补齐终态，保留成交与体力事实，绝不重跑机会。"""
import json

from django.db import transaction
from django.utils import timezone

from system_settings.agent_activity import update_work_activity
from system_settings.models import AgentRunRecord, WorldAction
from system_settings.token_usage.models import AgentTokenUsage
from .farm_gate import guarded
from .market_models import MarketSession, MarketTransaction
from .run_diagnostics import finish_record

PROCESS_INTERRUPTED = '进程中断，市场会话已关闭'


@guarded
def recover_interrupted_sessions(*, record_id: str | None = None) -> None:
    # 关闭会话不等于进程退出：主动离场、超时等由仍存活的 runner 收尾。
    # 只处理已经确认退出的进程，也补齐旧版本遗留的关闭会话。
    sessions = MarketSession.objects.filter(status='closed', reason=PROCESS_INTERRUPTED,
                                           record__status='running')
    if record_id is not None:
        sessions = sessions.filter(record_id=record_id)
    for session in sessions:
        with transaction.atomic():
            record = AgentRunRecord.objects.select_for_update().get(pk=session.record_id)
            if record.status != 'running':
                continue
            action = WorldAction.objects.select_for_update().filter(record=record, snapshot__market=True).first()
            if not action:
                continue  # MCP/战斗等共用市场会话，不由市场任务恢复修改其执行记录。
            ended_at = session.ended_at or timezone.now()
            trades = list(MarketTransaction.objects.filter(session__record=record)
                          .order_by('created_at', 'pk').values('id', 'operation', 'result'))
            summary = PROCESS_INTERRUPTED + (f'；已提交的 {len(trades)} 笔操作保留' if trades else '；本次未成交')
            action.status, action.effects_done, action.result = 'failed', True, {**action.result, 'reason': summary}
            action.save(update_fields=['status', 'effects_done', 'result', 'updated_at'])
            output = json.dumps({'reason': summary, 'transactions': trades, 'sessions': list(
                MarketSession.objects.filter(record=record).values('id', 'status', 'reason', 'call_count'))},
                ensure_ascii=False)
            finish_record(record, 'failed', summary, output, '市场执行中断', finished_at=ended_at)
            if record.agent:
                update_work_activity(record, record.agent, status='failed', summary=summary,
                                     current_action='市场执行已中断', output=output)
            for usage in AgentTokenUsage.objects.select_for_update().filter(record_key=record.pk, status='running'):
                usage.status, usage.ended_at, usage.usage_complete = 'interrupted', ended_at, False
                # 保留已知计数，未知消耗仍为空；save 同时登记既有同步修订。
                usage.save(update_fields=['status', 'ended_at', 'usage_complete', 'updated_at'])
