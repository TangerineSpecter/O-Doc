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


class AIStudy(Record):
    anthology = models.ForeignKey('anthology.Anthology', on_delete=models.CASCADE, related_name='quant_ai_studies')
    request_key = models.CharField(max_length=64)
    plan = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)
    user_report = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['anthology', 'request_key'], name='quant_study_request')]


class AIStudyGeneration(Record):
    study = models.ForeignKey(AIStudy, on_delete=models.CASCADE, related_name='generations')
    number = models.PositiveSmallIntegerField()
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['number']
        constraints = [models.UniqueConstraint(fields=['study', 'number'], name='quant_study_generation')]


class AIStudyJob(Record):
    study = models.OneToOneField(AIStudy, on_delete=models.CASCADE, related_name='job')
    owner_id = models.CharField(max_length=40)
    status = models.CharField(max_length=20, default='pending')
    error = models.TextField(blank=True)
    lease_until = models.DateTimeField(null=True)
    lease_token = models.CharField(max_length=40, default=stable_id)


class ExternalConnector(Record):
    anthology = models.ForeignKey('anthology.Anthology', on_delete=models.CASCADE, related_name='quant_connectors')
    name = models.CharField(max_length=200)
    config = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['-updated_at', 'id']


class ConnectorSecret(Record):
    connector = models.OneToOneField(ExternalConnector, on_delete=models.CASCADE, related_name='local_secret')
    values = models.JSONField(default=dict)


class ExternalResponse(Record):
    connector = models.ForeignKey(ExternalConnector, on_delete=models.CASCADE, related_name='responses')
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['-created_at', 'id']


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
        indexes = [models.Index(fields=['anthology', 'is_valid'], name='quant_entry_collection_idx'),
                   models.Index(fields=['anthology', '-updated_at', '-id', 'is_valid'], name='quant_entry_read_idx'),
                   models.Index(fields=['anthology','title','id','is_valid'],name='quant_entry_title_idx')]


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
                       'dependencies', 'parameters', 'source_version_id', 'content_hash', 'strategy_artifact_id')
    implementation = models.ForeignKey(Implementation, on_delete=models.CASCADE, related_name='versions')
    code = models.TextField(blank=True)
    note = models.CharField(max_length=2000, blank=True)
    language = models.CharField(max_length=20)
    language_version = models.CharField(max_length=100, blank=True)
    dependencies = models.TextField(blank=True)
    parameters = models.TextField(blank=True)
    content_hash = models.CharField(max_length=64)
    source_version_id = models.CharField(max_length=40, null=True, blank=True)
    strategy_artifact_id = models.CharField(max_length=40, blank=True, default='')
    compile_check = models.CharField(max_length=10, default='pending')
    run_check = models.CharField(max_length=10, default='pending')
    result_check = models.CharField(max_length=10, default='pending')
    verification_notes = models.TextField(blank=True)

    class Meta:
        indexes = [models.Index(fields=['implementation', '-created_at', '-id'], name='quant_version_read_idx')]
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
    source_version = models.ForeignKey(CodeVersion, on_delete=models.PROTECT, related_name='ai_runs', null=True, blank=True)
    source = models.ForeignKey('SourceRevision', on_delete=models.PROTECT, null=True, blank=True, related_name='analysis_runs')
    resolved_source = models.ForeignKey('SourceRevision', on_delete=models.PROTECT, null=True, blank=True, related_name='resolved_runs')
    experiment_result = models.ForeignKey('ExperimentResult', on_delete=models.PROTECT, null=True, blank=True, related_name='reviews')
    validation_result=models.ForeignKey('ValidationResult',on_delete=models.PROTECT,null=True,blank=True,related_name='reviews')
    review_version = models.PositiveSmallIntegerField(default=1)
    planning_context = models.JSONField(default=dict)
    feedback_workflow_version=models.PositiveSmallIntegerField(default=0)
    audit_report_id=models.CharField(max_length=40,blank=True)
    native_resume_run_id=models.CharField(max_length=40,blank=True)
    workflow_version = models.PositiveSmallIntegerField(default=0)
    resume_run_id = models.CharField(max_length=40, blank=True)
    restart_stage = models.CharField(max_length=30, blank=True)
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
        indexes = [models.Index(fields=['entry', 'status', '-created_at', '-id'], name='quant_run_status_idx'),
                   models.Index(fields=['entry','-created_at','-id'],name='quant_run_history_idx')]
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


