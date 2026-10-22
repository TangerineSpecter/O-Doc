"""Resume committed idle crafting with original operation IDs and frozen rules."""
from .life_models import LifeItem
from .life_activities import is_interleaved
from .life_schedule import execution_key
from .life_scope import life_scope
from .execution import execution_lease


def resume(action, kind, scheduler=None):
    if kind == 'blacksmith':
        from .blacksmith_runner import resume as resume_blacksmith
        resume_blacksmith(action, scheduler)
        return True
    if kind not in ('cooking', 'alchemy'):
        return False
    item = next((row for row in LifeItem.objects.filter(actor_id=action.actor_id, activity=kind, status='running')
                 if is_interleaved(row) and execution_key(row) == action.pk), None)
    if item is None:
        return False
    from system_settings.models import WorldActionRuntime, AgentExecutionLease, Agent
    if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
        return True
    if kind == 'cooking':
        from .cooking_service import commit_portion as commit
        from .cooking_runner import finish
    else:
        from .alchemy_service import commit_bottle as commit
        from .alchemy_runner import finish
    agent = Agent.objects.filter(pk=item.actor_id, archived_at__isnull=True).first()
    if not agent or not action.task:
        return False
    with life_scope(item, {}), execution_lease(WorldActionRuntime, {'pk': 'world'}) as world:
        if not world:
            return True
        with execution_lease(AgentExecutionLease, {'agent': agent}) as token:
            if not token:
                return True
            try:
                if 'plan' not in action.snapshot:
                    # No operation can have committed before the issued plan exists.
                    # The next attempt may safely reconstruct preparation from the
                    # already frozen LifeItem intent, without a model choice.
                    from .life_interleaving_craft import issue_plan
                    issue_plan(action, item, agent, kind)
                for index, operation in enumerate(action.snapshot['plan']):
                    commit(agent.pk, action.pk, index, operation['recipe_id'], operation['rule'],
                           action.snapshot.get('reason', '系统说明：接续已确认制作'), action.task, token, world)
                action.status = 'success'
                action.result = {'reason': '系统说明：已接续完成原制作计划'}
            except Exception as exc:
                action.status, action.result = 'failed', {'reason': '接续条件失效，已完成制作保留：' + str(exc)[:300]}
            action.save()
            finish(action, scheduler)
    return True
