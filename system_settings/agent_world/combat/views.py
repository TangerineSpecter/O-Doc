"""Owner-scoped commands; clients never supply combat outcomes."""
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from system_settings.models import Agent
from ..farm_gate import farm_gate
from ..cooking_queries import validate_actor
from .models import (CombatProfile, CombatFact, Exploration, CombatEncounter, CombatConfig, EquipmentInstance,
                     MIN_DAILY_EXPLORATION_MINUTES, MAX_DAILY_EXPLORATION_MINUTES)
from . import queries, profiles, explorations
from .facts import append, replay
from .permissions import local_runtime


def actor_for(owner,identity):
    try:
        validate_actor(owner,identity)
        if CombatProfile.objects.filter(pk=identity).exclude(owner_id=owner).exists():raise ValueError('冒险档案属于其他账号')
    except ValueError as exc:raise PermissionDenied(str(exc)) from exc
    return get_object_or_404(Agent,pk=identity)


def key_for(data):
    key=data.get('key')
    if not isinstance(key,str) or not 1<=len(key)<=40 or not all(c.isalnum() or c in '-_' for c in key):raise ValueError('所有写操作需要 1 至 40 位幂等请求键')
    return key


def job_choice(data):
    job=data.get('job_id')
    if not isinstance(job,str) or not job.strip():raise ValueError('职业选择无效')
    return job


def respond(data):
    return success_result(queries.with_timezone(data))