class ImmutableRecord(Record):
    """Application writes append snapshots; restore validates them before raw save."""
    SNAPSHOT_FIELDS = ()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.pk:
            original = type(self).objects.filter(pk=self.pk).values(*self.SNAPSHOT_FIELDS).first()
            if original and any(original[field] != getattr(self, field) for field in self.SNAPSHOT_FIELDS):
                raise ValidationError('研究快照不可覆盖，请创建新版本')
        super().save(*args, **kwargs)


class WorkflowStep(ImmutableRecord):
    """Durable stage input; a missing outcome remains interrupted after restore."""
    SNAPSHOT_FIELDS = ('run_id', 'ordinal', 'stage', 'input', 'content_hash')
    run = models.ForeignKey(AIRun, on_delete=models.CASCADE, related_name='workflow_steps')
    ordinal = models.PositiveSmallIntegerField()
    stage = models.CharField(max_length=30)
    input = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['ordinal']
        constraints = [models.UniqueConstraint(fields=['run', 'ordinal'], name='quant_workflow_step_ordinal')]


class WorkflowOutcome(ImmutableRecord):
    """One immutable success/failure, with optional exact reusable predecessor."""
    SNAPSHOT_FIELDS = ('step_id', 'data', 'content_hash')
    step = models.OneToOneField(WorkflowStep, on_delete=models.CASCADE, related_name='outcome')
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)


class SourceMaterial(ImmutableRecord):
    SNAPSHOT_FIELDS = ('entry_id',)
    entry = models.ForeignKey(Entry, on_delete=models.CASCADE, related_name='materials')
    title = models.CharField(max_length=255)
    current_revision_id = models.CharField(max_length=40, blank=True)


class SourceRevision(ImmutableRecord):
    SNAPSHOT_FIELDS = ('material_id', 'code_version_id', 'payload', 'content_hash')
    material = models.ForeignKey(SourceMaterial, on_delete=models.CASCADE, related_name='revisions')
    code_version = models.OneToOneField(CodeVersion, on_delete=models.PROTECT, null=True, blank=True)
    # Exact received material: code/text/URL, platform, language and provenance.
    # A URL is a reference, never evidence that its page was fetched.
    payload = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['created_at', 'id']


class ResearchReport(ImmutableRecord):
    SNAPSHOT_FIELDS = ('entry_id', 'source_id', 'run_id', 'schema_version', 'data', 'markdown', 'content_hash')
    entry = models.ForeignKey(Entry, on_delete=models.CASCADE, related_name='reports')
    source = models.ForeignKey(SourceRevision, on_delete=models.PROTECT, related_name='reports')
    run = models.OneToOneField(AIRun, on_delete=models.PROTECT, related_name='report')
    schema_version = models.PositiveIntegerField(default=1)
    data = models.JSONField(default=dict)
    markdown = models.TextField()
    content_hash = models.CharField(max_length=64)
    current_revision_id = models.CharField(max_length=40, blank=True)

    class Meta:
        indexes = [models.Index(fields=['entry', '-created_at', '-id'], name='quant_report_read_idx')]
        ordering = ['-created_at', '-id']


class ReportRevision(ImmutableRecord):
    SNAPSHOT_FIELDS = ('report_id', 'parent_id', 'markdown', 'content_hash')
    report = models.ForeignKey(ResearchReport, on_delete=models.CASCADE, related_name='revisions')
    # Stable pointer, checked by services/sync, avoids cyclic restore ordering.
    parent_id = models.CharField(max_length=40, blank=True)
    markdown = models.TextField(blank=True)
    content_hash = models.CharField(max_length=64)

    class Meta:
        indexes = [models.Index(fields=['report', '-created_at', '-id'], name='quant_revision_read_idx')]
        ordering = ['created_at', 'id']


