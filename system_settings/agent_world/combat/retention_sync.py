"""Validate compacted battle outcomes against retained, synchronized sources."""
from collections import defaultdict

from utils.sync_policy import SyncError
from .party_daily import FACT, RUN, _timestamp
from .party_sync import EVENT, MEMBER, PARTY, WAVE
from .party_daily_sync import SETTLEMENT as PARTY_SETTLEMENT
from .retention_projection import validate_archive
from .retention_replay import personal_outcomes
from .solo_settlement import ENCOUNTER, SETTLEMENT as SOLO_SETTLEMENT
from .store import digest


def _time(value):
    at = _timestamp(value)
    return at.replace(microsecond=at.microsecond // 1000 * 1000)


def _retained_run(run, outcome, owner, facts):
    result, snapshot = run.get('result') or {}, run.get('snapshot') or {}
    departures = [row for row in facts if row['kind'] == 'depart']
    if (run['owner_id'] != owner or run['id'] != outcome['exploration_id']
            or run['actor_id'] != outcome['actor_id'] or run['catalog_id'] != outcome['catalog_id']
            or run['status'] != outcome['status'] or not run.get('ended_at')
            or _time(run['ended_at']) != _time(outcome['ended_at'])
            or run['elapsed_seconds'] != outcome['elapsed_seconds']
            or outcome['dungeon_id'] != (snapshot.get('plan') or {}).get('dungeon_id')
            or outcome['job_id'] != (snapshot.get('progression') or {}).get('job')
            or any(outcome[key] != result.get(key) for key in ('kills', 'experience', 'energy', 'rewards'))
            or any(outcome[key] != result.get(key, {}) for key in ('potions_used', 'elixirs_used'))
            or len(departures) != 1 or departures[0]['owner_id'] != owner
            or departures[0]['actor_id'] != run['actor_id']
            or _time(departures[0]['created_at']) != _time(outcome['departed_at'])):
        raise ValueError('归档结算与保留的探索、出发或结果不一致')


def _retained_party(content, party, members, waves):
    origin = content['origin']
    if (party['status'] != 'completed' or any(origin.get(key) != party.get(key) for key in
            ('owner_id', 'head', 'digest', 'frame', 'frame_version'))
            or origin.get('party_id') != party['id']):
        raise ValueError('共同归档与保留的会话终点不一致')
    expected_runs = {(row['exploration_id'], row['actor_id']) for row in content['runs']}
    actual_runs = {(row['exploration_id'], row['actor_id']) for row in members}
    if (not members or len(actual_runs) != len(members) or actual_runs != expected_runs
            or any(row['owner_id'] != party['owner_id'] or row['active'] or not row.get('left_at') for row in members)):
        raise ValueError('共同归档与成员结束记录不一致')
    kills = {row['unit_id']: row for row in content['kills']}
    seen = set()
    for wave in waves:
        monsters = wave['snapshot']['monsters']
        for item in wave['result'].get('kills', []):
            unit = item['monster_id']
            if unit in seen or unit not in kills or unit not in monsters:
                raise ValueError('共同归档与波次击杀来源不一致')
            seen.add(unit)
            stored, monster = kills[unit], monsters[unit]
            if any(stored['monster'][key] != monster[source] for key, source in (
                    ('id', 'template_id'), ('name', 'name'), ('rank', 'rank'), ('level', 'level'))):
                raise ValueError('共同归档的魔物与波次来源不一致')
            actions = {participant['actor_id']: {
                'kind': 'kill', 'monster': {**stored['monster'], 'unit_id': unit},
                'experience': participant['experience'], 'rewards': participant['rewards'],
            } for participant in stored['participants']}
            if actions != item['personal'] or not set(actions) <= set(wave['snapshot']['members']):
                raise ValueError('共同归档的参与者、经验或掉落与波次不一致')
    if seen != set(kills):
        raise ValueError('共同归档存在缺失的波次击杀')


def _retained_solo(content, run, encounters):
    fields = {key: run[key] for key in ('id', 'owner_id', 'actor_id', 'status', 'ended_at',
              'catalog_id', 'snapshot', 'state', 'result', 'elapsed_seconds')}
    ordered = sorted(encounters, key=lambda row: (row['number'], row['id']))
    if (digest(fields) != content['origin']['run_digest']
            or digest(ordered) != content['origin']['encounters_digest']):
        raise ValueError('旧单人归档与保留的探索或遭遇不一致')
    defeated = [row for row in ordered if (row.get('result') or {}).get('killed') is True]
    if len(defeated) != len(content['kills']):
        raise ValueError('旧单人归档与遭遇击杀数量不一致')
    for encounter, kill in zip(defeated, content['kills']):
        result = encounter['result']
        if (encounter['id'] != kill['encounter_id'] or encounter['number'] != kill['encounter_number']
                or encounter['monster'] != kill['monster'] or _time(encounter['ended_at']) != _time(kill['occurred_at'])
                or result.get('experience') != kill['experience'] or result.get('rewards') != kill['rewards']):
            raise ValueError('旧单人归档与遭遇击杀结果不一致')


def archive_index(data, meta=None):
    """Return verified archived ranges and virtual outcomes for each resident."""
    markers = [row for row in data if row['model'] in (PARTY_SETTLEMENT, SOLO_SETTLEMENT)
               and isinstance(row['fields'].get('content'), dict) and 'archive' in row['fields']['content']]
    if not markers:
        return {'parties': {}, 'solos': {}, 'ranges': {}, 'outcomes': {}}
    if meta is not None and meta.get('combat_schema_version', 0) < 20:
        raise SyncError('已清理的战斗回合需要战斗同步20')
    rows, facts, encounters, members, waves, events = {}, defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list)
    for item in data:
        model, key = item['model'], str(item['pk'])
        row = {'id': key, **item['fields']}
        rows[(model, key)] = row
        if model == FACT and row['exploration_id']:
            facts[row['exploration_id']].append(row)
        elif model == ENCOUNTER:
            encounters[row['exploration_id']].append(row)
        elif model == MEMBER:
            members[row['party_id']].append(row)
        elif model == WAVE:
            waves[row['party_id']].append(row)
        elif model == EVENT:
            events[row['party_id']].append(row)
    parties, solos, ranges, outcomes = {}, {}, defaultdict(list), defaultdict(list)
    seen_runs = set()
    try:
        for marker in markers:
            identity, fields = str(marker['pk']), marker['fields']
            content = fields['content']
            archive = validate_archive(content)
            kind = 'party' if marker['model'] == PARTY_SETTLEMENT else 'solo'
            source_id = content['party_id'] if kind == 'party' else content['run']['exploration_id']
            if (archive['kind'] != kind or source_id != identity or fields['version'] != 1
                    or fields['owner_id'] != content['owner_id'] or fields['digest'] != digest(content)):
                raise ValueError('战斗归档身份或指纹不一致')
            destination = parties if kind == 'party' else solos
            if identity in destination:
                raise ValueError('战斗归档存在重复身份')
            destination[identity] = content
            run_outcomes = content['runs'] if kind == 'party' else [content['run']]
            for outcome in run_outcomes:
                run_id = outcome['exploration_id']
                run = rows.get((RUN, run_id))
                if not run or run_id in seen_runs:
                    raise ValueError('战斗归档探索缺失或重复覆盖')
                seen_runs.add(run_id)
                _retained_run(run, outcome, content['owner_id'], facts[run_id])
                if any(row['kind'] == 'round' for row in facts[run_id]):
                    raise ValueError('已归档探索仍含原始回合')
                if kind == 'party' and (run.get('snapshot') or {}).get('party_id') != identity:
                    raise ValueError('共同归档与探索会话不一致')
                if kind == 'party':
                    final = (run.get('snapshot') or {}).get('party_final')
                    if final is not None and (not isinstance(final, dict) or final.get('events') != []):
                        raise ValueError('共同归档仍包含个人历史战斗过程')
                if kind == 'solo' and 'party_id' in (run.get('snapshot') or {}):
                    raise ValueError('旧单人归档包含共同探索')
            if kind == 'party':
                party = rows.get((PARTY, identity))
                if not party or any(row['kind'] == 'round' for row in events[identity]):
                    raise ValueError('共同归档缺少会话或仍含原始回合')
                _retained_party(content, party, members[identity], waves[identity])
            else:
                _retained_solo(content, rows[(RUN, identity)], encounters[identity])
            for item in archive['personal_ranges']:
                ranges[item['stream_id']].append(item)
            for item in personal_outcomes(content):
                outcomes[item['actor_id']].append(item)
    except (ValueError, KeyError, TypeError, AttributeError, IndexError) as exc:
        raise SyncError('战斗归档与保留的结算或来源不一致') from exc
    return {'parties': parties, 'solos': solos, 'ranges': dict(ranges), 'outcomes': dict(outcomes)}
