from datetime import timedelta
from django.utils import timezone
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from .models import Chapter, Entity, Fact, Job, Message, Outline, Project, Revision, Review, Rule, Run, Thread, Relation
from .chapters import StaleDraft, save_revision
from .memory import fingerprint
from .generation import KINDS
from .serializers import EntitySerializer, OutlineSerializer, ThreadSerializer, RelationSerializer
from .validation import text
from . import worker


def mark_affected(project):
    for chapter in Chapter.objects.filter(project=project, is_valid=True).exclude(adopted_id=''):
        chapter.needs_review = True
        chapter.save(update_fields=['needs_review', 'updated_at'])


def queue(project, data):
    key = text(data.get('request_key', ''), 64)
    if len(key) < 8:
        raise ValidationError('请求必须携带稳定的 requestKey')
    kind = data.get('kind')
    if kind not in KINDS:
        raise ValidationError('生成类型无效')
    cid = data.get('chapter_id')
    chapter = get_object_or_404(Chapter, pk=cid, project=project, is_valid=True) if cid else None
    if kind in ('generate', 'rewrite', 'continue', 'polish', 'scene', 'story', 'review') and chapter is None:
        raise ValidationError('请选择章节')
    payload = {'instruction': text(data.get('instruction', ''), 10000)}
    if kind == 'rewrite':
        payload.update(start=data.get('start'), end=data.get('end'))
    base = data.get('base_revision_id', '')
    if chapter and base != chapter.draft_id:
        raise StaleDraft('正文已变化，请先保存并刷新')
    previous = Run.objects.filter(project=project, request_key=key).first()
    if previous:
        if previous.kind != kind or previous.input != payload or previous.chapter_id != cid or previous.base_revision_id != base:
            raise StaleDraft('相同请求标识不能用于不同内容')
        return previous
    if Run.objects.filter(project=project, status__in=['pending', 'running'], job__cancelled=False).exists():
        raise ValidationError('本书已有任务运行，请等待完成或取消')
    run = Run.objects.create(project=project, chapter=chapter, request_key=key, kind=kind, input=payload,
                             base_revision_id=base, context_hash=fingerprint(project, chapter.position if chapter else None))
    Job.objects.create(run=run, lease_until=timezone.now() + timedelta(minutes=6))
    if kind in ('chat', 'blueprint') and payload['instruction']:
        Message.objects.create(project=project, role='user', content=payload['instruction'])
    transaction.on_commit(lambda: worker.dispatch(run.pk))
    return run


def use_candidate(chapter, run):
    if run.chapter_id != chapter.pk or run.status != 'completed' or run.kind not in ('generate', 'rewrite', 'continue', 'polish', 'scene', 'story'):
        raise ValidationError('任务不是本章可使用的正文候选')
    if chapter.draft_id != run.base_revision_id:
        raise StaleDraft('生成期间正文已变化，请对比后手动合并')
    if run.context_hash != fingerprint(chapter.project, chapter.position):
        raise StaleDraft('生成期间前文或设定已变化，请复核候选后手动保存')
    content = run.result.get('text', '')
    current = Revision.objects.filter(pk=chapter.draft_id, chapter=chapter).first()
    old = current.content if current else ''
    if run.kind == 'rewrite':
        start, end = run.input['start'], run.input['end']
        content = old[:start] + content + old[end:]
    elif run.kind == 'continue':
        content = old + content
    return save_revision(chapter, content, run.base_revision_id, source=run.kind)


