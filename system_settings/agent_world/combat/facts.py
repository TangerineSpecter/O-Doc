"""Append-only provenance; one chain serializes all changes for a resident."""
from .models import CombatFact, CombatIntegrity, CombatProfile, EquipmentInstance, Exploration, CombatEncounter
from .store import digest


def frame(actor):
    profile = CombatProfile.objects.filter(pk=actor).values('id','owner_id','catalog_id','progression','loadout','hp','mp','loot_progress').first()
    equipment = list(EquipmentInstance.objects.filter(actor_id=actor).order_by('id').values('id','catalog_id','template_id','snapshot','value','bound','locked','sold'))
    # Decimal converted once, identically to snapshot serialization.
    for row in equipment:
        row['value'] = str(row['value'])
    runs = list(Exploration.objects.filter(actor_id=actor).order_by('id').values('id','catalog_id','status','phase','elapsed_seconds','revision','snapshot','state','result'))
    encounters=list(CombatEncounter.objects.filter(actor_id=actor).order_by('id').values('id','exploration_id','number','monster','result'))
    return {'profile': profile, 'equipment': equipment, 'runs': runs,'encounters':encounters}


def append(profile, key, kind, payload, run=None):
    old = CombatFact.objects.filter(pk=key).first()
    if old:
        if old.actor_id != profile.pk or old.kind != kind or old.payload != payload:
            raise ValueError('请求键已用于不同操作')
        return old
    chain, _ = CombatIntegrity.objects.select_for_update().get_or_create(pk=profile.pk, defaults={'owner_id': profile.owner_id})
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
