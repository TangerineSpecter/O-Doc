"""Synchronized intentions and appointments; runtime permission is never stored here."""
from django.db import models
from ..life_models import LifeTimedModel


class AdventurePlanningDay(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    day = models.DateField()
    status = models.CharField(max_length=16, default='planning')
    snapshot = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['owner_id', 'day'], name='adventure_owner_day')]


class AdventureReservation(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    planning_day = models.ForeignKey(AdventurePlanningDay, on_delete=models.PROTECT)
    dungeon_id = models.CharField(max_length=80)
    prepare_at = models.DateTimeField(db_index=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    status = models.CharField(max_length=16, default='reserved')
    revision = models.PositiveIntegerField(default=1)
    snapshot = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)
