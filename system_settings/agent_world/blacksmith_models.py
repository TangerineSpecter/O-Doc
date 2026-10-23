"""Account recipe settings and immutable, single-piece forging receipts."""
from django.db import models
from django.utils import timezone


class BlacksmithCatalog(models.Model):
    id = models.CharField(primary_key=True, max_length=40)
    version = models.PositiveIntegerField(default=1)
    rules = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'


class BlacksmithOperation(models.Model):
    id = models.CharField(primary_key=True, max_length=140)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    actor_name = models.CharField(max_length=50)
    opportunity_id = models.CharField(max_length=64, db_index=True)
    piece_index = models.PositiveSmallIntegerField()
    recipe_id = models.CharField(max_length=40)
    snapshot = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    reason = models.CharField(max_length=500)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'
        ordering = ['created_at', 'id']
        constraints = [
            models.UniqueConstraint(fields=['opportunity_id', 'piece_index'], name='blacksmith_piece_unique'),
            models.CheckConstraint(condition=models.Q(piece_index__lt=3), name='blacksmith_piece_limit'),
        ]


class BlacksmithIntegrity(models.Model):
    id = models.CharField(primary_key=True, max_length=40)
    hashes = models.JSONField(default=dict)

    class Meta:
        app_label = 'system_settings'


class BlacksmithGoal(models.Model):
    """One intended piece; its recipe and material progress are read live."""

    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    recipe_id = models.CharField(max_length=40)
    template_id = models.CharField(max_length=80)
    status = models.CharField(max_length=16, default='active')  # active / completed / invalid
    operation_id = models.CharField(max_length=140, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        ordering = ['created_at', 'id']
        indexes = [models.Index(fields=['owner_id', 'actor_id', 'status'], name='blacksmith_goal_actor')]
