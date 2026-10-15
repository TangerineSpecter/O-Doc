"""Resident growth, recovery and immutable equipment ownership."""
import random
from datetime import timedelta
import hashlib
from django.db import transaction
from .models import CombatProfile, EquipmentInstance, Exploration
from .store import current
from . import attributes, equipment
from .facts import append, replay
from ..farm_gate import guarded
from ..life_time import local_time, storage_time

OPEN = ('preparing', 'active', 'paused', 'settling')
EQUIPMENT_SLOTS = {'weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'accessory', 'ring_1', 'ring_2'}


def two_handed(item, catalog) -> bool:
    if not item:
        return False
    grip = item.snapshot.get('grip')
    if not grip:
        grip = catalog.row('equipment_templates', item.template_id).get('grip', '')
    return grip == 'two_handed'


def apply_loadout_changes(profile, catalog, changes, owner):
    candidate = dict(profile.loadout)
    for slot, identity in changes.items():
        if slot not in EQUIPMENT_SLOTS:
            raise ValueError('未知装备部位')
        if identity is None:
            candidate.pop(slot, None)
            continue
        item = EquipmentInstance.objects.filter(pk=identity, actor_id=profile.pk, owner_id=owner, sold=False).first()
        if (not item or not equipment.loadout_slot_matches(catalog, item.template_id, item.snapshot, slot) or
                not equipment.allowed(catalog, item.template_id, profile.progression['job'],
                                      profile.progression['level'], item.snapshot['level'])):
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
    for slot, identity in list(profile.loadout.items()):
        item = EquipmentInstance.objects.get(pk=identity)
        if not equipment.allowed(catalog,item.template_id,job,profile.progression['level'],item.snapshot['level']):
            del profile.loadout[slot]
    if job == 'job.mage' and 'equip.mage_staff' in catalog.index['equipment_templates']:
        weapon = EquipmentInstance.objects.filter(pk=profile.loadout.get('weapon'), actor_id=profile.pk, sold=False).first()
        if weapon and weapon.template_id == 'equip.training_sword':
            profile.loadout.pop('weapon', None)
    weapon = EquipmentInstance.objects.filter(pk=profile.loadout.get('weapon'), actor_id=profile.pk, sold=False).first()
    if two_handed(weapon, catalog):
        profile.loadout.pop('offhand', None)
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


def preview_equipment(profile,changes):
    if not isinstance(changes,dict):raise ValueError('换装预览必须按部位提供装备 ID')
    from copy import copy
    result=copy(profile);result.loadout=dict(profile.loadout)
    catalog=current(profile.catalog_id)
    result.loadout=apply_loadout_changes(profile,catalog,changes,profile.owner_id)
    return stats(result,catalog)
