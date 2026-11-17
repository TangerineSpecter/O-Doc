from django.db import models
from django.utils import timezone


ARCHIVE_VERSION = 2


class ResidentAnalyticsDay(models.Model):
    """Synchronized, replaceable contribution for one owner and Shanghai day."""
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=50)
    day = models.DateField()
    version = models.PositiveSmallIntegerField(default=ARCHIVE_VERSION)
    contribution = models.JSONField()
    digest = models.CharField(max_length=64)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['owner_id', 'day'], name='resident_analytics_owner_day')]


class ResidentAnalyticsWork(models.Model):
    """Local validation and pending work; a remote summary cannot authorize itself."""
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=50)
    day = models.DateField()
    generation = models.BigIntegerField(default=0)
    scope_generation = models.BigIntegerField(default=0)
    verified_digest = models.CharField(max_length=64, blank=True)
    dirty = models.BooleanField(default=True)
    after = models.DateTimeField(default=timezone.now)
    error = models.CharField(max_length=64, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['dirty', 'after'], name='resident_stats_due'),
            models.Index(fields=['owner_id', 'day'], name='resident_work_owner_day'),
        ]
