"""Transactional sealing and runtime catalog retention. No historical records are deleted."""
import json
from django.core import serializers
from django.db import transaction
from .models import CombatCatalog, CombatProfile, CombatFact, CombatIntegrity, EquipmentInstance, Exploration, CombatEncounter
from .history_snapshot import normalize_source, OPEN
from ..farm_gate import guarded


@guarded
@transaction.atomic
def freeze_legacy() -> None:
    pending = list(CombatProfile.objects.exclude(pk__in=CombatFact.objects.filter(kind='checkpoint').values('actor_id'))
                   .select_for_update().order_by('pk'))
    if not pending:
        return
    actors = [profile.pk for profile in pending]
    from ..travel_models import AgentInventoryItem
    from ..market_models import MarketListing, MarketTransaction
    from ..alchemy_models import AlchemyOperation
    owners = {profile.owner_id for profile in pending}
    models = (CombatCatalog, CombatProfile, CombatFact, CombatIntegrity, EquipmentInstance, Exploration,
              CombatEncounter, AgentInventoryItem, MarketListing, MarketTransaction, AlchemyOperation)
    values = []
    for model in models:
        query = model.objects.all()
        if model == CombatCatalog:
            pass
        elif model == MarketListing:
            query = query.filter(owner_id__in=owners)
        elif model in (CombatProfile, CombatIntegrity):
            query = query.filter(pk__in=actors)
        else:
            query = query.filter(actor_id__in=actors)
        values.extend(query)
    data = json.loads(serializers.serialize('json', values))
    result = normalize_source(data)
    for row in result:
        fields, identity = row['fields'], str(row['pk'])
        if row['model'] == 'system_settings.equipmentinstance':
            EquipmentInstance.objects.filter(pk=identity).update(rules=fields['rules'])
        elif row['model'] == 'system_settings.exploration':
            run = Exploration.objects.get(pk=identity)
            if run.snapshot != fields['snapshot']:
                run.snapshot = fields['snapshot']
                run.save(update_fields=['snapshot'])
        elif row['model'] == 'system_settings.combatfact' and fields['kind'] == 'checkpoint':
            from django.utils.dateparse import parse_datetime
            CombatFact.objects.get_or_create(pk=identity, defaults={**fields, 'created_at': parse_datetime(fields['created_at'])})
        elif row['model'] == 'system_settings.combatintegrity':
            chain = CombatIntegrity.objects.get(pk=identity)
            chain.head, chain.digest, chain.frame = fields['head'], fields['digest'], fields['frame']
            chain.save(update_fields=['head', 'digest', 'frame'])
    # QuerySet.update above must also create revisions for the new persistent rules.
    for item in EquipmentInstance.objects.filter(actor_id__in=actors):
        item.save(update_fields=['rules'])


def runtime_catalog_ids() -> set[str]:
    newest = CombatCatalog.objects.order_by('-created_at', '-pk').values_list('pk', flat=True).first()
    return ({newest} if newest else set()) | set(CombatProfile.objects.values_list('catalog_id', flat=True)) | set(
        Exploration.objects.filter(status__in=OPEN).values_list('catalog_id', flat=True))


def prepare_fact_restore(data: list[dict]) -> None:
    """Restore each already-validated stream atomically, including migrated sequence numbers."""
    from django.db import connection
    if not connection.in_atomic_block:
        raise RuntimeError('恢复战斗事实必须位于事务内')
    streams = {}
    for row in data:
        if row['model'] == 'system_settings.combatfact':
            fields = row['fields']
            streams.setdefault((fields['actor_id'], fields['owner_id']), {})[str(row['pk'])] = fields['sequence']
    for (actor, owner), expected in streams.items():
        existing = CombatFact.objects.select_for_update().filter(actor_id=actor)
        if existing.exclude(owner_id=owner).exists():
            raise ValueError('战斗事实恢复的所属账号不一致')
        if dict(existing.values_list('pk', 'sequence')) != expected:
            existing.delete()


@guarded
@transaction.atomic
def maintain(catalog) -> None:
    freeze_legacy()
    from .profiles import adopt_catalog
    for profile in CombatProfile.objects.exclude(catalog_id=catalog.version).exclude(
            pk__in=Exploration.objects.filter(status__in=OPEN).values('actor_id')).select_for_update().order_by('pk'):
        adopt_catalog(profile, catalog)


def summary(owner: str) -> dict:
    profiles = CombatProfile.objects.filter(owner_id=owner)
    checkpoints = CombatFact.objects.filter(owner_id=owner, kind='checkpoint')
    active = Exploration.objects.filter(owner_id=owner, status__in=OPEN)
    needed = runtime_catalog_ids()
    rows = list(CombatCatalog.objects.order_by('-created_at', '-pk'))
    return {'current_version': rows[0].pk if rows else '', 'catalog_count': len(rows),
        'sync_catalog_count': sum(row.pk in needed for row in rows),
        'frozen_residents': checkpoints.values('actor_id').distinct().count(), 'resident_count': profiles.count(),
        'frozen_explorations': Exploration.objects.filter(owner_id=owner, snapshot__history_frozen=1).count(),
        'active_explorations': active.count(),
        'versions': [{'version': row.pk, 'bytes': len(json.dumps(row.tables, ensure_ascii=False).encode()),
            'synchronized': row.pk in needed, 'active_explorations': active.filter(catalog_id=row.pk).count(),
            'residents': profiles.filter(catalog_id=row.pk).count()} for row in rows]}
