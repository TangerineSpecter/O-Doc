"""Meaningful business changes wake prechecks, never bypass the decision cooldown."""
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .life_time import local_time, storage_time


@receiver(post_save, dispatch_uid='life-idle-wake-save')
@receiver(post_delete, dispatch_uid='life-idle-wake-delete')
def wake(sender, instance, **kwargs):
    labels = {'lifeitem', 'lifeconfig', 'agentinventoryitem', 'worldaction', 'systemsetting'}
    if sender._meta.app_label != 'system_settings' or sender._meta.model_name not in labels or kwargs.get('raw'):
        return
    if sender._meta.model_name == 'systemsetting' and instance.pk != 'system_world_stamina':
        return
    # No query while migrations/restore deserialize historical models. Restored
    # checkpoints are reconciled before the user grants this device permission.
    from .life_models import LifeInterleavingState
    from django.db import connection
    if LifeInterleavingState._meta.db_table not in connection.introspection.table_names():
        return
    rows = LifeInterleavingState.objects.all()
    actor = getattr(instance, 'actor_id', None) or getattr(instance, 'agent_id', None)
    if actor:
        rows = rows.filter(pk=actor)
    elif sender._meta.model_name == 'lifeconfig':
        rows = rows.filter(owner_id=instance.pk)
    elif sender._meta.model_name != 'systemsetting':
        return
    now = storage_time(local_time())
    for row in rows.filter(next_check_at__gt=now):
        row.next_check_at = now
        row.save(update_fields=['next_check_at', 'updated_at'])
