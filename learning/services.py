"""Short, idempotent learning transitions; model calls live in execution.py."""
import hashlib
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from .locking import course_lock
from .models import Attempt, ChatMessage, Course, DeviceJob, Exercise, Grade, Plan, Request, Runtime
from .progress import knowledge_state
from .adaptation import learning_assessment
from .serializers import CourseSerializer

ACTIVE = ['generating', 'ready', 'in_progress', 'grading', 'failed_grading']


class Conflict(ValidationError):
    status_code = 409


def request_id(course_id, kind, key):
    return hashlib.sha256(f'{course_id}:{kind}:{key}'.encode()).hexdigest()


def configured_model(course):
    if not course.model_id or not course.model or course.model.type != 'chat':
        raise ValidationError('老师模型不可用，请重新选择对话模型')
    return course.model_id


def snapshot(course):
    return {**CourseSerializer(course).data, 'model_id': configured_model(course)}


def reserve_exercise(course, key, scheduled=False):
    with course_lock(course.pk), transaction.atomic():
        course = Course.objects.select_for_update().get(pk=course.pk)
        rid = request_id(course.pk, 'generate', key)
        prior = Request.objects.filter(pk=rid).first()
        if prior:
            return prior, False
        if Exercise.objects.filter(course=course, status__in=ACTIVE).count() >= course.pending_limit:
            return None, False
        snap = snapshot(course)
        plan = Plan.objects.filter(course=course).order_by('-created_at', '-id').first()
        initial = not Grade.objects.filter(attempt__exercise__course=course, attempt__exercise__kind='initial').exists()
        if not initial and (not plan or not plan.confirmed):
            raise Conflict('请先确认学习计划，再生成下一份练习')
        if initial and Exercise.objects.filter(course=course, kind='initial', status__in=ACTIVE).exists():
            return None, False
        last = Attempt.objects.filter(exercise__course=course, status='completed').order_by('-submitted_at').first()
        kind = 'initial' if initial else 'recap' if last and last.submitted_at < timezone.now() - timedelta(days=14) else 'practice'
        if kind == 'recap' and Exercise.objects.filter(course=course, kind='recap', status__in=ACTIVE).exists():
            return None, False
        states = knowledge_state(course)
        assessment = learning_assessment(course, states)
        # Self-rating is a cold-start hint, never a permanent difficulty ceiling.
        starting_level = snap.pop('level', '不确定')
        if initial:
            snap['starting_level'] = starting_level
        snap['assessment'] = assessment
        due = [p for p in states if p['status'] == '需复习']
        count = 5 if initial else 3 if kind == 'recap' else course.question_count
        snap.update({'question_count': count, 'review_points': due[:int(count * .6)], 'knowledge': [{'id': p['id'], 'name': p['name']} for p in states],
                     'plan': plan.stages[plan.stage] if plan else None, 'kind': kind, 'scheduled': scheduled})
        exercise = Exercise.objects.create(course=course, kind=kind, snapshot=snap)
        req = Request.objects.create(id=rid, course=course, kind='generate', target_id=exercise.id, snapshot=snap)
        DeviceJob.objects.create(request=req)
        return req, True


def new_attempt(exercise):
    with course_lock(exercise.course_id), transaction.atomic():
        exercise.refresh_from_db()
        draft = Attempt.objects.filter(exercise=exercise, status='draft').first()
        if draft:
            return draft
        if exercise.status not in ('ready', 'completed'):
            raise Conflict('当前练习还不能作答')
        if exercise.status == 'completed' and Exercise.objects.filter(course=exercise.course, status__in=ACTIVE).count() >= exercise.course.pending_limit:
            raise Conflict('未完成名额已满，请先完成或结束已有练习')
        attempt = Attempt.objects.create(exercise=exercise)
        # Repractice is a new attempt, without reserving another exercise slot.
        exercise.status = 'in_progress'
        exercise.save(update_fields=['status'])
        return attempt


def save_draft(attempt, revision, answers):
    if not isinstance(answers, dict) or any(not isinstance(v, str) or len(v) > 5000 for v in answers.values()):
        raise ValidationError('答案格式错误或超过长度限制')
    allowed = {q['id'] for q in attempt.exercise.questions}
    if set(answers) - allowed:
        raise ValidationError('包含未知题目')
    with course_lock(attempt.exercise.course_id), transaction.atomic():
        attempt.refresh_from_db()
        if attempt.status != 'draft' or attempt.revision != revision:
            raise Conflict('答案已在其他页面更新，请重新加载后核对')
        attempt.answers = answers
        attempt.revision += 1
        attempt.save(update_fields=['answers', 'revision'])
    return attempt


