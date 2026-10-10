"""账号隔离的生活配置、目标、日程和调整接口。"""
from datetime import datetime, timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from utils.response_utils import success_result, valid_result
from utils.drf_utils import get_current_user_identifier
from .farm_gate import guarded
from .life_models import LifeProfile, LifeGoal, LifeItem, LifeCycle
from .life_config import config_for, validate_settings, ensure_profiles, effective_settings, DEFAULTS
from .life_time import storage_time,local_time
from .life_schedule import OPEN, SHANGHAI, recover, revise, requeue, retry_failed


def owner_of(request):
    return get_current_user_identifier(request)


def actor_for(owner, identity):
    from system_settings.models import Agent
    if not LifeProfile.objects.filter(pk=identity,owner_id=owner).exists():
        raise ValueError('居民不属于此账号的生活配置')
    return Agent.objects.get(pk=identity)


def item_data(item, detail=False):
    value={field:getattr(item,field) for field in ('id','owner_id','actor_id','original_at','scheduled_at','activity','task_id','status','intent','budget','spent','record_id','result','attempts')}
    from .life_budget_policy import effective_budget
    value['budget']=effective_budget(item)
    value['original_at']=local_time(item.original_at).isoformat()
    value['scheduled_at']=local_time(item.scheduled_at).isoformat()
    if detail:
        value['context']=item.context
        value['revisions']=list(item.revisions.order_by('created_at').values('id','before','after','reason','created_at'))
    return value


class LifeConfigView(APIView):
    permission_classes=[IsAuthenticated]

    def get(self,request):
        config=config_for(owner_of(request))
        return success_result({'settings':{**DEFAULTS,**config.settings},'active_agent_ids':effective_settings(config).get('agent_ids',[]),'paused_agents':config.paused_agents,'migrated':config.migrated,'profile_agent_ids':list(LifeProfile.objects.filter(owner_id=config.pk).values_list('pk',flat=True)),
                               'migration_summary':{'converted_items':LifeItem.objects.filter(owner_id=config.pk,context__legacy=True).count(),'running_items':LifeItem.objects.filter(owner_id=config.pk,status='running').count()},
                               'active_cycle':list(LifeCycle.objects.filter(owner_id=config.pk,ends_at__gt=timezone.now()).values('id','starts_at','ends_at','snapshot')[:1])})

    @guarded
    @transaction.atomic
    def post(self,request):
        try:
            config=config_for(owner_of(request))
            config.settings=validate_settings(request.data.get('settings',request.data))
            ensure_profiles(config.pk,config.settings['agent_ids'])
            config.migrated=True;config.save()
            return self.get(request)
        except (ValueError,TypeError) as exc:
            return valid_result(str(exc),status=400)


class LifeProfileView(APIView):
    permission_classes=[IsAuthenticated]

    def get(self,request,actor):
        try:
            actor_for(owner_of(request),actor)
            return success_result(LifeProfile.objects.filter(pk=actor).values('id','preferences','direction').get())
        except (ValueError,LifeProfile.DoesNotExist):
            return valid_result('居民生活资料不存在',status=404)

    @guarded
    @transaction.atomic
    def post(self,request,actor):
        try:
            actor_for(owner_of(request),actor)
            profile=LifeProfile.objects.get(pk=actor)
            for key in ('preferences','direction'):
                if key in request.data:
                    value=request.data[key]
                    if not isinstance(value,str) or len(value)>10000:raise ValueError('生活资料须为不超过10000字的文本')
                    setattr(profile,key,value)
            profile.save()
            return self.get(request,actor)
        except ValueError as exc:return valid_result(str(exc),status=400)


