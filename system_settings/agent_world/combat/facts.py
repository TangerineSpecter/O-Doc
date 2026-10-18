"""Append-only provenance; one chain serializes all changes for a resident."""
from .models import CombatFact, CombatIntegrity, CombatProfile, EquipmentInstance, Exploration, CombatEncounter
from .store import digest


def frame(actor):
    profile = CombatProfile.objects.filter(pk=actor).values('id','owner_id','catalog_id','progression','loadout','hp','mp','loot_progress').first()
    fields = ['id','catalog_id','template_id','snapshot','value','bound','locked','sold']
    if CombatFact.objects.filter(actor_id=actor, kind='checkpoint').exists():
        fields.append('rules')
    equipment = list(EquipmentInstance.objects.filter(actor_id=actor).order_by('id').values(*fields))
    # Decimal converted once, identically to snapshot serialization.
    for row in equipment:
        row['value'] = str(row['value'])
    runs = list(Exploration.objects.filter(actor_id=actor).order_by('id').values('id','catalog_id','status','phase','elapsed_seconds','revision','snapshot','state','result'))
    encounters=list(CombatEncounter.objects.filter(actor_id=actor).order_by('id').values('id','exploration_id','number','monster','result'))
    return {'profile': profile, 'equipment': equipment, 'runs': runs,'encounters':encounters}


def append(profile, key, kind, payload, run=None):
    old = CombatFact.objects.filter(pk=key).first()
    if old:
        extra = set(old.payload) - set(payload)
        if (old.actor_id != profile.pk or old.kind != kind or extra - {'progression_after', 'equipment_after'} or
                any(old.payload.get(name) != value for name, value in payload.items())):
            raise ValueError('请求键已用于不同操作')
        return old
    chain, _ = CombatIntegrity.objects.select_for_update().get_or_create(pk=profile.pk, defaults={'owner_id': profile.owner_id})
    payload = dict(payload)
    if kind in ('initialize', 'catalog', 'promote') or (kind == 'round' and any(
            event.get('kind') == 'kill' for event in payload.get('events', []))):
        from copy import deepcopy
        payload['progression_after'] = deepcopy(profile.progression)
    equipment_ids = ([payload['equipment_id']] if kind == 'initialize' else list(payload.get('loadout', {}).values())
                     if kind == 'promote' else [reward['equipment_id'] for event in payload.get('events', [])
                         if event.get('kind') == 'kill' for reward in event.get('rewards', []) if reward.get('kind') == 'equipment']
                     if kind == 'round' else [])
    if equipment_ids:
        payload['equipment_after'] = {item.pk: {'snapshot': item.snapshot, 'rules': item.rules}
            for item in EquipmentInstance.objects.filter(pk__in=equipment_ids, actor_id=profile.pk)}
    content = {'id':key, 'actor_id':profile.pk, 'owner_id':profile.owner_id, 'sequence':chain.head+1,
               'kind':kind, 'exploration_id':run.pk if run else '', 'elapsed_seconds':run.elapsed_seconds if run else 0,
               'payload':payload, 'previous_hash':chain.digest}
    row = CombatFact.objects.create(**content, digest=digest(content))
    chain.head, chain.digest, chain.frame = row.sequence, row.digest, digest(frame(profile.pk))
    chain.save()
    return row


def replay(actor, key, kind, arguments):
    row = CombatFact.objects.filter(pk=key).first()
    if row and (row.actor_id != actor or row.kind != kind or row.payload.get('arguments') != arguments):
        raise ValueError('请求键已用于不同操作')
    return row
