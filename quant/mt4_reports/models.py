"""Private MT4 archives; reports are data, never an EA execution request."""
from django.db import models

from quant.models import Record


class MT4Expert(Record):
    anthology = models.ForeignKey('anthology.Anthology', on_delete=models.CASCADE, related_name='mt4_experts')
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True)
    version = models.CharField(max_length=100, blank=True)
    source_url = models.URLField(max_length=2000, blank=True)
    forum_url = models.URLField(max_length=2000, blank=True)
    requirements = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    trading_logic = models.TextField(blank=True)
    parameters = models.JSONField(default=list)
    parameter_sets = models.JSONField(default=list)
    is_valid = models.BooleanField(default=True)

    class Meta:
        ordering = ['-updated_at', 'id']


class MT4Backtest(Record):
    expert = models.ForeignKey(MT4Expert, on_delete=models.CASCADE, related_name='backtests')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    conclusion = models.TextField(blank=True)
    # Imported raw strings and the confirmed parameter/metric snapshot belong to
    # this test, even after the EA's definitions or defaults change.
    data = models.JSONField(default=dict)
    report_hash = models.CharField(max_length=64, blank=True, db_index=True)
    is_valid = models.BooleanField(default=True)

    class Meta:
        ordering = ['-created_at', '-id']


class MT4Attachment(Record):
    expert = models.ForeignKey(MT4Expert, on_delete=models.CASCADE, related_name='attachments')
    backtest = models.ForeignKey(MT4Backtest, on_delete=models.CASCADE, related_name='attachments', null=True, blank=True)
    asset = models.ForeignKey('assets.Asset', on_delete=models.PROTECT, related_name='mt4_references')
    role = models.CharField(max_length=20, default='attachment')

    class Meta:
        ordering = ['-created_at', '-id']
