"""悬赏看板：用户发布、居民领取、交付验收与奖励。

悬赏是外部驱动事件，不进入 LifeItem 日程额度；执行授权和租约仍使用本机既有模型。
"""
import uuid

from django.db import models
from django.utils import timezone


def bounty_id():
    return 'bounty_' + uuid.uuid4().hex[:12]


def invite_id():
    return 'invite_' + uuid.uuid4().hex[:12]


def delivery_id():
    return 'delivery_' + uuid.uuid4().hex[:12]


BOUNTY_STATUSES = ('open', 'claimed', 'delivered', 'accepted', 'cancelled')
INVITE_STATUSES = ('pending', 'accepted', 'declined', 'expired')
DELIVERY_STATUSES = ('pending', 'accepted', 'rejected')


class Bounty(models.Model):
    """一条悬赏。领取后同一时刻只允许一个居民执行。"""

    id = models.CharField(primary_key=True, max_length=40, default=bounty_id)
    owner_id = models.CharField(max_length=40, db_index=True)
    title = models.CharField(max_length=200)
    objective = models.TextField()
    requirements = models.TextField(blank=True, default='')
    collection_id = models.CharField(max_length=40)
    category_id = models.CharField(max_length=64)
    reward = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=16, choices=[(value, value) for value in BOUNTY_STATUSES],
                              default='open', db_index=True)
    agent = models.ForeignKey('system_settings.Agent', null=True, blank=True, on_delete=models.SET_NULL,
                              related_name='bounties')
    article = models.ForeignKey('article.Article', null=True, blank=True, on_delete=models.SET_NULL,
                                related_name='bounty_deliveries')
    invite_at = models.DateTimeField(default=timezone.now, db_index=True)
    invite_round = models.PositiveIntegerField(default=0)
    claimed_at = models.DateTimeField(null=True, blank=True)
    expire_at = models.DateTimeField(null=True, blank=True, db_index=True)
    next_try_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    attempt = models.PositiveIntegerField(default=0)
    failures = models.PositiveIntegerField(default=0)
    reject_reason = models.TextField(blank=True, default='')
    last_error = models.CharField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        ordering = ['-created_at', '-id']


class BountyInvite(models.Model):
    """按加权抽签顺序逐个询问的接单邀请。"""

    id = models.CharField(primary_key=True, max_length=40, default=invite_id)
    bounty = models.ForeignKey(Bounty, on_delete=models.CASCADE, related_name='invites')
    agent = models.ForeignKey('system_settings.Agent', null=True, blank=True, on_delete=models.SET_NULL,
                              related_name='bounty_invites')
    sort = models.PositiveIntegerField(default=0)
    scheduled_at = models.DateTimeField(default=timezone.now, db_index=True)
    status = models.CharField(max_length=16, choices=[(value, value) for value in INVITE_STATUSES],
                              default='pending')
    decision = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'
        ordering = ['bounty_id', 'sort', 'id']


class BountyDelivery(models.Model):
    """一次交付事实；驳回后保留记录，居民继续处理同一悬赏。"""

    id = models.CharField(primary_key=True, max_length=40, default=delivery_id)
    bounty = models.ForeignKey(Bounty, on_delete=models.CASCADE, related_name='deliveries')
    agent = models.ForeignKey('system_settings.Agent', null=True, blank=True, on_delete=models.SET_NULL,
                              related_name='bounty_submissions')
    article = models.ForeignKey('article.Article', null=True, blank=True, on_delete=models.SET_NULL,
                                related_name='bounty_submission_records')
    run_record = models.ForeignKey('system_settings.AgentRunRecord', null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='bounty_deliveries')
    summary = models.TextField(blank=True, default='')
    status = models.CharField(max_length=16, choices=[(value, value) for value in DELIVERY_STATUSES],
                              default='pending', db_index=True)
    reject_reason = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'system_settings'
        ordering = ['-created_at', '-id']
