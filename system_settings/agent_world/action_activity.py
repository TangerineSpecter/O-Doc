"""世界行动结束时收束居民状态，包括跳过、失败及中断恢复。"""
import json
from django.utils import timezone

from system_settings.agent_activity import update_work_activity
from system_settings.models import AgentActivity


def finish_activity(action):
    if not action.record_id:
        return
    status = 'failed' if action.status == 'failed' else 'success'
    reason = action.result.get('reason', '')
    current_action = {'success': '评论与评分已完成', 'skipped': '本次机会已跳过',
                      'failed': '本次互动失败'}[action.status]
    if not action.agent_id:
        # Agent 删除后仍关闭已存在的活动，不重新绑定或猜测作者。
        AgentActivity.objects.filter(run_record_id=action.record_id, activity_type='work', status='running').update(
            status=status, summary=reason, current_action=current_action, updated_at=timezone.now(),
        )
        return
    activity = update_work_activity(action.record, action.agent, status=status, summary=reason,
                                    current_action=current_action, output=json.dumps(action.result, ensure_ascii=False))
    if action.status == 'skipped':
        activity.title = f'{action.agent.name}跳过了「{action.record.task_name}」'[:180]
        activity.save(update_fields=['title', 'updated_at'])
