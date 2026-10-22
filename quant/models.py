"""Private research facts and immutable code; uploaded scripts are never executed."""
import uuid
from django.core.exceptions import ValidationError
from django.db import models


def stable_id():
    return uuid.uuid4().hex


class Record(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=stable_id)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Entry(Record):
    KINDS = ('factor', 'indicator', 'strategy')
    anthology = models.ForeignKey('anthology.Anthology', on_delete=models.CASCADE, related_name='quant_entries')
    title = models.CharField(max_length=255)
    kind = models.CharField(max_length=20, default='factor')
    content = models.TextField(blank=True)
    source_url = models.URLField(max_length=2000, blank=True)
    tags = models.JSONField(default=list)
    is_valid = models.BooleanField(default=True)

    class Meta:
        ordering = ['-updated_at', 'id']
        indexes = [models.Index(fields=['anthology', 'is_valid'], name='quant_entry_collection_idx')]


class Implementation(Record):
    LANGUAGES = ('python', 'pine', 'mql4')
    entry = models.ForeignKey(Entry, on_delete=models.CASCADE, related_name='implementations')
    name = models.CharField(max_length=255)
    language = models.CharField(max_length=20)
    language_version = models.CharField(max_length=100, blank=True)
    dependencies = models.TextField(blank=True)
    parameters = models.TextField(blank=True)
    # A stable pointer avoids circular restore order. Services and snapshot
    # validation enforce that it targets one of this implementation's versions.
    current_version_id = models.CharField(max_length=40, blank=True)

    class Meta:
        ordering = ['created_at', 'id']


class CodeVersion(Record):
    CHECKS = ('pending', 'passed', 'failed')
    SNAPSHOT_FIELDS = ('implementation_id', 'code', 'note', 'language', 'language_version',
                       'dependencies', 'parameters', 'source_version_id', 'content_hash')
    implementation = models.ForeignKey(Implementation, on_delete=models.CASCADE, related_name='versions')
    code = models.TextField(blank=True)
    note = models.CharField(max_length=2000, blank=True)
    language = models.CharField(max_length=20)
    language_version = models.CharField(max_length=100, blank=True)
    dependencies = models.TextField(blank=True)
    parameters = models.TextField(blank=True)
    content_hash = models.CharField(max_length=64)
    source_version_id = models.CharField(max_length=40, null=True, blank=True)
    compile_check = models.CharField(max_length=10, default='pending')
    run_check = models.CharField(max_length=10, default='pending')
    result_check = models.CharField(max_length=10, default='pending')
    verification_notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def save(self, *args, **kwargs):
        if not self._state.adding:
            original = type(self).objects.filter(pk=self.pk).values(*self.SNAPSHOT_FIELDS).first()
            if original and any(original[field] != getattr(self, field) for field in self.SNAPSHOT_FIELDS):
                raise ValidationError('代码版本不可覆盖，请保存为新版本')
        super().save(*args, **kwargs)


class Backtest(Record):
    entry = models.ForeignKey(Entry, on_delete=models.CASCADE, related_name='backtests')
    name = models.CharField(max_length=255)
    version = models.ForeignKey(CodeVersion, on_delete=models.PROTECT, null=True, blank=True, related_name='backtests')
    symbol = models.CharField(max_length=255, blank=True)
    timeframe = models.CharField(max_length=100, blank=True)
    start_date = models.CharField(max_length=10, blank=True)
    end_date = models.CharField(max_length=10, blank=True)
    parameters = models.TextField(blank=True)
    fees = models.TextField(blank=True)
    metrics = models.JSONField(default=list)
    conclusion = models.TextField(blank=True)
    is_valid = models.BooleanField(default=True)

    class Meta:
        ordering = ['-created_at', '-id']


class Attachment(Record):
    entry = models.ForeignKey(Entry, on_delete=models.CASCADE, related_name='attachments')
    asset = models.ForeignKey('assets.Asset', on_delete=models.PROTECT, related_name='quant_references')
    implementation = models.ForeignKey(Implementation, on_delete=models.PROTECT, null=True, blank=True)
    version = models.ForeignKey(CodeVersion, on_delete=models.PROTECT, null=True, blank=True)
    backtest = models.ForeignKey(Backtest, on_delete=models.PROTECT, null=True, blank=True)

    class Meta:
        ordering = ['-created_at', '-id']


class AIRun(Record):
    """User requests and completed results sync; credentials and execution do not."""
    entry = models.ForeignKey(Entry, on_delete=models.CASCADE, related_name='runs')
    source_version = models.ForeignKey(CodeVersion, on_delete=models.PROTECT, related_name='ai_runs')
    request_key = models.CharField(max_length=64)
    input_hash = models.CharField(max_length=64)
    kind = models.CharField(max_length=20)
    target_language = models.CharField(max_length=20, blank=True)
    target_version = models.CharField(max_length=100, blank=True)
    requirements = models.TextField(blank=True)
    model_id = models.CharField(max_length=40, blank=True)
    model_name = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, default='pending')
    result = models.JSONField(default=dict)
    error = models.CharField(max_length=300, blank=True)
    adopted_implementation_id = models.CharField(max_length=40, null=True, blank=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [models.UniqueConstraint(fields=['entry', 'request_key'], name='quant_run_request_key')]


class Job(models.Model):
    """Local, revocable execution lease. Never included in a sync snapshot."""
    run = models.OneToOneField(AIRun, primary_key=True, on_delete=models.CASCADE)
    cancelled = models.BooleanField(default=False)
    lease_token = models.CharField(max_length=40, default=stable_id)
    lease_until = models.DateTimeField(null=True)
    stage = models.CharField(max_length=100, default='等待执行')
    preview = models.TextField(blank=True)