class FactorCandidate(ImmutableRecord):
    """An extraction or derived experiment formula, with immutable provenance."""
    SNAPSHOT_FIELDS = ('report_id', 'ordinal', 'data', 'content_hash', 'expression_hash', 'derived_checkpoint_id', 'formula_version_id', 'qualification_version', 'admission_version')
    report = models.ForeignKey(ResearchReport, on_delete=models.CASCADE, related_name='factor_candidates')
    ordinal = models.PositiveSmallIntegerField()
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)
    expression_hash = models.CharField(max_length=64, blank=True, db_index=True)
    current_revision_id = models.CharField(max_length=40, blank=True)
    # Stable pointer avoids a restore-order cycle through experiment seed plans.
    # Services and snapshot validation enforce the reference and ancestry.
    derived_checkpoint_id = models.CharField(max_length=40, blank=True, default='')
    formula_version_id = models.CharField(max_length=40, blank=True, default='')
    formula_selection_id = models.CharField(max_length=40, blank=True, default='')
    qualification_version = models.PositiveSmallIntegerField(default=0)
    admission_version = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['-created_at', 'id']
        constraints = [
            models.UniqueConstraint(fields=['report', 'ordinal'], condition=models.Q(derived_checkpoint_id='', formula_version_id=''), name='quant_factor_occurrence'),
            models.UniqueConstraint(fields=['derived_checkpoint_id'], condition=~models.Q(derived_checkpoint_id=''), name='quant_factor_derivation'),
        ]


class FactorQualification(ImmutableRecord):
    """Automatic typed-expression admission; never a platform or profit approval."""
    SNAPSHOT_FIELDS = ('candidate_id', 'policy_version', 'data', 'content_hash')
    candidate = models.ForeignKey(FactorCandidate, on_delete=models.CASCADE, related_name='qualifications')
    policy_version = models.PositiveSmallIntegerField(default=1)
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['candidate', 'policy_version'], name='quant_factor_qualification')]


class FactorEvidenceLink(ImmutableRecord):
    """Direct version-scoped evidence, reconstructed from the immutable target."""
    SNAPSHOT_FIELDS = ('candidate_id', 'kind', 'target_id', 'data', 'content_hash', 'admission_version')
    candidate = models.ForeignKey(FactorCandidate, on_delete=models.CASCADE, related_name='verification_evidence')
    kind = models.CharField(max_length=20)
    target_id = models.CharField(max_length=40)
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)
    admission_version = models.PositiveSmallIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['candidate', 'kind', 'target_id'], name='quant_factor_evidence_link')]


class FactorAdmission(ImmutableRecord):
    """Rule-based research layer for one formula and frozen observation scope."""
    SNAPSHOT_FIELDS = ('candidate_id', 'qualification_id', 'evidence_id', 'policy_version', 'stage', 'outcome', 'data', 'content_hash')
    candidate = models.ForeignKey(FactorCandidate, on_delete=models.CASCADE, related_name='admission_records')
    qualification = models.ForeignKey(FactorQualification, on_delete=models.CASCADE, related_name='admission_records')
    evidence = models.ForeignKey(FactorEvidenceLink, null=True, blank=True, on_delete=models.CASCADE, related_name='admission_records')
    policy_version = models.PositiveSmallIntegerField(default=1)
    stage = models.CharField(max_length=24)
    outcome = models.CharField(max_length=32)
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['-created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['candidate', 'policy_version'], condition=models.Q(evidence__isnull=True), name='quant_factor_admission_base'),
            models.UniqueConstraint(fields=['evidence','policy_version'],condition=models.Q(evidence__isnull=False),name='quant_admission_evidence_policy')]
        indexes = [models.Index(fields=['candidate', 'stage'], name='quant_admission_stage')]


class FactorFormulaVersion(ImmutableRecord):
    """An authored or experiment-generated definition, in a stable root lineage."""
    SNAPSHOT_FIELDS = ('root_id', 'candidate_id', 'request_key', 'data', 'content_hash')
    root = models.ForeignKey(FactorCandidate, on_delete=models.PROTECT, related_name='formula_versions')
    candidate = models.OneToOneField(FactorCandidate, on_delete=models.CASCADE, related_name='formula_version_record')
    request_key = models.CharField(max_length=64, blank=True)
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['root', 'request_key'], condition=~models.Q(request_key=''), name='quant_formula_request')]


class FactorFormulaSelection(ImmutableRecord):
    """Reversible working-version selection; never a performance promotion."""
    SNAPSHOT_FIELDS = ('root_id', 'candidate_id', 'request_key', 'parent_id', 'data', 'content_hash')
    root = models.ForeignKey(FactorCandidate, on_delete=models.PROTECT, related_name='formula_selections')
    candidate = models.ForeignKey(FactorCandidate, on_delete=models.PROTECT, related_name='formula_selections_as_target')
    request_key = models.CharField(max_length=64)
    parent_id = models.CharField(max_length=40, blank=True)
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['root', 'request_key'], name='quant_formula_selection_request')]


