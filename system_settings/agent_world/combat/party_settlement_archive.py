"""Project and independently re-count a completed party's compact settlement.

This is an in-memory preparation step only. It does not write an archive or
authorize deletion of the personal or shared source chains.
"""
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import date

from .equipment_snapshot import validate as validate_equipment
from .explorations import TERMINAL
from .frozen_validation import validate_progression
from .party_daily import FACT, RUN, _timestamp, project_party
from .party_sync import EVENT, MEMBER, PARTY
from .store import digest


def _records(data):
    return {(row['model'], str(row['pk'])): {'id': str(row['pk']), **row['fields']} for row in data}


def _settled_runs(rows, identity):
    members = sorted((row for (model, _), row in rows.items()
                      if model == MEMBER and row['party_id'] == identity), key=lambda row: row['id'])
    runs = {}
    for member in members:
        run = rows[(RUN, member['exploration_id'])]
        if run['id'] in runs:
            raise ValueError('同一探索被多个成员重复引用')
        result = run.get('result') or {}
        departures = [fact for (model, _), fact in rows.items() if model == FACT
                      and fact['exploration_id'] == run['id'] and fact['actor_id'] == run['actor_id']
                      and fact['owner_id'] == run['owner_id'] and fact['kind'] == 'depart']
        if len(departures) != 1 or not departures[0].get('created_at'):
            raise ValueError('结束探索缺少唯一真实出发时间，不能制作归档结算')
        _timestamp(departures[0]['created_at'])
        if (type(result.get('kills')) is not int or result['kills'] < 0
                or type(result.get('experience')) is not int or result['experience'] < 0
                or not isinstance(result.get('rewards'), list)):
            raise ValueError('探索结算缺少可信的击杀、经验或掉落')
        consumptions = []
        facts = sorted((fact for (model, _), fact in rows.items() if model == FACT and fact['kind'] == 'round'
                        and fact['exploration_id'] == run['id'] and fact['actor_id'] == run['actor_id']
                        and fact['owner_id'] == run['owner_id']), key=lambda fact: (fact['sequence'], fact['id']))
        for fact in facts:
            changes = fact['payload'].get('consumption', [])
            if not isinstance(changes, list):
                raise ValueError('探索的体力消费来源无效')
            consumptions.extend(deepcopy(changes))
        runs[run['id']] = {
            'exploration_id': run['id'], 'actor_id': run['actor_id'],
            'catalog_id': run['catalog_id'],
            'dungeon_id': (run.get('snapshot', {}).get('plan') or {}).get('dungeon_id'),
            'job_id': (run.get('snapshot', {}).get('progression') or {}).get('job'),
            'departed_at': departures[0]['created_at'], 'ended_at': run['ended_at'],
            'status': run['status'], 'elapsed_seconds': run['elapsed_seconds'],
            'kills': result['kills'], 'experience': result['experience'],
            'energy': result.get('energy'), 'potions_used': deepcopy(result.get('potions_used', {})),
            'elixirs_used': deepcopy(result.get('elixirs_used', {})),
            'rewards': deepcopy(result['rewards']), 'consumption': consumptions,
        }
    return runs


def _settled_kills(rows, identity):
    receipts = {(row['payload'].get('shared_event_id'), row['actor_id']): row
                for (model, _), row in rows.items() if model == FACT and row['kind'] == 'round'
                and row['payload'].get('shared_event_id')}
    kills = {}
    events = sorted((row for (model, _), row in rows.items()
                     if model == EVENT and row['party_id'] == identity), key=lambda row: row['sequence'])
    for event in events:
        if event['kind'] != 'round':
            continue
        for actor, actions in event['payload'].get('personal', {}).items():
            receipt = receipts.get((event['id'], actor))
            if not receipt:
                raise ValueError('共同击杀缺少对应个人回执')
            for index, action in enumerate(actions):
                if action.get('kind') != 'kill':
                    continue
                monster = action['monster']
                unit = monster['unit_id']
                item = kills.setdefault(unit, {
                    'unit_id': unit, 'monster': {key: monster[key] for key in ('id', 'name', 'rank', 'level')},
                    'occurred_at': event['created_at'], 'event_sequence': event['sequence'],
                    'shared_event_id': event['id'], 'participants': [],
                })
                experience, rewards = action.get('experience'), action.get('rewards')
                if type(experience) is not int or experience < 0 or not isinstance(rewards, list):
                    raise ValueError('个人击杀缺少可信的经验或掉落')
                payload = receipt['payload']
                item['participants'].append({
                    'actor_id': actor, 'exploration_id': receipt['exploration_id'],
                    'experience': experience, 'rewards': deepcopy(rewards),
                    'progression_after': deepcopy(payload.get('progression_after')),
                    'equipment_after': deepcopy(payload.get('equipment_after', {})),
                    'first_sequence': receipt['sequence'], 'first_fact_id': receipt['id'],
                    'first_event_index': index,
                })
    return [dict(item, participants=sorted(item['participants'], key=lambda row: row['actor_id']))
            for _, item in sorted(kills.items())]


