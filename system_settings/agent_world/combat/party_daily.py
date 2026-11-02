"""Build a compact, read-only daily projection from one complete shared session.

This projection is a backfill building block, not an archive authorization:
personal chain, asset provenance, remote coverage and recovery must also be
verified before any source is deleted.
"""
import hashlib
import json
from collections import defaultdict
from datetime import datetime

from django.utils.dateparse import parse_datetime

from ..life_time import local_time
from .party_sync import EVENT, MEMBER, PARTY, WAVE, validate_source

FACT = 'system_settings.combatfact'
RUN = 'system_settings.exploration'


def _timestamp(value):
    parsed = parse_datetime(value) if isinstance(value, str) else value
    if not isinstance(parsed, datetime):
        raise ValueError('共同事件缺少可信发生时间')
    return local_time(parsed)


def project_party(data, identity):
    """Project validated party kills by Shanghai day and actual participants.

    ``data`` is a complete serialized snapshot or complete party slice. The
    returned groups aggregate by monster attributes and participating personal
    explorations, rather than keeping one row per round or defeated unit.
    """
    rows = {}
    for item in data:
        key = (item['model'], str(item['pk']))
        if key in rows:
            raise ValueError('来源中存在重复业务身份')
        rows[key] = {'id': str(item['pk']), **item['fields']}
    party = rows.get((PARTY, identity))
    if not party or party['status'] != 'completed':
        raise ValueError('会话尚未完整结束')
    validate_source(data)

    from .explorations import TERMINAL
    members = [row for (kind, _), row in rows.items() if kind == MEMBER and row['party_id'] == identity]
    if not members:
        raise ValueError('会话缺少成员来源')
    by_run = {}
    for member in members:
        run = rows.get((RUN, member['exploration_id']))
        if member['active'] or not member.get('left_at') or not run or run['status'] not in TERMINAL or not run.get('ended_at'):
            raise ValueError('成员探索尚未完整结束或缺少结束时间')
        by_run[member['exploration_id']] = member

    receipts = {}
    for (kind, _), row in rows.items():
        if kind != FACT:
            continue
        event_id = row['payload'].get('shared_event_id')
        if event_id and (EVENT, event_id) in rows and rows[(EVENT, event_id)]['party_id'] == identity:
            key = (event_id, row['actor_id'])
            if key in receipts:
                raise ValueError('共同事件存在重复个人回执')
            member = by_run.get(row['exploration_id'])
            if not member or member['actor_id'] != row['actor_id'] or row['owner_id'] != party['owner_id']:
                raise ValueError('个人回执与实际成员探索不一致')
            receipts[key] = row

    recorded_units = set()
    for (kind, _), wave in rows.items():
        if kind != WAVE or wave['party_id'] != identity:
            continue
        if not isinstance(wave['result'], dict):
            raise ValueError('组队波次结算内容无效')
        for item in wave['result'].get('kills', []):
            unit = item['monster_id']
            if unit in recorded_units:
                raise ValueError('波次包含重复的魔物结算来源')
            recorded_units.add(unit)

    events = sorted((row for (kind, _), row in rows.items()
                     if kind == EVENT and row['party_id'] == identity), key=lambda row: row['sequence'])
    times_hash = hashlib.sha256()
    bounds = {}
    units = {}
    previous_day = None
    for event in events:
        at = _timestamp(event.get('created_at'))
        day = at.date().isoformat()
        if previous_day is not None and day < previous_day:
            raise ValueError('共同事件日期与序列顺序不一致，不能确定不重叠范围')
        previous_day = day
        times_hash.update((json.dumps([event['id'], event['sequence'], event['digest'], at.isoformat()],
                                     ensure_ascii=False, separators=(',', ':')) + '\n').encode())
        if day not in bounds:
            bounds[day] = [event['sequence'], event['sequence']]
        else:
            bounds[day][1] = event['sequence']
        if event['kind'] != 'round':
            continue
        wave = rows[(WAVE, f'{identity}:{event["payload"]["wave"]}')]
        monsters = wave['snapshot']['monsters']
        recorded_kills = wave['result'].get('kills', [])
        wave_kills = {item['monster_id']: item for item in recorded_kills}
        if len(wave_kills) != len(recorded_kills):
            raise ValueError('波次包含重复的魔物结算来源')
        for actor, actions in event['payload'].get('personal', {}).items():
            receipt = receipts.get((event['id'], actor))
            if receipt is None:
                raise ValueError('共同事件缺少个人回执')
            for action_index, action in enumerate(actions):
                if action.get('kind') != 'kill':
                    continue
                monster = action.get('monster') or {}
                unit = monster.get('unit_id')
                if not isinstance(unit, str) or not unit or unit not in monsters:
                    raise ValueError('击杀缺少可核对的魔物单位')
                prefix = f'{identity}:w{wave["number"]}:m'
                if not unit.startswith(prefix) or not unit[len(prefix):].isdigit():
                    raise ValueError('魔物单位与会话及波次的稳定身份不一致')
                if (any(not isinstance(monster.get(key), str) or not monster[key] for key in ('id', 'name', 'rank'))
                        or type(monster.get('level')) is not int or monster['level'] < 0):
                    raise ValueError('击杀魔物的统计维度不完整')
                origin = monsters[unit]
                if any(monster.get(key) != origin.get(source) for key, source in (
                        ('id', 'template_id'), ('name', 'name'), ('level', 'level'), ('rank', 'rank'))):
                    raise ValueError('击杀魔物与波次来源不一致')
                evidence = wave_kills.get(unit)
                if not evidence or evidence.get('personal', {}).get(actor) != action:
                    raise ValueError('击杀缺少对应波次结算来源')
                existing = units.setdefault(unit, {'event': event['id'], 'day': day,
                    'monster': monster, 'participants': {}, 'expected_actors': set(evidence.get('personal', {}))})
                if existing['event'] != event['id'] or existing['monster'] != monster:
                    raise ValueError('同一魔物单位存在冲突的击杀来源')
                if actor in existing['participants']:
                    raise ValueError('同一居民对同一魔物有重复击杀回执')
                existing['participants'][actor] = {
                    'exploration_id': receipt['exploration_id'], 'sequence': receipt['sequence'],
                    'fact_id': receipt['id'], 'event_index': action_index,
                }

    if set(units) != recorded_units:
        raise ValueError('共同回合与波次击杀来源不完整')
    groups = defaultdict(dict)
    for item in units.values():
        if set(item['participants']) != item['expected_actors']:
            raise ValueError('击杀参与者与波次结算来源不一致')
        monster = item['monster']
        participants = tuple(sorted((actor, value['exploration_id']) for actor, value in item['participants'].items()))
        key = (monster['id'], monster['name'], monster['rank'], monster['level'], participants)
        group = groups[item['day']].setdefault(key, {'kills': 0, 'positions': {}})
        group['kills'] += 1
        for actor, value in item['participants'].items():
            position = (value['sequence'], value['fact_id'], value['event_index'])
            previous = group['positions'].get(actor)
            group['positions'][actor] = min(previous, position) if previous is not None else position
    daily = []
    for day, (first, last) in sorted(bounds.items()):
        entries = [{'monster': {'id': key[0], 'name': key[1], 'rank': key[2], 'level': key[3]},
                    'participants': [{'actor_id': actor, 'exploration_id': run,
                        'first_sequence': group['positions'][actor][0], 'first_fact_id': group['positions'][actor][1],
                        'first_event_index': group['positions'][actor][2]} for actor, run in key[4]],
                    'kills': group['kills']} for key, group in sorted(groups[day].items())]
        daily.append({'date': day, 'first_sequence': first, 'last_sequence': last, 'groups': entries})
    receipt_proof = sorted((row['id'], row['actor_id'], row['exploration_id'], row['sequence'], row['digest'])
                           for row in receipts.values())
    closure_proof = sorted((member['id'], member['actor_id'], member['exploration_id'],
                            member['left_at'], rows[(RUN, member['exploration_id'])]['status'],
                            rows[(RUN, member['exploration_id'])]['ended_at']) for member in members)

    def fingerprint(value):
        return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                         separators=(',', ':')).encode()).hexdigest()

    return {
        'source': {'owner_id': party['owner_id'], 'party_id': identity, 'head': party['head'],
                   'digest': party['digest'], 'frame': party['frame'], 'frame_version': party.get('frame_version', 1),
                   'event_times_digest': times_hash.hexdigest(), 'receipt_digest': fingerprint(receipt_proof),
                   'member_closure_digest': fingerprint(closure_proof), 'days_digest': fingerprint(daily)},
        'days': daily,
        'cleanup_ready': False,
        'limitations': ['仅校验共同会话及回执；尚未核验个人完整事实链、资产来源和远端覆盖。'],
    }
