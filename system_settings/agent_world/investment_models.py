"""投资事实参与同步；可重新查询的行情、新闻正文与指标仅保留本机。"""
from django.db import models
from django.utils import timezone


class InvestmentAccount(models.Model):
    id = models.CharField(primary_key=True, max_length=40)  # Stable Agent ID, never name.
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_name = models.CharField(max_length=50)
    positions = models.JSONField(default=dict)
    trade_keys = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'


class InvestmentDecision(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    actor_name = models.CharField(max_length=50)
    reference_date = models.DateField()
    execution_date = models.DateField()
    task = models.ForeignKey('system_settings.AgentTask', null=True, on_delete=models.SET_NULL)
    record = models.ForeignKey('system_settings.AgentRunRecord', null=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=16, default='running')
    reason = models.TextField(blank=True)
    calls = models.JSONField(default=list)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        ordering = ['-created_at', 'id']


class InvestmentTrade(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    actor_name = models.CharField(max_length=50)
    decision = models.ForeignKey(InvestmentDecision, on_delete=models.PROTECT)
    operation = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'
        ordering = ['created_at', 'id']


class InvestmentNewsClaim(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    day = models.DateField()
    status = models.CharField(max_length=16, default='claimed')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'
        constraints = [models.UniqueConstraint(fields=['owner_id', 'day'], name='investment_news_owner_day')]


class InvestmentIntegrity(models.Model):
    id = models.CharField(primary_key=True, max_length=40)
    hashes = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'


class InvestmentCache(models.Model):
    id = models.CharField(primary_key=True, max_length=220)
    payload = models.JSONField(default=dict)
    expires_at = models.DateTimeField()

    class Meta:
        app_label = 'system_settings'
