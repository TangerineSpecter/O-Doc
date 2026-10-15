"""Finite activity selection with cross-slot constraints; no business commits."""
import time
from system_settings.decision.routing import choose_scene, owner_for, jev_enabled


def select_activities(agent, context, ask):
    owner = owner_for(agent)
    if not jev_enabled(owner, 'life_activity'):
        return None
    deadline = context.get('_request_deadline', time.monotonic() + 180)
    plans, farm_days = [], set(context.get('existing_farm_days', []))
    activities = {row['kind']: row for row in context.get('activities', [])}
    # An existing farm commitment outside this batch also occupies the daily slot.
    ids = {row['id'] for row in context.get('slots', [])}
    for row in context.get('upcoming', []):
        if row.get('activity') == 'farm' and row.get('id') not in ids:
            farm_days.add(row['time'][:10])
    for slot in context.get('slots', []):
        day = slot['time'][:10]
        choices = {'rest': '休息或本次不安排活动'}
        choices.update({kind: row.get('preference') or kind for kind, row in activities.items()
                        if kind != 'farm' or day not in farm_days})
        selection = choose_scene(owner, agent, 'life_activity',
            {**{k: v for k, v in context.items() if k not in ('role', 'slots', '_request_deadline')},
             'slot': slot, 'selected': plans}, choices, deadline=deadline)
        if selection is None:
            return None  # No writes occurred: normal model can plan this batch.
        if selection == 'farm':
            farm_days.add(day)
        plans.append({'id': slot['id'], 'activity': selection,
                      'reason': f'系统选择说明：结构化决策模型选择了{selection}，这不是人物感受或真实经历。'})
    updates = []
    if context.get('goals'):
        value = ask(agent, '只更新已提供的生活目标，不安排活动。返回 {"goal_updates":[]}；'
                    '如完成目标须引用真实evidence_record_id；允许放弃失效目标并说明原因。',
                    {key: context[key] for key in ('goals', 'recent_experiences', 'today') if key in context})
        updates = value.get('goal_updates', [])
    return {'plans': plans, 'goal_updates': updates}
