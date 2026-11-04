"""Compact completed legacy solo outcomes without retaining combat actions."""
from collections import Counter
from copy import deepcopy

from .equipment_snapshot import validate as validate_equipment
from .explorations import TERMINAL
from .frozen_validation import validate_progression
from .party_daily import FACT, RUN, _timestamp
from .store import digest

ENCOUNTER = 'system_settings.combatencounter'
SETTLEMENT = 'system_settings.combatsolosettlement'


def _result_fields(run, departure, consumptions):
    result = run.get('result') or {}
    return {
        'exploration_id': run['id'], 'actor_id': run['actor_id'],
        'catalog_id': run['catalog_id'],
        'dungeon_id': (run.get('snapshot', {}).get('plan') or {}).get('dungeon_id'),
        'job_id': (run.get('snapshot', {}).get('progression') or {}).get('job'),
        'departed_at': departure['created_at'], 'ended_at': run['ended_at'],
        'status': run['status'], 'elapsed_seconds': run['elapsed_seconds'],
        'kills': result.get('kills'), 'experience': result.get('experience'), 'energy': result.get('energy'),
        'potions_used': deepcopy(result.get('potions_used', {})),
        'elixirs_used': deepcopy(result.get('elixirs_used', {})),
        'rewards': deepcopy(result.get('rewards')), 'consumption': consumptions,
    }


def validate_settlement(settlement):
    """Validate compact solo outcomes and return kills grouped by local day."""
    if (settlement.get('version') != 1 or not isinstance(settlement.get('owner_id'), str)
            or not settlement['owner_id'] or not isinstance(settlement.get('run'), dict)
            or not isinstance(settlement.get('kills'), list) or not isinstance(settlement.get('origin'), dict)):
        raise ValueError('旧单人结算缺少来源、探索或击杀')
    run = settlement['run']
    if (not isinstance(run.get('exploration_id'), str) or not run['exploration_id']
            or not isinstance(run.get('actor_id'), str) or not run['actor_id']
            or run.get('status') not in TERMINAL or type(run.get('elapsed_seconds')) is not int
            or run['elapsed_seconds'] < 0 or type(run.get('energy')) is not int or run['energy'] < 0
            or type(run.get('kills')) is not int or type(run.get('experience')) is not int
            or not isinstance(run.get('rewards'), list) or not isinstance(run.get('consumption'), list)
            or any(not isinstance(run.get(field), dict) or any(
                not isinstance(key, str) or type(value) is not int or value < 0
                for key, value in run[field].items()) for field in ('potions_used', 'elixirs_used'))):
        raise ValueError('旧单人探索结算不完整')
    _timestamp(run['departed_at'])
    _timestamp(run['ended_at'])
    kills, rewards, xp, identities, reward_ids = Counter(), Counter(), 0, set(), set()
    last_number, last_sequence = 0, 0
    for item in settlement['kills']:
        identity, monster = item['encounter_id'], item['monster']
        number, sequence = item['encounter_number'], item['fact_sequence']
        if (not isinstance(identity, str) or not identity or identity in identities
                or type(number) is not int or number <= last_number
                or type(sequence) is not int or sequence <= last_sequence
                or not isinstance(item.get('fact_id'), str) or not item['fact_id']
                or type(item.get('event_index')) is not int or item['event_index'] < 0
                or not isinstance(monster, dict) or not isinstance(monster.get('id'), str) or not monster['id']
                or type(item.get('experience')) is not int or item['experience'] < 0
                or not isinstance(item.get('rewards'), list) or not isinstance(item.get('equipment_after'), dict)):
            raise ValueError('旧单人击杀来源或参与信息无效')
        identities.add(identity)
        last_number, last_sequence = number, sequence
        day = _timestamp(item['occurred_at']).date().isoformat()
        kills[day] += 1
        xp += item['experience']
        if item.get('progression_after') is not None:
            validate_progression(item['progression_after'])
        for reward in item['rewards']:
            reward_id = reward.get('id') if isinstance(reward, dict) else None
            if not isinstance(reward_id, str) or not reward_id or reward_id in reward_ids:
                raise ValueError('旧单人结算包含重复或无效的奖励来源')
            reward_ids.add(reward_id)
            rewards[digest(reward)] += 1
            if reward.get('kind') == 'equipment':
                equipment = item['equipment_after'].get(reward.get('equipment_id'))
                # Historical pre-checkpoint receipts may not contain frozen
                # equipment rules; preserve that uncertainty for retention.
                if equipment is not None:
                    if not isinstance(equipment, dict) or equipment.get('snapshot') != reward.get('item'):
                        raise ValueError('旧单人装备掉落与固化属性不一致')
                    validate_equipment(equipment['snapshot'], equipment.get('rules'))
            elif (reward.get('kind') != 'material' or not isinstance(reward.get('item'), dict)
                  or not isinstance(reward['item'].get('id'), str) or not reward['item']['id']
                  or type(reward.get('quantity')) is not int or reward['quantity'] < 1):
                raise ValueError('旧单人材料掉落无效')
    if (sum(kills.values()) != run['kills'] or xp != run['experience']
            or rewards != Counter(digest(reward) for reward in run['rewards'])):
        raise ValueError('旧单人击杀的数量、经验或掉落与探索结算不一致')
    return dict(sorted(kills.items()))