class CombatView(APIView):
    permission_classes=[IsAuthenticated]
    kind='catalog'

    def get(self,request,identity=None):
        owner=get_current_user_identifier(request)
        try:
            with farm_gate(),transaction.atomic():
                if self.kind=='catalog':return respond(queries.catalog_view())
                if self.kind=='config':return respond(queries.config(owner))
                if self.kind=='profile':
                    agent=actor_for(owner,identity)
                    profile=CombatProfile.objects.select_for_update().filter(pk=identity,owner_id=owner).first()
                    if profile:profiles.recover_expired_rest(profile)
                    return respond(queries.profile_view(owner,agent))
                if self.kind=='party_events':
                    from .party_models import AdventureParty, AdventureEvent
                    party=get_object_or_404(AdventureParty,pk=identity,owner_id=owner)
                    before=int(request.GET.get('before',party.head+1))
                    if before<1:raise ValueError('战报游标无效')
                    events=list(AdventureEvent.objects.filter(party_id=party.pk,sequence__lt=before).order_by('-sequence')[:40])
                    return respond({'events':[{'id':e.pk,'sequence':e.sequence,'kind':e.kind,'payload':e.payload} for e in reversed(events)],
                        'has_more':bool(events and events[-1].sequence>1)})
                if self.kind=='adventure_options':
                    from .party_options import options
                    return respond(options(owner,actor_for(owner,identity)))
                if self.kind=='history':
                    profile=CombatProfile.objects.filter(pk=identity,owner_id=owner).first()
                    if not profile:actor_for(owner,identity)
                    page=int(request.GET.get('page',1))
                    if page<1:raise ValueError('页码无效')
                    return respond(queries.history(owner,identity,page))
                run=get_object_or_404(Exploration,pk=identity,owner_id=owner)
                cursor=int(request.GET.get('cursor',0))
                if cursor<0:raise ValueError('游标无效')
                if self.kind=='encounters':
                    page=int(request.GET.get('page',1))
                    if page<1:raise ValueError('页码无效')
                    rows=CombatEncounter.objects.filter(exploration_id=run.pk).order_by('-number')
                    return respond({'list':list(rows.values()[(page-1)*20:page*20]),'total':rows.count(),'version':run.revision})
                return respond(queries.snapshot(run,cursor))
        except (ValueError,TypeError) as exc:return valid_result(str(exc),status=409)

    def post(self,request,identity=None):
        owner=get_current_user_identifier(request)
        try:
            key=key_for(request.data)
            if self.kind=='profile' and request.data.get('operation')=='trade':
                # Entering a market and each trade are independent successful facts.
                # A rejected purchase must not undo the already accepted entry fee.
                from ..market_sessions import enter
                from ..market_tools import call_market_tool
                from ..life_scope import manual_combat_potion_scope
                with farm_gate():
                    agent=actor_for(owner,identity)
                    operation=request.data.get('trade',{})
                    names={'buy_potion':'buy_combat_potion','sell_combat_material':'sell_combat_material','sell_combat_equipment':'sell_combat_equipment'}
                    if not isinstance(operation,dict) or operation.get('kind') not in names:raise ValueError('未知冒险商店操作')
                    with transaction.atomic():profiles.ensure(owner,agent)
                    session=enter(owner,agent,request.data.get('session_key',key),mode='mcp')
                    arguments={'request_id':key,'session_id':session.pk,**{k:v for k,v in operation.items() if k!='kind'}}
                    if operation['kind']=='buy_potion':
                        with manual_combat_potion_scope(owner,agent.pk):
                            return respond(call_market_tool(names[operation['kind']],arguments,agent))
                    return respond(call_market_tool(names[operation['kind']],arguments,agent))
            with farm_gate(),transaction.atomic():
                if self.kind=='config':
                    arguments={k:v for k,v in request.data.items() if k!='key'}
                    business,_=CombatConfig.objects.get_or_create(pk=owner)
                    receipt=business.requests.get(key)
                    if receipt:
                        if receipt!=arguments:raise ValueError('请求键已用于不同配置')
                        return respond(queries.config(owner))
                    if set(arguments)-{'daily_minutes'}:raise ValueError('未知探索配置')
                    if 'daily_minutes' in arguments:
                        value=arguments['daily_minutes']
                        if type(value)is not int or not MIN_DAILY_EXPLORATION_MINUTES<=value<=MAX_DAILY_EXPLORATION_MINUTES:raise ValueError('每日探索额度须为 30 至 1440 分钟')
                        CombatConfig.objects.update_or_create(pk=owner,defaults={'daily_minutes':value})
                    business.refresh_from_db()
                    business.requests={**business.requests,key:arguments};business.save()
                    return respond(queries.config(owner))
                if self.kind in ('snapshot','command'):
                    run=get_object_or_404(Exploration,pk=identity,owner_id=owner)
                    if not local_runtime(run):raise ValueError('其他设备只能展示探索历史，不能接续或召回')
                    operation=request.data.get('operation','recall')
                    old=CombatFact.objects.filter(pk=key).first()
                    if old:
                        if old.actor_id!=run.actor_id or old.payload.get('arguments')!={'operation':operation,'exploration_id':run.pk}:raise ValueError('请求键已用于不同操作')
                        return respond(queries.snapshot(run))
                    if operation=='recall':explorations.finish(run.pk)
                    elif operation=='resume':explorations.resume(run.pk)
                    elif operation=='leave' and run.snapshot.get('party_id') and run.status=='active':
                        if run.phase=='searching':
                            explorations.finish(run.pk,'recalled','当前波次已结束，已离队')
                        else:
                            run.state['leave_after_wave']=True
                            run.reason='已申请在本波结束后离队'
                            run.save()
                    else:raise ValueError('未知探索操作')
                    run.refresh_from_db()
                    append(CombatProfile.objects.get(pk=run.actor_id),key,'command',{'arguments':{'operation':operation,'exploration_id':run.pk}},run)
                    return respond(queries.snapshot(run))
                agent=actor_for(owner,identity)
                operation=request.data.get('operation','prepare')
                if operation=='prepare':
                    run=explorations.request(owner,agent,key,request.data.get('constraints',{}))
                    return respond(queries.snapshot(run))
                if operation=='retry_promotion':
                    explorations.request_promotion_retry(owner,agent,key)
                    return respond(queries.profile_view(owner,agent))
                if operation=='preview_equip':
                    profile=get_object_or_404(CombatProfile,pk=agent.pk,owner_id=owner)
                    return respond({'attributes':profiles.preview_equipment(profile,request.data.get('equipment',{}))})
                if operation=='preview_reselect':
                    profile=get_object_or_404(CombatProfile,pk=agent.pk,owner_id=owner)
                    return respond(profiles.preview_reselect(profile,job_choice(request.data)))
                if operation=='equip':profiles.equip(owner,agent,key,request.data.get('equipment',{}))
                elif operation=='reselect_job':
                    reason=request.data.get('reason','')
                    if not isinstance(reason,str):raise ValueError('重选理由格式无效')
                    # Owner-driven correction of a level-one profession; the agent never picks this.
                    profiles.reselect(owner,agent,key,job_choice(request.data),reason=reason)
                elif operation=='promote':raise ValueError('转职分支由 Agent 根据探索经历自动选择')
                elif operation=='initialize':
                    profile=profiles.ensure(owner,agent)
                    append(profile,key,'initialize_request',{'arguments':{}})
                elif operation=='favorite':
                    arguments={'equipment_id':request.data.get('equipment_id'),'locked':request.data.get('locked')}
                    if type(arguments['locked'])is not bool:raise ValueError('收藏值无效')
                    if not replay(agent.pk,key,'favorite',arguments):
                        item=get_object_or_404(EquipmentInstance,pk=arguments['equipment_id'],actor_id=agent.pk,owner_id=owner,sold=False)
                        from ..market_models import MarketListing
                        if MarketListing.objects.filter(owner_id=owner,status='active',
                                item__source__kind='combat_equipment',
                                item__source__equipment_id=item.pk).exists():
                            raise ValueError('装备正在居民集市挂牌，请先撤回')
                        item.locked=arguments['locked'];item.save()
                        append(CombatProfile.objects.get(pk=agent.pk),key,'favorite',{'arguments':arguments})
                elif operation=='close_market':
                    from ..market_models import MarketSession
                    from ..market_sessions import close_session
                    session=get_object_or_404(MarketSession,pk=request.data.get('session_key'),owner_id=owner,actor_id=agent.pk)
                    close_session(session,'补给交易结束')
                    append(CombatProfile.objects.get(pk=agent.pk),key,'close_market',{'arguments':{'session_id':session.pk}})
                else:raise ValueError('未知冒险操作')
                return respond(queries.profile_view(owner,agent))
        except (ValueError,TypeError,KeyError) as exc:return valid_result(str(exc),status=409)
