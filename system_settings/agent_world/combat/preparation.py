"""Only preparation and post-return promotion call the resident's model."""
from contextlib import nullcontext
import hashlib
from django.db import transaction
from .models import Exploration, CombatProfile, CombatRuntime
from .profiles import equip, promote, stats
from .store import current
from .explorations import depart, finish, TERMINAL
from ..farm_gate import farm_gate
from ..inventory_stock import stock_quantity
from ..life_planner import ask
from utils.token_usage import usage_scope


def context(run: Exploration) -> dict:
    from system_settings.models import Agent
    agent=Agent.objects.get(pk=run.actor_id)
    profile=CombatProfile.objects.get(pk=run.actor_id)
    catalog=current(run.catalog_id)
    from .queries import profile_view
    return {'constraints':run.snapshot['constraints'],'adventure':profile_view(run.owner_id,agent),
        'dungeons':catalog.tables['dungeons'],'styles':catalog.tables['styles'],'potions':catalog.tables['potions'],
        'balance':str(agent.money),'inventory':{r['id']:stock_quantity(agent.pk,run.owner_id,'combat.'+r['id']) for r in catalog.tables['potions']},
        'energy_costs':{'30min':22,'60min':34,'120min':58,'market_entry':5}}


def validate(run: Exploration,plan: dict) -> dict:
    if not isinstance(plan,dict) or set(plan)-{'dungeon_id','style_id','duration_seconds','equipment','purchases','potions','reason'}:
        raise ValueError('探索准备计划格式无效')
    catalog=current(run.catalog_id)
    for field,table in (('dungeon_id','dungeons'),('style_id','styles')):
        if catalog.row(table,plan.get(field)).get('enabled','1')!='1':raise ValueError('计划引用停用配置')
    if type(plan.get('duration_seconds'))is not int or plan['duration_seconds'] not in (1800,3600,7200):raise ValueError('计划时长无效')
    for key,value in run.snapshot['constraints'].items():
        if plan.get(key)!=value:raise ValueError('准备计划未遵守用户约束')
    for field in ('potions','purchases'):
        values=plan.get(field,{})
        if not isinstance(values,dict):raise ValueError('药剂列表必须为对象')
        for sid,count in values.items():
            row=catalog.row('potions',sid)
            if type(count)is not int or not 0<=count<=99 or row['enabled']!='1' or int(row['required_level'])>CombatProfile.objects.get(pk=run.actor_id).progression['level']:raise ValueError('药剂等级或数量无效')
    if sum(plan.get('potions',{}).values())>int(catalog.rules['potion_carry_cap']):raise ValueError('每次最多携带 20 瓶药剂')
    if not isinstance(plan.get('equipment',{}),dict):raise ValueError('换装必须为对象')
    if plan.get('equipment'):
        from .profiles import preview_equipment
        preview_equipment(CombatProfile.objects.get(pk=run.actor_id),plan['equipment'])
    return plan


