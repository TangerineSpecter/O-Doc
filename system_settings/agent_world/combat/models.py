"""Business records sync; execution permissions and leases remain device-local."""
import uuid
from django.db import models
from django.utils import timezone
from ..life_models import LifeTimedModel


def identity():
    return uuid.uuid4().hex


class CombatCatalog(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=64)
    digest = models.CharField(max_length=64)
    tables = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)


class CombatConfig(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=40)
    daily_minutes = models.PositiveIntegerField(default=120)
    requests = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)


class CombatProfile(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=40)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_name = models.CharField(max_length=50)
    catalog_id = models.CharField(max_length=64)
    progression = models.JSONField(default=dict)
    loadout = models.JSONField(default=dict)
    hp = models.PositiveIntegerField(default=104)
    mp = models.PositiveIntegerField(default=62)
    recovered_at = models.DateTimeField(default=timezone.now)
    rest_until = models.DateTimeField(null=True)
    loot_progress = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)


class EquipmentInstance(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=64, default=identity)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    catalog_id = models.CharField(max_length=64)
    template_id = models.CharField(max_length=64)
    snapshot = models.JSONField(default=dict)
    value = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    bound = models.BooleanField(default=False)
    locked = models.BooleanField(default=False)
    sold = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)


class Exploration(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    actor_name = models.CharField(max_length=50)
    catalog_id = models.CharField(max_length=64)
    life_item_id = models.CharField(max_length=64, blank=True)
    record_id = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=24, default='preparing', db_index=True)
    phase = models.CharField(max_length=24, default='preparing')
    reason = models.CharField(max_length=500, blank=True)
    duration_seconds = models.PositiveIntegerField(default=1800)
    elapsed_seconds = models.PositiveIntegerField(default=0)
    revision = models.PositiveIntegerField(default=0)
    snapshot = models.JSONField(default=dict)
    state = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    next_tick_at = models.DateTimeField(null=True, db_index=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    ended_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['actor_id'], condition=models.Q(status__in=['preparing', 'active', 'paused', 'settling']), name='combat_single_open_actor')]


class CombatEncounter(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=100)
    exploration_id = models.CharField(max_length=64, db_index=True)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    number = models.PositiveIntegerField()
    monster = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    started_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True)


class CombatFact(LifeTimedModel):
    """Append-only actor chain, also records round, growth, supply and reward provenance."""
    id = models.CharField(primary_key=True, max_length=140)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    exploration_id = models.CharField(max_length=64, blank=True, db_index=True)
    sequence = models.PositiveBigIntegerField()
    kind = models.CharField(max_length=24)
    elapsed_seconds = models.PositiveIntegerField(default=0)
    payload = models.JSONField(default=dict)
    previous_hash = models.CharField(max_length=64, blank=True)
    digest = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['actor_id', 'sequence'], name='combat_actor_fact_sequence')]
        ordering = ['sequence']


class CombatIntegrity(models.Model):
    id = models.CharField(primary_key=True, max_length=40)
    owner_id = models.CharField(max_length=40, db_index=True)
    head = models.PositiveBigIntegerField(default=0)
    digest = models.CharField(max_length=64, blank=True)
    frame = models.CharField(max_length=64, blank=True)


class CombatRuntime(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, blank=True)
    authorized = models.BooleanField(default=False)
    auto_enabled = models.BooleanField(default=False)
    requests = models.JSONField(default=dict)
    promotion_pending = models.BooleanField(default=False)
    token = models.CharField(max_length=64, blank=True)
    until = models.DateTimeField(null=True)
