"""Combat NPC trades are ordinary market-session transactions."""
from decimal import Decimal
from .models import EquipmentInstance, CombatProfile
from .profiles import idle
from .store import current
from .facts import append
from ..inventory_stock import add_stock, take_stock


def transact(owner,agent,key,operation,change_money,at):
    profile=CombatProfile.objects.select_for_update().filter(pk=agent.pk,owner_id=owner).first()
    if not profile:
        from .profiles import ensure
        profile=ensure(owner,agent)
    catalog=current(profile.catalog_id)
    kind=operation['kind']
    count=operation.get('quantity',1)
    if type(count)is not int or not 1<=count<=99:raise ValueError('交易数量须为 1 至 99')
    if kind=='buy_potion':
        if count>20:raise ValueError('单次药剂采购最多 20 瓶')
        row=catalog.row('potions',operation.get('potion_id'))
        if row['enabled']!='1' or int(row['required_level'])>profile.progression['level']:raise ValueError('药剂未开放')
        amount=Decimal(row['purchase_price'])*count
        change_money(agent,-amount,key,at)
        item=add_stock(agent.pk,owner,agent.name,'combat.'+row['id'],count,row['name'],'combat_potion',row['purchase_price'],key)
        return {'name':row['name'],'quantity':count,'total':str(amount),'item_id':item.pk,'deltas':[{'actor_id':agent.pk,'amount':str(-amount)}]}
    idle(profile)
    if kind=='sell_combat_material':
        row=catalog.row('materials',operation.get('material_id'))
        take_stock(agent.pk,owner,'combat.'+row['id'],count)
        amount=Decimal(row['sale_price'])*count
        result={'name':row['name'],'quantity':count,'total':str(amount)}
    elif kind=='sell_combat_equipment':
        item=EquipmentInstance.objects.select_for_update().filter(pk=operation.get('equipment_id'),owner_id=owner,actor_id=agent.pk,sold=False).first()
        if not item or item.bound or item.locked or item.pk in profile.loadout.values():raise ValueError('装备不可出售：已穿戴、收藏或绑定')
        if count!=1:raise ValueError('装备只能单件出售')
        amount=item.value;item.sold=True;item.save()
        result={'name':item.snapshot['name'],'quantity':1,'total':str(amount)}
    else:raise ValueError('未知战斗商店操作')
    change_money(agent,amount,key,at)
    return {**result,'deltas':[{'actor_id':agent.pk,'amount':str(amount)}]}


def record(agent,key,operation,result):
    if operation['kind'] in ('buy_potion','sell_combat_material','sell_combat_equipment'):
        append(CombatProfile.objects.get(pk=agent.pk),key+':combat','trade',{'arguments':operation,'transaction_id':key,'result':result})