class LifeGoalView(APIView):
    permission_classes=[IsAuthenticated]

    def get(self,request):
        if request.query_params.get('options')=='1':
            from .travel_models import TravelDestination
            from .farm_catalog import catalog_for
            from .item_catalog_icons import catalog_item_names
            from django.db.models import Q
            query=str(request.query_params.get('q',''))[:100]
            destinations=TravelDestination.objects.filter(enabled=True)
            if query:destinations=destinations.filter(Q(city__icontains=query)|Q(country__icontains=query))
            choices=list(destinations.order_by('country','city','pk').values('id','city','country')[:100])
            selected=TravelDestination.objects.filter(pk=request.query_params.get('destination_id')).values('id','city','country').first()
            if selected and selected['id'] not in {r['id'] for r in choices}:choices.insert(0,selected)
            return success_result({'destinations':choices,
                                   'items':[{'sku':sku,'name':name} for sku,name in catalog_item_names(catalog_for(owner_of(request)).rules).items()]})
        qs=LifeGoal.objects.filter(owner_id=owner_of(request))
        if request.query_params.get('actor_id'):qs=qs.filter(actor_id=request.query_params['actor_id'])
        try:
            page=int(request.query_params.get('page','1'))
            if not 1<=page<=1000000:raise ValueError()
        except ValueError:return valid_result('目标页码无效',status=400)
        return success_result(list(qs.order_by('-updated_at','id').values('id','actor_id','title','condition','progress','status','reason')[(page-1)*100:page*100]))

    @guarded
    @transaction.atomic
    def post(self,request):
        try:
            owner=owner_of(request)
            goal=LifeGoal.objects.filter(pk=request.data.get('id'),owner_id=owner).first()
            if request.data.get('id') and not goal:return valid_result('目标不存在',status=404)
            actor=goal.actor_id if goal else request.data.get('actor_id')
            actor_for(owner,actor)
            goal=goal or LifeGoal(owner_id=owner,actor_id=actor)
            title=request.data.get('title',goal.title)
            if not isinstance(title,str) or not title.strip() or len(title)>200:raise ValueError('目标标题须为1至200字')
            condition=request.data.get('condition',goal.condition or {'kind':'subjective'})
            if not isinstance(condition,dict) or condition.get('kind') not in ('subjective','savings','travel','inventory'):raise ValueError('目标完成条件无效')
            if condition['kind']=='savings':
                from .life_budget import money
                if money(condition.get('amount'))<=0:raise ValueError('储蓄目标金额须为正数')
            if condition['kind']=='travel':
                from .travel_models import TravelDestination
                if not TravelDestination.objects.filter(pk=condition.get('destination_id')).exists():raise ValueError('目的地不存在')
            if condition['kind']=='inventory' and (not isinstance(condition.get('sku'),str) or type(condition.get('quantity')) is not int or condition['quantity']<=0):raise ValueError('库存目标条件无效')
            status=request.data.get('status',goal.status)
            if status not in ('active','paused','completed','abandoned'):raise ValueError('目标状态无效')
            reason=request.data.get('reason',goal.reason)
            if not isinstance(reason,str) or len(reason)>2000 or (status!='active' and not reason.strip()):raise ValueError('目标状态变更须说明原因')
            progress=request.data.get('progress',goal.progress)
            if not isinstance(progress,str) or len(progress)>2000:raise ValueError('目标进展须为文本')
            goal.title,goal.condition,goal.status,goal.reason,goal.progress=title,condition,status,reason,progress
            goal.save()
            return success_result({'id':goal.pk})
        except (ValueError,TypeError) as exc:return valid_result(str(exc),status=400)


