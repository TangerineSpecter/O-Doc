"""Seal verified legacy aggregates once; historical catalogs become provenance labels."""
from collections import Counter
from copy import deepcopy

from .store import digest

PREFIX = 'system_settings.'
PROFILE, GEAR, RUN, FACT, CHAIN, CATALOG, ENCOUNTER = [PREFIX + name for name in
    ('combatprofile', 'equipmentinstance', 'exploration', 'combatfact', 'combatintegrity', 'combatcatalog', 'combatencounter')]
OPEN = {'preparing', 'active', 'paused', 'settling'}


def indexed(data: list[dict]) -> dict:
    return {(row['model'], str(row['pk'])): {'id': str(row['pk']), **row['fields']} for row in data}


def aggregate_frame(rows: dict, actor: str, *, frozen: bool) -> dict:
    def select(row, keys):
        return {key: row[key] for key in keys.split()}
    return {
        'profile': select(rows[(PROFILE, actor)], 'id owner_id catalog_id progression loadout hp mp loot_progress'),
        'equipment': [select(row, 'id catalog_id template_id snapshot value bound locked sold' + (' rules' if frozen else ''))
            for (model, _), row in sorted(rows.items()) if model == GEAR and row['actor_id'] == actor],
        'runs': [select(row, 'id catalog_id status phase elapsed_seconds revision snapshot state result')
            for (model, _), row in sorted(rows.items()) if model == RUN and row['actor_id'] == actor],
        'encounters': [select(row, 'id exploration_id number monster result')
            for (model, _), row in sorted(rows.items()) if model == ENCOUNTER and row['actor_id'] == actor],
    }


def verify_chain(ordered: list[dict], chain: dict, actor: str, owner: str) -> None:
    previous = ''
    for sequence, row in enumerate(ordered, 1):
        content = {key: row[key] for key in ('id', 'actor_id', 'owner_id', 'sequence', 'kind',
                   'exploration_id', 'elapsed_seconds', 'payload', 'previous_hash')}
        if (row['actor_id'] != actor or row['owner_id'] != owner or row['sequence'] != sequence or
                row['previous_hash'] != previous or digest(content) != row['digest']):
            raise ValueError('历史事实链缺失或发生分叉，不能固化')
        previous = row['digest']
    if not ordered or chain['head'] != len(ordered) or chain['digest'] != previous or chain['owner_id'] != owner:
        raise ValueError('历史事实链终点不一致，不能固化')


def inventory_balance(rows: dict, actor: str, owner: str) -> dict:
    balance = Counter()
    for (model, _), row in rows.items():
        if model == PREFIX + 'agentinventoryitem' and row['actor_id'] == actor and row['source'].get('sku', '').startswith('combat.'):
            if row['owner_id'] != owner:
                raise ValueError('战斗库存所属账号不一致')
            balance[row['source']['sku']] += row['quantity']
    return dict(sorted((key, value) for key, value in balance.items() if value))


def stock_changes(row: dict, balance: Counter) -> None:
    payload, kind = row['payload'], row['kind']
    if kind == 'depart':
        balance.subtract({'combat.' + key: count for key, count in payload['plan'].get('potions', {}).items()})
    elif kind == 'terminal':
        balance.update({'combat.' + key: count for key, count in payload['returned'].items()})
    elif kind == 'round':
        for event in payload.get('events', []):
            if event['kind'] == 'kill':
                for reward in event['rewards']:
                    if reward['kind'] != 'equipment':
                        balance['combat.' + reward['item']['id']] += reward['quantity']
    elif kind == 'trade':
        operation = payload['arguments']
        if operation['kind'] == 'buy_potion':
            balance['combat.' + operation['potion_id']] += operation['quantity']
        elif operation['kind'] == 'sell_combat_material':
            balance['combat.' + operation['material_id']] -= operation['quantity']


def frozen_run(snapshot: dict, catalog) -> dict:
    plan, progress = snapshot.get('plan') or {}, snapshot.get('progression') or {}
    def label(table, identity):
        return {'id': identity, 'name': catalog.index.get(table, {}).get(identity, {}).get('name', identity)}
    return {**snapshot, 'history_frozen': 1, 'history': {'version': 1, 'source_catalog': catalog.version,
        'dungeon': label('dungeons', plan.get('dungeon_id', '')),
        'profession': label('professions', progress.get('job', ''))}}


