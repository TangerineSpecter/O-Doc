"""Evidence-based teaching guidance, derived without changing declared self-rating."""
from .progress import knowledge_state


def learning_assessment(course, states=None) -> dict:
    states = knowledge_state(course) if states is None else states
    points = []
    for point in states:
        # Repeating the same exercise cannot establish transfer to new situations.
        distinct = {}
        for evidence in point['evidence']:
            # Evidence is chronological; replacing also moves the exercise to its latest position.
            distinct.pop(evidence['exercise_id'], None)
            distinct[evidence['exercise_id']] = evidence
        recent = list(distinct.values())[-3:]
        independent = [e for e in recent if not e['assisted']]
        if not recent:
            guidance, reason = '待评估', '尚无有效作答证据，先用适中题目探测'
        elif point['evidence'][-1]['assisted'] or point['evidence'][-1]['score'] < 80:
            guidance, reason = '巩固基础', '最近作答低于80分或使用帮助，换场景巩固后再检测'
        elif len(independent) >= 2 and all(e['score'] >= 80 for e in independent):
            guidance, reason = '提升挑战', '近期至少两份不同练习独立达到80分，逐步增加表达或场景复杂度'
        else:
            guidance, reason = '保持练习', '已有合格表现，继续换题检测，避免仅凭一次成绩提升难度'
        points.append({'id': point['id'], 'name': point['name'], 'status': point['status'],
                       'guidance': guidance, 'reason': reason, 'recent_evidence': recent,
                       'due_at': point['due_at']})
    count = len({e['exercise_id'] for p in points for e in p['recent_evidence']})
    return {'status': '持续评估中' if count >= 2 else '初步评估' if count else '待初测',
            'evidence_count': count, 'points': points}
