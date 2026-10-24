"""Shared adventure business facts; local execution uses CombatRuntime only."""
from django.db import models
from django.utils import timezone
from ..life_models import LifeTimedModel


class AdventureParty(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    catalog_id = models.CharField(max_length=64)
    dungeon_id = models.CharField(max_length=64)
    leader_id = models.CharField(max_length=40)
    status = models.CharField(max_length=16, default='active', db_index=True)
    state = models.JSONField(default=dict)
    revision = models.PositiveBigIntegerField(default=0)
    head = models.PositiveBigIntegerField(default=0)
    digest = models.CharField(max_length=64, blank=True)
    frame = models.CharField(max_length=64, blank=True)
    frame_version = models.PositiveSmallIntegerField(default=1)
    next_tick_at = models.DateTimeField(null=True, db_index=True)
    ends_at = models.DateTimeField()
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)


class AdventureMember(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=100)
    party_id = models.CharField(max_length=64, db_index=True)
    exploration_id = models.CharField(max_length=64, unique=True)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    active = models.BooleanField(default=True)
    joined_at = models.DateTimeField(default=timezone.now)
    ends_at = models.DateTimeField()
    left_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['actor_id'], condition=models.Q(active=True), name='adventure_single_active_member')]


class AdventureWave(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=100)
    party_id = models.CharField(max_length=64, db_index=True)
    owner_id = models.CharField(max_length=40)
    number = models.PositiveIntegerField()
    snapshot = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True)
    content_digest = models.CharField(max_length=64, blank=True)

    def _save_life(self, *args, **kwargs):
        from .party_integrity import WAVE_FIELDS, wave_digest
        content = {key: getattr(self, key) for key in WAVE_FIELDS}
        fields = kwargs.get('update_fields')
        if fields is not None:
            if not fields:
                return
            stored = type(self).objects.values(*WAVE_FIELDS).get(pk=self.pk)
            content = {**stored, **{key: value for key, value in content.items() if key in fields}}
            kwargs['update_fields'] = set(fields) | {'content_digest'}
        self.content_digest = wave_digest(content)
        return super()._save_life(*args, **kwargs)


class AdventureEvent(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=140)
    party_id = models.CharField(max_length=64, db_index=True)
    owner_id = models.CharField(max_length=40)
    sequence = models.PositiveBigIntegerField()
    kind = models.CharField(max_length=24)
    payload = models.JSONField(default=dict)
    previous_hash = models.CharField(max_length=64, blank=True)
    digest = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['party_id', 'sequence'], name='adventure_event_sequence')]
        ordering = ['sequence']
