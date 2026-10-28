from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from anthology.models import Anthology
from system_settings.models import AIModel
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result
from .access import owned_project, published_chapters, readable_project
from .models import Chapter, Entity, Job, Outline, Project, Revision, Rule, Run, Thread, Relation
from .locking import project_lock
from .memory import state_at, invalidate_later
from .chapters import adopt, publish, revision_for, save_revision
from .presentation import snapshot, chapter_data, revision_data, run_data
from .serializers import ChapterSerializer, EntitySerializer, OutlineSerializer, RuleSerializer, ThreadSerializer, RelationSerializer
from .services import queue, use_candidate, apply_blueprint, delete_entity, delete_thread, mark_affected
from .validation import text
from . import worker


class NovelView(APIView):
    permission_classes = [IsAuthenticated]

    def handle_exception(self, exc):
        response = super().handle_exception(exc)
        if isinstance(exc, ValidationError):
            response.status_code = exc.status_code
            if isinstance(response.data, dict) and 'code' in response.data:
                response.data['code'] = exc.status_code
        if isinstance(response.data, dict) and 'code' not in response.data:
            response.data = {'code': response.status_code, 'msg': str(response.data.get('detail', response.data)), 'data': None}
        elif isinstance(response.data, list):
            response.data = {'code': response.status_code, 'msg': '；'.join(map(str, response.data)), 'data': None}
        return response


class ProjectView(NovelView):
    def get(self, request, coll_id):
        project = owned_project(request, coll_id)
        with project_lock(coll_id), transaction.atomic():
            for run in Run.objects.filter(project=project, status__in=['pending', 'running']):
                worker.recover(run)
            return success_result(snapshot(project))

    def patch(self, request, coll_id):
        project = owned_project(request, coll_id)
        with project_lock(coll_id), transaction.atomic():
            project.refresh_from_db()
            data = request.data
            changed = False
            for field in ('direction', 'style', 'blueprint'):
                if field in data:
                    setattr(project, field, text(data[field], 30000))
                    changed = field != 'direction' or changed
            if 'setup' in data:
                if not isinstance(data['setup'], dict) or len(str(data['setup'])) > 30000:
                    raise ValidationError('筹备资料格式无效')
                project.setup = data['setup']
                changed = True
            if 'confirmed' in data:
                if type(data['confirmed']) is not bool:
                    raise ValidationError('确认状态无效')
                project.confirmed = data['confirmed']
            for field in ('writer_model_id', 'editor_model_id'):
                if field in data:
                    mid = text(data[field], 40)
                    if mid and not AIModel.objects.filter(pk=mid, type='chat').exists():
                        raise ValidationError('请选择已配置的对话模型')
                    setattr(project, field, mid)
            if 'title' in data:
                title = text(data['title'], 100).strip()
                if not title or Anthology.objects.filter(user_id=project.anthology.user_id, type='novel', title=title).exclude(pk=coll_id).exists():
                    raise ValidationError('书名不能为空或与已有小说重复')
                project.anthology.title = title
                from django.db import IntegrityError
                try:
                    project.anthology.save(update_fields=['title', 'updated_at'])
                except IntegrityError as exc:
                    raise ValidationError('书名与已有小说重复') from exc
            project.save()
            if changed:
                mark_affected(project)
            return success_result(snapshot(project))


class ModelsView(NovelView):
    def get(self, request):
        return success_result(list(AIModel.objects.filter(type='chat').values('id', 'name', 'display_name')))


