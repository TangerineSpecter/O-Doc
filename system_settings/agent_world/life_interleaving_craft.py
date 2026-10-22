"""Reissue a server plan only when an interrupted opportunity has no commits."""
from .execution import stamina


def issue_plan(action, item, agent, kind):
    if kind not in ('cooking', 'alchemy'):
        raise ValueError('逐件打造使用自己的阶段检查点，不生成整批制作计划')
    if kind == 'cooking':
        from .cooking_runner import prepare_decision
        from .cooking_plan import build_plan
        from .cooking_schedule_plan import available_pool
        decision, options = prepare_decision(action.task, agent)
        plan = build_plan(item.owner_id, agent.pk, decision['choices'], options, stamina(agent),
                          pool=available_pool(item.owner_id, agent.pk, exclude_ids=[item.pk]))
        reason = decision['reason']
    else:
        from .alchemy_runner import prepare_decision
        from .alchemy_plan import build_plan
        from .alchemy_schedule_plan import available_pool
        choices, options, reason = prepare_decision(action.task, agent)
        plan = build_plan(item.owner_id, agent.pk, choices, options, stamina(agent),
                          pool=available_pool(item.owner_id, agent.pk, exclude_ids=[item.pk]))
    action.snapshot = {kind: True, 'owner_id': item.owner_id, 'plan': plan, 'reason': reason}
    action.save(update_fields=['snapshot', 'updated_at'])
