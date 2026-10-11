"""Lesson transitions and local request authorization; no model I/O here."""
import hashlib
from django.db import transaction
from rest_framework.exceptions import ValidationError
from .generation import text
from .locking import course_lock
from .models import Attempt, DeviceJob, Exercise, LearningSession, LearningTurn, Request, AnswerRevision
from .services import ACTIVE, Conflict, request_id, snapshot


def start_session(exercise, key):
    with course_lock(exercise.course_id), transaction.atomic():
        exercise.refresh_from_db()
        if exercise.format != 'scenario':
            raise ValidationError('该练习使用专项作答')
        sid = hashlib.sha256(f'{exercise.id}:{key}'.encode()).hexdigest()[:40]
        prior = LearningSession.objects.filter(pk=sid).first()
        if prior:
            return prior
        current = LearningSession.objects.filter(exercise=exercise).exclude(phase__in=['completed', 'ended']).first()
        if current:
            return current
        if exercise.status not in ('ready', 'completed'):
            raise Conflict('当前练习不能开始学习')
        if exercise.status == 'completed' and Exercise.objects.filter(course=exercise.course, status__in=ACTIVE).count() >= exercise.course.pending_limit:
            raise Conflict('未完成名额已满')
        exercise.status = 'in_progress'
        exercise.save(update_fields=['status'])
        return LearningSession.objects.create(id=sid, exercise=exercise)


def check_version(session, revision):
    session.refresh_from_db()
    if type(revision) is not int or session.revision != revision:
        raise Conflict('学习会话已更新，请重新加载后核对')
    if session.phase in ('completed', 'ended', 'verification'):
        raise Conflict('当前阶段不能修改教学会话')
    if LearningTurn.objects.filter(session=session, status__in=['pending', 'running']).exists():
        raise Conflict('老师正在回复，请稍后再操作')


def save_session_draft(session, revision, content):
    if not isinstance(content, str) or len(content) > 3000:
        raise ValidationError('输入最多3000字')
    with course_lock(session.exercise.course_id), transaction.atomic():
        check_version(session, revision)
        session.draft_text = content
        session.revision += 1
        session.save(update_fields=['draft_text', 'revision'])
    return session


def advance_session(session, revision, key):
    with course_lock(session.exercise.course_id), transaction.atomic():
        session.refresh_from_db()
        if key in session.advance_keys:
            return session
        check_version(session, revision)
        if session.phase == 'demo':
            LearningTurn.objects.create(session=session, kind='understanding', content=text(session.draft_text, 3000), status='completed')
            session.phase = 'expressions'
        elif session.phase == 'expressions':
            session.phase = 'substitution'
        elif session.phase == 'substitution':
            if LearningTurn.objects.filter(session=session, kind='substitution', status='completed').count() < 2:
                raise Conflict('先完成两次变化组句')
            session.phase = 'conversation'
        elif session.phase == 'conversation':
            if LearningTurn.objects.filter(session=session, kind='conversation', status='completed').count() < 3:
                raise Conflict('先完成三个交流回合')
            # Only the new transfer test starts an official attempt.
            session.attempt = Attempt.objects.create(exercise=session.exercise)
            session.phase = 'verification'
        else:
            raise Conflict('未知学习阶段')
        session.draft_text = ''
        session.revision += 1
        session.advance_keys.append(key)
        session.save(update_fields=['phase', 'attempt', 'draft_text', 'revision', 'advance_keys'])
    return session


def queue_turn(session, revision, key, help_requested=False, retry_id=None):
    if retry_id is not None and (not isinstance(retry_id, str) or not retry_id or len(retry_id) > 40):
        raise ValidationError('交流重试ID无效')
    with course_lock(session.exercise.course_id), transaction.atomic():
        course = session.exercise.course
        rid = request_id(course.pk, 'lesson_turn', f'{session.id}:{key}')
        previous = Request.objects.filter(pk=rid).first()
        if previous:
            return previous
        check_version(session, revision)
        if session.phase not in ('substitution', 'conversation'):
            raise Conflict('当前阶段不能提交交流')
        if retry_id:
            turn = LearningTurn.objects.filter(pk=retry_id, session=session, status='failed').first()
            if not turn or turn.kind not in (session.phase, 'help'):
                raise Conflict('没有可重试的交流')
            turn.status = 'pending'
            turn.save(update_fields=['status'])
        else:
            position = LearningTurn.objects.filter(session=session, kind=session.phase, status='completed').count()
            if position >= (2 if session.phase == 'substitution' else 3):
                raise Conflict('本阶段已完成，请进入下一步')
            if LearningTurn.objects.filter(session=session, status='failed').exists():
                raise Conflict('先重试失败的交流，或结束本次学习')
            turn = LearningTurn.objects.create(session=session, kind='help' if help_requested else session.phase,
                                              position=position, content='请给我一个提示' if help_requested else text(session.draft_text, 3000))
        session.revision += 1
        snap = snapshot(course)
        snap.update(session_phase=session.phase, session_revision=session.revision)
        req = Request.objects.create(id=rid, course=course, kind='lesson_turn', target_id=turn.id, snapshot=snap)
        DeviceJob.objects.create(request=req)
        session.save(update_fields=['revision'])
        return req


def queue_revision(attempt, question_id, content, key, retry_id=None):
    if not isinstance(question_id, str) or (retry_id is not None and (not isinstance(retry_id, str) or len(retry_id) > 40)):
        raise ValidationError('订正题目或重试ID无效')
    with course_lock(attempt.exercise.course_id), transaction.atomic():
        attempt.refresh_from_db()
        if attempt.status != 'completed':
            raise Conflict('批改完成后才能订正')
        if question_id not in {q['id'] for q in attempt.exercise.questions} or not attempt.answers.get(question_id, '').strip():
            raise ValidationError('只能订正已作答题目')
        rid = request_id(attempt.exercise.course_id, 'revise', f'{attempt.id}:{key}')
        prior = Request.objects.filter(pk=rid).first()
        if prior:
            return prior
        if AnswerRevision.objects.filter(attempt=attempt, status__in=['pending', 'running']).exists():
            raise Conflict('老师正在反馈订正')
        if retry_id:
            correction = AnswerRevision.objects.filter(pk=retry_id, attempt=attempt, question_id=question_id, status='failed').first()
            if not correction:
                raise Conflict('订正不可重试')
            correction.status = 'pending'
            correction.save(update_fields=['status'])
        else:
            correction = AnswerRevision.objects.create(attempt=attempt, question_id=question_id,
                                                      original_answer=attempt.answers[question_id], content=text(content, 3000))
        req = Request.objects.create(id=rid, course=attempt.exercise.course, kind='revise', target_id=correction.id, snapshot=snapshot(attempt.exercise.course))
        DeviceJob.objects.create(request=req)
        return req
