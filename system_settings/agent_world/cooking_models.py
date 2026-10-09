"""烹饪目录、居民成长与不可变制作事实；不另建背包或钱包。"""
from django.db import models
from django.utils import timezone


class CookingCatalog(models.Model):
    id = models.CharField(primary_key=True, max_length=40)
    rules = models.JSONField(default=dict)
    item_icons = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'


class CookingSkill(models.Model):
    id = models.CharField(primary_key=True, max_length=40)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_name = models.CharField(max_length=50)
    experience = models.PositiveBigIntegerField(default=0)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'


class CookingOperation(models.Model):
    id = models.CharField(primary_key=True, max_length=140)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    actor_name = models.CharField(max_length=50)
    opportunity_id = models.CharField(max_length=64, db_index=True)
    recipe_id = models.CharField(max_length=40)
    snapshot = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    reason = models.CharField(max_length=500)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'
        ordering = ['created_at', 'id']


class CookingIntegrity(models.Model):
    id = models.CharField(primary_key=True, max_length=40)
    hashes = models.JSONField(default=dict)

    class Meta:
        app_label = 'system_settings'
