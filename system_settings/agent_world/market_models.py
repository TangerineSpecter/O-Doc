"""市场业务事实参与同步，执行凭证仅保留本机。"""
from django.db import models
from django.utils import timezone


class MarketConfig(models.Model):
    id = models.CharField(primary_key=True, max_length=40)
    slot_count = models.PositiveIntegerField(default=8)
    seed = models.CharField(max_length=64)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'


class MarketBatch(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    starts_at = models.DateTimeField()
    expires_at = models.DateTimeField()
    slots = models.JSONField(default=list)
    feed_price = models.DecimalField(max_digits=12, decimal_places=2)
    purchase_keys = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        constraints = [models.UniqueConstraint(fields=['owner_id', 'starts_at'], name='market_owner_hour_unique')]


class MarketListing(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    seller_id = models.CharField(max_length=40, db_index=True)
    seller_name = models.CharField(max_length=50)
    item = models.JSONField(default=dict)
    initial_quantity = models.PositiveIntegerField()
    remaining_quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=16, default='active')
    history = models.JSONField(default=list)
    operation_keys = models.JSONField(default=list)
    created_at = models.DateTimeField(default=timezone.now)
    repriced_at = models.DateTimeField(null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        ordering = ['-created_at', 'id']


class MarketSession(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    actor_name = models.CharField(max_length=50)
    task = models.ForeignKey('system_settings.AgentTask', null=True, on_delete=models.SET_NULL)
    record = models.ForeignKey('system_settings.AgentRunRecord', null=True, on_delete=models.SET_NULL)
    mode = models.CharField(max_length=16, default='mcp')
    status = models.CharField(max_length=16, default='active')
    call_count = models.PositiveIntegerField(default=0)
    calls = models.JSONField(default=list)
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True)
    reason = models.CharField(max_length=500, blank=True)

    class Meta:
        app_label = 'system_settings'
        ordering = ['-created_at', 'id']


class MarketTransaction(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    session = models.ForeignKey(MarketSession, on_delete=models.PROTECT)
    actor_id = models.CharField(max_length=40, db_index=True)
    actor_name = models.CharField(max_length=50)
    operation = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'
        ordering = ['-created_at', 'id']


class MarketRuntime(models.Model):
    # Never synchronized: a copied session is not permission to execute.
    id = models.CharField(primary_key=True, max_length=64)
    agent_token = models.CharField(max_length=64)
    process_id = models.IntegerField()

    class Meta:
        app_label = 'system_settings'


class MarketIntegrity(models.Model):
    """Latest coherent asset checkpoint. Mixed device snapshots are rejected, never replayed blindly."""
    id = models.CharField(primary_key=True, max_length=40)
    hashes = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
