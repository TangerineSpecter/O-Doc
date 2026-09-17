"""Published reading data is synced; execution and source caches stay local."""
import uuid

from django.db import models


def new_id():
    return uuid.uuid4().hex


class BookAnalysis(models.Model):
    book = models.OneToOneField('anthology.Book', primary_key=True, on_delete=models.CASCADE)
    mode = models.CharField(max_length=16, default='knowledge')
    subject_name = models.CharField(max_length=255, blank=True)
    source_hash = models.CharField(max_length=64, blank=True)
    inspection = models.JSONField(default=dict)
    published_revision = models.CharField(max_length=64, blank=True)
    settings_version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)


class Chapter(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    book = models.ForeignKey('anthology.Book', on_delete=models.CASCADE)
    source_hash = models.CharField(max_length=64)
    ordinal = models.PositiveIntegerField()
    title = models.CharField(max_length=255)
    char_count = models.PositiveIntegerField()
    locator = models.JSONField(default=dict)
    is_valid = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['ordinal']
        indexes = [models.Index(fields=['book', 'source_hash', 'ordinal'])]


class Revision(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=new_id)
    book = models.ForeignKey('anthology.Book', on_delete=models.CASCADE)
    source_hash = models.CharField(max_length=64)
    mode = models.CharField(max_length=16)
    subject_name = models.CharField(max_length=255, blank=True)
    settings_version = models.PositiveIntegerField()
    overview = models.JSONField(default=dict)
    state = models.CharField(max_length=16, default='building')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class ChapterResult(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    revision = models.ForeignKey(Revision, on_delete=models.CASCADE)
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE)
    digest = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['revision', 'chapter'], name='book_result_revision_chapter')]


class GraphNode(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    revision = models.ForeignKey(Revision, on_delete=models.CASCADE)
    canonical_id = models.CharField(max_length=64)
    kind = models.CharField(max_length=20)
    name = models.CharField(max_length=255)
    aliases = models.JSONField(default=list)
    facts = models.JSONField(default=list)
    ordinal = models.PositiveBigIntegerField(default=0)
    time_label = models.CharField(max_length=255, blank=True)
    time_order = models.CharField(max_length=64, blank=True)
    thread = models.CharField(max_length=120, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['revision', 'canonical_id']), models.Index(fields=['revision', 'kind', 'ordinal'])]
        constraints = [models.UniqueConstraint(fields=['revision', 'canonical_id'], name='book_node_revision_canonical')]


class GraphEdge(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    revision = models.ForeignKey(Revision, on_delete=models.CASCADE)
    source = models.ForeignKey(GraphNode, on_delete=models.CASCADE, related_name='outgoing')
    target = models.ForeignKey(GraphNode, on_delete=models.CASCADE, related_name='incoming')
    kind = models.CharField(max_length=32)
    label = models.CharField(max_length=255)
    evidence = models.JSONField(default=list)
    context = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)


class NodeSource(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    node = models.ForeignKey(GraphNode, on_delete=models.CASCADE)
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE)
    updated_at = models.DateTimeField(auto_now=True)


class Correction(models.Model):
    """Overrides live outside generated revisions and survive regeneration."""
    id = models.CharField(primary_key=True, max_length=64)
    book = models.ForeignKey('anthology.Book', on_delete=models.CASCADE)
    kind = models.CharField(max_length=16)
    key = models.CharField(max_length=64)
    patch = models.JSONField(default=dict)
    introduced_ordinal = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)


class SourceCache(models.Model):
    chapter = models.OneToOneField(Chapter, primary_key=True, on_delete=models.CASCADE)
    text = models.TextField()


class SegmentCache(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE)
    mode = models.CharField(max_length=16)
    payload = models.JSONField(default=dict)


class AnalysisRun(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=new_id)
    book = models.ForeignKey('anthology.Book', on_delete=models.CASCADE)
    revision = models.ForeignKey(Revision, on_delete=models.CASCADE)
    chapter_ids = models.JSONField(default=list)
    completed_ids = models.JSONField(default=list)
    state = models.CharField(max_length=16, default='queued')
    stage = models.CharField(max_length=64, default='等待处理')
    error = models.CharField(max_length=500, blank=True)
    cancel_requested = models.BooleanField(default=False)
    force = models.BooleanField(default=False)
    kind = models.CharField(max_length=16, default='analyze')
    index_state = models.CharField(max_length=16, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class WorkerLease(models.Model):
    id = models.CharField(primary_key=True, max_length=32, default='book-analysis')
    owner = models.CharField(max_length=64, blank=True)
    run_id = models.CharField(max_length=64, blank=True)
    expires_at = models.DateTimeField(null=True)


class ExecutionEvent(models.Model):
    run = models.ForeignKey(AnalysisRun, on_delete=models.CASCADE, related_name='events')
    kind = models.CharField(max_length=40)
    title = models.CharField(max_length=255)
    level = models.CharField(max_length=16, default='info')
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['run', 'id'])]


class SourceEvidence(models.Model):
    """A reusable, version-scoped excerpt; vectors are rebuildable elsewhere."""
    id = models.CharField(primary_key=True, max_length=64)
    revision = models.ForeignKey(Revision, on_delete=models.CASCADE)
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE)
    quote = models.TextField()
    locator = models.JSONField(default=dict)
    ordinal = models.PositiveBigIntegerField(default=0)


class BiographyQuote(models.Model):
    """Verified subject speech, separate from narrator claims and AI reflections."""
    id = models.CharField(primary_key=True, max_length=64)
    revision = models.ForeignKey(Revision, on_delete=models.CASCADE)
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE)
    speaker = models.CharField(max_length=255)
    text = models.TextField()
    evidence = models.JSONField(default=dict)
    attribution_evidence = models.JSONField(default=dict)
    event_id = models.CharField(max_length=64, blank=True)
    ordinal = models.PositiveBigIntegerField(default=0)

    class Meta:
        indexes = [models.Index(fields=['revision', 'ordinal'])]


class EntityFact(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    node = models.ForeignKey(GraphNode, on_delete=models.CASCADE, related_name='structured_facts')
    evidence = models.ForeignKey(SourceEvidence, on_delete=models.CASCADE)
    attribute = models.CharField(max_length=32)
    value = models.TextField()
    attribution = models.CharField(max_length=24, default='narrator')
    speaker = models.CharField(max_length=255, blank=True)
    time_label = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=16, default='explicit')


class ProfileChange(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    node = models.ForeignKey(GraphNode, on_delete=models.CASCADE, related_name='profile_changes')
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE)
    patch = models.JSONField(default=dict)
    basis = models.JSONField(default=list)
    state = models.CharField(max_length=16, default='ready')
    legacy = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['node', 'chapter'], name='book_profile_node_chapter')]


class Hypothesis(models.Model):
    """Append observations rather than overwriting an earlier interpretation."""
    id = models.CharField(primary_key=True, max_length=64)
    revision = models.ForeignKey(Revision, on_delete=models.CASCADE)
    key = models.CharField(max_length=64)
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE)
    source = models.ForeignKey(GraphNode, on_delete=models.CASCADE, related_name='hypotheses')
    target = models.ForeignKey(GraphNode, on_delete=models.CASCADE, null=True, related_name='hypothesis_targets')
    description = models.TextField()
    state = models.CharField(max_length=16, default='pending')
    basis = models.JSONField(default=list)

    class Meta:
        indexes = [models.Index(fields=['revision', 'key'])]
