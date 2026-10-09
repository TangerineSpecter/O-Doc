"""Objective scoring and validated quality rubrics; failed calls never score zero."""
from .generation import text
from rest_framework.exceptions import ValidationError


def objective_items(attempt, review=False):
    items, subjective = [], []
    for q in attempt.exercise.questions:
        answer = attempt.answers.get(q['id'], '').strip()
        if not answer:
            items.append({'question_id': q['id'], 'skipped': True, 'score': None, 'feedback': '本题跳过，不计入得分和掌握证据', 'dimensions': [], 'natural_expression': ''})
        elif q['type'] in ('short', 'translation') or (review and q['type'] == 'fill'):
            subjective.append({**q, 'student_answer': answer})
        else:
            accepted = [q['reference_answer']] if q['type'] == 'choice' else q['accepted_answers']
            correct = answer in accepted if q['type'] == 'choice' else answer.casefold() in [v.strip().casefold() for v in accepted]
            items.append({'question_id': q['id'], 'skipped': False, 'score': 100 if correct else 0, 'feedback': '回答正确' if correct else '与预设答案不一致；如表达合理可申请复核', 'dimensions': [], 'natural_expression': q['reference_answer']})
    return items, subjective


def validate_quality(payload, questions):
    raw = payload.get('items')
    if not isinstance(raw, list) or len(raw) != len(questions):
        raise ValidationError('批改结果不完整')
    expected = {q['id']: q for q in questions}
    output, seen = [], set()
    for item in raw:
        if not isinstance(item, dict) or item.get('question_id') not in expected or item['question_id'] in seen:
            raise ValidationError('批改题目不匹配')
        q = expected[item['question_id']]
        dims = item.get('dimensions')
        if not isinstance(dims, list) or len(dims) != 3:
            raise ValidationError('缺少分项评分')
        validated = []
        for index, d in enumerate(dims):
            if not isinstance(d, dict) or type(d.get('score')) not in (int, float) or not 0 <= d['score'] <= q['weights'][index]:
                raise ValidationError('分项评分越界')
            reason = text(d.get('reason'))
            verdict = d.get('verdict')
            if verdict not in ('correct', 'partial', 'incorrect'):
                raise ValidationError('评分依据格式错误')
            if (verdict == 'correct' and d['score'] != q['weights'][index]) or (verdict == 'incorrect' and d['score'] != 0) or (verdict == 'partial' and not 0 < d['score'] < q['weights'][index]):
                raise ValidationError('评分与判断矛盾')
            validated.append({'score': d['score'], 'max_score': q['weights'][index], 'reason': reason, 'verdict': verdict})
        score = sum(d['score'] for d in validated)
        if item.get('score') != score:
            raise ValidationError('总分与分项不一致')
        output.append({'question_id': q['id'], 'score': score, 'skipped': False, 'dimensions': validated, 'feedback': text(item.get('feedback')), 'natural_expression': text(item.get('natural_expression'))})
        seen.add(q['id'])
    return output


def combine(items, questions):
    by_id = {v['question_id']: v for v in items}
    ordered = [by_id[q['id']] for q in questions]
    scores = [i['score'] for i in ordered if not i['skipped']]
    return {'items': ordered, 'score': round(sum(scores) / len(scores), 1) if scores else None,
            'answered': len(scores), 'total': len(questions), 'completion': round(len(scores) / len(questions) * 100)}