class QuantVocabulary(ImmutableRecord):
    """Collection-owned vocabulary head; immutable definitions live separately."""
    SNAPSHOT_FIELDS = ('anthology_id',)
    anthology = models.OneToOneField('anthology.Anthology', on_delete=models.CASCADE, related_name='quant_vocabulary')
    current_revision_id = models.CharField(max_length=40, blank=True, default='')


class QuantVocabularyTerm(ImmutableRecord):
    """A stable concept cannot be repurposed by a later label or alias edit."""
    SNAPSHOT_FIELDS = ('vocabulary_id', 'code', 'dimension', 'definition', 'content_hash')
    vocabulary = models.ForeignKey(QuantVocabulary, on_delete=models.CASCADE, related_name='terms')
    code = models.CharField(max_length=48)
    dimension = models.CharField(max_length=30)
    definition = models.TextField()
    content_hash = models.CharField(max_length=64)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['vocabulary', 'code'], name='quant_vocabulary_code')]


class QuantVocabularyRevision(ImmutableRecord):
    SNAPSHOT_FIELDS = ('vocabulary_id', 'parent_id', 'request_key', 'data', 'content_hash')
    vocabulary = models.ForeignKey(QuantVocabulary, on_delete=models.CASCADE, related_name='revisions')
    parent_id = models.CharField(max_length=40, blank=True)
    request_key = models.CharField(max_length=64)
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['vocabulary', 'request_key'], name='quant_vocabulary_request')]


class FactorRevision(ImmutableRecord):
    """User curation never changes the extraction or its expression/provenance."""
    SNAPSHOT_FIELDS = ('candidate_id', 'parent_id', 'data', 'content_hash')
    candidate = models.ForeignKey(FactorCandidate, on_delete=models.CASCADE, related_name='revisions')
    parent_id = models.CharField(max_length=40, blank=True)
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['created_at', 'id']


class FactorVector(models.Model):
    """Rebuildable device-local projection; never exported in business snapshots."""
    candidate = models.OneToOneField(FactorCandidate, primary_key=True, on_delete=models.CASCADE, related_name='vector_cache')
    projection_hash = models.CharField(max_length=64)
    model_signature = models.CharField(max_length=64, db_index=True)
    model_name = models.CharField(max_length=200)
    vector = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)


class FactorIndexJob(Record):
    """Explicit local execution permission, revoked by restore or cancellation."""
    anthology = models.ForeignKey('anthology.Anthology', on_delete=models.CASCADE)
    owner_id = models.CharField(max_length=100)
    candidate_ids = models.JSONField(default=list)
    model_id = models.CharField(max_length=40)
    model_signature = models.CharField(max_length=64)
    model_name = models.CharField(max_length=200)
    status = models.CharField(max_length=20, default='pending')
    processed = models.PositiveIntegerField(default=0)
    error = models.CharField(max_length=300, blank=True)
    lease_token = models.CharField(max_length=40, default=stable_id)
    lease_until = models.DateTimeField(null=True)


class FactorRelation(ImmutableRecord):
    """A versioned semantic suggestion or fixed-sample statistical observation."""
    SNAPSHOT_FIELDS = ('left_id', 'right_id', 'kind', 'evidence', 'content_hash')
    left = models.ForeignKey(FactorCandidate, on_delete=models.CASCADE, related_name='outgoing_relations')
    right = models.ForeignKey(FactorCandidate, on_delete=models.CASCADE, related_name='incoming_relations')
    kind = models.CharField(max_length=30, default='semantic_similar')
    evidence = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)


class MarketDataset(ImmutableRecord):
    """Received historical prices and normalized contract, preserved for replay."""
    SNAPSHOT_FIELDS = ('anthology_id', 'name', 'raw_csv', 'snapshot', 'content_hash')
    anthology = models.ForeignKey('anthology.Anthology', on_delete=models.CASCADE, related_name='quant_datasets')
    name = models.CharField(max_length=200)
    raw_csv = models.TextField()
    snapshot = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['-created_at', 'id']