def normalize_source(data: list[dict]) -> list[dict]:
    """Only verified pre-checkpoint data can establish the one-time trust boundary."""
    from utils.sync_manager import SyncError
    from .catalog import Catalog
    from .equipment_snapshot import rules_for, validate
    result = deepcopy(data)
    rows = indexed(result)
    catalogs = {}
    def catalog(version):
        if version not in catalogs:
            source = rows[(CATALOG, version)]
            if digest(source['tables']) != source['digest']:
                raise ValueError('目录指纹不一致，不能固化')
            catalogs[version] = Catalog(source['tables'], version)
        return catalogs[version]
    try:
        for (model, actor), profile in list(rows.items()):
            if model != PROFILE:
                continue
            ordered = sorted((row for (kind, _), row in rows.items() if kind == FACT and row['actor_id'] == actor),
                             key=lambda row: row['sequence'])
            if any(row['kind'] == 'checkpoint' for row in ordered):
                continue
            chain = rows[(CHAIN, actor)]
            verify_chain(ordered, chain, actor, profile['owner_id'])
            if digest(aggregate_frame(rows, actor, frozen=False)) != chain['frame']:
                raise ValueError('历史状态指纹不一致，不能固化')
            stock = Counter()
            for row in ordered:
                stock_changes(row, stock)
            actual = inventory_balance(rows, actor, profile['owner_id'])
            if {key: value for key, value in stock.items() if value} != actual:
                raise ValueError('战斗库存与历史消费事实不一致，不能固化')
            equipment = {}
            for (kind, _), item in rows.items():
                if kind != GEAR or item['actor_id'] != actor:
                    continue
                if item['owner_id'] != profile['owner_id']:
                    raise ValueError('历史装备所属账号不一致')
                if not item.get('rules'):
                    item['rules'] = rules_for(catalog(item['catalog_id']), item['template_id'], item['snapshot'], bound=item['bound'])
                validate(item['snapshot'], item['rules'])
                equipment[item['id']] = {'snapshot': deepcopy(item['snapshot']), 'rules': deepcopy(item['rules'])}
            for (kind, _), run in rows.items():
                if kind == RUN and run['actor_id'] == actor and run['status'] not in OPEN:
                    run['snapshot'] = frozen_run(run['snapshot'], catalog(run['catalog_id']))
            payload = {'version': 1, 'source_sequence': chain['head'], 'source_digest': chain['digest'],
                'source_frame': chain['frame'], 'progression': deepcopy(profile['progression']),
                'equipment': equipment, 'stock': actual}
            identity = 'checkpoint:' + digest({'actor': actor, 'head': chain['head'], 'digest': chain['digest']})[:29]
            content = {'id': identity, 'actor_id': actor, 'owner_id': profile['owner_id'], 'sequence': chain['head'] + 1,
                'kind': 'checkpoint', 'exploration_id': '', 'elapsed_seconds': 0, 'payload': payload, 'previous_hash': chain['digest']}
            sealed = {**content, 'digest': digest(content), 'created_at': ordered[-1]['created_at']}
            rows[(FACT, identity)] = sealed
            chain.update(head=sealed['sequence'], digest=sealed['digest'], frame=digest(aggregate_frame(rows, actor, frozen=True)))
        original = {(row['model'], str(row['pk'])): row for row in result}
        for key, fields in rows.items():
            if key in original:
                original[key]['fields'] = {name: value for name, value in fields.items() if name != 'id'}
            else:
                result.append({'model': key[0], 'pk': key[1], 'fields': {name: value for name, value in fields.items() if name != 'id'}})
        return result
    except (ValueError, KeyError, TypeError, ArithmeticError) as exc:
        raise SyncError('战斗历史固化失败：' + str(exc)) from exc


def required_catalogs(data: list[dict]) -> set[str]:
    rows = indexed(data)
    catalogs = [row for (model, _), row in rows.items() if model == CATALOG]
    newest = max(catalogs, key=lambda row: (str(row.get('created_at', '')), row['id']), default=None)
    required = {newest['id']} if newest else set()
    required.update(row['catalog_id'] for (model, _), row in rows.items() if model == PROFILE or
                    (model == RUN and row['status'] in OPEN))
    return required


def compact_source(data: list[dict]) -> list[dict]:
    needed = required_catalogs(data)
    return [row for row in data if row['model'] != CATALOG or str(row['pk']) in needed]