def rebuild_daily(settlement):
    """Rebuild the existing per-day grouping without the original round rows."""
    runs = {row['exploration_id']: row['actor_id'] for row in settlement['runs']}
    if len(runs) != len(settlement['runs']):
        raise ValueError('归档结算包含重复探索')
    bounds = {}
    previous_last = 0
    for item in settlement['day_bounds']:
        day, first, last = item['date'], item['first_sequence'], item['last_sequence']
        if (date.fromisoformat(day).isoformat() != day or day in bounds or type(first) is not int
                or type(last) is not int or first != previous_last + 1 or last < first):
            raise ValueError('归档结算的日期范围无效')
        if bounds and day <= next(reversed(bounds)):
            raise ValueError('归档结算的日期顺序无效')
        bounds[day] = (first, last)
        previous_last = last
    groups, units, reward_ids = defaultdict(dict), set(), set()
    for item in settlement['kills']:
        unit, monster = item['unit_id'], item['monster']
        day = _timestamp(item['occurred_at']).date().isoformat()
        sequence = item['event_sequence']
        if (not isinstance(unit, str) or not unit or unit in units or day not in bounds
                or type(sequence) is not int or not bounds[day][0] <= sequence <= bounds[day][1]
                or not isinstance(item.get('shared_event_id'), str) or not item['shared_event_id']):
            raise ValueError('归档结算包含重复或无效的击杀来源')
        units.add(unit)
        if (not isinstance(monster, dict)
                or any(not isinstance(monster.get(key), str) or not monster[key] for key in ('id', 'name', 'rank'))
                or type(monster.get('level')) is not int or monster['level'] < 0):
            raise ValueError('归档结算的魔物维度无效')
        positions = {}
        for participant in item['participants']:
            actor, run = participant['actor_id'], participant['exploration_id']
            position = (participant['first_sequence'], participant['first_fact_id'], participant['first_event_index'])
            if (runs.get(run) != actor or actor in positions or type(position[0]) is not int or position[0] <= 0
                    or not isinstance(position[1], str) or not position[1]
                    or type(position[2]) is not int or position[2] < 0
                    or type(participant['experience']) is not int or participant['experience'] < 0
                    or not isinstance(participant['rewards'], list)
                    or not isinstance(participant['equipment_after'], dict)):
                raise ValueError('归档结算的参与者、经验或位置无效')
            validate_progression(participant['progression_after'])
            positions[actor] = (run, position)
            for reward in participant['rewards']:
                reward_id = reward.get('id') if isinstance(reward, dict) else None
                if not isinstance(reward_id, str) or not reward_id or reward_id in reward_ids:
                    raise ValueError('归档结算包含重复或无效的奖励来源')
                reward_ids.add(reward_id)
                if reward.get('kind') == 'equipment':
                    equipment = participant['equipment_after'].get(reward.get('equipment_id'))
                    if not isinstance(equipment, dict) or equipment.get('snapshot') != reward.get('item'):
                        raise ValueError('归档结算缺少装备掉落及其固化规则')
                    validate_equipment(equipment['snapshot'], equipment.get('rules'))
                elif (reward.get('kind') != 'material' or not isinstance(reward.get('item'), dict)
                      or not isinstance(reward['item'].get('id'), str) or not reward['item']['id']
                      or type(reward.get('quantity')) is not int or reward['quantity'] < 1):
                    raise ValueError('归档结算的材料掉落无效')
        if not positions:
            raise ValueError('归档击杀缺少参与者')
        participants = tuple(sorted((actor, value[0]) for actor, value in positions.items()))
        key = (monster['id'], monster['name'], monster['rank'], monster['level'], participants)
        group = groups[day].setdefault(key, {'kills': 0, 'positions': {}})
        group['kills'] += 1
        for actor, (_, position) in positions.items():
            group['positions'][actor] = min(group['positions'].get(actor, position), position)
    daily = []
    for day, (first, last) in bounds.items():
        entries = [{'monster': {'id': key[0], 'name': key[1], 'rank': key[2], 'level': key[3]},
                    'participants': [{'actor_id': actor, 'exploration_id': run,
                        'first_sequence': group['positions'][actor][0], 'first_fact_id': group['positions'][actor][1],
                        'first_event_index': group['positions'][actor][2]} for actor, run in key[4]],
                    'kills': group['kills']} for key, group in sorted(groups[day].items())]
        daily.append({'date': day, 'first_sequence': first, 'last_sequence': last, 'groups': entries})
    return daily


