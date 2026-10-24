"""Preparation and level-gated promotion call the resident's model."""
from contextlib import nullcontext
from decimal import Decimal
import hashlib
from django.db import transaction
from .models import Exploration, CombatProfile, CombatRuntime
from .facts import append
from .profiles import equip, promote, wearing
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
    from ..market_spending import spending_context
    spending=spending_context(run.owner_id,agent.pk)
    full = profile_view(run.owner_id,agent)
    loadout = full.get('loadout') or {}
    equipped_ids = set(loadout.values())
    from .equipment_market import preparation_intents
    decided_ids = set(preparation_intents(agent.pk, run.owner_id))
    equipment = []
    for row in full.get('equipment', []):
        snapshot = row.get('snapshot') or {}
        if row.get('sold') or ((row.get('bound') or row.get('locked')) and row.get('id') not in equipped_ids):
            continue
        if row.get('id') in decided_ids and row.get('id') not in equipped_ids:
            continue
        equipment.append({
            'id': row.get('id'), 'slot': snapshot.get('slot'), 'name': snapshot.get('name'),
            'equipment_type': snapshot.get('equipment_type'), 'level': snapshot.get('level'),
            'rarity': snapshot.get('rarity'), 'stats': snapshot.get('stats'),
            'equipped': row.get('id') in equipped_ids, 'locked': row.get('locked'),
        })
    adventure = {
        'progression': {key: full.get('progression', {})[key] for key in ('level', 'experience', 'job', 'stats') if key in full.get('progression', {})},
        'attributes': full.get('attributes'),
        'hp': full.get('hp'), 'mp': full.get('mp'),
        'loadout': loadout,
        'equipment': equipment,
        'skills': [{key: row[key] for key in ('id', 'name', 'rank', 'kind', 'description', 'parameters', 'effects') if key in row}
                   for row in full.get('skills', [])],
    }
    level = adventure['progression'].get('level', 1)
    dungeons = [{**{key: row[key] for key in ('id', 'name', 'recommended_level_min', 'recommended_level_max',
                'boss_id', 'boss_level_min', 'boss_level_max', 'boss_start_kills', 'boss_probability_step',
                'boss_probability_cap', 'equipment_level_min', 'equipment_level_max') if key in row},
                'has_boss': bool(row.get('boss_id'))}
                for row in catalog.tables['dungeons'] if row.get('enabled') == '1']
    styles = [{key: row[key] for key in ('id', 'name', 'attack_weight', 'skill_weight', 'heal_threshold',
              'mana_threshold', 'defend_factor') if key in row}
              for row in catalog.tables['styles'] if row.get('enabled') == '1']
    potions = [{key: row[key] for key in ('id', 'name', 'kind', 'restore_value', 'required_level',
               'purchase_price', 'shared_cooldown_rounds') if key in row}
               for row in catalog.tables['potions'] if row.get('enabled') == '1' and int(row['required_level']) <= level]
    from .elixir import candidates as elixir_candidates
    elixirs = elixir_candidates(agent.pk, run.owner_id)
    return {'constraints':run.snapshot['constraints'],'adventure':adventure,
        'dungeons':dungeons,'styles':styles,'potions':potions,'elixirs':elixirs,
        'elixir_carry_cap':5,
        'balance':str(agent.money),'inventory':{r['id']:stock_quantity(agent.pk,run.owner_id,'combat.'+r['id']) for r in potions},
        'purchase_funds':spending['spendable'],
        'energy_costs':{'30min':22,'60min':34,'120min':58,'market_entry':5}}


