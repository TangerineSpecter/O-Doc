"""农场以整份聚合状态同步，避免独立合并地块和生产周期造成半笔经营。"""
from django.db import models
from django.utils import timezone


class FarmCatalog(models.Model):
    id = models.CharField(primary_key=True, max_length=40)
    seed = models.CharField(max_length=64)
    rules = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'


class AgentFarm(models.Model):
    # Stable Agent ID, kept even after the resident is removed.
    id = models.CharField(primary_key=True, max_length=40)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_name = models.CharField(max_length=50)
    appearance = models.JSONField(default=dict)
    state = models.JSONField(default=dict)
    revision = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'


class FarmOperation(models.Model):
    id = models.CharField(primary_key=True, max_length=140)
    farm = models.ForeignKey(AgentFarm, on_delete=models.CASCADE, related_name='operations')
    opportunity_id = models.CharField(max_length=64, db_index=True)
    operation = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    reason = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'
        ordering = ['-created_at', '-id']
