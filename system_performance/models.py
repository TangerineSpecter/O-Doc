"""Deployment-local diagnostics; deliberately excluded from sync and business backups."""
from django.db import models


class PerformancePolicy(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    value = models.JSONField(default=dict)
    version = models.PositiveIntegerField(default=1)
    generation = models.PositiveIntegerField(default=1)


class PerformanceBucket(models.Model):
    key = models.CharField(max_length=64)
    minute = models.DateTimeField(db_index=True)
    dimensions = models.JSONField(default=dict)
    count = models.PositiveBigIntegerField(default=0)
    errors = models.PositiveBigIntegerField(default=0)
    slow = models.PositiveBigIntegerField(default=0)
    total_ms = models.FloatField(default=0)
    max_ms = models.FloatField(default=0)
    histogram = models.JSONField(default=list)
    sql_count = models.PositiveBigIntegerField(default=0)
    sql_ms = models.FloatField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['key', 'minute'], name='performance_bucket_unique')]


class PerformanceSample(models.Model):
    id = models.CharField(max_length=32, primary_key=True)
    created = models.DateTimeField(db_index=True)
    kind = models.CharField(max_length=20, db_index=True)
    operation = models.CharField(max_length=240)
    duration_ms = models.FloatField()
    status = models.CharField(max_length=24)
    evidence = models.JSONField(default=dict)


class PerformanceFlushBatch(models.Model):
    id = models.CharField(max_length=32, primary_key=True)
    created = models.DateTimeField(auto_now_add=True, db_index=True)


class DatabaseStatSnapshot(models.Model):
    created = models.DateTimeField(db_index=True)
    state = models.JSONField(default=dict)


class PerformanceInflight(models.Model):
    id = models.CharField(max_length=32, primary_key=True)
    updated = models.DateTimeField(db_index=True)
    state = models.JSONField(default=dict)