def validate(run: Exploration,plan: dict) -> dict:
    if not isinstance(plan,dict) or set(plan)-{'dungeon_id','style_id','duration_seconds','equipment','purchases','potions','reason','food','elixirs'}:
        raise ValueError('探索准备计划格式无效')
    catalog=current(run.catalog_id)
    for field,table in (('dungeon_id','dungeons'),('style_id','styles')):
        if catalog.row(table,plan.get(field)).get('enabled','1')!='1':raise ValueError('计划引用停用配置')
    dungeon = catalog.row('dungeons', plan.get('dungeon_id'))
    profile = CombatProfile.objects.get(pk=run.actor_id)
    if profile.progression['level'] < int(dungeon['recommended_level_min']):
        raise ValueError('角色等级未达到迷宫推荐等级下限')
    if type(plan.get('duration_seconds'))is not int or (plan['duration_seconds'] not in (1800,3600,7200) and not (run.snapshot.get('target_party_id') and plan['duration_seconds']>=600)):raise ValueError('计划时长无效')
    from ..food_effects import validate_selection
    validate_selection(plan.get('food'), plan['duration_seconds'])
    from ..elixir_effects import validate_carried
    from ..alchemy_limits import CARRY_CAP
    if plan.get('elixirs') is not None:
        validate_carried(plan['elixirs'], CARRY_CAP)
    for key,value in run.snapshot['constraints'].items():
        if plan.get(key)!=value:raise ValueError('准备计划未遵守用户约束')
    for field in ('potions','purchases'):
        values=plan.get(field,{})
        if not isinstance(values,dict):raise ValueError('药剂列表必须为对象')
        for sid,count in values.items():
            row=catalog.row('potions',sid)
            if type(count)is not int or not 0<=count<=99 or row['enabled']!='1' or int(row['required_level'])>CombatProfile.objects.get(pk=run.actor_id).progression['level']:raise ValueError('药剂等级或数量无效')
    if sum(plan.get('potions',{}).values())>int(catalog.rules['potion_carry_cap']):raise ValueError('每次最多携带 20 瓶药剂')
    equipment_changes=plan.get('equipment',{})
    if not isinstance(equipment_changes,dict):
        plan=skip_equipment_changes(plan)
    elif equipment_changes:
        from .profiles import preview_equipment
        try:
            preview_equipment(CombatProfile.objects.get(pk=run.actor_id),equipment_changes)
        except (ValueError,KeyError,TypeError):
            plan=skip_equipment_changes(plan)
    return plan


def skip_equipment_changes(plan: dict) -> dict:
    reason=str(plan.get('reason') or '').strip()
    note='换装计划未通过校验，保留当前装备继续探索。'
    return {**plan,'equipment':{},'reason':(reason+'；' if reason else '')+note}


