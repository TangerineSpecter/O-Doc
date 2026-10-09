from .models import Attempt, ChatMessage, Correction, Evaluation, Exercise, Grade, Plan, Request, Runtime
from .progress import knowledge_state
from .adaptation import learning_assessment
from .serializers import CourseSerializer
from .services import ACTIVE


def request_data(req):
    return {'id': req.id, 'kind': req.kind, 'target_id': req.target_id, 'status': req.status, 'error': req.error} if req else None


def exercise_summary(ex):
    return {'id': ex.id, 'title': ex.title, 'kind': ex.kind, 'status': ex.status, 'created_at': ex.created_at, 'question_count': len(ex.questions)}


def attempt_data(attempt):
    grade = Grade.objects.filter(attempt=attempt).order_by('-version', '-id').first()
    return {'id': attempt.id, 'answer_items': [{'question_id': key, 'answer': value} for key, value in attempt.answers.items()], 'assisted': attempt.assisted, 'revision': attempt.revision, 'status': attempt.status,
            'review_requested': attempt.review_requested, 'submitted_at': attempt.submitted_at, 'grade': grade.result if grade else None,
            'grades': list(Grade.objects.filter(attempt=attempt).order_by('version').values('id', 'version', 'result', 'created_at'))}


def exercise_data(ex):
    attempts = list(Attempt.objects.filter(exercise=ex).order_by('created_at', 'id'))
    current = attempts[-1] if attempts else None
    reveal = current is not None and Grade.objects.filter(attempt=current).exists() and current.status != 'draft'
    public = ('id', 'type', 'prompt', 'options', 'knowledge_id', 'knowledge_name', 'review')
    return {**exercise_summary(ex), 'introduction': ex.introduction, 'questions': ex.questions if reveal else [{k: q[k] for k in public} for q in ex.questions],
            'attempt': attempt_data(current) if current else None, 'attempts': [attempt_data(a) for a in attempts],
            'requests': [request_data(r) for r in Request.objects.filter(course=ex.course).filter(target_id__in=[ex.id, *[a.id for a in attempts]]).order_by('-created_at')[:10]]}


def course_data(course):
    plan = Plan.objects.filter(course=course).order_by('-created_at', '-id').first()
    baseline = plan.baseline if plan else []
    practice_ids = list(Exercise.objects.filter(course=course, kind='practice', attempt__grade__isnull=False).exclude(pk__in=baseline).values_list('id', flat=True).distinct())
    evaluations = list(Evaluation.objects.filter(course=course).order_by('-created_at').values('id', 'result', 'evidence', 'created_at')[:10])
    return {'config': CourseSerializer(course).data, 'title': course.anthology.title, 'auto_enabled': Runtime.objects.filter(course=course, enabled=True).exists(),
            'model_available': bool(course.model_id and course.model and course.model.type == 'chat'),
            'pending_count': Exercise.objects.filter(course=course, status__in=ACTIVE).count(),
            'completed_count': Exercise.objects.filter(course=course, attempt__grade__isnull=False).distinct().count(),
            'plan': {'id': plan.id, 'stages': plan.stages, 'stage': plan.stage, 'confirmed': plan.confirmed} if plan else None,
            'stage_completed': len(practice_ids), 'stage_evaluation_due': len(practice_ids) >= 5,
            'knowledge': knowledge_state(course), 'assessment': learning_assessment(course), 'evaluations': evaluations,
            'corrections': list(Correction.objects.filter(course=course).order_by('-created_at').values('id', 'content', 'created_at')[:20]),
            'exercises': [exercise_summary(ex) for ex in Exercise.objects.filter(course=course).order_by('-created_at')[:100]],
            'requests': [request_data(r) for r in Request.objects.filter(course=course).order_by('-created_at')[:20]],
            'messages': list(ChatMessage.objects.filter(course=course).order_by('-created_at').values('id', 'role', 'content', 'attempt_id', 'question_id', 'created_at')[:60])[::-1]}