def prepare(run_id: str, *, planner=None) -> Exploration:
    from system_settings.models import Agent
    from ..market_sessions import enter, close_session
    from ..market_tools import call_market_tool
    from ..life_models import LifeItem
    from ..life_scope import life_scope
    from ..life_context import build_context
    run=Exploration.objects.get(pk=run_id)
    if run.status!='preparing':return run
    agent=Agent.objects.get(pk=run.actor_id)
    item=LifeItem.objects.filter(pk=run.life_item_id).first()
    scope=life_scope(item,build_context(run.owner_id,agent,item)) if item else nullcontext()
    session=None
    try:
        with scope:
            # Persist the proposed preparation before any paid transaction. Retry never asks for a new plan.
            plan=run.snapshot.get('prepared_plan')
            if plan is None:
                with usage_scope(agent=agent,purpose='exploration_prepare'):
                    plan=(planner or ask)(agent,'为迷宫探索准备出发。只决定出发地点、时长、风格、换装、药剂采购和携带，不参与战斗。遵守constraints，返回 JSON: {dungeon_id, duration_seconds, style_id, equipment:{部位:装备ID}, purchases:{药剂ID:数量}, potions:{药剂ID:携带数量}, reason}。无需采购时purchases为空。考虑余额、全程体力和推荐等级。',context(run))
                validate(run,plan)
                with farm_gate(),transaction.atomic():
                    locked=Exploration.objects.select_for_update().get(pk=run_id)
                    if locked.status!='preparing' or not CombatRuntime.objects.filter(pk=run_id,authorized=True).exists():return locked
                    locked.snapshot={**locked.snapshot,'prepared_plan':plan};locked.revision+=1;locked.save()
                    from .facts import append
                    append(CombatProfile.objects.get(pk=run.actor_id),run.pk+':plan','plan',{'plan':plan},locked)
            with farm_gate(),transaction.atomic():
                locked=Exploration.objects.select_for_update().get(pk=run_id)
                if locked.status!='preparing' or not CombatRuntime.objects.filter(pk=run_id,authorized=True).exists():return locked
                equip(run.owner_id,agent,run.pk+':equip',plan.get('equipment',{}),preparing=run.pk)
            purchases={sid:n for sid,n in plan.get('purchases',{}).items() if n}
            if purchases:
                from .schedule import PREPARING
                marker=PREPARING.set(run.pk)
                try:session=enter(run.owner_id,agent,hashlib.sha256((run.pk+':market').encode()).hexdigest(),mode='mcp')
                finally:PREPARING.reset(marker)
                for index,(sid,n) in enumerate(purchases.items()):
                    with farm_gate():
                        if not Exploration.objects.filter(pk=run.pk,status='preparing').exists() or not CombatRuntime.objects.filter(pk=run.pk,authorized=True).exists():raise ValueError('准备期间探索已取消')
                        call_market_tool('buy_combat_potion',{'request_id':hashlib.sha256((run.pk+f':purchase:{index}').encode()).hexdigest(),'session_id':session.pk,'potion_id':sid,'quantity':n},agent)
                close_session(session,'探索补给采购完成');session=None
            return depart(run.pk,plan)
    except Exception as exc:
        finish(run.pk,'failed','准备失败：'+str(exc)[:400])
        raise
    finally:
        if session:close_session(session,'准备结束，已成交采购保留')


def promotion(run_id: str, *, planner=None, require_permit: bool=False) -> None:
    from system_settings.models import Agent
    run=Exploration.objects.get(pk=run_id)
    if run.status not in TERMINAL:return
    agent=Agent.objects.filter(pk=run.actor_id).first()
    if not agent:return
    for _ in range(3):
        if require_permit and not CombatRuntime.objects.filter(pk=run_id,requests__promotion_allowed=True).exists():return
        profile=CombatProfile.objects.get(pk=run.actor_id)
        catalog=current(profile.catalog_id)
        options=[row for row in catalog.tables['professions'] if row['parent_id']==profile.progression['job'] and int(row['required_level'])<=profile.progression['level'] and row['enabled']=='1']
        if not options:return
        original_job=profile.progression['job']
        with usage_scope(agent=agent,purpose='combat_promotion'):
            plan=(planner or ask)(agent,'返回后请选择战斗职业分支，返回 {job_id,reason}；只能选择options中的直接分支。',{'progression':profile.progression,'options':options,'report':run.result.get('report')})
        if not isinstance(plan,dict) or plan.get('job_id') not in {row['id'] for row in options}:raise ValueError('转职选择不符合可选直接分支')
        with farm_gate(),transaction.atomic():
            if require_permit and not CombatRuntime.objects.filter(pk=run_id,requests__promotion_allowed=True).exists():return
            if CombatProfile.objects.get(pk=run.actor_id).progression['job']!=original_job:return
            promote(run.owner_id,agent,run.pk+':promote:'+original_job,plan['job_id'])
