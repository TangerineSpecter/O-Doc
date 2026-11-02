"""Synchronized daily contributions for completed fishing trips."""
from django.db import models


class FishingTripCoverage(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    version = models.PositiveSmallIntegerField(default=1)
    source = models.JSONField(default=dict)
    days = models.JSONField(default=list)


class FishingTripDay(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    trip_id = models.CharField(max_length=64, db_index=True)
    owner_id = models.CharField(max_length=40)
    actor_id = models.CharField(max_length=40)
    day = models.DateField()
    first_sequence = models.PositiveBigIntegerField()
    last_sequence = models.PositiveBigIntegerField()
    counters = models.JSONField(default=dict)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['trip_id', 'day'], name='fishing_trip_day_unique')]
        indexes = [models.Index(fields=['owner_id', 'actor_id', 'day'], name='fishing_day_owner_actor')]