class FactorComparison(ImmutableRecord):
    """Fixed-input output evidence; it does not certify source-platform equivalence."""
    SNAPSHOT_FIELDS = ('anthology_id', 'left_id', 'right_id', 'dataset_id', 'request_key', 'plan', 'result', 'content_hash')
    anthology = models.ForeignKey('anthology.Anthology', on_delete=models.CASCADE)
    left = models.ForeignKey(FactorCandidate, on_delete=models.PROTECT, related_name='left_comparisons')
    right = models.ForeignKey(FactorCandidate, on_delete=models.PROTECT, related_name='right_comparisons')
    dataset = models.ForeignKey(MarketDataset, on_delete=models.PROTECT, related_name='factor_comparisons')
    request_key = models.CharField(max_length=64)
    plan = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['-created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['anthology', 'request_key'], name='quant_comparison_request_key')]


class FactorMerge(ImmutableRecord):
    """A reversible curation link, preserving both candidates and its direct evidence."""
    SNAPSHOT_FIELDS = ('anthology_id', 'comparison_id', 'request_key', 'name', 'reason', 'curation', 'content_hash')
    anthology = models.ForeignKey('anthology.Anthology', on_delete=models.CASCADE)
    comparison = models.ForeignKey(FactorComparison, on_delete=models.PROTECT, related_name='merges')
    request_key = models.CharField(max_length=64)
    name = models.CharField(max_length=200)
    reason = models.TextField(blank=True)
    curation = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['-created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['anthology', 'request_key'], name='quant_merge_request_key')]


class FactorMergeWithdrawal(ImmutableRecord):
    """Explicitly targets one merge; replay never decides revocation by timestamp order."""
    SNAPSHOT_FIELDS = ('anthology_id', 'merge_id', 'request_key', 'reason', 'content_hash')
    anthology = models.ForeignKey('anthology.Anthology', on_delete=models.CASCADE)
    merge = models.OneToOneField(FactorMerge, on_delete=models.PROTECT, related_name='withdrawal')
    request_key = models.CharField(max_length=64)
    reason = models.TextField(blank=True)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['anthology', 'request_key'], name='quant_withdrawal_request_key')]


class ExperimentRequest(ImmutableRecord):
    """Frozen research authorization input; restoring it never authorizes execution."""
    SNAPSHOT_FIELDS = ('anthology_id', 'dataset_id', 'request_key', 'plan', 'content_hash')
    anthology = models.ForeignKey('anthology.Anthology', on_delete=models.CASCADE, related_name='quant_experiments')
    dataset = models.ForeignKey(MarketDataset, on_delete=models.PROTECT, related_name='experiments')
    request_key = models.CharField(max_length=64)
    plan = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['-created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['anthology', 'request_key'], name='quant_experiment_request_key')]


class ExperimentResult(ImmutableRecord):
    """Complete or partial engine evidence, never replaced by a retry."""
    SNAPSHOT_FIELDS = ('request_id', 'data', 'content_hash')
    request = models.OneToOneField(ExperimentRequest, on_delete=models.CASCADE, related_name='result')
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)


class ExperimentJob(Record):
    """Device-local revocable execution lease and partial progress."""
    request = models.OneToOneField(ExperimentRequest, on_delete=models.CASCADE, related_name='job')
    owner_id = models.CharField(max_length=100)
    status = models.CharField(max_length=20, default='pending')
    error = models.CharField(max_length=300, blank=True)
    lease_token = models.CharField(max_length=40, default=stable_id)
    lease_until = models.DateTimeField(null=True)
    cancel_requested = models.BooleanField(default=False)


class ExperimentCheckpoint(ImmutableRecord):
    """One completed/rejected/cancelled attempt, durable even if a process exits."""
    SNAPSHOT_FIELDS = ('request_id', 'ordinal', 'attempt', 'content_hash')
    request = models.ForeignKey(ExperimentRequest, on_delete=models.CASCADE, related_name='checkpoints')
    ordinal = models.PositiveSmallIntegerField()
    attempt = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['ordinal']
        constraints = [models.UniqueConstraint(fields=['request', 'ordinal'], name='quant_experiment_checkpoint')]


class ExperimentProposal(ImmutableRecord):
    """An AI research design, kept distinct from authorization to run it."""
    SNAPSHOT_FIELDS = ('run_id', 'data', 'content_hash')
    run = models.OneToOneField(AIRun, on_delete=models.CASCADE, related_name='experiment_proposal')
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)


