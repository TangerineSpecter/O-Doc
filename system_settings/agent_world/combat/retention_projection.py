"""Prepare compact continuity ranges and replayable outcomes for old combat."""
from collections import defaultdict
from copy import deepcopy

from .party_daily import FACT
from .party_settlement_archive import project_settlement, validate_settlement
from .party_sync import EVENT, PARTY
from .retention_segments import personal_ranges, shared_ranges, verify_shared
from .solo_settlement import project as project_solo, validate_settlement as validate_solo
from .store import digest


def _rows(data, model):
    return [{'id': str(item['pk']), **item['fields']} for item in data if item['model'] == model]


def _personal_ranges(data, owner, run_actors):
    facts = _rows(data, FACT)
    by_actor = defaultdict(set)
    for run, actor in run_actors.items():
        by_actor[actor].add(run)
    result = []
    for actor, run_ids in sorted(by_actor.items()):
        result.extend(personal_ranges(facts, owner=owner, actor=actor, run_ids=run_ids))
    return result


def prepare_party(data, identity, *, exact_event_times=None):
    """Produce an archive from a still-complete, internally verified party slice."""
    content = project_settlement(data, identity)
    run_actors = {row['exploration_id']: row['actor_id'] for row in content['runs']}
    events = [row for row in _rows(data, EVENT) if row['party_id'] == identity]
    party = next(row for row in _rows(data, PARTY) if row['id'] == identity)
    runs = {row['id']: row for row in _rows(data, 'system_settings.exploration')}
    shared = shared_ranges(events, owner=content['owner_id'], party=identity)
    verify_shared((row for row in sorted(events, key=lambda item: item['sequence']) if row['kind'] != 'round'),
                  party, ranges=shared)
    archived = deepcopy(content)
    times = exact_event_times or {row['id']: row['created_at'] for row in events}
    kill_times = {kill['shared_event_id']: times[kill['shared_event_id']] for kill in content['kills']}
    archived['archive'] = {'version': 1, 'kind': 'party', 'settlement_digest': digest(content),
                           'personal_ranges': _personal_ranges(data, content['owner_id'], run_actors),
                           'shared_ranges': shared, 'exact_event_times': kill_times,
                           'party_final_digests': {run: digest((runs[run]['snapshot'] or {}).get('party_final'))
                                                   for run in sorted(run_actors)}}
    validate_archive(archived)
    return archived


def prepare_solo(data, identity):
    """Produce an archive from a still-complete legacy solo source slice."""
    content = project_solo(data, identity)
    run = content['run']
    archived = deepcopy(content)
    archived['archive'] = {'version': 1, 'kind': 'solo', 'settlement_digest': digest(content),
                           'personal_ranges': _personal_ranges(
                               data, content['owner_id'], {run['exploration_id']: run['actor_id']}),
                           'shared_ranges': []}
    validate_archive(archived)
    return archived


def validate_archive(content):
    """Check archive structure and that every retained kill falls inside its ranges."""
    if not isinstance(content, dict) or not isinstance(content.get('archive'), dict):
        raise ValueError('战斗归档缺少范围信息')
    archive = content['archive']
    original = {key: value for key, value in content.items() if key != 'archive'}
    if (archive.get('version') != 1 or archive.get('kind') not in ('party', 'solo')
            or archive.get('settlement_digest') != digest(original)
            or not isinstance(archive.get('personal_ranges'), list)
            or not isinstance(archive.get('shared_ranges'), list)):
        raise ValueError('战斗归档的结算或范围指纹不一致')
    if archive['kind'] == 'party':
        validate_settlement(original)
        runs = {row['exploration_id']: row['actor_id'] for row in original['runs']}
        shared_id = original['party_id']
        final_digests = archive.get('party_final_digests')
        if (not isinstance(final_digests, dict) or set(final_digests) != set(runs)
                or any(not isinstance(value, str) or len(value) != 64 for value in final_digests.values())):
            raise ValueError('共同归档缺少个人历史快照指纹')
        from .party_daily import _timestamp
        exact = archive.get('exact_event_times')
        if not isinstance(exact, dict) or set(exact) != {kill['shared_event_id'] for kill in original['kills']}:
            raise ValueError('共同击杀归档缺少准确发生时间')
        for kill in original['kills']:
            actual, stored = _timestamp(exact[kill['shared_event_id']]), _timestamp(kill['occurred_at'])
            if actual.replace(microsecond=actual.microsecond // 1000 * 1000) != stored.replace(
                    microsecond=stored.microsecond // 1000 * 1000):
                raise ValueError('共同击杀的准确时间与来源不一致')
    else:
        validate_solo(original)
        run = original['run']
        runs = {run['exploration_id']: run['actor_id']}
        shared_id = ''
        if archive['shared_ranges']:
            raise ValueError('旧单人归档不应包含共同回合')
    owner = original['owner_id']
    by_actor, shared = defaultdict(list), []
    for gap in archive['personal_ranges']:
        if (gap.get('owner_id') != owner or runs.get(gap.get('exploration_id')) != gap.get('stream_id')
                or type(gap.get('first_sequence')) is not int or type(gap.get('last_sequence')) is not int
                or gap['first_sequence'] < 1 or gap['last_sequence'] < gap['first_sequence']):
            raise ValueError('个人归档范围的居民或探索不一致')
        by_actor[(gap['stream_id'], gap['exploration_id'])].append(gap)
    for gap in archive['shared_ranges']:
        if (gap.get('owner_id') != owner or gap.get('stream_id') != shared_id or gap.get('exploration_id') != ''
                or type(gap.get('first_sequence')) is not int or type(gap.get('last_sequence')) is not int
                or gap['first_sequence'] < 1 or gap['last_sequence'] < gap['first_sequence']):
            raise ValueError('共同归档范围不一致')
        shared.append(gap)

    def contains(gaps, sequence):
        return sum(gap['first_sequence'] <= sequence <= gap['last_sequence'] for gap in gaps) == 1

    if archive['kind'] == 'party':
        for kill in original['kills']:
            if not contains(shared, kill['event_sequence']):
                raise ValueError('共同击杀不在归档的回合范围内')
            for participant in kill['participants']:
                key = (participant['actor_id'], participant['exploration_id'])
                if not contains(by_actor[key], participant['first_sequence']):
                    raise ValueError('个人击杀不在归档的回合范围内')
    else:
        for kill in original['kills']:
            if not contains(by_actor[(run['actor_id'], run['exploration_id'])], kill['fact_sequence']):
                raise ValueError('旧单人击杀不在归档的回合范围内')
    # Different explorations of the same resident still share a single chain.
    # Checking each (resident, exploration) separately would accept overlaps.
    actor_ranges = defaultdict(list)
    for (actor, _), ranges in by_actor.items():
        actor_ranges[actor].extend(ranges)
    for ranges in [*actor_ranges.values(), shared]:
        previous = 0
        for gap in sorted(ranges, key=lambda item: item['first_sequence']):
            if gap['first_sequence'] <= previous:
                raise ValueError('归档回合范围重叠')
            previous = gap['last_sequence']
    return archive
