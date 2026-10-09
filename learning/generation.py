"""Validate untrusted teacher output before it becomes an exercise."""
import hashlib
import unicodedata
from rest_framework.exceptions import ValidationError
from .models import KnowledgePoint


def point_id(course_id, name):
    normalized = unicodedata.normalize('NFKC', name).strip().casefold()
    return hashlib.sha256(f'{course_id}:{normalized}'.encode()).hexdigest()


def text(value, limit=5000):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValidationError('老师返回的文字格式不完整')
    return value.strip()


def validate_exercise(payload, exercise):
    title = text(payload.get('title'), 160)
    intro = text(payload.get('introduction'))
    questions = payload.get('questions')
    if not isinstance(questions, list) or len(questions) != exercise.snapshot['question_count']:
        raise ValidationError('题目数量不符合设置')
    known = {p.id: p.name for p in KnowledgePoint.objects.filter(course=exercise.course)}
    requested_review = {p['id'] for p in exercise.snapshot['review_points']}
    reviewed = set()
    output = []
    for i, raw in enumerate(questions):
        if not isinstance(raw, dict) or raw.get('type') not in ('choice', 'fill', 'short', 'translation'):
            raise ValidationError('不支持的题型')
        name = text(raw.get('knowledge_name'), 160)
        supplied_id = raw.get('knowledge_id')
        pid = supplied_id if supplied_id in known else point_id(exercise.course_id, name)
        if supplied_id and supplied_id not in known:
            raise ValidationError('老师选择了未知知识点ID')
        if pid in requested_review:
            reviewed.add(pid)
        answer = text(raw.get('reference_answer'))
        accepted = raw.get('accepted_answers', [])
        if not isinstance(accepted, list) or any(not isinstance(v, str) or not v.strip() or len(v) > 5000 for v in accepted):
            raise ValidationError('可接受答案格式不正确')
        options = raw.get('options', [])
        if raw['type'] == 'choice' and (not isinstance(options, list) or not 2 <= len(options) <= 6 or any(not isinstance(v, str) or len(v) > 1000 for v in options) or len(set(options)) != len(options) or answer not in options):
            raise ValidationError('单选题选项或答案无效')
        if raw['type'] == 'fill' and not accepted:
            raise ValidationError('填空题必须提供可接受答案')
        weights = raw.get('weights', [40, 30, 30])
        if not isinstance(weights, list) or len(weights) != 3 or any(type(v) is not int or v <= 0 for v in weights) or sum(weights) != 100:
            raise ValidationError('评分权重必须为三个正整数且合计100')
        output.append({'id': f'q{i+1}', 'type': raw['type'], 'prompt': text(raw.get('prompt')), 'options': options if raw['type'] == 'choice' else [],
                       'knowledge_id': pid, 'knowledge_name': known.get(pid, name), 'reference_answer': answer, 'accepted_answers': accepted,
                       'explanation': text(raw.get('explanation')), 'rubric': text(raw.get('rubric')), 'weights': weights, 'review': pid in requested_review})
    if requested_review - reviewed:
        raise ValidationError('本次练习缺少指定复习知识点')
    return title, intro, output


def validate_stages(value):
    if not isinstance(value, list) or len(value) != 3:
        raise ValidationError('学习计划需要三个阶段')
    return [{'title': text(v.get('title'), 100), 'focus': text(v.get('focus'), 1000)} for v in value if isinstance(v, dict)] if all(isinstance(v, dict) for v in value) else _invalid()


def _invalid():
    raise ValidationError('学习阶段格式错误')
