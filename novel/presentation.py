from django.forms.models import model_to_dict
from anthology.models import Anthology
from .models import Chapter, Entity, Message, Outline, Review, Rule, Run, Thread, Relation
from .serializers import ChapterSerializer, EntitySerializer, OutlineSerializer, RuleSerializer, ThreadSerializer, RelationSerializer
from .chapters import revision_for
from .memory import state_at


def anthology_description(anthology: Anthology, *, owner: bool) -> str:
    project = anthology.novel
    return project.direction if owner else project.setup.get('public_synopsis', '')


def revision_data(revision):
    return {'id': revision.pk, 'title': revision.title, 'volume': revision.volume, 'content': revision.content,
            'entity_ids': revision.entity_ids, 'source': revision.source, 'created_at': revision.created_at} if revision else None


def chapter_data(chapter):
    data = dict(ChapterSerializer(chapter).data)
    data['draft'] = revision_data(revision_for(chapter, chapter.draft_id))
    data['versions'] = [{'id': r.pk, 'created_at': r.created_at, 'source': r.source, 'title': r.title} for r in chapter.revisions.order_by('-created_at')]
    reviews = Review.objects.filter(revision_id=chapter.draft_id).order_by('-created_at')
    data['review'] = review_data(reviews.first())
    return data


def review_data(review):
    return model_to_dict(review, fields=['id', 'revision', 'summary', 'changes', 'issues', 'dismissed', 'confirmed_ids', 'context_hash']) if review else None


def run_data(run):
    job = getattr(run, 'job', None)
    return {'id': run.pk, 'chapter_id': run.chapter_id, 'kind': run.kind, 'status': run.status, 'result': run.result,
            'base_revision_id': run.base_revision_id, 'preview': job.preview if job else '', 'stage': job.stage if job else '',
            'error': run.error, 'model_name': run.model_name, 'created_at': run.created_at}


def snapshot(project):
    return {'id': project.pk, 'title': project.anthology.title, 'permission': project.anthology.permission,
            'direction': project.direction, 'setup': project.setup, 'blueprint': project.blueprint, 'style': project.style,
            'confirmed': project.confirmed, 'writer_model_id': project.writer_model_id, 'editor_model_id': project.editor_model_id,
            'entities': EntitySerializer(Entity.objects.filter(project=project).order_by('created_at'), many=True).data,
            'outlines': OutlineSerializer(Outline.objects.filter(project=project).order_by('position'), many=True).data,
            'relations': RelationSerializer(Relation.objects.filter(project=project), many=True).data,
            'threads': ThreadSerializer(Thread.objects.filter(project=project), many=True).data,
            'rules': RuleSerializer(Rule.objects.filter(project=project), many=True).data,
            'chapters': ChapterSerializer(Chapter.objects.filter(project=project, is_valid=True), many=True).data,
            'messages': list(Message.objects.filter(project=project).order_by('created_at').values('id', 'role', 'content')),
            'runs': [run_data(r) for r in Run.objects.filter(project=project).order_by('-created_at')[:30]],
            'memory': state_at(project)}
