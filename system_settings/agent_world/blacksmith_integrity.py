"""Stable hashes of recipe settings, piece receipts and durable decision progress."""
import json

from django.core import serializers

from .alchemy_integrity import hash_rows

PREFIX = 'system_settings.'
CATALOG = PREFIX + 'blacksmithcatalog'
OPERATION = PREFIX + 'blacksmithoperation'
INTEGRITY = PREFIX + 'blacksmithintegrity'
GOAL = PREFIX + 'blacksmithgoal'
ACTION = PREFIX + 'worldaction'


def database_data(owner: str | None = None) -> list[dict]:
    from system_settings.models import WorldAction
    from .blacksmith_models import BlacksmithCatalog, BlacksmithOperation, BlacksmithIntegrity, BlacksmithGoal
    catalogs = BlacksmithCatalog.objects.all()
    operations = BlacksmithOperation.objects.all()
    checks = BlacksmithIntegrity.objects.all()
    goals = BlacksmithGoal.objects.all()
    actions = WorldAction.objects.filter(snapshot__blacksmith=True) | WorldAction.objects.filter(snapshot__blacksmith_energy=True)
    if owner is not None:
        catalogs, operations, checks = catalogs.filter(pk=owner), operations.filter(owner_id=owner), checks.filter(pk=owner)
        goals = goals.filter(owner_id=owner)
        actions = actions.filter(snapshot__owner_id=owner)
    return json.loads(serializers.serialize('json', [*catalogs, *operations, *checks, *goals, *actions]))


def owners_for(data: list[dict]) -> set[str]:
    result = set()
    for row in data:
        fields, label = row['fields'], row['model']
        if label in (CATALOG, INTEGRITY):
            result.add(str(row['pk']))
        elif label in (OPERATION, GOAL):
            result.add(fields['owner_id'])
        elif label == ACTION and (fields.get('snapshot', {}).get('blacksmith') or fields.get('snapshot', {}).get('blacksmith_energy')):
            result.add(fields['snapshot']['owner_id'])
    return result


def fingerprints_source(data: list[dict], owner: str) -> dict:
    groups = {'catalog': [], 'operations': [], 'actions': [], 'energy': []}
    if any(row['model'] == GOAL and row['fields']['owner_id'] == owner for row in data):
        groups['goals'] = []
    for row in data:
        fields, label = row['fields'], row['model']
        value = {'id': str(row['pk']), **fields}
        if label == CATALOG and str(row['pk']) == owner:
            groups['catalog'].append({key: value[key] for key in ('id', 'version', 'rules')})
        elif label == OPERATION and fields['owner_id'] == owner:
            groups['operations'].append(value)
        elif label == GOAL and fields['owner_id'] == owner:
            groups['goals'].append(value)
        elif label == ACTION and fields.get('snapshot', {}).get('owner_id') == owner:
            snapshot = fields['snapshot']
            if snapshot.get('blacksmith') or snapshot.get('blacksmith_energy'):
                groups['energy' if snapshot.get('blacksmith_energy') else 'actions'].append(value)
    return {key: hash_rows(sorted(rows, key=lambda row: row['id']), ('created_at', 'updated_at', 'consumed_at'))
            for key, rows in groups.items()}


def fingerprints(owner: str) -> dict:
    return fingerprints_source(database_data(owner), owner)
