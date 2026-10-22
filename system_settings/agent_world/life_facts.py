"""Batch public projections of real domain events; missing values stay unknown."""
from datetime import datetime
from decimal import Decimal
from django.db.models import Q
from .life_activities import source
from .life_schedule import execution_key
from .life_time import local_time, SHANGHAI


def iso(value):
    return local_time(value).isoformat() if value and not isinstance(value, str) else value


def batch_actuals(items):
    from system_settings.models import WorldAction, AgentRunRecord
    from .cooking_models import CookingOperation
    from .alchemy_models import AlchemyOperation
    from .blacksmith_models import BlacksmithOperation
    from .combat.models import Exploration
    from .fishing.models import FishingTrip
    values = {i.pk: {'source': source(i), 'actual_started_at': i.context.get('execution_started'),
                     'actual_ended_at': None, 'actual_energy_cost': None, 'domain_detail': None} for i in items}
    if not values:
        return values
    for item in items:
        if item.activity == 'blacksmith':
            values[item.pk]['domain_detail'] = {'kind': 'blacksmith', 'id': execution_key(item)}
    keys = {execution_key(i): i.pk for i in items}
    ops = {}
    for model, kind in ((CookingOperation, 'cooking'), (AlchemyOperation, 'alchemy'), (BlacksmithOperation, 'blacksmith')):
        opportunities = [execution_key(i) for i in items if i.activity == kind]
        if opportunities:
            ops.update({pk: keys[key] for pk, key in model.objects.filter(opportunity_id__in=opportunities).values_list('pk', 'opportunity_id')})
    exploration_ids, fishing_ids = {}, {}
    for model, kind, mapping in ((Exploration, 'exploration', exploration_ids), (FishingTrip, 'fishing', fishing_ids)):
        ids = [i.pk for i in items if i.activity == kind]
        if not ids:
            continue
        for run in model.objects.filter(life_item_id__in=ids):
            mapping[run.pk] = run.life_item_id
            value = values[run.life_item_id]
            value['domain_detail'] = {'kind': kind, 'id': run.pk}
            value['actual_started_at'] = iso(getattr(run, 'departed_at', None))
            value['actual_ended_at'] = iso(run.ended_at)
    # Crafting parent actions carry no per-portion cost. Domain debits, not the
    # parent zero-cost wrapper, determine whether an actual total is known.
    plain = [execution_key(i) for i in items if i.activity not in ('cooking', 'alchemy', 'blacksmith', 'exploration', 'fishing')]
    query = Q(pk__in=plain) | Q(result__operation_id__in=list(ops)) | Q(result__exploration_id__in=list(exploration_ids)) | Q(result__fishing_trip_id__in=list(fishing_ids))
    import hashlib
    supply_sessions = {hashlib.sha256((pk + ':market').encode()).hexdigest(): identity for pk, identity in exploration_ids.items()}
    query |= Q(result__session_id__in=list(supply_sessions))
    actor_ids = {i.actor_id for i in items}
    for action in WorldAction.objects.filter(query, actor_id__in=actor_ids, status='success').order_by('consumed_at', 'pk'):
        result = action.result or {}
        identity = (ops.get(result.get('operation_id')) or exploration_ids.get(result.get('exploration_id'))
                    or fishing_ids.get(result.get('fishing_trip_id')) or supply_sessions.get(result.get('session_id')) or keys.get(action.pk))
        if identity not in values:
            continue
        value = values[identity]
        value['actual_energy_cost'] = str(Decimal(value['actual_energy_cost'] or '0') + action.energy_cost)
        value['actual_started_at'] = value['actual_started_at'] or iso(action.consumed_at)
    record_items = {i.record_id: i for i in items if i.record_id and i.status in ('completed', 'failed', 'cancelled')}
    for record in AgentRunRecord.objects.filter(pk__in=record_items):
        value = values[record_items[record.pk].pk]
        last = (record.steps or [{}])[-1]
        if not value['actual_ended_at'] and last.get('status') in ('success', 'failed') and last.get('time'):
            value['actual_ended_at'] = datetime.fromisoformat(last['time']).replace(tzinfo=SHANGHAI).isoformat()
    return values


def actuals(item):
    return batch_actuals([item])[item.pk]