class ResourceView(NovelView):
    registry = {'entities': (Entity, EntitySerializer), 'outlines': (Outline, OutlineSerializer), 'threads': (Thread, ThreadSerializer), 'rules': (Rule, RuleSerializer), 'relations': (Relation, RelationSerializer)}

    def post(self, request, coll_id, resource, record_id=None):
        project = owned_project(request, coll_id)
        with project_lock(coll_id), transaction.atomic():
            model, serializer_type = self.registry[resource]
            instance = get_object_or_404(model, project=project, pk=record_id) if record_id else None
            data = request.data.copy()
            if model == Rule and not instance:
                instance = Rule.objects.filter(project=project, kind=data.get('kind'), instruction=data.get('instruction'), example=data.get('example', ''),
                    scope=data.get('scope', '全书'), scope_entity_ids=data.get('scope_entity_ids', []), scope_chapter_ids=data.get('scope_chapter_ids', [])).first()
                if instance and 'enabled' not in data:
                    data['enabled'] = True
            serializer = serializer_type(instance, data=data, partial=instance is not None, context={'project': project})
            serializer.is_valid(raise_exception=True)
            serializer.save(project=project)
            # A rename affects retrieval labels but never changes existing prose.
            if model != Rule or request.data.get('strength') == 'forbid':
                mark_affected(project)
            return success_result(snapshot(project))

    def delete(self, request, coll_id, resource, record_id):
        project = owned_project(request, coll_id)
        with project_lock(coll_id), transaction.atomic():
            model, _ = self.registry[resource]
            instance = get_object_or_404(model, project=project, pk=record_id)
            if model == Entity:
                delete_entity(instance)
            elif model == Thread:
                delete_thread(instance)
            else:
                instance.delete()
            mark_affected(project)
            return success_result(snapshot(project))


class ChapterView(NovelView):
    def get(self, request, coll_id, chapter_id):
        project = owned_project(request, coll_id)
        return success_result(chapter_data(get_object_or_404(Chapter, project=project, pk=chapter_id, is_valid=True)))

    def post(self, request, coll_id, chapter_id=None):
        project = owned_project(request, coll_id)
        with project_lock(coll_id), transaction.atomic():
            chapter = get_object_or_404(Chapter, project=project, pk=chapter_id, is_valid=True) if chapter_id else None
            serializer = ChapterSerializer(chapter, data=request.data, partial=chapter is not None, context={'project': project})
            serializer.is_valid(raise_exception=True)
            old = (chapter.position, chapter.story_time, chapter.time_order, chapter.entity_ids) if chapter else None
            chapter = serializer.save(project=project)
            if old and old != (chapter.position, chapter.story_time, chapter.time_order, chapter.entity_ids) and chapter.adopted_id:
                mark_affected(project)
            if 'content' in request.data:
                save_revision(chapter, request.data['content'], request.data.get('base_revision_id', ''))
            return success_result(chapter_data(chapter))

    def delete(self, request, coll_id, chapter_id):
        project = owned_project(request, coll_id)
        with project_lock(coll_id), transaction.atomic():
            chapter = get_object_or_404(Chapter, project=project, pk=chapter_id)
            if chapter.published_id:
                raise ValidationError('请先撤回发布')
            chapter.is_valid = False
            chapter.save()
            invalidate_later(chapter)
            return success_result()


class ChapterActionView(NovelView):
    def post(self, request, coll_id, chapter_id, action):
        project = owned_project(request, coll_id)
        with project_lock(coll_id), transaction.atomic():
            chapter = get_object_or_404(Chapter, project=project, pk=chapter_id, is_valid=True)
            data = request.data
            if action == 'adopt':
                chapter = adopt(chapter, data.get('review_id'), data.get('confirmations', []), data.get('dismissals', {}))
                if not getattr(__import__('django.conf', fromlist=['settings']).settings, 'NOVEL_DISABLE_WORKERS', False):
                    transaction.on_commit(lambda: worker.executor.submit(worker.index_safely, chapter.adopted_id))
            elif action == 'publish':
                chapter = publish(chapter, data.get('revision_id'), data.get('audience', 'public'))
            elif action == 'unpublish':
                chapter.published_id = ''
                chapter.published_at = None
                chapter.save()
            elif action == 'restore':
                rev = get_object_or_404(Revision, pk=data.get('revision_id'), chapter=chapter)
                save_revision(chapter, rev.content, data.get('base_revision_id', ''), source='restore')
            elif action == 'candidate':
                use_candidate(chapter, get_object_or_404(Run, pk=data.get('run_id'), project=project))
            else:
                raise ValidationError('章节操作无效')
            return success_result(chapter_data(chapter))


