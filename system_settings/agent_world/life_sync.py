"""完整生活快照校验；预算是计划事实，恢复不产生任何新扣款。"""
import hashlib
import json
from django.core.serializers.json import DjangoJSONEncoder
from .life_models import LifeConfig, LifeProfile, LifeGoal, LifeCycle, LifeItem, LifeRevision, LifeIntegrity


def fingerprints(owner: str) -> dict[str, str]:
    queries=[LifeConfig.objects.filter(pk=owner),LifeProfile.objects.filter(owner_id=owner),LifeGoal.objects.filter(owner_id=owner),LifeCycle.objects.filter(owner_id=owner),LifeItem.objects.filter(owner_id=owner),LifeRevision.objects.filter(item__owner_id=owner)]
    return {q.model.__name__:hashlib.sha256(json.dumps(list(q.order_by('pk').values()),cls=DjangoJSONEncoder,sort_keys=True,separators=(',',':')).encode()).hexdigest() for q in queries}


def checkpoint_all() -> None:
    for owner in LifeConfig.objects.values_list('pk',flat=True):
        hashes = fingerprints(owner)
        checkpoint, created = LifeIntegrity.objects.get_or_create(pk=owner, defaults={'hashes': hashes})
        if not created and checkpoint.hashes != hashes:
            checkpoint.hashes = hashes
            checkpoint.save(update_fields=['hashes', 'updated_at'])


def reconcile_life() -> None:
    from utils.sync_manager import SyncError
    from system_settings.models import Agent, AgentRunRecord, AgentExecutionLease, WorldActionRuntime
    owners=set(LifeIntegrity.objects.values_list('pk',flat=True)) | set(LifeConfig.objects.values_list('pk',flat=True))
    owners.update(LifeItem.objects.values_list('owner_id',flat=True))
    for owner in owners:
        check=LifeIntegrity.objects.filter(pk=owner).first()
        if not check or check.hashes!=fingerprints(owner):
            raise SyncError('生活快照缺少配置、目标、安排或调整记录，拒绝恢复')
        config=LifeConfig.objects.filter(pk=owner).first()
        if not config:raise SyncError('生活快照缺少所属配置')
        # 已删除居民允许历史保留；活跃配置必须可解释。
        for item in LifeItem.objects.filter(owner_id=owner):
            if item.cycle_id and item.cycle.owner_id!=owner:raise SyncError('生活周期归属不一致')
            if not LifeProfile.objects.filter(pk=item.actor_id,owner_id=owner).exists():raise SyncError('安排缺少居民生活资料')
            if item.record_id:
                record=AgentRunRecord.objects.filter(pk=item.record_id).first()
                if not record or record.agent_id not in (item.actor_id,None):raise SyncError('生活安排缺少实际执行记录')
                if record.agent_id is None:
                    from .life_config import task_owner
                    from system_settings.models import AgentTask,WorldAction
                    task=AgentTask.objects.filter(pk=record.task_id).first()
                    retained=WorldAction.objects.filter(record_id=record.pk,actor_id=item.actor_id).exists()
                    if not retained and (not task or task_owner(task)!=owner or record.task_id!=item.task_id or record.status=='running'):
                        raise SyncError('无居民执行记录缺少可解释的活动归属')
            if item.budget<item.spent or item.spent<0:raise SyncError('生活预算或支出无效')
            keys=item.context.get('debit_keys',[])
            if keys:
                from .models import WorldLedger
                from decimal import Decimal
                charges=list(WorldLedger.objects.filter(pk__in=keys,agent_id=item.actor_id,amount__lt=0).values_list('amount',flat=True))
                if len(charges)!=len(keys) or len(set(keys))!=len(keys) or -sum(charges,Decimal(0))!=item.spent:
                    raise SyncError('生活累计支出与真实扣款账本不一致')
        for goal in LifeGoal.objects.filter(owner_id=owner):
            if not LifeProfile.objects.filter(pk=goal.actor_id,owner_id=owner).exists():raise SyncError('目标缺少居民生活资料')
    from .life_planner import check_goals
    for profile in LifeProfile.objects.all():
        actor=Agent.objects.filter(pk=profile.pk).first()
        if actor:check_goals(profile.owner_id,actor)
    # 同步只关闭生活执行凭证；新设备仍须手动开启世界运行。
    AgentExecutionLease.objects.filter(token__startswith='life:').update(token='',until=None)
    WorldActionRuntime.objects.filter(pk__in=['world','life-planner']).update(token='',until=None,enabled=False)
