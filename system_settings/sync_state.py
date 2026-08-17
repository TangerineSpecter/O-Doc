"""v2 同步的本机修订状态与信号抑制开关。"""
import hashlib
import json
import threading
import uuid
from contextlib import contextmanager

from django.utils import timezone

DEVICE_SETTING_KEY = 'system_sync_v2_device'
LOCAL_ONLY_MODEL_LABELS = frozenset({'system_settings.syncentitystate'})
_local = threading.local()


def is_tracking_suspended():
    return bool(getattr(_local, 'suspended', False))


@contextmanager
def suspend_tracking():
    previous = is_tracking_suspended()
    _local.suspended = True
    try:
        yield
    finally:
        _local.suspended = previous


def get_device_id():
    from system_settings.models import SystemSetting
    setting, _ = SystemSetting.objects.get_or_create(
        key=DEVICE_SETTING_KEY,
        defaults={'value': {'device_id': uuid.uuid4().hex}, 'description': 'v2 同步设备标识'},
    )
    value = setting.value or {}
    device_id = value.get('device_id')
    if not device_id:
        device_id = uuid.uuid4().hex
        setting.value = {'device_id': device_id}
        setting.save(update_fields=['value'])
    return device_id


def canonical_hash(value):
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str)
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def sync_entity_identity(model_label, object_pk, fields=None):
    """为跨设备自增主键模型生成与序列化快照一致的稳定身份。"""
    fields = fields or {}
    if model_label == 'auth.user' and fields.get('username'):
        return f"username:{fields['username']}"
    if model_label == 'auth.group' and fields.get('name'):
        return f"name:{fields['name']}"
    if model_label == 'user.userprofile' and fields.get('userid'):
        return f"userid:{fields['userid']}"
    if model_label == 'system_settings.skill' and (fields.get('skill_key') or fields.get('source') == 'built_in'):
        return f"skill:{fields.get('skill_key') or fields.get('name', '')}"
    return str(object_pk)


def should_track(sender):
    return (
        sender._meta.app_label in {
            'article', 'anthology', 'categories', 'tags', 'assets', 'stats',
            'ai_assistant', 'system_settings', 'user', 'auth',
        }
        and sender._meta.label_lower not in LOCAL_ONLY_MODEL_LABELS
        and not sender._meta.auto_created
    )


def record_change(sender, instance, deleted=False):
    if is_tracking_suspended() or not should_track(sender):
        return
    from system_settings.models import SyncEntityState
    fields = {
        field.name: getattr(instance, field.name, None)
        for field in sender._meta.fields
    }
    SyncEntityState.objects.update_or_create(
        model_label=sender._meta.label_lower,
        object_pk=sync_entity_identity(sender._meta.label_lower, instance.pk, fields),
        defaults={
            'revision_at': timezone.now(),
            'origin_device': get_device_id(),
            'is_deleted': deleted,
        },
    )


def record_bulk_change(queryset):
    """QuerySet.update 不会触发 post_save，调用方须在批量写入前记录修订。"""
    if is_tracking_suspended() or not should_track(queryset.model):
        return
    object_pks = list(queryset.values_list(queryset.model._meta.pk.attname, flat=True))
    if not object_pks:
        return
    from system_settings.models import SyncEntityState
    now = timezone.now()
    device_id = get_device_id()
    for object_pk in object_pks:
        SyncEntityState.objects.update_or_create(
            model_label=queryset.model._meta.label_lower,
            object_pk=str(object_pk),
            defaults={'revision_at': now, 'origin_device': device_id, 'is_deleted': False},
        )
