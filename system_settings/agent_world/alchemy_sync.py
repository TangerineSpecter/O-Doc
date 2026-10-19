"""炼金完整快照包括共用背包与市场托管，拒绝把缺失事实重做成药水。"""
import hashlib
from django.db.models.signals import post_save, post_delete
from system_settings.sync_state import is_tracking_suspended
from .alchemy_models import AlchemyCatalog, AlchemySkill, AlchemyOperation, AlchemyIntegrity
from .travel_models import AgentInventoryItem
from .market_models import MarketListing, MarketTransaction
from .alchemy_integrity import fingerprints


def checkpoint(owner: str) -> None:
    AlchemyIntegrity.objects.update_or_create(pk=owner, defaults={'hashes': fingerprints(owner)})


def checkpoint_all() -> None:
    owners = set(AlchemyCatalog.objects.values_list('pk', flat=True)) | set(AlchemyIntegrity.objects.values_list('pk', flat=True))
    for owner in owners:
        checkpoint(owner)


def changed(sender, instance, **kwargs):
    if is_tracking_suspended() or kwargs.get('raw'):
        return
    owner = instance.pk if sender is AlchemyCatalog else getattr(instance, 'owner_id', None)
    if sender.__name__ == 'WorldAction':
        snapshot = instance.snapshot or {}
        owner = snapshot.get('owner_id') if (snapshot.get('alchemy_energy') or snapshot.get('alchemy')) else None
    if owner and (sender is AlchemyCatalog or AlchemyCatalog.objects.filter(pk=owner).exists()):
        checkpoint(owner)


def register_signals():
    from system_settings.models import WorldAction
    for model in (AlchemyCatalog, AlchemySkill, AlchemyOperation, AgentInventoryItem, MarketListing, MarketTransaction, WorldAction):
        for signal in (post_save, post_delete):
            signal.connect(changed, sender=model, weak=False, dispatch_uid=f'alchemy:{model.__name__}:{signal}')


def reconcile_alchemy(*, source_hashes: dict | None = None) -> None:
    from utils.sync_manager import SyncError
    from system_settings.models import WorldAction
    from .alchemy_quality_sync import validate_quality_operation
    owners = (set(AlchemyCatalog.objects.values_list('pk', flat=True)) | set(AlchemySkill.objects.values_list('owner_id', flat=True)) |
              set(AlchemyOperation.objects.values_list('owner_id', flat=True)) | set(AlchemyIntegrity.objects.values_list('pk', flat=True)))
    for owner in owners:
        integrity = AlchemyIntegrity.objects.filter(pk=owner).first()
        expected = source_hashes.get(owner) if source_hashes is not None else integrity.hashes if integrity else None
        if not integrity or expected != fingerprints(owner) or not AlchemyCatalog.objects.filter(pk=owner).exists():
            raise SyncError('炼金快照不完整，拒绝恢复：' + ','.join(key for key, value in fingerprints(owner).items() if not integrity or integrity.hashes.get(key) != value))
        for skill in AlchemySkill.objects.filter(owner_id=owner):
            experience = 0
            for op in sorted(AlchemyOperation.objects.filter(owner_id=owner, actor_id=skill.pk), key=lambda row: row.result.get('experience_before', -1)):
                gained = validate_quality_operation(op, experience)
                if op.result.get('experience_before') != experience or op.result.get('experience_gained') != gained:
                    raise SyncError('炼金成长链不一致')
                experience += gained
                if op.result.get('experience_after') != experience:
                    raise SyncError('炼金经验记录不一致')
                action = WorldAction.objects.filter(pk=hashlib.sha256(f'alchemy-energy:{op.pk}'.encode()).hexdigest(), actor_id=skill.pk, status='success', energy_cost=op.snapshot['energy_cost'], consumed_at=op.created_at, result__operation_id=op.pk).first()
                if not action:
                    raise SyncError('炼金体力事实缺失')
            if skill.experience != experience:
                raise SyncError('炼金经验缺失制作依据')
        if AlchemyOperation.objects.filter(owner_id=owner).exclude(actor_id__in=AlchemySkill.objects.filter(owner_id=owner).values('pk')).exists():
            raise SyncError('炼金记录缺失居民熟练度')