class RunView(NovelView):
    def post(self, request, coll_id, run_id=None, action=None):
        project = owned_project(request, coll_id)
        with project_lock(coll_id), transaction.atomic():
            if not run_id:
                return success_result(run_data(queue(project, request.data)))
            run = get_object_or_404(Run, project=project, pk=run_id)
            worker.recover(run)
            if action == 'cancel' and run.status in ('pending', 'running'):
                Job.objects.filter(run=run).update(cancelled=True, stage='已取消')
                run.status = 'cancelled'
                run.save()
                transaction.on_commit(lambda: worker.interrupt(run.pk))
            elif action == 'retry' and run.status in ('failed', 'cancelled', 'interrupted'):
                # Explicit retries get a new execution key, preserving previous billing/result records.
                data = dict(run.input, kind=run.kind, chapter_id=run.chapter_id, base_revision_id=run.base_revision_id, request_key=request.data.get('request_key'))
                run = queue(project, data)
            elif action == 'blueprint':
                apply_blueprint(project, run)
                return success_result(snapshot(project))
            elif action != 'cancel':
                raise ValidationError('任务状态不支持此操作')
            return success_result(run_data(run))

    def get(self, request, coll_id, run_id):
        project = owned_project(request, coll_id)
        with project_lock(coll_id), transaction.atomic():
            return success_result(run_data(worker.recover(get_object_or_404(Run, project=project, pk=run_id))))


class RevisionView(NovelView):
    def get(self, request, coll_id, revision_id):
        project = owned_project(request, coll_id)
        return success_result(revision_data(get_object_or_404(Revision, pk=revision_id, chapter__project=project)))


class MemoryView(NovelView):
    def get(self, request, coll_id):
        project = owned_project(request, coll_id)
        value = request.query_params.get('through')
        if value is not None and not value.isdigit():
            raise ValidationError('章节进度无效')
        return success_result(state_at(project, through=int(value) if value else None))


class ReaderView(NovelView):
    permission_classes = [AllowAny]

    def get(self, request, coll_id, chapter_id=None):
        from django.http import Http404

        project = readable_project(request, coll_id)
        chapters = list(published_chapters(Chapter.objects.filter(project=project, is_valid=True)
                                           .only('id', 'project_id', 'position', 'created_at', 'published_id')))
        owner = request.user.is_authenticated and get_current_user_identifier(request) == project.anthology.user_id
        revision_ids = [chapter.published_id for chapter in chapters]
        revisions = {(revision.pk, revision.chapter_id): revision for revision in
                     Revision.objects.filter(pk__in=revision_ids).only('id', 'chapter_id', 'title', 'volume')}
        available = [(chapter, revisions[(chapter.published_id, chapter.pk)]) for chapter in chapters
                     if (chapter.published_id, chapter.pk) in revisions]
        if not owner and not available:
            raise Http404
        selected = next((item for item in available if item[0].pk == chapter_id), None) if chapter_id else next(iter(available), None)
        if chapter_id and selected is None:
            raise Http404

        def item(chapter, revision):
            return {'id': chapter.pk, 'title': revision.title, 'volume': revision.volume, 'position': chapter.position}

        selected_data = None
        if selected:
            chapter, revision = selected
            content = Revision.objects.filter(pk=revision.pk, chapter_id=chapter.pk).values_list('content', flat=True).first()
            if content is None:
                raise Http404
            selected_data = {**item(chapter, revision), 'content': content}
        response = success_result({'id': project.pk, 'title': project.anthology.title, 'synopsis': project.setup.get('public_synopsis', ''),
                               'can_manage': owner, 'chapters': [item(chapter, revision) for chapter, revision in available],
                               'chapter': selected_data})
        response['Cache-Control'] = 'private, no-store'
        return response


class ExportView(NovelView):
    def get(self, request, coll_id):
        project = owned_project(request, coll_id)
        choice = request.query_params.get('version', 'adopted')
        if choice not in ('draft', 'adopted', 'published'):
            raise ValidationError('导出版本无效')
        # `format` is reserved by DRF for renderer negotiation (json/html).
        format = request.query_params.get('file_type', 'md')
        if format not in ('md', 'txt'):
            raise ValidationError('导出格式无效')
        from .exporting import export_book
        content = export_book(project, choice, format)
        return success_result({'content': content, 'title': project.anthology.title})
