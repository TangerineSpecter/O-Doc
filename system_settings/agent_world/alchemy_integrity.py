"""Alchemy asset fingerprints with lossless compatibility for ISO zero milliseconds."""
import json
from django.core.serializers.json import DjangoJSONEncoder
from utils.sync_datetime import normalize_datetime_fraction
from system_settings.sync_state import canonical_hash
from .alchemy_models import AlchemyCatalog, AlchemySkill, AlchemyOperation, AlchemyIntegrity
from .travel_models import AgentInventoryItem
from .market_models import MarketListing, MarketTransaction

ASSETS = (AlchemySkill, AlchemyOperation, AgentInventoryItem, MarketListing, MarketTransaction)
ENERGY_FIELDS = ('id', 'actor_id', 'energy_cost', 'consumed_at', 'status', 'result')


def hash_rows(rows: list[dict], dates: tuple[str, ...] = (), *, normalize: bool = True) -> str:
    serialized = json.loads(json.dumps(rows, cls=DjangoJSONEncoder))
    if normalize:
        for row in serialized:
            for field in dates:
                value = row.get(field)
                if isinstance(value, str):
                    row[field] = normalize_datetime_fraction(value)
    return canonical_hash(serialized)


def dates_for(model) -> tuple[str, ...]:
    return tuple(field.attname for field in model._meta.fields if field.get_internal_type() == 'DateTimeField')


def fingerprints(owner: str) -> dict:
    from system_settings.models import WorldAction
    result = {'catalog': hash_rows(list(AlchemyCatalog.objects.filter(pk=owner).values('id', 'rules', 'item_icons')))}
    for model in ASSETS:
        result[model.__name__] = hash_rows(list(model.objects.filter(owner_id=owner).order_by('pk').values()), dates_for(model))
    plans = list(WorldAction.objects.filter(snapshot__alchemy=True, snapshot__owner_id=owner,
        snapshot__plan__0__rule__quality_rules__version=1).order_by('pk').values('id', 'actor_id', 'snapshot'))
    if plans:
        result['quality_plans'] = hash_rows(plans)
    result['energy'] = hash_rows(list(WorldAction.objects.filter(snapshot__alchemy_energy=True,
        snapshot__owner_id=owner).order_by('pk').values(*ENERGY_FIELDS)), ('consumed_at',))
    return result


def source_integrity(data: list[dict]) -> dict[str, dict]:
    from utils.sync_manager import SyncError
    from system_settings.models import WorldAction
    owners = {str(row['pk']) if row['model'] in ('system_settings.alchemycatalog', 'system_settings.alchemyintegrity')
              else row['fields']['owner_id'] for row in data if row['model'] in (
                  'system_settings.alchemycatalog', 'system_settings.alchemyintegrity',
                  'system_settings.alchemyskill', 'system_settings.alchemyoperation')}
    checkpoints = {str(row['pk']): row['fields']['hashes'] for row in data if row['model'] == 'system_settings.alchemyintegrity'}
    catalogs = {str(row['pk']) for row in data if row['model'] == 'system_settings.alchemycatalog'}
    values = {}
    try:
        for model in (AlchemyCatalog, *ASSETS, WorldAction):
            rows = []
            for row in data:
                if row['model'] != model._meta.label_lower:
                    continue
                fields = row['fields']
                rows.append({field.attname: row['pk'] if field.primary_key else fields[field.name]
                             for field in model._meta.fields})
            values[model] = sorted(rows, key=lambda row: str(row['id']))
        result = {}
        for owner in owners:
            if owner not in checkpoints or owner not in catalogs:
                raise SyncError('炼金快照缺少目录或完整性事实')
            groups = {'catalog': ([{key: row[key] for key in ('id', 'rules', 'item_icons')}
                                   for row in values[AlchemyCatalog] if row['id'] == owner], ())}
            for model in ASSETS:
                groups[model.__name__] = ([row for row in values[model] if row['owner_id'] == owner], dates_for(model))
            plans = [{key: row[key] for key in ('id', 'actor_id', 'snapshot')} for row in values[WorldAction]
                     if row['snapshot'].get('alchemy') and row['snapshot'].get('owner_id') == owner
                     and row['snapshot'].get('plan') and row['snapshot']['plan'][0]['rule'].get('quality_rules', {}).get('version') == 1]
            if plans:
                groups['quality_plans'] = (plans, ())
            groups['energy'] = ([{key: row[key] for key in ENERGY_FIELDS} for row in values[WorldAction]
                                 if row['snapshot'].get('alchemy_energy') and row['snapshot'].get('owner_id') == owner], ('consumed_at',))
            raw = {key: hash_rows(rows, dates, normalize=False) for key, (rows, dates) in groups.items()}
            normalized = {key: hash_rows(rows, dates) for key, (rows, dates) in groups.items()}
            if checkpoints[owner] != raw and checkpoints[owner] != normalized:
                raise SyncError('炼金原始快照完整性不一致')
            result[owner] = normalized
        return result
    except (KeyError, TypeError, ValueError) as exc:
        raise SyncError('炼金原始快照字段缺失或无效') from exc
