"""Learning facts are separate from world residents and their memory."""
import uuid
from django.db import models


def stable_id():
    return uuid.uuid4().hex


class Course(models.Model):
    anthology = models.OneToOneField('anthology.Anthology', primary_key=True, on_delete=models.CASCADE)
    goal = models.CharField(max_length=1000)
    subject = models.CharField(max_length=20, default='english')
    scenarios = models.JSONField(default=list)
    level = models.CharField(max_length=40, default='不确定')
    learning_mode = models.CharField(max_length=20, default='scenario', choices=[('classic', '专项练习'), ('scenario', '场景学习')])
    minutes = models.PositiveIntegerField(default=10)
    question_count = models.PositiveIntegerField(default=3)
    pending_limit = models.PositiveIntegerField(default=2)
    teacher_name = models.CharField(max_length=50, default='英语老师')
    model = models.ForeignKey('system_settings.AIModel', null=True, on_delete=models.SET_NULL)
    style = models.CharField(max_length=500, default='耐心讲解，结合实际应用')
    schedule_time = models.CharField(max_length=5, default='09:00')
    timezone = models.CharField(max_length=80, default='Asia/Shanghai')
    updated_at = models.DateTimeField(auto_now=True)


class Plan(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=stable_id)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    stages = models.JSONField(default=list)
    stage = models.PositiveIntegerField(default=0)
    confirmed = models.BooleanField(default=False)
    baseline = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)


class KnowledgePoint(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    name = models.CharField(max_length=160)


class Exercise(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=stable_id)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    kind = models.CharField(max_length=20, default='practice')
    format = models.CharField(max_length=20, default='classic')
    teaching = models.JSONField(default=dict)
    title = models.CharField(max_length=160, default='正在准备练习')
    introduction = models.TextField(default='', blank=True)
    snapshot = models.JSONField(default=dict)
    questions = models.JSONField(default=list)
    status = models.CharField(max_length=20, default='generating')
    created_at = models.DateTimeField(auto_now_add=True)


class Attempt(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=stable_id)
    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE)
    answers = models.JSONField(default=dict)
    assisted = models.JSONField(default=list)
    revision = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, default='draft')
    review_requested = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Grade(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=stable_id)
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE)
    version = models.PositiveIntegerField(default=1)
    result = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['attempt', 'version'], name='learning_grade_version')]


class Evaluation(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=stable_id)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    evidence = models.JSONField(default=list)
    result = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)


class Correction(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=stable_id)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    content = models.CharField(max_length=1000)
    created_at = models.DateTimeField(auto_now_add=True)


class ChatMessage(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=stable_id)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    attempt = models.ForeignKey(Attempt, null=True, on_delete=models.SET_NULL)
    question_id = models.CharField(max_length=40, blank=True, default='')
    role = models.CharField(max_length=20, default='user')
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class Request(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    kind = models.CharField(max_length=20)
    target_id = models.CharField(max_length=40)
    snapshot = models.JSONField(default=dict)
    status = models.CharField(max_length=20, default='pending')
    error = models.CharField(max_length=250, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Runtime(models.Model):
    """Device execution permission and leases never enter WebDAV."""
    course = models.OneToOneField(Course, primary_key=True, on_delete=models.CASCADE)
    enabled = models.BooleanField(default=False)
    claimed_at = models.DateTimeField(null=True)
    owner = models.CharField(max_length=40, default='', blank=True)
    enabled_at = models.DateTimeField(null=True)


class DeviceJob(models.Model):
    """Only locally authorized requests may call a provider."""
    request = models.OneToOneField(Request, primary_key=True, on_delete=models.CASCADE)


class GoalProposal(models.Model):
    """Original selections, teacher proposal and confirmation are synced facts."""
    id = models.CharField(primary_key=True, max_length=64)
    anthology = models.ForeignKey('anthology.Anthology', on_delete=models.CASCADE)
    snapshot = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    status = models.CharField(max_length=20, default='pending')
    error = models.CharField(max_length=250, blank=True, default='')
    confirmed_at = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class GoalJob(models.Model):
    """Local permission/lease for refining a goal; never synced or replayed."""
    proposal = models.OneToOneField(GoalProposal, primary_key=True, on_delete=models.CASCADE)
    owner = models.CharField(max_length=40, blank=True, default='')
    claimed_at = models.DateTimeField(null=True)


class LearningSession(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=stable_id)
    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE)
    attempt = models.OneToOneField(Attempt, null=True, on_delete=models.CASCADE)
    phase = models.CharField(max_length=20, default='demo')
    revision = models.PositiveIntegerField(default=0)
    draft_text = models.TextField(default='', blank=True)
    feedback = models.JSONField(default=dict)
    advance_keys = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)


class LearningTurn(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=stable_id)
    session = models.ForeignKey(LearningSession, on_delete=models.CASCADE)
    kind = models.CharField(max_length=20)
    position = models.PositiveIntegerField(default=0)
    content = models.TextField()
    result = models.JSONField(default=dict)
    status = models.CharField(max_length=20, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)


class AnswerRevision(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=stable_id)
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE)
    question_id = models.CharField(max_length=40)
    original_answer = models.TextField()
    content = models.TextField()
    feedback = models.TextField(default='', blank=True)
    status = models.CharField(max_length=20, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)


class LearningItem(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=stable_id)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    knowledge = models.ForeignKey(KnowledgePoint, on_delete=models.CASCADE)
    source_exercise = models.ForeignKey(Exercise, null=True, on_delete=models.SET_NULL)
    kind = models.CharField(max_length=20, default='chunk')
    text = models.CharField(max_length=200)
    meaning = models.CharField(max_length=500)
    example = models.CharField(max_length=1000)
    usage = models.CharField(max_length=1000)
    revision = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