class ResearchCampaign(ImmutableRecord):
    """Frozen multi-round research scope; execution permission stays local."""
    SNAPSHOT_FIELDS = ('anthology_id', 'proposal_id', 'request_key', 'plan', 'content_hash')
    anthology = models.ForeignKey('anthology.Anthology', on_delete=models.CASCADE, related_name='quant_campaigns')
    proposal = models.ForeignKey(ExperimentProposal, on_delete=models.PROTECT)
    request_key = models.CharField(max_length=64)
    plan = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['-created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['anthology', 'request_key'], name='quant_campaign_request_key')]


class ResearchRound(ImmutableRecord):
    SNAPSHOT_FIELDS = ('campaign_id', 'ordinal', 'experiment_id')
    campaign = models.ForeignKey(ResearchCampaign, on_delete=models.CASCADE, related_name='rounds')
    ordinal = models.PositiveSmallIntegerField()
    experiment = models.OneToOneField(ExperimentRequest, on_delete=models.PROTECT, related_name='research_round')

    class Meta:
        ordering = ['ordinal']
        constraints = [models.UniqueConstraint(fields=['campaign', 'ordinal'], name='quant_campaign_round')]


class ResearchEvaluation(ImmutableRecord):
    SNAPSHOT_FIELDS = ('round_id', 'run_id')
    round = models.OneToOneField(ResearchRound, on_delete=models.CASCADE, related_name='evaluation')
    run = models.OneToOneField(AIRun, on_delete=models.PROTECT, related_name='campaign_evaluation')


class ResearchOutcome(ImmutableRecord):
    SNAPSHOT_FIELDS = ('campaign_id', 'data', 'content_hash')
    campaign = models.OneToOneField(ResearchCampaign, on_delete=models.CASCADE, related_name='outcome')
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)


class ResearchCampaignJob(Record):
    """Bounded local coordinator. Restore revokes it and all child permissions."""
    campaign = models.OneToOneField(ResearchCampaign, on_delete=models.CASCADE, related_name='job')
    owner_id = models.CharField(max_length=100)
    status = models.CharField(max_length=20, default='pending')
    lease_token = models.CharField(max_length=40, default=stable_id)
    lease_until = models.DateTimeField(null=True)
    deadline = models.DateTimeField()


class IntakeBatch(ImmutableRecord):
    """Archived source membership and bounded analysis scope; no execution grant."""
    SNAPSHOT_FIELDS = ('anthology_id', 'request_key', 'plan', 'content_hash')
    anthology = models.ForeignKey('anthology.Anthology', on_delete=models.CASCADE, related_name='quant_intake_batches')
    request_key = models.CharField(max_length=64)
    plan = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['-created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['anthology', 'request_key'], name='quant_intake_batch_key')]


class IntakeDispatch(ImmutableRecord):
    """One dispatch decision per source per batch; failed attempts remain visible."""
    SNAPSHOT_FIELDS = ('batch_id', 'ordinal', 'run_id', 'reason')
    batch = models.ForeignKey(IntakeBatch, on_delete=models.CASCADE, related_name='dispatches')
    ordinal = models.PositiveSmallIntegerField()
    run = models.OneToOneField(AIRun, null=True, on_delete=models.PROTECT, related_name='intake_dispatch')
    reason = models.CharField(max_length=40, blank=True)

    class Meta:
        ordering = ['ordinal']
        constraints = [models.UniqueConstraint(fields=['batch', 'ordinal'], name='quant_intake_dispatch_ordinal')]


class IntakeOutcome(ImmutableRecord):
    SNAPSHOT_FIELDS = ('batch_id', 'data', 'content_hash')
    batch = models.OneToOneField(IntakeBatch, on_delete=models.CASCADE, related_name='outcome')
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)


class IntakeBatchJob(Record):
    """Device-local revocable permission. Never exported or restored."""
    batch = models.OneToOneField(IntakeBatch, on_delete=models.CASCADE, related_name='job')
    owner_id = models.CharField(max_length=100)
    status = models.CharField(max_length=20, default='pending')
    lease_token = models.CharField(max_length=40, default=stable_id)
    lease_until = models.DateTimeField(null=True)
    deadline = models.DateTimeField()


class StrategyArtifact(ImmutableRecord):
    """Generated native candidate, original execution intent and exact code version."""
    SNAPSHOT_FIELDS = ('request_id', 'version_id', 'data', 'content_hash')
    request = models.ForeignKey(ExperimentRequest, on_delete=models.PROTECT, related_name='strategy_artifacts')
    version = models.OneToOneField(CodeVersion, on_delete=models.PROTECT, related_name='strategy_artifact')
    data = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['created_at', 'id']


