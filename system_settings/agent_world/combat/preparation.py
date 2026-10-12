"""Preparation and level-gated promotion call the resident's model."""
from contextlib import nullcontext
import hashlib
from django.db import transaction
from .models import Exploration, CombatProfile, CombatRuntime
from .facts import append
from .profiles import equip, promote, stats, wearing
from . import attributes
from .store import current
from .explorations import depart, finish, TERMINAL
from ..farm_gate import farm_gate
from ..inventory_stock import stock_quantity
from ..life_planner import ask
from utils.token_usage import usage_scope


def context(run: Exploration) -> dict:
    from system_settings.models import Agent
    from system_settings.agent_availability import require_active_agent
    agent=require_active_agent(run.actor_id)
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
    from system_settings.agent_availability import require_active_agent
    agent=require_active_agent(run.actor_id)
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
    from system_settings.agent_availability import agent_operation
    run = Exploration.objects.get(pk=run_id)
    with agent_operation(run.actor_id, promotion_run_id=run.pk):
        resume_after = _promotion(run_id, planner=planner, require_permit=require_permit)
    if resume_after:
        from .explorations import resume
        try:
            resume(run_id)
        except Exception:
            with farm_gate(),transaction.atomic():
                locked=Exploration.objects.select_for_update().filter(pk=run_id).first()
                profile=CombatProfile.objects.filter(pk=run.actor_id).first()
                if locked and profile and locked.status=='paused' and locked.phase=='promotion' and not attributes.promotion_options(current(profile.catalog_id),profile.progression):
                    locked.phase='interrupted';locked.reason='转职已完成，但当前探索无法自动恢复；可手动继续或召回'
                    locked.revision+=1;locked.save(update_fields=['phase','reason','revision'])
                    append(profile,f'{locked.pk}:promotion-resume-failed:{locked.revision}',
                        'promotion_resume_failed',{'reason':locked.reason},locked)
            raise


def _promotion(run_id: str, *, planner=None, require_permit: bool=False) -> bool:
    from system_settings.models import Agent
    run=Exploration.objects.get(pk=run_id)
    paused_for_promotion=run.status=='paused' and run.phase in ('promotion','promotion_failed','interrupted')
    if run.status not in TERMINAL and not paused_for_promotion:return False
    agent=Agent.objects.filter(pk=run.actor_id).first()
    if not agent:raise ValueError('待转职居民不可用')
    for _ in range(3):
        if require_permit and not CombatRuntime.objects.filter(pk=run_id,requests__promotion_allowed=True).exists():return False
        profile=CombatProfile.objects.get(pk=run.actor_id)
        catalog=current(profile.catalog_id)
        options=attributes.promotion_options(catalog,profile.progression)
        if not options:break
        original_job=profile.progression['job']
        with usage_scope(agent=agent,purpose='combat_promotion'):
            plan=(planner or ask)(agent,'你已达到战斗职业转职等级。请从 options 中选择一个直接分支并给出简短理由，返回 {job_id,reason}。完成转职前不得继续探索。',
                {'progression':profile.progression,'options':options,'report':run.result.get('report'),
                 'exploration':{'elapsed_seconds':run.elapsed_seconds,'result':run.result,
                    'dungeon_id':run.snapshot.get('plan',{}).get('dungeon_id','')}})
        if not isinstance(plan,dict) or plan.get('job_id') not in {row['id'] for row in options}:raise ValueError('转职选择不符合可选直接分支')
        reason=plan.get('reason','')
        if not isinstance(reason,str):raise ValueError('转职理由格式无效')
        with farm_gate(),transaction.atomic():
            locked=Exploration.objects.select_for_update().get(pk=run_id)
            if require_permit and not CombatRuntime.objects.filter(pk=run_id,requests__promotion_allowed=True).exists():return False
            profile=CombatProfile.objects.select_for_update().get(pk=run.actor_id)
            if profile.progression['job']!=original_job:return False
            in_paused_run=locked.status=='paused' and locked.phase in ('promotion','promotion_failed','interrupted')
            profile=promote(run.owner_id,agent,run.pk+':promote:'+original_job,plan['job_id'],
                exploration_id=run.pk if in_paused_run else '',reason=reason)
            if in_paused_run:
                derived=stats(profile,catalog)
                player={**locked.state['player'],'stats':derived,'level':profile.progression['level'],
                    'skills':profile.progression['skills'],'passives':attributes.passives(catalog,profile.progression['skills']),
                    'hp':profile.hp,'mp':profile.mp}
                locked.snapshot={**locked.snapshot,'progression':profile.progression,'equipment':wearing(profile)}
                locked.state={**locked.state,'player':player}
                locked.revision+=1;locked.save(update_fields=['snapshot','state','revision'])
                state_key='promotion-state:'+hashlib.sha256(f'{run.pk}:{original_job}'.encode()).hexdigest()
                append(profile,state_key,'promotion_state',
                    {'job_id':plan['job_id'],'progression':profile.progression,'loadout':profile.loadout},locked)
                run=locked
    profile=CombatProfile.objects.get(pk=run.actor_id)
    catalog=current(profile.catalog_id)
    if attributes.promotion_options(catalog,profile.progression):raise ValueError('转职阶段未能全部完成')
    run.refresh_from_db()
    return run.status=='paused' and run.phase in ('promotion','promotion_failed','interrupted')
