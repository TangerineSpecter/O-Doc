from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .sync_state import record_change, should_track


@receiver(post_save)
def track_sync_save(sender, instance, **kwargs):
    if should_track(sender):
        record_change(sender, instance, deleted=False)


@receiver(post_delete)
def track_sync_delete(sender, instance, **kwargs):
    if should_track(sender):
        record_change(sender, instance, deleted=True)