def submit(attempt, key, confirm_skips=False, review=False, retry=False):
    with course_lock(attempt.exercise.course_id), transaction.atomic():
        attempt.refresh_from_db()
        kind = 'review' if review else 'grade'
        existing = Request.objects.filter(pk=request_id(attempt.exercise.course_id, kind, f'{attempt.id}:{key}')).first()
        if existing:
            return existing
        if review:
            if attempt.status != 'completed' or attempt.review_requested:
                raise Conflict('每份作答只可主动复核一次')
            attempt.review_requested = True
        elif retry:
            if attempt.status != 'failed':
                raise Conflict('只有失败的批改可以重试')
            previous = Request.objects.filter(target_id=attempt.id, kind__in=['grade', 'review']).order_by('-created_at').first()
            kind = previous.kind if previous else 'grade'
        elif attempt.status != 'draft':
            raise Conflict('已提交，请查看批改状态')
        elif not confirm_skips and any(not attempt.answers.get(q['id'], '').strip() for q in attempt.exercise.questions):
            raise Conflict('存在未作答题，请确认跳过后提交')
        snap = snapshot(attempt.exercise.course)
        attempt.status = 'pending'
        attempt.submitted_at = attempt.submitted_at or timezone.now()
        attempt.save(update_fields=['status', 'submitted_at', 'review_requested'])
        attempt.exercise.status = 'grading'
        attempt.exercise.save(update_fields=['status'])
        req = Request.objects.create(id=request_id(attempt.exercise.course_id, kind, f'{attempt.id}:{key}'), course=attempt.exercise.course, kind=kind, target_id=attempt.id, snapshot=snap)
        DeviceJob.objects.create(request=req)
        return req


def end_exercise(exercise):
    with course_lock(exercise.course_id), transaction.atomic():
        exercise.refresh_from_db()
        exercise.status = 'ended'
        exercise.save(update_fields=['status'])
        for req in Request.objects.filter(course_id=exercise.course_id, status__in=['pending', 'running']):
            if req.target_id == exercise.id or Attempt.objects.filter(exercise=exercise, pk=req.target_id).exists():
                req.status, req.error = 'cancelled', '练习已结束'
                req.save(update_fields=['status', 'error', 'updated_at'])
        for attempt in Attempt.objects.filter(exercise=exercise).exclude(status='completed'):
            attempt.status = 'ended'
            attempt.save(update_fields=['status'])


def assist(attempt, question_id):
    if question_id not in {q['id'] for q in attempt.exercise.questions}:
        raise ValidationError('题目不存在')
    with course_lock(attempt.exercise.course_id), transaction.atomic():
        attempt.refresh_from_db()
        if attempt.status == 'draft' and question_id not in attempt.assisted:
            attempt.assisted.append(question_id)
            attempt.revision += 1
            attempt.save(update_fields=['assisted', 'revision'])


def queue_chat(course, content, key, attempt=None, question_id=''):
    if not isinstance(content, str) or not content.strip() or len(content) > 3000:
        raise ValidationError('请输入问题，最多3000字')
    with course_lock(course.pk), transaction.atomic():
        rid = request_id(course.pk, 'chat', key)
        prior = Request.objects.filter(pk=rid).first()
        if prior:
            return prior
        if Request.objects.filter(course=course, kind='chat', status__in=['pending', 'running']).exists():
            raise Conflict('老师正在回复，请稍后再提问')
        snap = snapshot(course)
        if attempt:
            if question_id:
                if question_id not in {q['id'] for q in attempt.exercise.questions}:
                    raise ValidationError('题目不存在')
                attempt.refresh_from_db()
                if attempt.status == 'draft' and question_id not in attempt.assisted:
                    attempt.assisted.append(question_id)
                    attempt.revision += 1
                    attempt.save(update_fields=['assisted', 'revision'])
            elif attempt.status == 'draft':
                for q in attempt.exercise.questions:
                    if q['id'] not in attempt.assisted:
                        attempt.assisted.append(q['id'])
                attempt.revision += 1
                attempt.save(update_fields=['assisted', 'revision'])
        else:
            # General chat during an active draft might still supply answer help.
            for draft in Attempt.objects.filter(exercise__course=course, status='draft'):
                draft.assisted = [q['id'] for q in draft.exercise.questions]
                draft.revision += 1
                draft.save(update_fields=['assisted', 'revision'])
        msg = ChatMessage.objects.create(course=course, content=content.strip(), attempt=attempt, question_id=question_id)
        req = Request.objects.create(id=rid, course=course, kind='chat', target_id=msg.id, snapshot=snap)
        DeviceJob.objects.create(request=req)
        return req
