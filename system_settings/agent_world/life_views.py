"""账号隔离的生活配置、目标、日程和调整接口。"""
from datetime import datetime, timedelta
from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from utils.response_utils import success_result, valid_result
from utils.drf_utils import get_current_user_identifier
from .farm_gate import guarded
from .life_models import LifeProfile, LifeGoal, LifeItem, LifeCycle
from .life_activities import main_items
from .life_config import config_for, validate_settings, ensure_profiles, effective_settings, DEFAULTS, normalize_settings_keys
from .life_time import storage_time,local_time
from .life_schedule import OPEN, SHANGHAI, recover, revise, requeue, retry_block_reason, retry_failed, is_settled_exploration


def owner_of(request):
    return get_current_user_identifier(request)


def actor_for(owner, identity):
    from system_settings.models import Agent
    if not LifeProfile.objects.filter(pk=identity,owner_id=owner).exists():
        raise ValueError('居民不属于此账号的生活配置')
    return Agent.objects.get(pk=identity)


def settled_exploration_item_ids(items):
    candidates = {item.pk: item.record_id for item in items if item.activity == 'exploration' and item.status == 'failed'}
    if not candidates:
        return set()
    from .combat.models import Exploration
    from .combat.explorations import EXECUTION_COMPLETED
    matching_runs = Exploration.objects.filter(
        life_item_id__in=candidates, ended_at__isnull=False, status__in=EXECUTION_COMPLETED,
    ).values_list('life_item_id', 'record_id')
    return {item_id for item_id, record_id in matching_runs if candidates[item_id] == record_id}


def item_data(item, detail=False, settled_exploration_ids=None, facts=None):
    status = item.status
    if status == 'failed' and item.activity == 'exploration':
        is_settled = (item.pk in settled_exploration_ids) if settled_exploration_ids is not None else is_settled_exploration(item)
        if is_settled:
            status = 'completed'
    value={field:getattr(item,field) for field in ('id','owner_id','actor_id','original_at','scheduled_at','activity','task_id','intent','budget','spent','record_id','result','attempts')}
    value['status']=status
    from .life_facts import actuals
    value.update(facts if facts is not None else actuals(item))
    from .life_budget_policy import effective_budget
    value['budget']=effective_budget(item)
    value['original_at']=local_time(item.original_at).isoformat()
    value['scheduled_at']=local_time(item.scheduled_at).isoformat()
    if item.context.get('adventure_reservation_id'):
        from .combat.reservation_views import summary
        value['reservation'] = summary(item)
    if detail:
        from .life_interleaving_usage import summary as usage_summary
        value['activity_usage'] = usage_summary(item)
        value['context']=item.context
        value['revisions']=list(item.revisions.order_by('created_at').values('id','before','after','reason','created_at'))
        if status == 'failed' and item.activity == 'market_prepare':
            blocked=retry_block_reason(item)
            value['retry_available']=not blocked
            value['retry_blocked_reason']=blocked
    return value


