"""User-confirmed contextual vocabulary; no automatic collection or evidence."""
import hashlib
import unicodedata
from django.db import transaction
from rest_framework.exceptions import ValidationError
from .generation import point_id, text
from .locking import course_lock
from .models import Exercise, KnowledgePoint, LearningItem, stable_id
from .skills import skill_states


def item_fields(data):
    if not isinstance(data, dict):
        raise ValidationError('词与表达需要对象格式')
    if data.get('kind') not in ('word', 'chunk', 'frame'):
        raise ValidationError('请选择单词、搭配或句子框架')
    return {'kind': data['kind'], **{k: text(data.get(k), limit) for k, limit in [('text', 200), ('meaning', 500), ('example', 1000), ('usage', 1000)]}}


def save_item(course, data, item=None):
    fields = item_fields(data)
    with course_lock(course.pk), transaction.atomic():
        if item:
            # Editing a card preserves both its identity and historical learning evidence.
            changed = any(getattr(item, key) != value for key, value in fields.items())
            semantic_change = any(getattr(item, key) != fields[key] for key in ('kind', 'text', 'meaning'))
            if semantic_change:
                name = f"表达：{fields['text']}"[:160]
                item.knowledge, _ = KnowledgePoint.objects.get_or_create(id=point_id(course.pk, name), defaults={'course': course, 'name': name})
            for key, value in fields.items():
                setattr(item, key, value)
            if changed:
                item.revision += 1
            item.save(update_fields=[*fields, 'revision', 'knowledge'])
            return item
        source = None
        name = f"表达：{fields['text']}"[:160]
        if data.get('source_exercise_id'):
            source = Exercise.objects.filter(pk=data['source_exercise_id'], course=course).first()
            if not source:
                raise ValidationError('表达来源不属于当前课程')
            match = next((v for v in source.teaching.get('expressions', []) if all(v.get(k) == val for k, val in fields.items())), None)
            if not match:
                raise ValidationError('收藏内容与来源建议不一致；修改后的表达请手动添加')
            name = match['knowledge_name']
        pid = point_id(course.pk, name)
        knowledge, _ = KnowledgePoint.objects.get_or_create(id=pid, defaults={'course': course, 'name': name})
        identity = unicodedata.normalize('NFKC', f"{fields['kind']}:{fields['text']}:{fields['meaning']}").strip().casefold()
        iid = hashlib.sha256(f'{course.pk}:{identity}'.encode()).hexdigest()
        matching = LearningItem.objects.filter(course=course, kind=fields['kind'], text__iexact=fields['text'], meaning__iexact=fields['meaning']).first()
        if matching:
            return matching
        occupied = LearningItem.objects.filter(pk=iid).first()
        if occupied:
            # The original card may have been edited. Recollecting its old content
            # must not return the edited card or overwrite it.
            iid = stable_id()
        result, _ = LearningItem.objects.get_or_create(id=iid, defaults={'course': course, 'knowledge': knowledge, 'source_exercise': source, **fields})
        return result


def items_data(course, states=None):
    items = list(LearningItem.objects.filter(course=course).order_by('-created_at', 'id'))
    by_id = {p['id']: p for p in skill_states(course, items=items)}
    return [{**{k: getattr(item, k) for k in ('id', 'kind', 'text', 'meaning', 'example', 'usage', 'revision', 'created_at')},
             'knowledge_id': item.knowledge_id, 'source_exercise_id': item.source_exercise_id,
             'recognition': by_id[item.id]['recognition'], 'expression': by_id[item.id]['expression']}
            for item in items]
