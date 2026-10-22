"""Evaluate goals after a new real result, with a durable per-result dedupe key."""
import logging
from .life_models import LifeGoal
logger = logging.getLogger(__name__)


def update(item, agent):
    from .life_planner import check_goals, ask, apply_plan
    check_goals(item.owner_id, agent)
    if item.status != 'completed' or not item.record_id or item.context.get('goal_result_record') == item.record_id:
        return
    from system_settings.models import AgentRunRecord
    record = AgentRunRecord.objects.filter(pk=item.record_id, agent_id=agent.pk, status='success').first()
    if not record:
        return
    goals = [goal for goal in LifeGoal.objects.filter(owner_id=item.owner_id, actor_id=agent.pk, status='active')
             if goal.condition.get('kind') == 'subjective' and goal.condition.get('activity', item.activity) == item.activity]
    # Mark the factual trigger before the request. A crash/failure does not cause
    # a planning loop to repeatedly ask about the same result; later facts retry.
    item.context['goal_result_record'] = item.record_id
    item.save(update_fields=['context', 'updated_at'])
    if not goals:
        return
    try:
        response = ask(agent, '仅根据本次真实成果更新相关主观目标；无进展可返回空列表。'
            '返回 {"goal_updates":[]}，完成须引用本次 evidence_record_id。',
            {'goals': [{'id': g.pk, 'title': g.title, 'condition': g.condition, 'progress': g.progress} for g in goals],
             'result': {'record_id': record.pk, 'activity': item.activity, 'summary': record.summary}},
            include_profile=False, include_memory=False)
        apply_plan(item.owner_id, agent, [], {'plans': [], 'goal_updates': response.get('goal_updates', [])})
    except Exception:
        logger.warning('真实成果目标更新暂未完成 item=%s', item.pk, exc_info=True)
