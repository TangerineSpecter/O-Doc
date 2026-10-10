from django.db import models
from django.utils import timezone


class AgentMemoryState(models.Model):
    agent = models.OneToOneField('system_settings.Agent', primary_key=True, on_delete=models.CASCADE)
    owner_id = models.CharField(max_length=40)
    enabled_at = models.DateTimeField(default=timezone.now)
    processed_day = models.DateField(null=True)
    attempted_day = models.DateField(null=True)
    status = models.CharField(max_length=16, default='pending')
    detail = models.CharField(max_length=300, blank=True)
    observations = models.JSONField(default=dict)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'


class AgentMemoryLease(models.Model):
    id = models.CharField(primary_key=True, max_length=40)
    token = models.CharField(max_length=64, blank=True)
    until = models.DateTimeField(null=True)

    class Meta:
        app_label = 'system_settings'
