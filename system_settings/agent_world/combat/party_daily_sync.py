"""Validate synced daily contributions against still-retained combat sources.

Version 1 deliberately requires the original party events and receipts. It is
not a deletion checkpoint and cannot be used to restore discarded rounds.
"""
import hashlib
import json
from collections import defaultdict
from itertools import chain

from .party_daily import FACT, RUN, project_party
from .party_integrity import canonical
from .party_sync import EVENT, MEMBER, PARTY, WAVE
from .store import digest

COVERAGE = 'system_settings.combatpartycoverage'
DAY = 'system_settings.combatpartyday'
SETTLEMENT = 'system_settings.combatpartysettlement'
VERSION = 1


def day_id(party_id, day):
    return hashlib.sha256(json.dumps([party_id, day], ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def records(projection):
    source = projection['source']
    party, owner = source['party_id'], source['owner_id']
    days = projection['days']
    coverage = {'model': COVERAGE, 'pk': party, 'fields': {
        'owner_id': owner, 'version': VERSION, 'source': source,
        'days': [item['date'] for item in days],
    }}
    entries = [{'model': DAY, 'pk': day_id(party, item['date']), 'fields': {
        'party_id': party, 'owner_id': owner, 'day': item['date'],
        'first_sequence': item['first_sequence'], 'last_sequence': item['last_sequence'],
        'groups': item['groups'],
    }} for item in days]
    return [coverage, *entries]


def settlement_record(settlement):
    return {'model': SETTLEMENT, 'pk': settlement['party_id'], 'fields': {
        'owner_id': settlement['owner_id'], 'version': 1,
        'content': settlement, 'digest': digest(settlement),
    }}


def source_slices(data, party_ids):
    """Group each relevant raw source once instead of scanning it per party."""
    slices = defaultdict(list)
    events, runs = {}, {}
    for row in data:
        label, key, fields = row['model'], str(row['pk']), row['fields']
        if label == PARTY and key in party_ids:
            slices[key].append(row)
        elif label in (MEMBER, WAVE, EVENT) and fields['party_id'] in party_ids:
            party = fields['party_id']
            slices[party].append(row)
            if label == MEMBER:
                runs.setdefault(fields['exploration_id'], set()).add(party)
            elif label == EVENT:
                events[key] = party
    for row in data:
        label, key, fields = row['model'], str(row['pk']), row['fields']
        if label == RUN:
            for party in runs.get(key, ()):
                slices[party].append(row)
        elif label == FACT:
            parties = set(runs.get(fields['exploration_id'], ()))
            event_party = events.get((fields.get('payload') or {}).get('shared_event_id'))
            if event_party:
                parties.add(event_party)
            for party in parties:
                slices[party].append(row)
    return slices


def validate_source(data, meta=None, *, archives=None):
    from utils.sync_policy import SyncError
    stored = {}
    for row in data:
        if row['model'] not in (COVERAGE, DAY, SETTLEMENT):
            continue
        key = (row['model'], str(row['pk']))
        if key in stored:
            raise SyncError('战斗每日贡献存在重复业务身份')
        stored[key] = row
    if not stored:
        return
    if meta is not None and meta.get('combat_schema_version', 0) < 18:
        raise SyncError('战斗每日贡献需要战斗同步18')
    if meta is not None and meta.get('combat_schema_version', 0) < 19 and any(
            model == SETTLEMENT for model, _ in stored):
        raise SyncError('战斗压缩结算需要战斗同步19')
    party_ids = {key for (model, key) in stored if model == COVERAGE}
    if any(row['fields'].get('party_id') not in party_ids for (model, _), row in stored.items() if model == DAY):
        raise SyncError('战斗每日贡献缺少来源覆盖')
    if any(key not in party_ids for (model, key) in stored if model == SETTLEMENT):
        raise SyncError('战斗压缩结算缺少每日来源覆盖')
    if archives is None:
        from .retention_sync import archive_index
        archives = archive_index(data, meta)
    slices = source_slices(data, party_ids)
    expected = {}
    try:
        for identity in sorted(party_ids):
            archived = archives['parties'].get(identity)
            if archived:
                from .party_settlement_archive import validate_settlement
                original = {key: value for key, value in archived.items() if key != 'archive'}
                projection = {'source': original['origin'], 'days': validate_settlement(original)}
            else:
                projection = project_party(slices[identity], identity)
            for row in records(projection):
                expected[(row['model'], str(row['pk']))] = row
            if (SETTLEMENT, identity) in stored:
                if archived:
                    settlement = archived
                else:
                    from .party_settlement_archive import _from_validated_projection
                    settlement = _from_validated_projection(slices[identity], identity, projection)
                row = settlement_record(settlement)
                expected[(SETTLEMENT, identity)] = row
    except (KeyError, TypeError, ValueError) as exc:
        raise SyncError('战斗每日贡献无法由完整来源核对') from exc
    if stored != expected:
        raise SyncError('战斗每日贡献与原始来源、日期或覆盖范围不一致')


def validate_conflicts(local, remote):
    from utils.sync_policy import SyncError
    left = {(row['model'], str(row['pk'])): row['fields'] for row in local
            if row['model'] in (COVERAGE, DAY, SETTLEMENT)}
    for row in remote:
        key = (row['model'], str(row['pk']))
        if key in left and left[key] != row['fields']:
            raise SyncError('同一战斗每日贡献在不同设备的来源或结果不一致，请先核对原始事实')

    # A device without a contribution may still have a different copy of its
    # source. In particular, event timestamps are not part of the legacy event
    # digest, yet they decide the Shanghai day; generic last-write-wins would
    # otherwise silently discard one of those copies.
    party_ids = {str(row['pk']) for row in chain(local, remote) if row['model'] == COVERAGE}
    if not party_ids:
        return
    fields_by_model = {
        PARTY: ('owner_id', 'status', 'head', 'digest', 'frame', 'frame_version'),
        MEMBER: ('party_id', 'owner_id', 'actor_id', 'exploration_id', 'active', 'joined_at', 'left_at', 'ends_at'),
        WAVE: ('party_id', 'owner_id', 'number', 'snapshot', 'result', 'created_at', 'ended_at', 'content_digest'),
        EVENT: ('party_id', 'owner_id', 'sequence', 'digest', 'created_at'),
        RUN: ('owner_id', 'actor_id', 'status', 'ended_at'),
        FACT: ('owner_id', 'actor_id', 'exploration_id', 'sequence', 'digest'),
    }
    local_slices, remote_slices = source_slices(local, party_ids), source_slices(remote, party_ids)
    for party in party_ids:
        originals = {(row['model'], str(row['pk'])): row['fields'] for row in local_slices[party]}
        for row in remote_slices[party]:
            key = (row['model'], str(row['pk']))
            if key not in originals:
                continue
            fields = fields_by_model[key[0]]
            a, b = originals[key], row['fields']
            if canonical({field: a.get(field) for field in fields}) != canonical({field: b.get(field) for field in fields}):
                raise SyncError('战斗每日贡献对应的原始来源在不同设备不一致，请先核对')
