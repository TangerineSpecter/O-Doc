"""完整社交事实校验；同步恢复不产生社交或生图请求。"""
import hashlib
import json
from django.core.serializers.json import DjangoJSONEncoder
from .social_models import (SocialConfig, Moment, MomentComment, MomentLike, SocialInbox,
                            SocialRelation, SocialEvent, SocialOpportunity, SocialIntegrity)


def fingerprints(owner):
    queries = [SocialConfig.objects.filter(pk=owner)]
    queries += [m.objects.filter(owner_id=owner) for m in (Moment, SocialInbox, SocialRelation, SocialEvent, SocialOpportunity)]
    queries += [m.objects.filter(moment__owner_id=owner) for m in (MomentComment, MomentLike)]
    return {q.model.__name__: hashlib.sha256(json.dumps(list(q.order_by('pk').values()), cls=DjangoJSONEncoder,
            sort_keys=True, separators=(',', ':')).encode()).hexdigest() for q in queries}


def checkpoint_all():
    owners = set(SocialConfig.objects.values_list('pk', flat=True)) | set(Moment.objects.values_list('owner_id', flat=True))
    owners |= set(SocialRelation.objects.values_list('owner_id', flat=True)) | set(SocialInbox.objects.values_list('owner_id', flat=True))
    for owner in owners:
        hashes = fingerprints(owner)
        row, created = SocialIntegrity.objects.get_or_create(pk=owner, defaults={'hashes': hashes})
        if not created and row.hashes != hashes: row.hashes = hashes; row.save()


def reconcile_social():
    from utils.sync_manager import SyncError
    from system_settings.models import WorldActionRuntime
    owners = set(SocialIntegrity.objects.values_list('pk', flat=True))
    for model in (SocialConfig, Moment, SocialInbox, SocialRelation, SocialEvent, SocialOpportunity):
        owners |= set(model.objects.values_list('pk' if model == SocialConfig else 'owner_id', flat=True))
    for owner in owners:
        row = SocialIntegrity.objects.filter(pk=owner).first()
        if not row or row.version != 1 or row.hashes != fingerprints(owner): raise SyncError('社交快照版本或业务事实不完整，拒绝恢复')
    from assets.models import Asset
    for row in Moment.objects.filter(is_valid=True):
        if Asset.objects.filter(pk__in=row.images, is_valid=True).count() != len(set(row.images)): raise SyncError('朋友圈快照缺少引用图片')
        task_id = row.image_state.get('task_id')
        if task_id:
            from prompts.models import ImageGenerationTask
            if not ImageGenerationTask.objects.filter(pk=task_id).exists(): raise SyncError('朋友圈快照缺少生图任务')
    WorldActionRuntime.objects.filter(pk__startswith='social-').update(token='', until=None, enabled=False)
    # 社交也受全世界本机运行开关约束。
    WorldActionRuntime.objects.filter(pk='world').update(token='', until=None, enabled=False)
