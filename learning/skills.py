"""Separate recognition from independent expression, derived from graded facts."""
from datetime import timedelta
from zoneinfo import ZoneInfo
from django.utils import timezone
from .models import Attempt, Grade, KnowledgePoint
from .progress import INTERVALS
from .time_utils import aware


def skill_states(course, items=None):
    entities = KnowledgePoint.objects.filter(course=course) if items is None else items
    points = {p.id: {'id': p.id, 'name': p.name if items is None else p.text, 'recognition': [], 'expression': []} for p in entities}
    versions = {p.id: p.revision for p in items} if items is not None else {}
    latest = {}
    for attempt in Attempt.objects.filter(exercise__course=course, submitted_at__isnull=False, grade__isnull=False).select_related('exercise').distinct().order_by('submitted_at', 'id'):
        latest.pop(attempt.exercise_id, None)
        latest[attempt.exercise_id] = attempt
    grades = {}
    for grade in Grade.objects.filter(attempt__exercise__course=course).order_by('version', 'created_at', 'id'):
        grades[grade.attempt_id] = grade.result
    for attempt in latest.values():
        result = grades.get(attempt.id)
        if not result:
            continue
        questions = {q['id']: q for q in attempt.exercise.questions}
        grouped = {}
        for item in result['items']:
            if item.get('skipped'):
                continue
            q = questions[item['question_id']]
            skill = 'expression' if q['type'] in ('short', 'translation') else 'recognition'
            targets = [q['knowledge_id']] if items is None else q.get('learning_item_ids', [])
            if items is not None:
                saved_versions = {v['item_id']: v['revision'] for v in q.get('learning_item_versions', [])}
                targets = [pid for pid in targets if pid in versions and saved_versions.get(pid, 0) == versions[pid]]
            for pid in targets:
                grouped.setdefault((pid, skill), []).append((item, q))
        for (pid, skill), values in grouped.items():
            if pid not in points:
                continue
            points[pid][skill].append({
                'attempt_id': attempt.id, 'exercise_id': attempt.exercise_id,
                'score': round(sum(i['score'] for i, _ in values) / len(values), 1),
                'assisted': any(q['id'] in attempt.assisted for _, q in values),
                'date': aware(attempt.submitted_at).astimezone(ZoneInfo(course.timezone)).date().isoformat(),
                'when': attempt.submitted_at, 'review': any(q.get('review', False) for _, q in values),
                'example': next((attempt.answers.get(q['id'], '') for i, q in values if i['score'] >= 80), ''),
                'feedback': values[0][0]['feedback'],
            })
    for point in points.values():
        for skill in ('recognition', 'expression'):
            evidence, due, interval, passed_exercises, dates, reviewed = point[skill], None, 0, set(), set(), False
            for e in evidence:
                e['review'] = e['review'] and due is not None and e['when'] >= due
                passed = e['score'] >= 80 and not e['assisted']
                if passed:
                    passed_exercises.add(e['exercise_id']); dates.add(e['date']); reviewed |= e['review']
                    days = INTERVALS[min(interval, len(INTERVALS) - 1)]
                    interval = min(interval + 1, len(INTERVALS) - 1)
                else:
                    days = 1
                due = e['when'] + timedelta(days=days)
                e.pop('when')
            mastered = len(passed_exercises) >= 3 and len(dates) >= 2 and reviewed
            point[skill] = {'status': '待评估' if not evidence else '需复习' if due <= timezone.now() else '初步掌握' if mastered else '学习中',
                            'due_at': aware(due).isoformat(timespec='milliseconds') if due else None, 'evidence': evidence,
                            'last_score': evidence[-1]['score'] if evidence else None}
    return list(points.values())


def growth_data(states):
    expression = [e for p in states for e in p['expression']['evidence']]
    return {
        'independent_examples': [{'knowledge_name': p['name'], **e} for p in states for e in p['expression']['evidence'] if e['score'] >= 80 and not e['assisted']][-5:],
        'repeated_difficulties': [{'knowledge_name': p['name'], 'count': len(failed), 'feedback': failed[-1]['feedback']}
                                 for p in states if len(failed := [e for e in p['expression']['evidence'] if e['score'] < 80]) >= 2],
        'expression_count': len(expression),
        'next_focus': [p['name'] for p in states if p['expression']['status'] == '需复习' or
                       (p['expression']['evidence'] and (p['expression']['last_score'] < 80 or p['expression']['evidence'][-1]['assisted']))][:3],
    }