class ValidationPlan(ImmutableRecord):
    """Actual formula/configuration registered before choosing new evaluation data."""
    SNAPSHOT_FIELDS=('anthology_id','source_request_id','request_key','data','content_hash')
    anthology=models.ForeignKey('anthology.Anthology',on_delete=models.CASCADE,related_name='quant_validation_plans')
    source_request=models.ForeignKey(ExperimentRequest,on_delete=models.PROTECT,related_name='validation_plans')
    request_key=models.CharField(max_length=64)
    data=models.JSONField(default=dict)
    content_hash=models.CharField(max_length=64)

    class Meta:
        ordering=['-created_at','id']
        constraints=[models.UniqueConstraint(fields=['anthology','request_key'],name='quant_validation_plan_key')]


class ValidationRequest(ImmutableRecord):
    """A plan may bind exactly one dataset; cancellation cannot unconsume it."""
    SNAPSHOT_FIELDS=('plan_id','dataset_id','data','content_hash')
    plan=models.OneToOneField(ValidationPlan,on_delete=models.CASCADE,related_name='evaluation')
    dataset=models.ForeignKey(MarketDataset,on_delete=models.PROTECT,related_name='fixed_validations')
    data=models.JSONField(default=dict)
    content_hash=models.CharField(max_length=64)


class ValidationResult(ImmutableRecord):
    SNAPSHOT_FIELDS=('request_id','data','content_hash')
    request=models.OneToOneField(ValidationRequest,on_delete=models.CASCADE,related_name='result')
    data=models.JSONField(default=dict)
    content_hash=models.CharField(max_length=64)


class ValidationJob(Record):
    """Local-only execution authority, removed by restore."""
    request=models.OneToOneField(ValidationRequest,on_delete=models.CASCADE,related_name='job')
    owner_id=models.CharField(max_length=100)
    status=models.CharField(max_length=20,default='pending')
    error=models.CharField(max_length=300,blank=True)
    lease_token=models.CharField(max_length=40,default=stable_id)
    lease_until=models.DateTimeField(null=True)
    cancel_requested=models.BooleanField(default=False)


class SelectionDiagnostic(ImmutableRecord):
    """Frozen selection-risk measurement; never an execution grant or promotion."""
    SNAPSHOT_FIELDS=('result_id','data','content_hash')
    result=models.OneToOneField(ExperimentResult,on_delete=models.CASCADE,related_name='selection_diagnostic')
    data=models.JSONField(default=dict)
    content_hash=models.CharField(max_length=64)


class NativePythonRequest(ImmutableRecord):
    SNAPSHOT_FIELDS=('anthology_id','candidate_id','source_id','dataset_id','request_key','plan','content_hash')
    anthology=models.ForeignKey('anthology.Anthology',on_delete=models.CASCADE,related_name='quant_native_python_requests')
    candidate=models.ForeignKey(FactorCandidate,on_delete=models.PROTECT,related_name='native_python_requests')
    source=models.ForeignKey(SourceRevision,on_delete=models.PROTECT,related_name='native_python_requests')
    dataset=models.ForeignKey(MarketDataset,on_delete=models.PROTECT,related_name='native_python_requests')
    request_key=models.CharField(max_length=64)
    plan=models.JSONField(default=dict)
    content_hash=models.CharField(max_length=64)

    class Meta:
        ordering=['-created_at','id']
        constraints=[models.UniqueConstraint(fields=['anthology','request_key'],name='quant_native_python_request_key')]


class NativePythonResult(ImmutableRecord):
    SNAPSHOT_FIELDS=('request_id','data','content_hash')
    request=models.OneToOneField(NativePythonRequest,on_delete=models.CASCADE,related_name='result')
    data=models.JSONField(default=dict)
    content_hash=models.CharField(max_length=64)


class NativePythonJob(Record):
    """Device-local, revocable Docker execution authority; never synchronized."""
    request=models.OneToOneField(NativePythonRequest,on_delete=models.CASCADE,related_name='job')
    owner_id=models.CharField(max_length=100)
    model_id=models.CharField(max_length=40,blank=True)
    status=models.CharField(max_length=20,default='pending')
    error=models.CharField(max_length=300,blank=True)
    lease_token=models.CharField(max_length=40,default=stable_id)
    lease_until=models.DateTimeField(null=True)
    cancel_requested=models.BooleanField(default=False)


# Register MT4 archive records with the existing synchronized quant app.
from .mt4_reports.models import MT4Attachment, MT4Backtest, MT4Expert  # noqa: E402,F401