def fit_potion_plan(run: Exploration, agent, plan: dict) -> dict:
    """Fit optional purchases and carried potions to unreserved cash and stock."""
    from ..market_spending import spending_context
    catalog=current(run.catalog_id)
    funds=Decimal(spending_context(run.owner_id,agent.pk)['spendable'])
    purchases={}
    changed=False
    for sid,count in plan.get('purchases',{}).items():
        unit_price=Decimal(catalog.row('potions',sid)['purchase_price'])
        affordable=min(count,int(funds//unit_price))
        if affordable:
            purchases[sid]=affordable
            funds-=unit_price*affordable
        if affordable!=count:
            changed=True
    potions={}
    for sid,count in plan.get('potions',{}).items():
        available=stock_quantity(agent.pk,run.owner_id,'combat.'+sid)+purchases.get(sid,0)
        carry=min(count,available)
        if carry:
            potions[sid]=carry
        if carry!=count:
            changed=True
    fitted={**plan,'purchases':purchases,'potions':potions}
    if changed:
        reason=str(fitted.get('reason') or '').strip()
        fitted['reason']=(reason+'；' if reason else '')+'药剂按未预留余额与现有库存调整；探索本身不需要生活预算。'
    return fitted


def prepare(run_id: str, *, planner=None) -> Exploration:
    from system_settings.models import Agent
    from ..market_sessions import enter, close_session
    from ..market_tools import call_market_tool
    from ..market_spending import MarketPurchaseBlocked
    from ..life_models import LifeItem
    from ..life_scope import life_scope, manual_combat_potion_scope
    from ..life_context import build_execution_context
    run=Exploration.objects.get(pk=run_id)
    if run.status!='preparing':return run
    from system_settings.agent_availability import require_active_agent
    agent=require_active_agent(run.actor_id)
    item=LifeItem.objects.filter(pk=run.life_item_id).first()
    from ..life_activities import is_interleaved
    if item and is_interleaved(item):
        from datetime import datetime
        from ..life_time import local_time
        if local_time(datetime.fromisoformat(item.context['interleaving']['expires_at'])) <= local_time():
            return finish(run.pk, 'interrupted', '系统说明：未出发的穿插已过期')
    scope=life_scope(item,build_execution_context(run.owner_id,agent,item)) if item else nullcontext()
    manual_potion_scope=manual_combat_potion_scope(run.owner_id,agent.pk) if not item else nullcontext()
    session=None
    try:
        with scope,manual_potion_scope:
            # Persist the proposed preparation before any paid transaction. Retry never asks for a new plan.
            from .party_sessions import modern
            if modern(current(run.catalog_id)):
                from .party_options import select_for_preparation
                select_for_preparation(run, agent)
            plan=run.snapshot.get('prepared_plan')
            if plan is None:
                from system_settings.decision.routing import jev_enabled
                preparation_decisions = None
                def check_preparation():
                    current_run = Exploration.objects.filter(pk=run_id, status='preparing').first()
                    if not current_run or not CombatRuntime.objects.filter(pk=run_id, authorized=True).exists():
                        raise ValueError('准备期间探索已取消')
                from ..life_activities import is_interleaved
                if (item and is_interleaved(item)) or jev_enabled(run.owner_id, 'combat_preparation'):
                    from .preparation_decision import build_plan
                    plan, preparation_decisions = build_plan(run, agent, check=check_preparation)
                else:
                    with usage_scope(agent=agent,purpose='exploration_prepare'):
                        plan=(planner or ask)(agent,'为迷宫探索准备出发。只决定出发地点、时长、风格、换装、药剂采购和携带，不参与战斗。探索本身不需要生活预算；药剂是可选补给，只能使用purchase_funds中的未预留真实余额。若余额不足，减少或放弃采购，并按现有库存决定携带，不要因此放弃探索。装备部位可用 weapon、offhand、head、body、hands、feet、accessory、ring_1、ring_2；accessory 是吊坠位，戒指分别使用 ring_1 和 ring_2。双手武器占用副手，不能同时填写 offhand。遵守constraints，返回 JSON: {dungeon_id, duration_seconds, style_id, equipment:{部位:装备ID}, purchases:{药剂ID:数量}, potions:{药剂ID:携带数量}, reason}。考虑职业精通、全程体力和推荐等级。',context(run))
                plan=fit_potion_plan(run,agent,validate(run,plan))
                from ..life_interleaving_preparation import fit_supply_energy
                plan = fit_supply_energy(run, agent, plan)
                if preparation_decisions is None:
                    from .food import choose as choose_food
                    food, record = choose_food(run, agent, plan['duration_seconds'], structured=False, planner=planner, check=check_preparation)
                    plan = {**plan, 'food': food}
                    preparation_decisions = {'food': record}
                with farm_gate(),transaction.atomic():
                    locked=Exploration.objects.select_for_update().get(pk=run_id)
                    if locked.status!='preparing' or not CombatRuntime.objects.filter(pk=run_id,authorized=True).exists():return locked
                    locked.snapshot={**locked.snapshot,'prepared_plan':plan}
                    if preparation_decisions is not None:
                        locked.snapshot['preparation_decisions'] = preparation_decisions
                    locked.revision+=1;locked.save()
                    from .facts import append
                    append(CombatProfile.objects.get(pk=run.actor_id),run.pk+':plan','plan',{'plan':plan},locked)
            from ..life_interleaving_preparation import resize_exploration
            plan = resize_exploration(run, agent, plan)
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
                completed_purchases={}
                for index,(sid,n) in enumerate(purchases.items()):
                    with farm_gate():
                        if not Exploration.objects.filter(pk=run.pk,status='preparing').exists() or not CombatRuntime.objects.filter(pk=run.pk,authorized=True).exists():raise ValueError('准备期间探索已取消')
                        try:
                            call_market_tool('buy_combat_potion',{'request_id':hashlib.sha256((run.pk+f':purchase:{index}').encode()).hexdigest(),'session_id':session.pk,'potion_id':sid,'quantity':n},agent)
                        except (MarketPurchaseBlocked,ValueError) as exc:
                            blocked_code=getattr(exc,'result',{}).get('code')
                            if blocked_code not in ('life_budget_exceeded','insufficient_balance') and str(exc)!='真实余额不足或资金已预留给其他生活安排':
                                raise
                            adjusted_potions={}
                            for potion_id,count in plan.get('potions',{}).items():
                                carry=min(count,stock_quantity(agent.pk,run.owner_id,'combat.'+potion_id))
                                if carry:adjusted_potions[potion_id]=carry
                            note='可用余额变化后跳过未完成药剂采购，按现有库存出发。'
                            reason=str(plan.get('reason') or '').strip()
                            plan={**plan,'purchases':completed_purchases,'potions':adjusted_potions,
                                  'reason':(reason+'；' if reason else '')+note}
                            with transaction.atomic():
                                locked=Exploration.objects.select_for_update().get(pk=run.pk)
                                if locked.status!='preparing' or not CombatRuntime.objects.filter(pk=run.pk,authorized=True).exists():return locked
                                locked.snapshot={**locked.snapshot,'prepared_plan':plan};locked.revision+=1;locked.save()
                                append(CombatProfile.objects.get(pk=locked.actor_id),locked.pk+':purchase-adjustment',
                                    'purchase_adjustment',{'reason':note,'purchases':completed_purchases,'potions':adjusted_potions},locked)
                            break
                        completed_purchases[sid]=n
                close_session(session,'探索补给采购完成');session=None
            from ..life_interleaving_preparation import resize_exploration
            plan = resize_exploration(run, agent, plan)
            return depart(run.pk,plan)
    except Exception as exc:
        from system_settings.decision.jev import DecisionUnavailable
        from ..life_activities import is_interleaved
        if item and is_interleaved(item) and isinstance(exc, (DecisionUnavailable, TimeoutError)):
            from datetime import timedelta
            from ..life_time import local_time
            with farm_gate(), transaction.atomic():
                locked = Exploration.objects.select_for_update().get(pk=run.pk)
                locked.snapshot['preparation_retry_at'] = (local_time() + timedelta(minutes=5)).isoformat()
                locked.save()
            return locked
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
        result = run.result if isinstance(run.result, dict) else {}
        outcome = {key: result[key] for key in ('energy', 'experience', 'kills', 'potions_used', 'returned_potions', 'rewards', 'growth') if key in result}
        with usage_scope(agent=agent,purpose='combat_promotion'):
            plan=(planner or ask)(agent,'你已达到战斗职业转职等级。请从 options 中选择一个直接分支并给出简短理由，返回 {job_id,reason}。完成转职前不得继续探索。',
                {'progression':{key: profile.progression[key] for key in ('level', 'job', 'stats', 'skills') if key in profile.progression},
                 'options':options,'combat_result':outcome,
                 'exploration':{'elapsed_seconds':run.elapsed_seconds,
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
                from .food import combat_stats
                derived=combat_stats(profile,catalog,locked.snapshot)
                player={**locked.state['player'],'stats':derived,'level':profile.progression['level'],
                    'skills':profile.progression['skills'],'passives':attributes.passives(
                        catalog,profile.progression['skills'],wearing(profile)),
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
