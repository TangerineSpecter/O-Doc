"""Resident growth, recovery and immutable equipment ownership."""
import random
from copy import copy
from datetime import timedelta
import hashlib
from django.db import transaction
from .models import CombatProfile, EquipmentInstance, Exploration
from .store import current
from . import attributes, equipment
from . import equipment_snapshot
from .facts import append, replay
from ..farm_gate import guarded
from ..life_time import local_time, storage_time

OPEN = ('preparing', 'active', 'paused', 'settling')
EQUIPMENT_SLOTS = {'weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'accessory', 'ring_1', 'ring_2'}


def two_handed(item, catalog) -> bool:
    if not item:
        return False
    grip = item.rules['grip']
    return grip == 'two_handed'


def apply_loadout_changes(profile, catalog, changes, owner):
    candidate = dict(profile.loadout)
    for slot, identity in changes.items():
        if slot not in EQUIPMENT_SLOTS:
            if identity is None and slot in candidate:
                # Let an explicit unequip remove a stale unsupported slot key on this profile.
                candidate.pop(slot)
                continue
            raise ValueError('未知装备部位')
        if identity is None:
            candidate.pop(slot, None)
            continue
        item = EquipmentInstance.objects.filter(pk=identity, actor_id=profile.pk, owner_id=owner, sold=False).first()
        already_worn_here = profile.loadout.get(slot) == identity
        if not item:
            raise ValueError('装备不属于居民或不满足穿戴条件')
        if not already_worn_here:
            from ..market_models import MarketListing
            if MarketListing.objects.filter(owner_id=owner, status='active',
                    item__source__kind='combat_equipment', item__source__equipment_id=item.pk).exists():
                raise ValueError('装备正在居民集市挂牌，请先撤回')
        if not equipment_snapshot.slot_matches(item.snapshot, item.rules, slot):
            raise ValueError('装备不属于居民或不满足穿戴条件')
        if not already_worn_here and not equipment_snapshot.permitted(
                item.snapshot, item.rules, profile.progression['job'], profile.progression['level']):
            raise ValueError('装备不属于居民或不满足穿戴条件')
        for current_slot, current_identity in list(candidate.items()):
            if current_identity == identity and current_slot != slot:
                candidate.pop(current_slot)
        candidate[slot] = identity

    if len(set(candidate.values())) != len(candidate):
        raise ValueError('同一件装备不能同时占用多个装备槽')
    weapon = EquipmentInstance.objects.filter(pk=candidate.get('weapon'), actor_id=profile.pk, sold=False).first()
    if two_handed(weapon, catalog):
        if changes.get('offhand') is not None:
            raise ValueError('双手武器不能同时装备副手')
        candidate.pop('offhand', None)
    return candidate


def wearing(profile):
    by_id = {r.pk:r for r in EquipmentInstance.objects.filter(pk__in=profile.loadout.values(), actor_id=profile.pk, sold=False)}
    if len(by_id) != len(profile.loadout):
        raise ValueError('穿戴装备来源缺失')
    return [by_id[key].snapshot for key in profile.loadout.values()]


def _job_loadout(profile, catalog, job):
    """Keep only the slots the new profession may wear, then drop an invalid offhand."""
    loadout = {}
    for slot, identity in profile.loadout.items():
        item = EquipmentInstance.objects.filter(pk=identity, actor_id=profile.pk, sold=False).first()
        if not item:
            # A missing slot record is corrupt data, not an unwearable item; never drop it silently.
            raise ValueError('穿戴装备来源缺失')
        if equipment_snapshot.permitted(item.snapshot, item.rules, job, profile.progression['level']):
            loadout[slot] = identity
    weapon = EquipmentInstance.objects.filter(pk=loadout.get('weapon'), actor_id=profile.pk, sold=False).first()
    if 'job.bard' in catalog.path(job) and (not weapon or weapon.snapshot.get('equipment_type')!='instrument'):
        loadout.pop('weapon',None)
        loadout.pop('offhand',None)
    if two_handed(weapon, catalog):
        loadout.pop('offhand', None)
    return loadout


def _reselect_weapon(catalog, job, key='') -> dict:
    """Shared replacement snapshot; starter weapon attributes do not depend on the seed."""
    try:
        level = int(catalog.row('professions', job)['required_level'])
        template = equipment.promotion_weapon(catalog, job, level)
        return equipment.generate(catalog, template, level, 'white', random.Random(key), starter=True)
    except ValueError as exc:
        raise ValueError('新职业在当前等级没有可补发的武器，请先装备可用武器') from exc


def _grant_weapon(owner, agent, catalog, job, key):
    item = _reselect_weapon(catalog, job, key)
    gear = EquipmentInstance.objects.create(pk='reselect:' + hashlib.sha256(key.encode()).hexdigest()[:54],
        owner_id=owner, actor_id=agent.pk, catalog_id=catalog.version, template_id=item['template_id'], snapshot=item, bound=True)
    return gear.pk


def stats(profile, catalog=None):
    return attributes.attributes(catalog or current(profile.catalog_id), profile.progression, wearing(profile))


def ensure(owner, agent, now=None):
    profile = CombatProfile.objects.select_for_update().filter(pk=agent.pk).first()
    if profile:
        if profile.owner_id != owner:
            raise ValueError('冒险档案属于其他账号')
        return profile
    from ..life_models import LifeProfile
    identity,_=LifeProfile.objects.get_or_create(pk=agent.pk,defaults={'owner_id':owner})
    if identity.owner_id!=owner:raise ValueError('居民所属账号不一致')
    catalog = current()
    item = equipment.generate(catalog, 'equip.training_sword', 1, 'white', random.Random(agent.pk), starter=True)
    gear = EquipmentInstance.objects.create(pk='starter:'+agent.pk, owner_id=owner, actor_id=agent.pk, catalog_id=catalog.version,
        template_id=item['template_id'], snapshot=item, bound=True)
    profile = CombatProfile.objects.create(pk=agent.pk, owner_id=owner, actor_name=agent.name, catalog_id=catalog.version,
        progression=attributes.initial(), loadout={'weapon':gear.pk}, recovered_at=now or storage_time(local_time()))
    derived = stats(profile, catalog)
    profile.hp, profile.mp = derived['hp_max'], derived['mp_max']
    profile.save()
    append(profile, 'initialize:'+agent.pk, 'initialize', {'equipment_id':gear.pk, 'progression':profile.progression,'catalog_id':catalog.version})
    from .history import freeze_legacy
    freeze_legacy()
    return profile


def recover(profile, now):
    if Exploration.objects.filter(actor_id=profile.pk, status__in=OPEN).exists():
        return
    now = local_time(now)
    recovery_base=local_time(profile.recovered_at)
    last = recovery_base
    mp_blocks=max(0,int((now-last).total_seconds()//300))
    if profile.rest_until:
        if now < local_time(profile.rest_until):
            raise ValueError('倒地休息尚未结束')
        last = max(last, local_time(profile.rest_until))
        profile.hp = max(1, int(stats(profile)['hp_max']*.2))
        profile.rest_until = None
    blocks = max(0, int((now-last).total_seconds()//300))
    if blocks:
        derived = stats(profile)
        profile.hp = min(derived['hp_max'], profile.hp+max(1,int(derived['hp_max']*.05))*blocks)
        profile.recovered_at = last+timedelta(seconds=blocks*300)
    if mp_blocks:
        derived=stats(profile)
        profile.mp=min(derived['mp_max'],profile.mp+max(1,int(derived['mp_max']*.1))*mp_blocks)
        profile.recovered_at=recovery_base+timedelta(seconds=mp_blocks*300)
    profile.save()


def recover_expired_rest(profile, now=None):
    """Clear a fallen resident's elapsed rest deadline and record the recovery."""
    now = local_time(now)
    if not profile.rest_until:
        return False
    rest_until = local_time(profile.rest_until)
    if now < rest_until or Exploration.objects.filter(actor_id=profile.pk, status__in=OPEN).exists():
        return False
    recover(profile, now)
    key = 'rest:' + profile.pk + ':' + hashlib.sha256(rest_until.isoformat().encode()).hexdigest()[:24]
    append(profile, key, 'rest_recovery', {'rest_until': rest_until.isoformat(), 'hp': profile.hp, 'mp': profile.mp})
    return True


def adopt_catalog(profile,catalog):
    if profile.catalog_id==catalog.version:return
    profile.progression={**profile.progression,'skills':catalog.learned(
        profile.progression['job'],profile.progression['level'],profile.progression.get('skills'))}
    profile.catalog_id=catalog.version
    derived=stats(profile,catalog)
    profile.hp,profile.mp=min(profile.hp,derived['hp_max']),min(profile.mp,derived['mp_max'])
    profile.save()
    append(profile,'catalog:'+profile.pk+':'+catalog.version,'catalog',{'catalog_id':catalog.version,'skills':profile.progression['skills']})


def idle(profile, *, excluding=''):
    if Exploration.objects.filter(actor_id=profile.pk, status__in=OPEN).exclude(pk=excluding).exists():
        raise ValueError('探索进行中，装备和职业已固定')


@guarded
@transaction.atomic
def equip(owner, agent, key, changes, *, preparing=None):
    if not isinstance(changes,dict) or any(identity is not None and not isinstance(identity,str) for identity in changes.values()):
        raise ValueError('换装必须按部位提供装备字符串 ID')
    if replay(agent.pk,key,'equip',changes):
        return CombatProfile.objects.get(pk=agent.pk)
    profile = ensure(owner, agent)
    if not preparing or not Exploration.objects.filter(pk=preparing,actor_id=profile.pk,status='preparing').exists():
        idle(profile)
    catalog = current(profile.catalog_id)
    profile.loadout = apply_loadout_changes(profile, catalog, changes, owner)
    derived = stats(profile,catalog)
    profile.hp, profile.mp = min(profile.hp,derived['hp_max']), min(profile.mp,derived['mp_max'])
    profile.save()
    append(profile,key,'equip',{'arguments':changes,'loadout':profile.loadout})
    return profile


@guarded
@transaction.atomic
def promote(owner, agent, key, job, *, exploration_id='', reason=''):
    if replay(agent.pk,key,'promote',job):
        return CombatProfile.objects.get(pk=agent.pk)
    profile = ensure(owner,agent)
    idle(profile,excluding=exploration_id)
    catalog = current(profile.catalog_id)
    profile.progression = attributes.promote(catalog,profile.progression,job)
    profile.loadout = _job_loadout(profile, catalog, job)
    if 'weapon' not in profile.loadout:
        level = int(catalog.row('professions',job)['required_level'])
        template = equipment.promotion_weapon(catalog, job, level)
        item = equipment.generate(catalog,template,level,'white',random.Random(key),starter=True)
        gear = EquipmentInstance.objects.create(pk='promotion:'+hashlib.sha256(key.encode()).hexdigest()[:54],owner_id=owner,actor_id=agent.pk,catalog_id=catalog.version,template_id=template,snapshot=item,bound=True)
        profile.loadout['weapon'] = gear.pk
    derived = stats(profile,catalog)
    profile.hp, profile.mp = min(profile.hp,derived['hp_max']),min(profile.mp,derived['mp_max'])
    profile.save()
    append(profile,key,'promote',{'arguments':job,'reason':reason[:400],'progression':profile.progression,'loadout':profile.loadout,'catalog_id':catalog.version})
    return profile


@guarded
@transaction.atomic
def reselect(owner, agent, key, job, *, reason=''):
    """Owner-driven level-one profession change: keep level, replay growth, refit gear."""
    if replay(agent.pk,key,'reselect',job):
        return CombatProfile.objects.get(pk=agent.pk)
    profile = ensure(owner,agent)
    idle(profile)
    catalog = current(profile.catalog_id)
    previous = profile.progression['job']
    profile.progression = attributes.reselect(catalog,profile.progression,job)
    profile.loadout = _job_loadout(profile, catalog, job)
    if 'weapon' not in profile.loadout:
        profile.loadout['weapon'] = _grant_weapon(owner, agent, catalog, job, key)
    derived = stats(profile,catalog)
    profile.hp, profile.mp = min(profile.hp,derived['hp_max']),min(profile.mp,derived['mp_max'])
    profile.save()
    append(profile,key,'reselect',{'arguments':job,'from_job':previous,'reason':reason[:400],
        'progression':profile.progression,'loadout':profile.loadout,'catalog_id':catalog.version})
    return profile


def preview_reselect(profile, job):
    """Dry-run a profession change without writing facts, equipment or growth."""
    catalog = current(profile.catalog_id)
    progression = attributes.reselect(catalog, profile.progression, job)
    candidate = copy(profile)
    candidate.progression = progression
    candidate.loadout = _job_loadout(candidate, catalog, job)
    worn = wearing(candidate)
    if 'weapon' not in candidate.loadout:
        worn.append(_reselect_weapon(catalog, job))
    return {'attributes': attributes.attributes(catalog, progression, worn), 'progression': progression,
            'unequipped': sorted(slot for slot in profile.loadout if slot not in candidate.loadout)}


def preview_equipment(profile,changes):
    if not isinstance(changes,dict):raise ValueError('换装预览必须按部位提供装备 ID')
    from copy import copy
    result=copy(profile);result.loadout=dict(profile.loadout)
    catalog=current(profile.catalog_id)
    result.loadout=apply_loadout_changes(profile,catalog,changes,profile.owner_id)
    return stats(result,catalog)
