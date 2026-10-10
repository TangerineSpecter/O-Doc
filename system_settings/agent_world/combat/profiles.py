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
    item = equipment.generate(catalog, 'equip.sword', 1, 'white', random.Random(agent.pk), starter=True)
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


def adopt_catalog(profile,catalog):
    if profile.catalog_id==catalog.version:return
    profile.progression={**profile.progression,'skills':catalog.learned(profile.progression['job'],profile.progression['level'])}
    profile.catalog_id=catalog.version
    derived=stats(profile,catalog)
    profile.hp,profile.mp=min(profile.hp,derived['hp_max']),min(profile.mp,derived['mp_max'])
    profile.save()
    append(profile,'catalog:'+profile.pk+':'+catalog.version,'catalog',{'catalog_id':catalog.version,'skills':profile.progression['skills']})


def idle(profile):
    if Exploration.objects.filter(actor_id=profile.pk, status__in=OPEN).exists():
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
    for slot, identity in changes.items():
        if slot not in ('weapon','head','body','hands','feet','accessory'):
            raise ValueError('未知装备部位')
        if identity is None:
            profile.loadout.pop(slot, None)
            continue
        item = EquipmentInstance.objects.filter(pk=identity, actor_id=profile.pk, owner_id=owner, sold=False).first()
        if not item or item.snapshot['slot'] != slot or not equipment.allowed(catalog,item.template_id,profile.progression['job'],profile.progression['level'],item.snapshot['level']):
            raise ValueError('装备不属于居民或不满足穿戴条件')
        profile.loadout[slot] = identity
    derived = stats(profile,catalog)
    profile.hp, profile.mp = min(profile.hp,derived['hp_max']), min(profile.mp,derived['mp_max'])
    profile.save()
    append(profile,key,'equip',{'arguments':changes,'loadout':profile.loadout})
    return profile


@guarded
@transaction.atomic
def promote(owner, agent, key, job):
    if replay(agent.pk,key,'promote',job):
        return CombatProfile.objects.get(pk=agent.pk)
    profile = ensure(owner,agent)
    idle(profile)
    catalog = current(profile.catalog_id)
    profile.progression = attributes.promote(catalog,profile.progression,job)
    for slot, identity in list(profile.loadout.items()):
        item = EquipmentInstance.objects.get(pk=identity)
        if not equipment.allowed(catalog,item.template_id,job,profile.progression['level'],item.snapshot['level']):
            del profile.loadout[slot]
    if 'weapon' not in profile.loadout:
        template = next(r['equipment_id'] for r in catalog.tables['equipment_professions'] if r['profession_id']==job and catalog.row('equipment_templates',r['equipment_id'])['slot']=='weapon')
        item = equipment.generate(catalog,template,int(catalog.row('professions',job)['required_level']),'white',random.Random(key),starter=True)
        gear = EquipmentInstance.objects.create(pk='promotion:'+hashlib.sha256(key.encode()).hexdigest()[:54],owner_id=owner,actor_id=agent.pk,catalog_id=catalog.version,template_id=template,snapshot=item,bound=True)
        profile.loadout['weapon'] = gear.pk
    derived = stats(profile,catalog)
    profile.hp, profile.mp = min(profile.hp,derived['hp_max']),min(profile.mp,derived['mp_max'])
    profile.save()
    append(profile,key,'promote',{'arguments':job,'progression':profile.progression,'loadout':profile.loadout,'catalog_id':catalog.version})
    return profile


def preview_equipment(profile,changes):
    if not isinstance(changes,dict):raise ValueError('换装预览必须按部位提供装备 ID')
    from copy import copy
    result=copy(profile);result.loadout=dict(profile.loadout)
    catalog=current(profile.catalog_id)
    for slot,identity in changes.items():
        if slot not in ('weapon','head','body','hands','feet','accessory'):raise ValueError('未知装备部位')
        if identity is None:
            result.loadout.pop(slot,None)
            continue
        item=EquipmentInstance.objects.filter(pk=identity,actor_id=profile.pk,sold=False).first()
        if not item or item.snapshot['slot']!=slot or not equipment.allowed(catalog,item.template_id,profile.progression['job'],profile.progression['level'],item.snapshot['level']):raise ValueError('装备不满足穿戴条件')
        result.loadout[slot]=identity
    return stats(result,catalog)
