"""Synchronized source contributions for completed shared combat sessions."""
from django.db import models


class CombatPartyCoverage(models.Model):
    # The shared party ID is globally stable; no device-local aggregate totals.
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    version = models.PositiveSmallIntegerField(default=1)
    source = models.JSONField(default=dict)
    days = models.JSONField(default=list)


class CombatPartyDay(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    party_id = models.CharField(max_length=64, db_index=True)
    owner_id = models.CharField(max_length=40)
    day = models.DateField()
    first_sequence = models.PositiveBigIntegerField()
    last_sequence = models.PositiveBigIntegerField()
    groups = models.JSONField(default=list)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['party_id', 'day'], name='combat_party_day_unique')]
        indexes = [models.Index(fields=['owner_id', 'day'], name='combat_day_owner_date')]


class CombatPartySettlement(models.Model):
    """Compact, synchronized results from one verified completed session."""
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    version = models.PositiveSmallIntegerField(default=1)
    content = models.JSONField(default=dict)
    digest = models.CharField(max_length=64)


class CombatSoloSettlement(models.Model):
    """Compact, synchronized outcome of one completed legacy solo run."""
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    version = models.PositiveSmallIntegerField(default=1)
    content = models.JSONField(default=dict)
    digest = models.CharField(max_length=64)