def apply_blueprint(project, run):
    if run.project_id != project.pk or run.kind != 'blueprint' or run.status != 'completed':
        raise ValidationError('蓝图提案无效')
    proposal = run.result.get('proposal', {})
    if run.context_hash != fingerprint(project):
        raise StaleDraft('讨论后设定已变化，请先重新生成蓝图')
    project.setup = proposal.get('setup', {})
    project.blueprint = text(proposal.get('blueprint', ''))
    project.style = text(proposal.get('style', ''), 20000)
    project.confirmed = True
    project.save()
    for key, serializer_type, model in [('entities', EntitySerializer, Entity), ('outlines', OutlineSerializer, Outline), ('threads', ThreadSerializer, Thread)]:
        entries = proposal.get(key, [])
        if not isinstance(entries, list) or len(entries) > 100:
            raise ValidationError('蓝图候选数量无效')
        for entry in entries:
            # Existing author-approved records remain editable individually; a new
            # blueprint cannot silently overwrite them or their stable identities.
            if not isinstance(entry, dict):
                raise ValidationError('蓝图候选格式无效')
            name_field = 'name' if key == 'entities' else 'title'
            if (find_entity(project, entry.get('name')) if key == 'entities' else model.objects.filter(project=project, **{name_field: entry.get(name_field)}).exists()):
                continue
            serializer = serializer_type(data=entry, context={'project': project})
            serializer.is_valid(raise_exception=True)
            serializer.save(project=project)
    relations = proposal.get('relations', [])
    if not isinstance(relations, list) or len(relations) > 200:
        raise ValidationError('关系候选数量无效')
    for item in relations:
        if not isinstance(item, dict):
            raise ValidationError('关系候选格式无效')
        source = find_entity(project, item.get('source_name'))
        target = find_entity(project, item.get('target_name'))
        if not source or not target:
            raise ValidationError('关系候选引用了未定义实体')
        serializer = RelationSerializer(data={'source_id': source.pk, 'target_id': target.pk, 'description': item.get('description'), 'secret': item.get('secret', False)}, context={'project': project})
        serializer.is_valid(raise_exception=True)
        if not Relation.objects.filter(project=project, source_id=source.pk, target_id=target.pk, description=item.get('description')).exists():
            serializer.save(project=project)
    mark_affected(project)


def find_entity(project, name):
    exact = Entity.objects.filter(project=project, name=name).first()
    if exact:
        return exact
    matches = [e for e in Entity.objects.filter(project=project) if name in e.aliases]
    if len(matches) > 1:
        raise ValidationError('人物别名存在歧义，请先确定关联人物')
    return matches[0] if matches else None


def entity_references(entity):
    project, eid = entity.project, entity.pk
    names = [entity.name, *entity.aliases]
    for rev in Revision.objects.filter(chapter__project=project).iterator():
        if eid in rev.entity_ids or any(n and n in rev.content for n in names):
            return True
    for fact in Fact.objects.filter(project=project).iterator():
        if eid in (fact.data.get('entity_id'), fact.data.get('target_id'), fact.data.get('holder_id')):
            return True
    return False


def delete_thread(thread):
    if any(f.data.get('thread_id') == thread.pk for f in Fact.objects.filter(project=thread.project).iterator()):
        raise ValidationError('线索已有正文证据，请标为放弃或开放结局')
    reviews = Review.objects.filter(revision__chapter__project=thread.project)
    if any(change.get('thread_id') == thread.pk for review in reviews.iterator() for change in review.changes):
        raise ValidationError('线索已被历史审查引用，请标为放弃或开放结局')
    thread.delete()


def delete_entity(entity):
    if entity_references(entity):
        raise ValidationError('该人物已被正文版本或故事记录引用，请改为隐藏或退场')
    for model in (Outline, Thread, Chapter):
        if any(entity.pk in row.entity_ids for row in model.objects.filter(project=entity.project)):
            raise ValidationError('请先处理大纲、章节和伏笔中的人物关联')
    if Relation.objects.filter(project=entity.project, source_id=entity.pk).exists() or Relation.objects.filter(project=entity.project, target_id=entity.pk).exists():
        raise ValidationError('请先处理人物关系引用')
    if any(entity.pk in r.scope_entity_ids for r in Rule.objects.filter(project=entity.project)):
        raise ValidationError('请先处理本书规则中的人物引用')
    entity.delete()
