"""Validated teaching material, kept separate from hidden assessment answers."""
from rest_framework.exceptions import ValidationError
from .generation import text, point_id

PHASES = ('demo', 'expressions', 'substitution', 'conversation', 'verification', 'completed', 'ended')

TEACHING_SCHEMA = {
    'task': '一个具体的日常或旅行任务', 'role': '老师扮演的角色', 'opening': '角色的第一句英文',
    'dialogue': [{'speaker': '角色', 'text': '简短英文', 'meaning': '中文意思'}],
    'understanding': '用中文确认双方意图的一个问题',
    'expressions': [{'kind': 'word|chunk|frame', 'text': '表达', 'meaning': '当前语境的含义',
                     'example': '英文例句', 'usage': '关键搭配或简短语法说明', 'knowledge_name': '对应知识点'}],
    'substitutions': [{'prompt': '替换任务', 'frame': '第一题提供框架，第二题仅提示关键词'}],
}


def validate_teaching(raw, course_id):
    if not isinstance(raw, dict):
        raise ValidationError('场景教学内容缺失')
    result = {k: text(raw.get(k), 1000) for k in ('task', 'role', 'opening', 'understanding')}
    dialogue = raw.get('dialogue')
    if not isinstance(dialogue, list) or not 2 <= len(dialogue) <= 8:
        raise ValidationError('示范对话需要2至8句')
    result['dialogue'] = [{k: text(v.get(k), 1000) for k in ('speaker', 'text', 'meaning')} for v in dialogue if isinstance(v, dict)]
    if len(result['dialogue']) != len(dialogue):
        raise ValidationError('示范对话格式错误')
    expressions = raw.get('expressions')
    if not isinstance(expressions, list) or not 2 <= len(expressions) <= 3:
        raise ValidationError('每次学习2至3个重点表达')
    result['expressions'] = []
    for value in expressions:
        if not isinstance(value, dict) or value.get('kind') not in ('word', 'chunk', 'frame'):
            raise ValidationError('表达类型无效')
        item = {k: text(value.get(k), limit) for k, limit in [('text', 200), ('meaning', 500), ('example', 1000), ('usage', 1000), ('knowledge_name', 160)]}
        item.update(kind=value['kind'], knowledge_id=point_id(course_id, item['knowledge_name']))
        result['expressions'].append(item)
    substitutions = raw.get('substitutions')
    if not isinstance(substitutions, list) or len(substitutions) != 2 or any(not isinstance(v, dict) for v in substitutions):
        raise ValidationError('需要两次变化组句练习')
    result['substitutions'] = [{k: text(v.get(k), 1000) for k in ('prompt', 'frame')} for v in substitutions]
    return result


def validate_turn(payload):
    """No model-controlled phase transition or official score."""
    corrections = payload.get('corrections', [])
    if not isinstance(corrections, list) or len(corrections) > 2:
        raise ValidationError('交流反馈最多两个修改建议')
    return {'reply': text(payload.get('reply'), 3000), 'feedback': text(payload.get('feedback'), 2000),
            'corrections': [text(v, 1000) for v in corrections]}
