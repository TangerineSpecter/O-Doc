"""大乐透的同步业务事实；执行授权仍属于本机生活日程。"""
from django.db import models
from django.utils import timezone


class LotteryConfig(models.Model):
    id = models.CharField(primary_key=True, max_length=40)  # owner
    enabled = models.BooleanField(default=False)
    first_draw_at = models.DateTimeField()
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'


class LotteryRound(models.Model):
    id = models.CharField(primary_key=True, max_length=100)
    owner_id = models.CharField(max_length=40, db_index=True)
    sequence = models.PositiveIntegerField()
    opens_at = models.DateTimeField()
    closes_at = models.DateTimeField()
    draws_at = models.DateTimeField()
    rules = models.JSONField(default=dict)
    status = models.CharField(max_length=16, default='open')
    result = models.JSONField(default=dict)  # 固化号码、售票收入、补贴、结转及各档奖金
    settled_at = models.DateTimeField(null=True)

    class Meta:
        app_label = 'system_settings'
        constraints = [models.UniqueConstraint(fields=['owner_id', 'sequence'], name='lottery_owner_sequence')]


class LotteryTicket(models.Model):
    id = models.CharField(primary_key=True, max_length=120)
    owner_id = models.CharField(max_length=40, db_index=True)
    round = models.ForeignKey(LotteryRound, on_delete=models.PROTECT, related_name='tickets')
    actor_id = models.CharField(max_length=40, db_index=True)
    actor_name = models.CharField(max_length=50)
    life_item_id = models.CharField(max_length=64, db_index=True)
    purchase_key = models.CharField(max_length=120, db_index=True)
    ordinal = models.PositiveSmallIntegerField()
    numbers = models.JSONField(default=list)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'
        constraints = [models.UniqueConstraint(fields=['purchase_key', 'ordinal'], name='lottery_purchase_ordinal')]


class LotteryIntegrity(models.Model):
    id = models.CharField(primary_key=True, max_length=40)
    digest = models.CharField(max_length=64)

    class Meta:
        app_label = 'system_settings'