def validate_settlement(settlement):
    """Check stored outcomes against kill evidence and return rebuilt days."""
    if (settlement.get('version') != 1 or not isinstance(settlement.get('party_id'), str)
            or not settlement['party_id'] or not isinstance(settlement.get('owner_id'), str)
            or not settlement['owner_id'] or not isinstance(settlement.get('runs'), list)
            or not settlement['runs'] or not isinstance(settlement.get('origin'), dict)
            or not isinstance(settlement.get('day_bounds'), list)
            or not isinstance(settlement.get('kills'), list)):
        raise ValueError('归档结算缺少会话身份或结果')
    daily = rebuild_daily(settlement)
    origin = settlement['origin']
    if (origin.get('party_id') != settlement['party_id'] or origin.get('owner_id') != settlement['owner_id']
            or type(origin.get('head')) is not int
            or origin['head'] != (daily[-1]['last_sequence'] if daily else 0)
            or origin.get('days_digest') != digest(daily)):
        raise ValueError('归档结算与原日期统计指纹不一致')
    personal_kills, personal_xp = Counter(), Counter()
    personal_rewards = defaultdict(Counter)
    for kill in settlement['kills']:
        for participant in kill['participants']:
            run = participant['exploration_id']
            personal_kills[run] += 1
            personal_xp[run] += participant['experience']
            personal_rewards[run].update(digest(reward) for reward in participant['rewards'])
    for outcome in settlement['runs']:
        run = outcome['exploration_id']
        _timestamp(outcome['departed_at'])
        _timestamp(outcome['ended_at'])
        if (not isinstance(outcome.get('actor_id'), str) or not outcome['actor_id']
                or not isinstance(run, str) or not run
                or outcome.get('status') not in TERMINAL
                or type(outcome['elapsed_seconds']) is not int or outcome['elapsed_seconds'] < 0
                or type(outcome['energy']) is not int or outcome['energy'] < 0
                or type(outcome['kills']) is not int or type(outcome['experience']) is not int
                or any(not isinstance(outcome.get(field), dict) or any(
                    not isinstance(key, str) or type(value) is not int or value < 0
                    for key, value in outcome[field].items()) for field in ('potions_used', 'elixirs_used'))
                or not isinstance(outcome['rewards'], list) or not isinstance(outcome['consumption'], list)
                or personal_kills[run] != outcome['kills'] or personal_xp[run] != outcome['experience']
                or personal_rewards[run] != Counter(digest(reward) for reward in outcome['rewards'])):
            raise ValueError('压缩击杀的数量、经验或掉落与探索结算不一致')
    return daily


def _from_validated_projection(data, identity, projection):
    """Called only with a projection just verified against this same source."""
    rows = _records(data)
    party = rows[(PARTY, identity)]
    runs = _settled_runs(rows, identity)
    settlement = {
        'version': 1, 'party_id': identity, 'owner_id': party['owner_id'],
        'origin': deepcopy(projection['source']),
        'runs': [runs[key] for key in sorted(runs)],
        'day_bounds': [{key: row[key] for key in ('date', 'first_sequence', 'last_sequence')}
                       for row in projection['days']],
        'kills': _settled_kills(rows, identity),
    }
    if validate_settlement(settlement) != projection['days']:
        raise ValueError('压缩后的战斗结算无法重建原每日统计')
    return settlement


def project_settlement(data, identity):
    """Keep outcomes and kill evidence, then prove the daily stats can be rebuilt."""
    return _from_validated_projection(data, identity, project_party(data, identity))