class LifeConfigView(APIView):
    permission_classes=[IsAuthenticated]

    def get(self,request):
        config=config_for(owner_of(request))
        from system_settings.decision.failover import public_status
        return success_result({'settings':{**DEFAULTS,**config.settings},'active_agent_ids':effective_settings(config).get('agent_ids',[]),'paused_agents':config.paused_agents,'migrated':config.migrated,'profile_agent_ids':list(LifeProfile.objects.filter(owner_id=config.pk).values_list('pk',flat=True)),
                               'migration_summary':{'converted_items':LifeItem.objects.filter(owner_id=config.pk,context__legacy=True).count(),'running_items':LifeItem.objects.filter(owner_id=config.pk,status='running').count()},
                               'active_cycle':list(LifeCycle.objects.filter(owner_id=config.pk,ends_at__gt=timezone.now()).values('id','starts_at','ends_at','snapshot')[:1]),
                               'decision_failover':public_status(config.pk)})

    @guarded
    @transaction.atomic
    def post(self,request):
        try:
            config=config_for(owner_of(request))
            raw_settings=request.data.get('settings',request.data)
            settings=validate_settings(raw_settings)
            submitted_settings=normalize_settings_keys(raw_settings)
            for key in ('decision_model_id', 'decision_connection_id', 'decision_connection_ids',
                        'decision_sticky_ttl_seconds', 'jev_enabled', 'jev_excluded_scenes',
                        'market_automation_v2', 'interleaving_enabled', 'interleaving_check_minutes',
                        'interleaving_decision_minutes', 'interleaving_wait_minutes'):
                if key not in submitted_settings:
                    settings[key] = config.settings.get(key, DEFAULTS[key])
            from system_settings.decision.failover import apply_saved_order
            settings = apply_saved_order(config.pk, settings, config.settings)
            from system_settings.models import Agent
            added=set(settings['agent_ids'])-set(config.settings.get('agent_ids', []))
            if Agent.objects.filter(pk__in=added, archived_at__isnull=False).exists():
                raise ValueError('不能新增归档居民参与生活，请先恢复')
            config.settings=settings
            known_profiles=set(LifeProfile.objects.filter(owner_id=config.pk).values_list('pk',flat=True))
            ensure_profiles(config.pk,config.settings['agent_ids'])
            # 新建居民自动加入社交参与名单，避免每次都要回社交设置手动勾选。
            from .social_config import add_participants
            add_participants(config.pk,[key for key in config.settings['agent_ids'] if key not in known_profiles])
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
            from .life_schedule_query import select_source, source_counts, status_summary
            counts = source_counts(qs)
            qs = select_source(qs, request.query_params.get('source', 'all'))
            from .combat.models import Exploration
            from .combat.explorations import EXECUTION_COMPLETED
            settled_exploration = Exploration.objects.filter(
                life_item_id=OuterRef('pk'), record_id=OuterRef('record_id'),
                owner_id=owner_of(request), ended_at__isnull=False, status__in=EXECUTION_COMPLETED,
            )
            qs = qs.annotate(_settled_exploration=Exists(settled_exploration))
            summary = status_summary(qs)
            requested_status=request.query_params.get('status')
            if requested_status in ('completed','failed'):
                if requested_status=='completed':
                    qs=qs.filter(Q(status='completed')|Q(_settled_exploration=True))
                else:
                    qs=qs.filter(status='failed',_settled_exploration=False)
            elif requested_status:
                qs=qs.filter(status=requested_status)
            page=int(request.query_params.get('page','1'))
            if page<1:raise ValueError('页码无效')
            view=request.query_params.get('view','list')
            if view not in ('today','week','list'):raise ValueError('日程视图无效')
            from .life_facts import batch_actuals
            from .combat.reservation_views import planning_summary
            exploration_planning = planning_summary(owner_of(request), start, end, request.query_params.get('actor_id', ''))
            ordered=qs.order_by('scheduled_at','id')
            if view in ('today', 'week'):
                limit = 1 if view == 'today' else 7
                if end-start>timedelta(days=limit):raise ValueError(f'日程查询范围不能超过{limit}天')
                # 日历必须以完整日期范围分组，不能把分页缺失误呈现为当天无安排。
                rows=list(ordered)
                settled_ids=settled_exploration_item_ids(rows)
                facts = batch_actuals(rows)
                items=[item_data(i,settled_exploration_ids=settled_ids, facts=facts[i.pk]) for i in rows]
                return success_result({'total':len(items),'items':items,'page':1,'counts':counts,'summary':summary,'exploration_planning':exploration_planning})
            rows=list(ordered[(page-1)*100:page*100])
            settled_ids=settled_exploration_item_ids(rows)
            facts = batch_actuals(rows)
            return success_result({'total':qs.count(),'items':[item_data(i,settled_exploration_ids=settled_ids,facts=facts[i.pk]) for i in rows],'page':page,'counts':counts,'summary':summary,'exploration_planning':exploration_planning})
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
                actor=request.data.get('actor_id') or ''
                if not isinstance(actor,str):raise ValueError('居民无效')
                if actor:actor_for(owner,actor)
                start=datetime.fromisoformat(str(request.data.get('start',local_time().date().isoformat())))
                end=datetime.fromisoformat(str(request.data.get('end',(start+timedelta(days=7)).isoformat())))
                if start.tzinfo is None:start=start.replace(tzinfo=SHANGHAI)
                if end.tzinfo is None:end=end.replace(tzinfo=SHANGHAI)
                if not timedelta(0)<end-start<=timedelta(days=366):raise ValueError('查询范围须为1至366天')
                query=main_items(LifeItem.objects.select_for_update().filter(
                    owner_id=owner,status='failed',record_id='',
                    scheduled_at__gte=storage_time(start),scheduled_at__lt=storage_time(end))
                ).exclude(activity__in=('market_prepare', 'blacksmith'))
                if actor:query=query.filter(actor_id=actor)
                rows=list(query)
                residents=[]
                count=0
                for row in rows:
                    if is_settled_exploration(row):continue
                    requeue(row,reason)
                    count+=1
                    if row.actor_id not in residents:residents.append(row.actor_id)
                for resident in residents:
                    recover(config,resume_actor=resident,delay_reason='人工补做，过期时间点已顺延到可执行空档')
                return success_result({'count':count})
            item=LifeItem.objects.select_for_update().filter(pk=identity,owner_id=owner).first()
            if not item:return valid_result('安排不存在',status=404)
            if item.context.get('adventure_reservation_id'):
                from .combat.reservation_views import change
                change(item, action, reason)
                item.refresh_from_db()
                return success_result(item_data(item, True))
            if action not in ('cancel','replan','retry'):raise ValueError('无效的日程操作')
            if item.status=='running':
                from system_settings.models import AgentExecutionLease
                if action!='cancel':
                    raise ValueError('活动正在执行；仅在执行锁释放后可取消遗留工作流')
                from .combat.models import Exploration
                from .fishing.models import FishingTrip
                from .fishing.service import finish as finish_fishing
                fishing = FishingTrip.objects.filter(life_item_id=item.pk, ended_at__isnull=True).first()
                if fishing:
                    finish_fishing(fishing.pk, '日程人工取消：' + reason[:300], cancelled=True)
                    item.refresh_from_db()
                    return success_result(item_data(item, True))
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
