"""Author facts and immutable manuscripts; no chapter is an ordinary Article."""
import uuid
from django.db import models


def stable_id():
    return uuid.uuid4().hex


class Record(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=stable_id)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Project(models.Model):
    anthology = models.OneToOneField('anthology.Anthology', primary_key=True, on_delete=models.CASCADE, related_name='novel')
    direction = models.TextField(blank=True)
    setup = models.JSONField(default=dict)
    style = models.TextField(blank=True)
    blueprint = models.TextField(blank=True)
    confirmed = models.BooleanField(default=False)
    writer_model_id = models.CharField(max_length=40, blank=True)
    editor_model_id = models.CharField(max_length=40, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class Entity(Record):
    KINDS = ('person', 'place', 'organization', 'item', 'event', 'clue')
    IMPORTANCE = ('protagonist', 'core', 'important', 'supporting', 'temporary')
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    kind = models.CharField(max_length=20, default='person')
    name = models.CharField(max_length=100)
    aliases = models.JSONField(default=list)
    importance = models.CharField(max_length=20, default='supporting')
    roles = models.JSONField(default=list)
    biography = models.TextField(blank=True)
    plan = models.TextField(blank=True)
    initial_state = models.JSONField(default=dict)
    hidden = models.BooleanField(default=False)


class Outline(Record):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    level = models.CharField(max_length=20, default='volume')
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True)
    position = models.PositiveIntegerField(default=1)
    entity_ids = models.JSONField(default=list)


class Relation(Record):
    """Author planning relationships are separate from prose-established facts."""
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    source_id = models.CharField(max_length=40)
    target_id = models.CharField(max_length=40)
    description = models.TextField()
    secret = models.BooleanField(default=False)


class Chapter(Record):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    title = models.CharField(max_length=255, default='未命名章节')
    volume = models.CharField(max_length=100, default='第一卷')
    position = models.PositiveIntegerField(default=1)
    outline = models.TextField(blank=True)
    entity_ids = models.JSONField(default=list)
    story_time = models.CharField(max_length=100, blank=True)
    time_order = models.IntegerField(null=True, blank=True)
    pov = models.CharField(max_length=100, blank=True)
    # Stable string pointers avoid restore-order cycles. Services/snapshot validators
    # enforce that every pointer belongs to this chapter, never another manuscript.
    draft_id = models.CharField(max_length=40, blank=True)
    adopted_id = models.CharField(max_length=40, blank=True)
    published_id = models.CharField(max_length=40, blank=True)
    published_at = models.DateTimeField(null=True)
    needs_review = models.BooleanField(default=False)
    is_valid = models.BooleanField(default=True)

    class Meta:
        ordering = ['position', 'created_at', 'id']


class Revision(Record):
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name='revisions')
    title = models.CharField(max_length=255)
    volume = models.CharField(max_length=100, blank=True)
    content = models.TextField()
    content_hash = models.CharField(max_length=64)
    entity_ids = models.JSONField(default=list)
    source = models.CharField(max_length=30, default='save')


class Thread(Record):
    STATES = ('planned', 'planted', 'progressing', 'partial', 'resolved', 'abandoned')
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    kind = models.CharField(max_length=20, default='foreshadowing')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    state = models.CharField(max_length=20, default='planned')
    entity_ids = models.JSONField(default=list)
    planned_payoff = models.CharField(max_length=200, blank=True)
    open_ending = models.BooleanField(default=False)


class Rule(Record):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    kind = models.CharField(max_length=20, default='expression')
    instruction = models.TextField()
    strength = models.CharField(max_length=20, default='avoid')
    scope = models.CharField(max_length=100, default='全书')
    scope_entity_ids = models.JSONField(default=list)
    scope_chapter_ids = models.JSONField(default=list)
    example = models.TextField(blank=True)
    alternative = models.TextField(blank=True)
    exception = models.TextField(blank=True)
    source_revision_id = models.CharField(max_length=40, blank=True)
    enabled = models.BooleanField(default=True)


class Message(Record):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    role = models.CharField(max_length=20)
    content = models.TextField()


class Review(Record):
    revision = models.ForeignKey(Revision, on_delete=models.CASCADE, related_name='reviews')
    context_hash = models.CharField(max_length=64)
    summary = models.TextField(blank=True)
    changes = models.JSONField(default=list)
    issues = models.JSONField(default=list)
    dismissed = models.JSONField(default=dict)
    confirmed_ids = models.JSONField(default=list)


class Fact(Record):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    revision = models.ForeignKey(Revision, on_delete=models.RESTRICT)
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE)
    data = models.JSONField(default=dict)


class Run(Record):
    """Completed output is a synced business record, execution is device local."""
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, null=True)
    request_key = models.CharField(max_length=64)
    kind = models.CharField(max_length=20)
    input = models.JSONField(default=dict)
    base_revision_id = models.CharField(max_length=40, blank=True)
    context_hash = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=20, default='pending')
    result = models.JSONField(default=dict)
    error = models.CharField(max_length=300, blank=True)
    model_name = models.CharField(max_length=200, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['project', 'request_key'], name='novel_request_key')]


class Job(models.Model):
    run = models.OneToOneField(Run, primary_key=True, on_delete=models.CASCADE)
    preview = models.TextField(blank=True)
    cancelled = models.BooleanField(default=False)
    lease_until = models.DateTimeField(null=True)
    stage = models.CharField(max_length=100, default='等待执行')

