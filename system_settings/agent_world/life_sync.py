"""完整生活快照校验；预算是计划事实，恢复不产生任何新扣款。"""
import logging
from .life_models import LifeConfig, LifeProfile, LifeGoal, LifeCycle, LifeItem, LifeRevision, LifeIntegrity, LifeInterleavingState
from .life_snapshot import hash_rows

logger = logging.getLogger(__name__)


def fingerprints(owner: str) -> dict[str, str]:
    queries=[LifeConfig.objects.filter(pk=owner),LifeProfile.objects.filter(owner_id=owner),LifeGoal.objects.filter(owner_id=owner),LifeCycle.objects.filter(owner_id=owner),LifeItem.objects.filter(owner_id=owner),LifeRevision.objects.filter(item__owner_id=owner), LifeInterleavingState.objects.filter(owner_id=owner)]
    return {q.model.__name__: hash_rows(list(q.values()), tuple(
        field.attname for field in q.model._meta.fields if field.get_internal_type() == 'DateTimeField'
    )) for q in queries}


def life_owners() -> set[str]:
    """所有拥有任意生活记录的账号；不能只看 LifeConfig，否则孤立记录无法生成摘要。"""
    owners = set(LifeConfig.objects.values_list('pk', flat=True))
    for model in (LifeProfile, LifeGoal, LifeCycle, LifeItem, LifeInterleavingState):
        owners.update(model.objects.values_list('owner_id', flat=True))
    return owners


def checkpoint_all() -> None:
    from .life_config import DEFAULTS
    owners = life_owners()
    for owner in owners:
        # 运行时 config_for 同样按需创建默认配置；导出前补齐，避免孤立记录让上传被来源校验拒绝。
        if not LifeConfig.objects.filter(pk=owner).exists():
            logger.warning('生活记录缺少所属配置，已补建默认配置 owner=%s', owner)
            LifeConfig.objects.create(pk=owner, settings=dict(DEFAULTS))
        hashes = fingerprints(owner)
        checkpoint, created = LifeIntegrity.objects.get_or_create(pk=owner, defaults={'hashes': hashes})
        if not created and checkpoint.hashes != hashes:
            checkpoint.hashes = hashes
            checkpoint.save(update_fields=['hashes', 'updated_at'])
    # 账号已无任何生活记录时，遗留摘要会被来源校验当作缺失数据。
    stale = list(LifeIntegrity.objects.exclude(pk__in=owners).values_list('pk', flat=True))
    if stale:
        logger.warning('清理无对应生活记录的完整性摘要 owners=%s', stale)
        LifeIntegrity.objects.filter(pk__in=stale).delete()


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
            try:
                if 'travel_plan' in item.context:
                    from .life_daily_travel import validate_snapshot
                    if item.activity != 'travel':
                        raise ValueError('旅行目的地属于其他活动')
                    validate_snapshot(item.context['travel_plan'])
                if 'daily_choice' in item.context:
                    from .life_daily_planner import validate_checkpoint
                    validate_checkpoint(item.context['daily_choice'], item.pk)
            except (ValueError, TypeError, KeyError) as exc:
                raise SyncError('整日日程意向或旅行目的地依据无效') from exc
            if 'cooking_plan' in item.context:
                from .cooking_schedule_plan import validate_plan
                try:
                    if item.activity != 'cooking':
                        raise ValueError('美食计划属于其他活动')
                    validate_plan(item.context['cooking_plan'])
                except (ValueError, TypeError) as exc:
                    raise SyncError('美食日程计划不一致') from exc
            if 'alchemy_plan' in item.context:
                from .alchemy_schedule_plan import validate_plan
                try:
                    if item.activity != 'alchemy':
                        raise ValueError('炼金计划属于其他活动')
                    validate_plan(item.context['alchemy_plan'])
                except (ValueError, TypeError) as exc:
                    raise SyncError('炼金日程计划不一致') from exc
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
    from .life_interleaving_sync import validate_database
    validate_database()
    from .life_planner import check_goals
    for profile in LifeProfile.objects.all():
        actor=Agent.objects.filter(pk=profile.pk).first()
        if actor:check_goals(profile.owner_id,actor)
    # 同步只关闭生活执行凭证；新设备仍须手动开启世界运行。
    AgentExecutionLease.objects.filter(token__startswith='life:').update(token='',until=None)
    WorldActionRuntime.objects.filter(pk__in=['world','life-planner','life-idle-decision']).update(token='',until=None,enabled=False)