class LifeScheduleView(APIView):
    permission_classes=[IsAuthenticated]

    def get(self,request,identity=None):
        qs=LifeItem.objects.filter(owner_id=owner_of(request))
        if identity:
            item=qs.filter(pk=identity).first()
            return success_result(item_data(item,True)) if item else valid_result('安排不存在',status=404)
        try:
            start=datetime.fromisoformat(request.query_params.get('start',local_time().date().isoformat()))
            end=datetime.fromisoformat(request.query_params.get('end',(start+timedelta(days=7)).isoformat()))
            if start.tzinfo is None:start=start.replace(tzinfo=SHANGHAI)
            if end.tzinfo is None:end=end.replace(tzinfo=SHANGHAI)
            if not timedelta(0)<end-start<=timedelta(days=366):raise ValueError('查询范围须为1至366天')
            qs=qs.filter(scheduled_at__gte=storage_time(start),scheduled_at__lt=storage_time(end))
            if request.query_params.get('actor_id'):qs=qs.filter(actor_id=request.query_params['actor_id'])
            if request.query_params.get('status'):qs=qs.filter(status=request.query_params['status'])
            page=int(request.query_params.get('page','1'))
            if page<1:raise ValueError('页码无效')
            view=request.query_params.get('view','list')
            if view not in ('week','list'):raise ValueError('日程视图无效')
            ordered=qs.order_by('scheduled_at','id')
            if view=='week':
                if end-start>timedelta(days=7):raise ValueError('周日程查询范围不能超过7天')
                # 日历必须以完整日期范围分组，不能把分页缺失误呈现为当天无安排。
                items=[item_data(i) for i in ordered]
                return success_result({'total':len(items),'items':items,'page':1})
            return success_result({'total':qs.count(),'items':[item_data(i) for i in ordered[(page-1)*100:page*100]],'page':page})
        except ValueError as exc:return valid_result(str(exc),status=400)

    @guarded
    @transaction.atomic
    def post(self,request,identity=None):
        try:
            owner=owner_of(request);action=request.data.get('action')
            config=config_for(owner)
            if action in ('pause','resume'):
                actor=request.data.get('actor_id');actor_for(owner,actor)
                paused=set(config.paused_agents)
                if action=='pause':paused.add(actor)
                else:paused.discard(actor)
                config.paused_agents=sorted(paused);config.save()
                recover(config,resume_actor=actor)
                return success_result({'paused_agents':config.paused_agents})
            reason=request.data.get('reason','')
            if not isinstance(reason,str) or not reason.strip():raise ValueError('调整须说明原因')
            if action=='replan_failed':
                actor=request.data.get('actor_id');actor_for(owner,actor)
                start=datetime.fromisoformat(str(request.data.get('start',local_time().date().isoformat())))
                end=datetime.fromisoformat(str(request.data.get('end',(start+timedelta(days=7)).isoformat())))
                if start.tzinfo is None:start=start.replace(tzinfo=SHANGHAI)
                if end.tzinfo is None:end=end.replace(tzinfo=SHANGHAI)
                if not timedelta(0)<end-start<=timedelta(days=366):raise ValueError('查询范围须为1至366天')
                rows=list(LifeItem.objects.select_for_update().filter(
                    owner_id=owner,actor_id=actor,status='failed',record_id='',
                    scheduled_at__gte=storage_time(start),scheduled_at__lt=storage_time(end)).exclude(activity='market_prepare'))
                for row in rows:requeue(row,reason)
                if rows:
                    recover(config,resume_actor=actor,delay_reason='人工补做，过期时间点已顺延到可执行空档')
                return success_result({'count':len(rows)})
            item=LifeItem.objects.select_for_update().filter(pk=identity,owner_id=owner).first()
            if not item:return valid_result('安排不存在',status=404)
            if action not in ('cancel','replan','retry'):raise ValueError('无效的日程操作')
            if item.status=='running':
                from system_settings.models import AgentExecutionLease
                if action!='cancel':
                    raise ValueError('活动正在执行；仅在执行锁释放后可取消遗留工作流')
                from .combat.models import Exploration
                from .combat.explorations import finish as finish_exploration
                exploration=Exploration.objects.filter(life_item_id=item.pk,status__in=['preparing','active','paused']).first()
                if exploration:
                    from .combat.permissions import local_runtime
                    if not local_runtime(exploration):raise ValueError('其他设备只能展示探索历史，请在原后端处理')
                    finish_exploration(exploration.pk,'recalled','日程人工取消：'+reason[:300])
                    return success_result({'id':item.pk,'status':'completed'})
                if AgentExecutionLease.objects.filter(agent_id=item.actor_id,until__gt=timezone.now()).exists():
                    raise ValueError('活动正在执行；仅在执行锁释放后可取消遗留工作流')
                from .travel_models import TravelJourney,TravelRuntime
                trip=TravelJourney.objects.select_for_update().filter(pk=item.pk).first()
                if trip:
                    trip.status='cancelled'
                    if trip.departed_at and not trip.returned_at:trip.returned_at=timezone.now()
                    trip.save()
                    TravelRuntime.objects.filter(pk=trip.pk).update(authorized=False)
                    from system_settings.models import WorldAction,AgentRunRecord
                    activity=WorldAction.objects.filter(pk=trip.pk).first()
                    if activity and activity.record_id:
                        record=AgentRunRecord.objects.get(pk=activity.record_id)
                        record.status='failed';record.summary='旅行被人工取消：'+reason[:200]
                        record.save(update_fields=['status','summary','updated_at'])
                else:
                    raise ValueError('须先核对该活动的执行事实再取消')
            if action=='cancel':
                if item.status not in OPEN:raise ValueError('安排已经结束')
                revise(item,reason,status='cancelled')
            else:
                retry_failed(item,reason) if action=='retry' else requeue(item,reason)
                recover(config,resume_actor=item.actor_id,delay_reason='人工补做，过期时间点已顺延到可执行空档')
                item.refresh_from_db()
            return success_result(item_data(item,True))
        except (ValueError,TypeError) as exc:return valid_result(str(exc),status=400)
