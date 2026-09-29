"""冻结迁移：保留旧配置和资产，接管可恢复的明确机会。"""
import hashlib
from datetime import datetime
from zoneinfo import ZoneInfo
from django.conf import settings as django_settings
from django.db import migrations
from django.utils import timezone


def migrate_world(apps, schema_editor):
    Agent=apps.get_model('system_settings','Agent')
    Task=apps.get_model('system_settings','AgentTask')
    Config=apps.get_model('system_settings','LifeConfig')
    Profile=apps.get_model('system_settings','LifeProfile')
    Item=apps.get_model('system_settings','LifeItem')
    Action=apps.get_model('system_settings','WorldAction')
    Runtime=apps.get_model('system_settings','WorldActionRuntime')
    Farm=apps.get_model('system_settings','AgentFarm')
    Account=apps.get_model('system_settings','InvestmentAccount')
    Anthology=apps.get_model('anthology','Anthology')
    tasks=list(Task.objects.exclude(task_kind='custom'))
    owners={}
    for task in tasks:
        field='publish_config' if task.task_kind=='post_publish' else task.task_kind+'_config'
        owner=(getattr(task,field,{}) or {}).get('owner_id')
        if task.task_kind=='post_interaction':owner=(task.world_state or {}).get('owner_id') or owner
        if not owner and task.task_kind=='post_interaction':
            visible=set(Anthology.objects.filter(pk__in=task.post_collection_ids).values_list('user_id',flat=True))
            if len(visible)==1:owner=visible.pop()
        if owner:owners[task.pk]=owner
    known=set(owners.values())
    if len(known)==1:
        for task in tasks:
            if task.task_kind=='post_interaction':owners.setdefault(task.pk,next(iter(known)))
    grouped={}
    for task in tasks:
        owner=owners.get(task.pk)
        if not owner:continue
        if task.task_kind=='post_interaction':
            task.world_state={**task.world_state,'owner_id':owner};task.save(update_fields=['world_state'])
        grouped.setdefault(owner,set()).update(task.agent_ids or [task.agent_id])
    now=timezone.now()
    for owner,actors in grouped.items():
        for actor in actors:
            old=Profile.objects.filter(pk=actor).first()
            if (old and old.owner_id!=owner) or Farm.objects.filter(pk=actor).exclude(owner_id=owner).exists() or Account.objects.filter(pk=actor).exclude(owner_id=owner).exists():
                raise RuntimeError('生活配置跨账号资产归属冲突，请先处理居民归属')
            Profile.objects.get_or_create(pk=actor,defaults={'owner_id':owner})
        settings={'agent_ids':sorted(actors),'mode':'fixed','period':'daily','count':12,'interval_minutes':60,'active_start':'00:00','active_end':'24:00','min_gap_minutes':15,'min_remaining_minutes':240}
        Config.objects.get_or_create(pk=owner,defaults={'settings':settings,'migrated':True})
    for task in tasks:
        owner=owners.get(task.pk)
        if not owner:continue
        ids=sorted(grouped[owner]);schedule=(task.world_state or {}).get('schedule',{})
        for index,point in enumerate(schedule.get('slots',[])):
            if index<schedule.get('index',0):continue
            when=datetime.fromisoformat(point)
            if django_settings.USE_TZ and when.tzinfo is None:when=when.replace(tzinfo=ZoneInfo('Asia/Shanghai'))
            if not django_settings.USE_TZ and when.tzinfo is not None:when=when.astimezone(ZoneInfo('Asia/Shanghai')).replace(tzinfo=None)
            if when<now:continue
            key=hashlib.sha256(f'{schedule.get("id",task.pk)}:{index}'.encode()).hexdigest()
            if Action.objects.filter(pk=key).exists():continue
            Item.objects.get_or_create(pk=key,defaults={'owner_id':owner,'actor_id':ids[index%len(ids)],'original_at':when,'scheduled_at':when,'activity':task.task_kind,'task_id':task.pk,'intent':'迁移既有明确时间点','context':{'legacy':True}})
        for action in Action.objects.filter(task_id=task.pk,status='claimed'):
            if not action.actor_id:continue
            Item.objects.get_or_create(pk=action.pk,defaults={'owner_id':owner,'actor_id':action.actor_id,'original_at':action.created_at,'scheduled_at':action.created_at,'activity':task.task_kind,'task_id':task.pk,'status':'running','record_id':action.record_id or '', 'context':{'legacy':True}})
        # 旅行节点没有在出发前创建 WorldAction，独立接入在途 workflow。
        if task.task_kind=='travel':
            Journey=apps.get_model('system_settings','TravelJourney')
            for trip in Journey.objects.filter(task_id=task.pk,status__in=['active','waiting','paused','manual']):
                Item.objects.get_or_create(pk=trip.pk,defaults={'owner_id':owner,'actor_id':trip.actor_id,'original_at':trip.created_at,'scheduled_at':trip.created_at,'activity':'travel','task_id':task.pk,'status':'running','context':{'legacy':True}})
    for pending in Item.objects.filter(status='running'):
        actor=Agent.objects.filter(pk=pending.actor_id).first()
        if actor:
            pending.budget=actor.money;pending.save(update_fields=['budget'])
    Runtime.objects.all().update(enabled=False,token='',until=None)


class Migration(migrations.Migration):
    dependencies=[('system_settings','0049_life_snapshot_integrity')]
    operations=[migrations.RunPython(migrate_world,migrations.RunPython.noop)]
