"""业务状态全部同步；FishingRuntime 是设备本地授权与租约。"""
from django.db import models
from django.utils import timezone
from ..life_models import LifeTimedModel


class FishingCatalog(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=40)
    rules = models.JSONField(default=dict)

    class Meta:
        app_label = 'system_settings'


class FishingConfig(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=40)
    enabled = models.BooleanField(default=False)
    catalog = models.ForeignKey(FishingCatalog, on_delete=models.PROTECT)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'


class FishingProfile(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=40)  # actor
    owner_id = models.CharField(max_length=40, db_index=True)
    experience = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'


class FishingTrip(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    actor_name = models.CharField(max_length=50)
    life_item_id = models.CharField(max_length=64, unique=True)
    record_id = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=16, default='preparing', db_index=True)
    rules = models.JSONField(default=dict)
    state = models.JSONField(default=dict)
    revision = models.PositiveIntegerField(default=0)
    next_tick_at = models.DateTimeField(null=True)
    departed_at = models.DateTimeField(null=True)
    deadline = models.DateTimeField(null=True)
    ended_at = models.DateTimeField(null=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        constraints = [models.UniqueConstraint(fields=['actor_id'], condition=models.Q(ended_at__isnull=True), name='fishing_actor_one_open')]


class FishingEvent(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=100)
    trip = models.ForeignKey(FishingTrip, on_delete=models.PROTECT, related_name='events')
    sequence = models.PositiveIntegerField()
    kind = models.CharField(max_length=24)
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'
        ordering = ['sequence']
        constraints = [models.UniqueConstraint(fields=['trip','sequence'], name='fishing_event_sequence')]


class FishingIntegrity(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=40)
    digest = models.CharField(max_length=64)

    class Meta:
        app_label = 'system_settings'


class FishingRuntime(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    authorized = models.BooleanField(default=False)
    token = models.CharField(max_length=64, blank=True)
    until = models.DateTimeField(null=True)

    class Meta:
        app_label = 'system_settings'
