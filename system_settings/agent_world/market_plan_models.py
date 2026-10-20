"""每日市场计划、采购目标、处置策略与小时预检的本机业务状态。

计划、目标、处置策略和装备不买属于同步资产；小时预检与待标记队列只是本机
执行进度，不同步，避免另一台设备凭旧队列重复执行。
"""
import hashlib
from decimal import Decimal

from django.db import models
from django.utils import timezone


def stable_key(*parts: object, length: int = 64) -> str:
    return hashlib.sha256(':'.join(str(part) for part in parts).encode()).hexdigest()[:length]


class MarketPlan(models.Model):
    """一位居民一天的市场规划：预算、目标与装备评价签名。"""

    id = models.CharField(primary_key=True, max_length=80)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    actor_name = models.CharField(max_length=50, blank=True, default='')
    plan_date = models.DateField(db_index=True)
    status = models.CharField(max_length=16, default='active')
    budget = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    spent = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal('0'))
    equipment_signature = models.CharField(max_length=64, blank=True, default='')
    summary = models.CharField(max_length=1000, blank=True, default='')
    context = models.JSONField(default=dict)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        ordering = ['-plan_date', 'id']
        constraints = [
            models.UniqueConstraint(fields=['owner_id', 'actor_id', 'plan_date'],
                                    name='market_plan_actor_day_unique'),
        ]


class MarketGoal(models.Model):
    """当日采购目标；装备目标按部位，其余按 sku。"""

    id = models.CharField(primary_key=True, max_length=80)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    plan = models.ForeignKey(MarketPlan, on_delete=models.CASCADE, related_name='goals')
    kind = models.CharField(max_length=16)  # shop / listing / equipment
    sku = models.CharField(max_length=128, blank=True, default='')
    slot = models.CharField(max_length=32, blank=True, default='')
    min_stars = models.PositiveSmallIntegerField(default=1)
    quantity = models.PositiveIntegerField(default=1)
    filled_quantity = models.PositiveIntegerField(default=0)
    max_unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    deadline = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, default='open')
    reason = models.CharField(max_length=500, blank=True, default='')
    context = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        ordering = ['created_at', 'id']
        indexes = [
            models.Index(fields=['owner_id', 'actor_id', 'status'], name='market_goal_actor_status'),
            models.Index(fields=['plan', 'status'], name='market_goal_plan_status'),
        ]


class MarketDisposition(models.Model):
    """按 sku 长期有效的处置策略；新入库自动套用目标持有量。"""

    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    sku = models.CharField(max_length=128)
    target_hold = models.PositiveIntegerField(default=0)
    sell_ratio = models.PositiveSmallIntegerField(default=0)
    list_ratio = models.PositiveSmallIntegerField(default=0)
    star_order = models.CharField(max_length=8, default='low')  # high / low
    list_price_ratio = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('1.20'))
    status = models.CharField(max_length=16, default='active')  # active / pending / review
    source = models.CharField(max_length=16, default='model')  # model / default / manual
    reason = models.CharField(max_length=500, blank=True, default='')
    revision = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        ordering = ['sku', 'id']
        constraints = [
            models.UniqueConstraint(fields=['owner_id', 'actor_id', 'sku'],
                                    name='market_disposition_actor_sku_unique'),
        ]


class MarketDispositionTask(models.Model):
    """待标记队列；只在本机消费，不同步。"""

    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    sku = models.CharField(max_length=128)
    quantity = models.PositiveIntegerField(default=0)
    source = models.CharField(max_length=24, blank=True, default='')
    status = models.CharField(max_length=16, default='pending')  # pending / running / done / failed
    attempts = models.PositiveSmallIntegerField(default=0)
    answers = models.JSONField(default=dict)
    error = models.CharField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        ordering = ['created_at', 'id']
        indexes = [
            models.Index(fields=['owner_id', 'actor_id', 'status'], name='market_task_actor_status'),
            models.Index(fields=['status', 'created_at'], name='market_task_status_created'),
        ]


class MarketNoBuy(models.Model):
    """装备实例级永久不买；只在实例真正消失时清理。"""

    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    equipment_id = models.CharField(max_length=64)
    snapshot = models.JSONField(default=dict)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    reason = models.CharField(max_length=300, blank=True, default='')
    decided_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        ordering = ['-decided_at', 'id']
        constraints = [
            models.UniqueConstraint(fields=['owner_id', 'actor_id', 'equipment_id'],
                                    name='market_no_buy_actor_equipment_unique'),
        ]


class MarketTick(models.Model):
    """每居民每小时的预检与进场记录；只在本机消费，不同步。"""

    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    hour = models.DateTimeField(db_index=True)
    scheduled_at = models.DateTimeField()
    status = models.CharField(max_length=16, default='pending')  # pending / skipped / entered / done / failed
    reason = models.CharField(max_length=500, blank=True, default='')
    hits = models.JSONField(default=dict)
    session_id = models.CharField(max_length=64, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        ordering = ['-hour', 'id']
        constraints = [
            models.UniqueConstraint(fields=['owner_id', 'actor_id', 'hour'],
                                    name='market_tick_actor_hour_unique'),
        ]
        indexes = [
            models.Index(fields=['status', 'scheduled_at'], name='market_tick_status_scheduled'),
        ]


def plan_id(owner: str, actor: str, day) -> str:
    return stable_key('market-plan', owner, actor, day, length=80)


def disposition_id(owner: str, actor: str, sku: str) -> str:
    return stable_key('market-disposition', owner, actor, sku)


def disposition_task_id(owner: str, actor: str, sku: str, source: str, operation: str) -> str:
    return stable_key('market-disposition-task', owner, actor, sku, source, operation)


def no_buy_id(owner: str, actor: str, equipment_id: str) -> str:
    return stable_key('market-no-buy', owner, actor, equipment_id)


def tick_id(owner: str, actor: str, hour) -> str:
    return stable_key('market-tick', owner, actor, hour)
