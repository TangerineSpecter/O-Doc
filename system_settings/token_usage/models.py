import uuid
from django.db import models
from django.utils import timezone


def usage_id():
    return uuid.uuid4().hex


class AgentTokenUsage(models.Model):
    """Stable identity snapshots survive deletion of the referenced business objects."""
    id = models.CharField(primary_key=True, max_length=40, default=usage_id)
    agent_key = models.CharField(max_length=40, blank=True, default='')
    agent_name = models.CharField(max_length=100, blank=True, default='系统规划')
    task_key = models.CharField(max_length=40, blank=True, default='')
    task_name = models.CharField(max_length=100, blank=True, default='')
    record_key = models.CharField(max_length=40, blank=True, default='')
    owner_key = models.CharField(max_length=100, blank=True, default='', db_index=True)
    purpose = models.CharField(max_length=40, default='task')
    phase = models.CharField(max_length=100, blank=True, default='')
    model_key = models.CharField(max_length=40, blank=True, default='')
    model_name = models.CharField(max_length=200, blank=True, default='')
    provider_key = models.CharField(max_length=40, blank=True, default='')
    provider_name = models.CharField(max_length=100, blank=True, default='')
    device_id = models.CharField(max_length=40)
    attempt = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, default='running')
    input_tokens = models.PositiveBigIntegerField(null=True, blank=True)
    output_tokens = models.PositiveBigIntegerField(null=True, blank=True)
    total_tokens = models.PositiveBigIntegerField(null=True, blank=True)
    cached_tokens = models.PositiveBigIntegerField(null=True, blank=True)
    reasoning_tokens = models.PositiveBigIntegerField(null=True, blank=True)
    usage_complete = models.BooleanField(default=False)
    started_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        db_table = 'sys_agent_token_usage'
        indexes = [
            models.Index(fields=['started_at', 'id'], name='token_usage_time'),
            models.Index(fields=['agent_key', 'started_at'], name='token_usage_agent'),
            models.Index(fields=['task_key', 'started_at'], name='token_usage_task'),
            models.Index(fields=['record_key', 'agent_key'], name='token_usage_record'),
        ]
