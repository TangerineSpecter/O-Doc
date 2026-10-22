"""Repair only conflicting proposals; keep other confirmed day choices intact."""
from datetime import datetime
from decimal import Decimal
from .life_plan_proposal import indexed_rows
from .life_energy import Commitment, forecast


def repair_conflicts(value, context):
    rows = indexed_rows(value.get('plans'), {s['id'] for s in context['slots']}, '活动选择')
    farm_days = set(context.get('existing_farm_days', []))
    cash = Decimal(context.get('travel_budget_ceiling', '0'))
    costs = {'post_interaction': 10, 'post_publish': 20, 'investment': 5, 'travel': 20, 'farm': 2, 'lottery': 0, 'rest': 0}
    from .stamina_settings import history
    from .life_time import local_time
    costs.update(context.get('activity_energy', {}))
    events = [Commitment(c['id'], datetime.fromisoformat(c['time']), Decimal(c['energy']) if c['energy'] is not None else None, 'committed') for c in context.get('energy_commitments', []) if c['energy'] is not None]
    # Unknown commitments block idle admission; main planning must first resolve
    # them. Still validate every known cost instead of abandoning the timeline.
    recovery, now = history(), local_time()
    publishing = context.get('publishing', {})
    next_publish = datetime.fromisoformat(publishing['next_available_at']) if publishing.get('next_available_at') else None
    publish_left = publishing.get('remaining_quota')
    for slot in sorted(context['slots'], key=lambda s: s['time']):
        row = rows[slot['id']]
        kind, reason, price = row.get('activity'), '', Decimal(0)
        if kind not in [*slot['allowed_activities'], 'rest']:
            reason = '活动不在该时段合法候选中'
        if kind == 'farm' and slot['time'][:10] in farm_days:
            reason = '当天已安排农场开工'
        if kind == 'post_publish':
            if publish_left is not None and publish_left <= 0:
                reason = '当天发帖安排已用完剩余额度'
            if next_publish and datetime.fromisoformat(slot['time']) < next_publish:
                reason = '与前一篇发帖的冷却间隔不足'
        if kind == 'travel':
            quote = next((q for q in context.get('travel', {}).get('candidates', []) if q['id'] == row.get('destination_id')), None)
            if quote is None:
                reason = '目的地报价失效'
            else:
                price = Decimal(quote['required_budget'])
                if price > cash:
                    reason = '当天其他日程已占用可分配预算'
        event = Commitment(row['id'], datetime.fromisoformat(slot['time']), Decimal(costs.get(kind, 0)), kind)
        projection = forecast(context['stamina'], now, [*events, event], recovery)
        if not reason and not projection['safe'] and projection.get('reason') != 'unknown_commitment':
            reason = '当天累计体力需求超过可恢复体力'
        if reason:
            row.update(activity='rest', reason='系统说明：本时段不安排，' + reason)
            row.pop('destination_id', None)
        else:
            cash -= price
            events.append(event)
            if kind == 'farm':
                farm_days.add(slot['time'][:10])
            if kind == 'post_publish':
                from datetime import timedelta
                next_publish = datetime.fromisoformat(slot['time']) + timedelta(hours=publishing.get('cooldown_hours', 6))
                if publish_left is not None:
                    publish_left -= 1
    return value
