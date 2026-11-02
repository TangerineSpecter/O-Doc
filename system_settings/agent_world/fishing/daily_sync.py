"""Validate synchronized trip-day contributions against retained fishing facts."""
import hashlib
import json
from collections import defaultdict
from itertools import chain

from utils.sync_policy import SyncError
from .daily import EVENT, TRIP, project_trip

COVERAGE = 'system_settings.fishingtripcoverage'
DAY = 'system_settings.fishingtripday'
VERSION = 1


def day_id(trip_id, day):
    return hashlib.sha256(json.dumps([trip_id, day], ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def records(projection):
    source, days = projection['source'], projection['days']
    trip, owner, actor = source['trip_id'], source['owner_id'], source['actor_id']
    coverage = {'model': COVERAGE, 'pk': trip, 'fields': {
        'owner_id': owner, 'actor_id': actor, 'version': VERSION, 'source': source,
        'days': [item['date'] for item in days],
    }}
    rows = [{'model': DAY, 'pk': day_id(trip, item['date']), 'fields': {
        'trip_id': trip, 'owner_id': owner, 'actor_id': actor, 'day': item['date'],
        'first_sequence': item['first_sequence'], 'last_sequence': item['last_sequence'],
        'counters': item['counters'],
    }} for item in days]
    return [coverage, *rows]


def source_slices(data, trip_ids):
    result = defaultdict(list)
    for row in data:
        if row['model'] == TRIP and str(row['pk']) in trip_ids:
            result[str(row['pk'])].append(row)
        elif row['model'] == EVENT:
            trip_id = str(row['fields'].get('trip') or '')
            if trip_id in trip_ids:
                result[trip_id].append(row)
    return result


def validate_source(data, meta=None):
    stored = {}
    for row in data:
        if row['model'] not in (COVERAGE, DAY):
            continue
        key = (row['model'], str(row['pk']))
        if key in stored:
            raise SyncError('钓鱼每日贡献存在重复业务身份')
        stored[key] = row
    if not stored:
        return
    if meta is not None and meta.get('fishing_schema_version', 0) < 2:
        raise SyncError('钓鱼每日贡献需要钓鱼同步2')
    trip_ids = {key for (model, key) in stored if model == COVERAGE}
    if any(row['fields'].get('trip_id') not in trip_ids for (model, _), row in stored.items() if model == DAY):
        raise SyncError('钓鱼每日贡献缺少来源覆盖')
    slices = source_slices(data, trip_ids)
    expected = {}
    try:
        for identity in sorted(trip_ids):
            for row in records(project_trip(slices[identity], identity)):
                expected[(row['model'], str(row['pk']))] = row
    except (KeyError, TypeError, ValueError) as exc:
        raise SyncError('钓鱼每日贡献无法由完整来源核对') from exc
    if stored != expected:
        raise SyncError('钓鱼每日贡献与原始来源、日期或覆盖范围不一致')


def validate_conflicts(local, remote):
    left = {(row['model'], str(row['pk'])): row['fields'] for row in local if row['model'] in (COVERAGE, DAY)}
    for row in remote:
        key = (row['model'], str(row['pk']))
        if key in left and left[key] != row['fields']:
            raise SyncError('同一钓鱼每日贡献在不同设备不一致，请先核对来源')
    identities = {str(row['pk']) for row in chain(local, remote) if row['model'] == COVERAGE}
    left_trips = {str(row['pk']): row['fields'] for row in local if row['model'] == TRIP and str(row['pk']) in identities}
    from .sync import normalize
    for row in remote:
        identity = str(row['pk'])
        if row['model'] != TRIP or identity not in left_trips:
            continue
        fields = ('owner_id', 'actor_id', 'status', 'revision', 'ended_at')
        old, new = left_trips[identity], row['fields']
        if normalize({field: old.get(field) for field in fields}) != normalize({field: new.get(field) for field in fields}):
            raise SyncError('钓鱼每日贡献对应的出钓来源在不同设备不一致')