def project(data, identity):
    """Check encounters against original kill receipts and freeze only outcomes."""
    rows = {}
    for row in data:
        key = (row['model'], str(row['pk']))
        if key in rows:
            raise ValueError('旧单人来源存在重复身份')
        rows[key] = {'id': str(row['pk']), **row['fields']}
    run = rows.get((RUN, identity))
    if (not run or run.get('status') not in TERMINAL or not run.get('ended_at')
            or not isinstance(run.get('snapshot'), dict) or 'party_id' in run['snapshot']):
        raise ValueError('旧单人探索尚未结束或来源无效')
    facts = sorted((row for (model, _), row in rows.items() if model == FACT
                    and row['exploration_id'] == identity), key=lambda row: (row['sequence'], row['id']))
    encounters = sorted((row for (model, _), row in rows.items() if model == ENCOUNTER
                         and row['exploration_id'] == identity), key=lambda row: (row['number'], row['id']))
    if any(row['owner_id'] != run['owner_id'] or row['actor_id'] != run['actor_id']
           for row in [*facts, *encounters]):
        raise ValueError('旧单人战斗事实的居民或账号不一致')
    expected_encounters = run.get('state', {}).get('encounter', 0)
    if type(expected_encounters) is not int or [row['number'] for row in encounters] != list(range(1, expected_encounters+1)):
        raise ValueError('旧单人遭遇来源缺失或重复')
    departures = [row for row in facts if row['kind'] == 'depart']
    if len(departures) != 1 or not departures[0].get('created_at'):
        raise ValueError('旧单人探索缺少唯一真实出发时间')
    actions, consumption = [], []
    for fact in facts:
        if fact['kind'] != 'round':
            continue
        payload = fact['payload']
        if not isinstance(payload.get('events', []), list) or not isinstance(payload.get('consumption', []), list):
            raise ValueError('旧单人回合载荷无效')
        consumption.extend(deepcopy(payload.get('consumption', [])))
        for index, action in enumerate(payload.get('events', [])):
            if isinstance(action, dict) and action.get('kind') == 'kill':
                actions.append((fact, index, action))
    defeated = [row for row in encounters if (row.get('result') or {}).get('killed') is True]
    if len(actions) != len(defeated):
        raise ValueError('旧单人击杀与遭遇结果数量不一致')
    kills = []
    for encounter, (fact, index, action) in zip(defeated, actions):
        outcome = encounter['result']
        if (not encounter.get('ended_at') or action.get('monster') != encounter['monster']
                or action.get('experience') != outcome.get('experience')
                or action.get('rewards') != outcome.get('rewards')):
            raise ValueError('旧单人击杀与遭遇结果不一致')
        kills.append({
            'encounter_id': encounter['id'], 'encounter_number': encounter['number'],
            'occurred_at': encounter['ended_at'], 'monster': deepcopy(encounter['monster']),
            'experience': outcome.get('experience'), 'rewards': deepcopy(outcome.get('rewards')),
            'fact_id': fact['id'], 'fact_sequence': fact['sequence'], 'event_index': index,
            'progression_after': deepcopy(fact['payload'].get('progression_after')),
            'equipment_after': deepcopy(fact['payload'].get('equipment_after', {})),
        })
    run_fields = {key: run[key] for key in ('id', 'owner_id', 'actor_id', 'status', 'ended_at',
                  'catalog_id', 'snapshot', 'state', 'result', 'elapsed_seconds')}
    settlement = {
        'version': 1, 'owner_id': run['owner_id'],
        'run': _result_fields(run, departures[0], consumption), 'kills': kills,
        'origin': {
            'run_digest': digest(run_fields),
            'facts_digest': digest([{key: row[key] for key in ('id', 'sequence', 'kind', 'digest', 'created_at')}
                                    for row in facts]),
            'encounters_digest': digest(encounters),
        },
    }
    validate_settlement(settlement)
    return settlement


def record(settlement):
    return {'model': SETTLEMENT, 'pk': settlement['run']['exploration_id'], 'fields': {
        'owner_id': settlement['owner_id'], 'version': 1,
        'content': settlement, 'digest': digest(settlement),
    }}


def matches_run(marker, run):
    """Check a saved outcome against its current completed exploration."""
    from utils.sync_policy import SyncError

    def stored_time(value):
        moment = _timestamp(value)
        return moment.replace(microsecond=moment.microsecond // 1000 * 1000)

    try:
        content, outcome = marker.content, marker.content['run']
        snapshot = run.snapshot or {}
        result = run.result or {}
        if (marker.version != 1 or marker.pk != run.pk or marker.owner_id != run.owner_id
                or marker.digest != digest(content) or content['owner_id'] != run.owner_id
                or outcome['exploration_id'] != run.pk or outcome['actor_id'] != run.actor_id
                or outcome['catalog_id'] != run.catalog_id or outcome['status'] != run.status
                or outcome['elapsed_seconds'] != run.elapsed_seconds or not run.ended_at
                or stored_time(outcome['ended_at']) != stored_time(run.ended_at)
                or outcome['dungeon_id'] != (snapshot.get('plan') or {}).get('dungeon_id')
                or outcome['job_id'] != (snapshot.get('progression') or {}).get('job')
                or outcome['kills'] != result.get('kills') or outcome['experience'] != result.get('experience')
                or outcome['energy'] != result.get('energy') or outcome['rewards'] != result.get('rewards')
                or outcome['potions_used'] != result.get('potions_used', {})
                or outcome['elixirs_used'] != result.get('elixirs_used', {})):
            return False
        validate_settlement(content)
        return True
    except (ValueError, KeyError, TypeError, AttributeError, IndexError, SyncError):
        return False
