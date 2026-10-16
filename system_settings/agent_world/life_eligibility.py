"""Independent, read-only activity predicates composed before every decision."""
from .cooking_schedule_plan import recipe_options
from .life_time import local_time


def filter_activities(context: dict, slot: dict, budgets: dict, cooking: dict | None,
                      farm_days: set[str]) -> tuple[dict, dict]:
    choices, reasons = {}, {}
    for activity in context['activities']:
        kind = activity['kind']
        reason = None
        if kind in ('travel', 'investment') and not budgets.get(kind):
            reason = '没有可行预算档'
        elif kind == 'investment' and local_time_from_slot(slot).weekday() >= 5:
            reason = '该时段为周末，不执行投资'
        elif kind == 'farm' and local_time_from_slot(slot).date().isoformat() in farm_days:
            reason = '当天已有农场开工安排'
        elif kind == 'cooking' and (not cooking or not recipe_options(
                cooking['rules'], cooking['level'], cooking['pool'], cooking['energy'])):
            reason = '没有材料、厨艺等级和体力均满足的菜谱'
        if reason:
            reasons[kind] = reason
        else:
            choices[kind] = activity.get('preference') or kind
    return choices, reasons


def local_time_from_slot(slot: dict):
    from datetime import datetime
    return local_time(datetime.fromisoformat(slot['time']))
