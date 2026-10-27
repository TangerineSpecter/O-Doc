"""Private MT4 archives; reports are data, never an EA execution request."""
from django.db import models
from django.core.validators import RegexValidator

from quant.models import Record


class MT4Expert(Record):
    anthology = models.ForeignKey('anthology.Anthology', on_delete=models.CASCADE, related_name='mt4_experts')
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True, choices=[(v, v) for v in ('马丁EA', '趋势EA', '震荡EA')])
    version = models.CharField(max_length=100, blank=True)
    source_url = models.URLField(max_length=2000, blank=True)
    forum_url = models.URLField(max_length=2000, blank=True)
    requirements = models.TextField(blank=True)
    minimum_capital = models.CharField(max_length=18, blank=True, validators=[RegexValidator(r'^\d+(?:\.\d+)?$', '最低资金只能填写非负数字')])
    timeframe = models.CharField(max_length=3, blank=True, choices=[(v, v) for v in ('1M', '5M', '15M', '30M', '1H', '4H', '1D')])
    account_requirement = models.CharField(max_length=10, blank=True, choices=[(v, v) for v in ('无要求', '低点差')])
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
