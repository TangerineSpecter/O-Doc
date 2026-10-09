"""Derive mastery from immutable submissions and current grade versions."""
from datetime import timedelta
from zoneinfo import ZoneInfo
from django.utils import timezone
from .time_utils import aware
from .models import Attempt, Grade, KnowledgePoint

INTERVALS = [1, 3, 7, 14, 30]


def knowledge_state(course, now=None):
    now = now or timezone.now()
    points = {p.id: {'id': p.id, 'name': p.name, 'status': '待评估', 'evidence': [], 'interval': 0,
                     'due_at': None, 'last_score': None, 'qualified_exercises': set(), 'dates': set(), 'review_passed': False}
              for p in KnowledgePoint.objects.filter(course=course)}
    attempts = Attempt.objects.filter(exercise__course=course, submitted_at__isnull=False).select_related('exercise').order_by('submitted_at', 'id')
    grades = {}
    for grade in Grade.objects.filter(attempt__exercise__course=course).order_by('version', 'created_at', 'id'):
        grades[grade.attempt_id] = grade.result
    for attempt in attempts:
        result = grades.get(attempt.id)
        if not result:
            continue
        questions = {q['id']: q for q in attempt.exercise.questions}
        # One submission contributes at most one observation to each knowledge point.
        observations = {}
        for item in result['items']:
            q = questions[item['question_id']]
            if item.get('skipped'):
                continue
            point_id = q['knowledge_id']
            observations.setdefault(point_id, []).append((item['score'], q['id'] in attempt.assisted, q.get('review', False)))
        for point_id, values in observations.items():
            if point_id not in points:
                continue
            p = points[point_id]
            score = sum(v[0] for v in values) / len(values)
            assisted = any(v[1] for v in values)
            passed = score >= 80 and not assisted
            date = aware(attempt.submitted_at).astimezone(ZoneInfo(course.timezone)).date().isoformat()
            due_review = any(v[2] for v in values) and p['due_at'] is not None and attempt.submitted_at >= p['due_at']
            if passed:
                p['qualified_exercises'].add(attempt.exercise_id)
                p['dates'].add(date)
                p['review_passed'] |= due_review
                days = INTERVALS[min(p['interval'], len(INTERVALS) - 1)]
                p['interval'] = min(p['interval'] + 1, len(INTERVALS) - 1)
            else:
                days = 1
            p['due_at'] = attempt.submitted_at + timedelta(days=days)
            p['last_score'] = round(score, 1)
            p['evidence'].append({'attempt_id': attempt.id, 'exercise_id': attempt.exercise_id, 'score': round(score, 1), 'assisted': assisted, 'date': date, 'review': due_review})
    output = []
    for p in points.values():
        if p['evidence']:
            mastered = len(p['qualified_exercises']) >= 3 and len(p['dates']) >= 2 and p['review_passed']
            p['status'] = '初步掌握' if mastered else '学习中'
            if p['due_at'] <= now:
                p['status'] = '需复习'
        p['due_at'] = aware(p['due_at']).isoformat(timespec='milliseconds') if p['due_at'] else None
        for key in ('qualified_exercises', 'dates', 'review_passed', 'interval'):
            p.pop(key)
        output.append(p)
    return output
