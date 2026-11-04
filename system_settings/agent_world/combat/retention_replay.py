"""Reconstruct outcome-only personal facts from verified archived settlements."""
from collections import defaultdict
from copy import deepcopy

from .retention_projection import validate_archive


def personal_outcomes(content):
    """Return virtual kill and consumption facts for existing asset checks.

    Ordinary attacks remain absent. These rows exist only while validating an
    archive and are not written back as individual combat facts.
    """
    archive = validate_archive(content)
    runs = (content['runs'] if archive['kind'] == 'party' else [content['run']])
    grouped = {}
    positions = {}

    def add(actor, run, sequence, identity, index, monster, experience, rewards, progression, equipment):
        position = (actor, sequence)
        if position in positions and positions[position] != (run, identity):
            raise ValueError('同一个人事实序号对应多个归档回执')
        positions[position] = (run, identity)
        key = (actor, run, sequence, identity)
        value = grouped.setdefault(key, {
            'id': identity, 'actor_id': actor, 'owner_id': content['owner_id'], 'exploration_id': run,
            'sequence': sequence, 'kind': 'round',
            'payload': {'events': [], 'progression_after': deepcopy(progression),
                        'equipment_after': deepcopy(equipment), 'consumption': []}, '_archived': True,
        })
        if (value['payload']['progression_after'] != progression or value['payload']['equipment_after'] != equipment
                or any(position == index for position, _ in value['payload']['events'])):
            raise ValueError('同一归档回执的成长、装备或事件位置不一致')
        value['payload']['events'].append((index, {'kind': 'kill', 'monster': deepcopy(monster),
                                                   'experience': experience, 'rewards': deepcopy(rewards)}))

    if archive['kind'] == 'party':
        for kill in content['kills']:
            monster = {**kill['monster'], 'unit_id': kill['unit_id']}
            for item in kill['participants']:
                add(item['actor_id'], item['exploration_id'], item['first_sequence'], item['first_fact_id'],
                    item['first_event_index'], monster, item['experience'], item['rewards'],
                    item['progression_after'], item['equipment_after'])
    else:
        run = content['run']
        for kill in content['kills']:
            add(run['actor_id'], run['exploration_id'], kill['fact_sequence'], kill['fact_id'],
                kill['event_index'], kill['monster'], kill['experience'], kill['rewards'],
                kill['progression_after'], kill['equipment_after'])

    result = []
    for row in grouped.values():
        row['payload']['events'] = [event for _, event in sorted(row['payload']['events'])]
        result.append(row)
    ranges = defaultdict(list)
    for item in archive['personal_ranges']:
        ranges[(item['stream_id'], item['exploration_id'])].append(item)
    for run in runs:
        if not run['consumption']:
            continue
        actor, identity = run['actor_id'], run['exploration_id']
        eligible = ranges[(actor, identity)]
        if not eligible:
            raise ValueError('归档体力消费缺少对应回合范围')
        result.append({'id': 'archive-consumption:' + identity, 'actor_id': actor, 'owner_id': content['owner_id'],
                       'exploration_id': identity, 'sequence': min(row['first_sequence'] for row in eligible),
                       'kind': 'archived_consumption', 'payload': {'consumption': deepcopy(run['consumption'])},
                       '_archived': True})
    return sorted(result, key=lambda row: (row['actor_id'], row['sequence'], row['id']))
