"""烹饪完整快照包括当前背包与市场托管，拒绝将缺失事实重做成品。"""
import hashlib
import json
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models.signals import post_save, post_delete
from system_settings.sync_state import canonical_hash, is_tracking_suspended
from .cooking_models import CookingCatalog, CookingSkill, CookingOperation, CookingIntegrity
from .travel_models import AgentInventoryItem
from .market_models import MarketListing, MarketTransaction


def fingerprints(owner: str) -> dict:
    from system_settings.models import WorldAction
    rows = {'catalog': list(CookingCatalog.objects.filter(pk=owner).values('id', 'rules', 'item_icons'))}
    for model in (CookingSkill, CookingOperation, AgentInventoryItem, MarketListing, MarketTransaction):
        rows[model.__name__] = list(model.objects.filter(owner_id=owner).order_by('pk').values())
    # Mutable FK links are cleared when an Agent/task is deleted; immutable actor and consumption survive.
    rows['energy'] = list(WorldAction.objects.filter(snapshot__cooking_energy=True, snapshot__owner_id=owner).order_by('pk').values('id', 'actor_id', 'energy_cost', 'consumed_at', 'status', 'result'))
    return {key: canonical_hash(json.loads(json.dumps(value, cls=DjangoJSONEncoder))) for key, value in rows.items()}


def checkpoint(owner: str) -> None:
    CookingIntegrity.objects.update_or_create(pk=owner, defaults={'hashes': fingerprints(owner)})


def checkpoint_all() -> None:
    owners = set(CookingCatalog.objects.values_list('pk', flat=True)) | set(CookingIntegrity.objects.values_list('pk', flat=True))
    for owner in owners:
        checkpoint(owner)


def changed(sender, instance, **kwargs):
    if is_tracking_suspended() or kwargs.get('raw'):
        return
    owner = instance.pk if sender is CookingCatalog else getattr(instance, 'owner_id', None)
    if sender.__name__ == 'WorldAction':
        owner = (instance.snapshot or {}).get('owner_id') if (instance.snapshot or {}).get('cooking_energy') else None
    if owner and (sender is CookingCatalog or CookingCatalog.objects.filter(pk=owner).exists()):
        checkpoint(owner)


def register_signals():
    from system_settings.models import WorldAction
    for model in (CookingCatalog, CookingSkill, CookingOperation, AgentInventoryItem, MarketListing, MarketTransaction, WorldAction):
        for signal in (post_save, post_delete):
            signal.connect(changed, sender=model, weak=False, dispatch_uid=f'cooking:{model.__name__}:{signal}')


def reconcile_cooking() -> None:
    from utils.sync_manager import SyncError
    from system_settings.models import WorldAction
    owners = set(CookingCatalog.objects.values_list('pk', flat=True)) | set(CookingSkill.objects.values_list('owner_id', flat=True)) | set(CookingOperation.objects.values_list('owner_id', flat=True)) | set(CookingIntegrity.objects.values_list('pk', flat=True))
    for owner in owners:
        integrity = CookingIntegrity.objects.filter(pk=owner).first()
        if not integrity or integrity.hashes != fingerprints(owner) or not CookingCatalog.objects.filter(pk=owner).exists():
            raise SyncError('烹饪快照不完整，拒绝恢复：' + ','.join(key for key, value in fingerprints(owner).items() if not integrity or integrity.hashes.get(key) != value))
        for skill in CookingSkill.objects.filter(owner_id=owner):
            experience = 0
            for op in sorted(CookingOperation.objects.filter(owner_id=owner, actor_id=skill.pk), key=lambda row: row.result.get('experience_before', -1)):
                if op.result.get('experience_before') != experience or op.result.get('experience_gained') != op.snapshot.get('experience'):
                    raise SyncError('厨艺成长链不一致')
                experience += op.snapshot['experience']
                if op.result.get('experience_after') != experience:
                    raise SyncError('厨艺经验记录不一致')
                action = WorldAction.objects.filter(pk=hashlib.sha256(f'cooking-energy:{op.pk}'.encode()).hexdigest(), actor_id=skill.pk, status='success', energy_cost=op.snapshot['energy_cost'], consumed_at=op.created_at, result__operation_id=op.pk).first()
                if not action:
                    raise SyncError('制作体力事实缺失')
            if skill.experience != experience:
                raise SyncError('厨艺经验缺失制作依据')
        if CookingOperation.objects.filter(owner_id=owner).exclude(actor_id__in=CookingSkill.objects.filter(owner_id=owner).values('pk')).exists():
            raise SyncError('制作记录缺失居民厨艺')
