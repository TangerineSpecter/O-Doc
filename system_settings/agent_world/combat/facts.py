"""Append-only provenance; one chain serializes all changes for a resident."""
import hashlib
import json
from contextlib import ExitStack
from itertools import islice

from .models import CombatFact, CombatIntegrity, CombatProfile, EquipmentInstance, Exploration, CombatEncounter
from .store import digest


def _frame_parts(actor):
    profile = CombatProfile.objects.filter(pk=actor).values('id','owner_id','catalog_id','progression','loadout','hp','mp','loot_progress').first()
    fields = ['id','catalog_id','template_id','snapshot','value','bound','locked','sold']
    if CombatFact.objects.filter(actor_id=actor, kind='checkpoint').exists():
        fields.append('rules')
    def equipment():
        rows = EquipmentInstance.objects.filter(actor_id=actor).order_by('id').values(*fields, 'retained_for_adventure')
        for row in rows.iterator(chunk_size=500):
            # Decimal converted once, identically to snapshot serialization.
            row['value'] = str(row['value'])
            # Omitting false preserves hashes made before the field existed.
            if not row['retained_for_adventure']:
                row.pop('retained_for_adventure')
            yield row
    runs = Exploration.objects.filter(actor_id=actor).order_by('id').values(
        'id','catalog_id','status','phase','elapsed_seconds','revision','snapshot','state','result')
    encounters = CombatEncounter.objects.filter(actor_id=actor).order_by('id').values(
        'id','exploration_id','number','monster','result')
    return profile, equipment(), runs.iterator(chunk_size=500), encounters.iterator(chunk_size=500)


def frame(actor):
    profile, equipment, runs, encounters = _frame_parts(actor)
    return {'profile': profile, 'equipment': list(equipment), 'runs': list(runs), 'encounters': list(encounters)}


def frame_digest(actor):
    """Hash the exact legacy frame encoding without retaining all history in memory."""
    profile, equipment, runs, encounters = _frame_parts(actor)
    with ExitStack() as stack:
        for rows in (equipment, runs, encounters):
            stack.callback(rows.close)
        return _digest_frame_parts(profile, equipment, runs, encounters)


def _digest_frame_parts(profile, equipment, runs, encounters):
    encoder = json.JSONEncoder(sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    result = hashlib.sha256()

    def write(value):
        result.update(encoder.encode(value).encode())

    # This order matches json.dumps(sort_keys=True) used by store.digest.
    result.update(b'{')
    for index, (key, value) in enumerate((('encounters', encounters), ('equipment', equipment),
                                          ('profile', profile), ('runs', runs))):
        if index:
            result.update(b',')
        write(key)
        result.update(b':')
        if key == 'profile':
            write(value)
            continue
        result.update(b'[')
        first = True
        while batch := list(islice(value, 500)):
            if not first:
                result.update(b',')
            # Encoding a bounded array uses the fast JSON encoder without
            # assembling the entire historical frame in memory.
            result.update(encoder.encode(batch)[1:-1].encode())
            first = False
        result.update(b']')
    result.update(b'}')
    return result.hexdigest()


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
    if kind in ('initialize', 'catalog', 'promote', 'reselect') or (kind == 'round' and any(
            event.get('kind') == 'kill' for event in payload.get('events', []))):
        from copy import deepcopy
        payload['progression_after'] = deepcopy(profile.progression)
    equipment_ids = ([payload['equipment_id']] if kind in ('initialize', 'tournament_reward', 'forge') else list(payload.get('loadout', {}).values())
                     if kind in ('promote', 'reselect') else [reward['equipment_id'] for event in payload.get('events', [])
                         if event.get('kind') == 'kill' for reward in event.get('rewards', []) if reward.get('kind') == 'equipment']
                     if kind == 'round' else [])
    if equipment_ids:
        payload['equipment_after'] = {item.pk: {'snapshot': item.snapshot, 'rules': item.rules}
            for item in EquipmentInstance.objects.filter(pk__in=equipment_ids, actor_id=profile.pk)}
    content = {'id':key, 'actor_id':profile.pk, 'owner_id':profile.owner_id, 'sequence':chain.head+1,
               'kind':kind, 'exploration_id':run.pk if run else '', 'elapsed_seconds':run.elapsed_seconds if run else 0,
               'payload':payload, 'previous_hash':chain.digest}
    row = CombatFact.objects.create(**content, digest=digest(content))
    chain.head, chain.digest, chain.frame = row.sequence, row.digest, frame_digest(profile.pk)
    chain.save()
    return row


def replay(actor, key, kind, arguments):
    row = CombatFact.objects.filter(pk=key).first()
    if row and (row.actor_id != actor or row.kind != kind or row.payload.get('arguments') != arguments):
        raise ValueError('请求键已用于不同操作')
    return row
