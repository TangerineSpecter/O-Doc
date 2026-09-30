"""可同步的社交事实。身份采用快照，删除居民不删除世界历史。"""
from django.db import models
from django.utils import timezone
from .life_models import LifeTimedModel, life_id


class SocialConfig(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=40)
    settings = models.JSONField(default=dict)
    overrides = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)


class Moment(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=40, default=life_id)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=100)
    identity = models.JSONField(default=dict)
    content = models.TextField()
    images = models.JSONField(default=list)
    image_state = models.JSONField(default=dict)
    evidence = models.JSONField(default=list)
    is_valid = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)


class MomentComment(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=40, default=life_id)
    moment = models.ForeignKey(Moment, on_delete=models.PROTECT, related_name='comments')
    actor_id = models.CharField(max_length=100)
    identity = models.JSONField(default=dict)
    content = models.TextField()
    parent_id = models.CharField(max_length=40, blank=True)
    root_id = models.CharField(max_length=40, blank=True)
    reply_to_actor_id = models.CharField(max_length=100, blank=True)
    is_valid = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)


class MomentLike(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=64)
    moment = models.ForeignKey(Moment, on_delete=models.PROTECT, related_name='likes')
    actor_id = models.CharField(max_length=100)
    identity = models.JSONField(default=dict)
    is_valid = models.BooleanField(default=True)
    rewarded = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['moment', 'actor_id'], name='social_like_actor')]


class SocialInbox(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    target_id = models.CharField(max_length=100, db_index=True)
    sender_id = models.CharField(max_length=100)
    source_kind = models.CharField(max_length=20)
    source_id = models.CharField(max_length=40)
    content_id = models.CharField(max_length=40)
    root_id = models.CharField(max_length=40, blank=True)
    identity = models.JSONField(default=dict)
    status = models.CharField(max_length=20, default='pending')
    reason = models.TextField(blank=True)
    available_at = models.DateTimeField(default=timezone.now)
    read_at = models.DateTimeField(null=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)


class SocialRelation(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    counterpart_id = models.CharField(max_length=100)
    counterpart_identity = models.JSONField(default=dict)
    familiarity = models.PositiveSmallIntegerField(default=0)
    affinity = models.SmallIntegerField(default=0)
    band = models.CharField(max_length=20, default='中性')
    emotion = models.JSONField(default=dict)
    reason = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['owner_id', 'actor_id', 'counterpart_id'], name='social_relation_direction')]


class SocialEvent(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40)
    counterpart_id = models.CharField(max_length=100)
    source_key = models.CharField(max_length=160)
    category = models.CharField(max_length=32)
    reason = models.TextField()
    before = models.JSONField(default=dict)
    after = models.JSONField(default=dict)
    rule_version = models.PositiveSmallIntegerField(default=1)
    created_at = models.DateTimeField(default=timezone.now)


class SocialOpportunity(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40)
    business_date = models.DateField()
    kind = models.CharField(max_length=20)
    status = models.CharField(max_length=20, default='pending')
    snapshot = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)


class SocialIntegrity(models.Model):
    id = models.CharField(primary_key=True, max_length=40)
    version = models.PositiveSmallIntegerField(default=1)
    hashes = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)
