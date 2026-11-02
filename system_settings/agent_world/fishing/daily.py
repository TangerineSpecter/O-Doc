"""Compact one finished fishing trip into occurrence-day statistics."""
from datetime import datetime

from django.utils.dateparse import parse_datetime

from system_settings.sync_state import canonical_hash
from ..life_time import local_time

TRIP = 'system_settings.fishingtrip'
EVENT = 'system_settings.fishingevent'
COUNTERS = ('casts', 'catches', 'kings', 'escaped', 'empty', 'junk', 'experience', 'ordinaryCatches')


def project_trip(data, identity):
    rows = {}
    for row in data:
        key = (row['model'], str(row['pk']))
        if key in rows:
            raise ValueError('钓鱼来源存在重复业务身份')
        rows[key] = row['fields']
    trip = rows.get((TRIP, identity))
    if not trip or trip.get('status') not in ('completed', 'cancelled') or not trip.get('ended_at'):
        raise ValueError('出钓尚未结束或缺少结束时间')
    events = sorted(({'id': key, **fields} for (model, key), fields in rows.items()
                     if model == EVENT and str(fields.get('trip')) == identity), key=lambda row: row['sequence'])
    if type(trip.get('revision')) is not int or trip['revision'] < 1:
        raise ValueError('钓鱼事实版本无效')
    if [row['sequence'] for row in events] != list(range(1, trip['revision']+1)):
        raise ValueError('钓鱼事实序列不完整')
    if not events or events[-1]['kind'] != 'return' or any(row['kind'] == 'return' for row in events[:-1]):
        raise ValueError('出钓缺少最终返还事实')
    days, previous_day, proof = {}, None, []
    for event in events:
        if event['kind'] not in ('choice', 'depart', 'cast', 'duel_round', 'duel_end', 'return') or not isinstance(event['data'], dict):
            raise ValueError('钓鱼事件类型或内容无效')
        value = event.get('created_at')
        at = parse_datetime(value) if isinstance(value, str) else value
        if not isinstance(at, datetime):
            raise ValueError('钓鱼事件缺少可信发生时间')
        at = local_time(at)
        day = at.date().isoformat()
        if previous_day is not None and day < previous_day:
            raise ValueError('钓鱼事件日期与序列顺序不一致')
        previous_day = day
        proof.append({'id': event['id'], 'sequence': event['sequence'], 'kind': event['kind'],
                      'created_at': at.isoformat(), 'data': event['data']})
        row = days.setdefault(day, {'date': day, 'first_sequence': event['sequence'],
                                    'last_sequence': event['sequence'], 'counters': dict.fromkeys(COUNTERS, 0)})
        row['last_sequence'] = event['sequence']
        if event['kind'] not in ('cast', 'duel_end'):
            continue
        data_value = event['data']
        experience = data_value.get('experience', 0)
        if type(experience) is not int or experience < 0:
            raise ValueError('钓鱼经验来源无效')
        counters = row['counters']
        counters['experience'] += experience
        if event['kind'] == 'cast':
            counters['casts'] += 1
            outcome_data = data_value.get('outcome', {})
            if not isinstance(outcome_data, dict):
                raise ValueError('钓鱼事件结果无效')
            outcome = outcome_data.get('kind')
            if outcome in ('escaped', 'empty', 'junk'):
                counters[outcome] += 1
        caught = data_value.get('catch')
        if caught is not None and not isinstance(caught, dict):
            raise ValueError('钓鱼事件捕获内容无效')
        if caught:
            counters['catches'] += 1
            counters['kings'] += int(bool(caught.get('king')))
            if event['kind'] == 'cast' and not caught.get('king'):
                counters['ordinaryCatches'] += 1
    daily = [days[day] for day in sorted(days)]
    source = {'trip_id': identity, 'owner_id': trip['owner_id'], 'actor_id': trip['actor_id'],
              'revision': trip['revision'], 'status': trip['status'], 'ended_at': trip['ended_at'],
              'events_digest': canonical_hash(proof), 'days_digest': canonical_hash(daily)}
    return {'source': source, 'days': daily, 'cleanup_ready': False}
