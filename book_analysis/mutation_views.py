import uuid

from django.db import transaction
from django.shortcuts import get_object_or_404

from utils.ai_service import AIService
from utils.response_utils import success_result

from .access import get_book, published
from .errors import AnalysisError
from .graph import correct_edge, correct_node
from .inspection import current_hash, edit_boundary
from .jobs import cancel_run, create_run, retry_run
from .models import AnalysisRun, BookAnalysis, Chapter
from .serializers import BoundaryInput, RunInput
from .views import AnalysisView, run_data


class RunView(AnalysisView):
    def post(self, request, book_id):
        book = get_book(request, book_id, owner=True)
        serializer = RunInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not BookAnalysis.objects.filter(book=book).exists():
            raise AnalysisError('请先检测图书正文', 409)
        if serializer.validated_data['kind'] == 'analyze':
            try:
                AIService.get_default_client_config()
            except Exception as exc:
                raise AnalysisError('请先在系统设置配置默认对话模型') from exc
        return success_result(run_data(create_run(book, **serializer.validated_data)))


class RunActionView(AnalysisView):
    def post(self, request, book_id, run_id, action):
        book = get_book(request, book_id, owner=True)
        run = get_object_or_404(AnalysisRun, pk=run_id, book=book)
        if action == 'cancel':
            cancel_run(run)
            run.refresh_from_db()
        elif action == 'retry':
            run = retry_run(run)
        else:
            raise AnalysisError('不支持的任务操作')
        return success_result(run_data(run))


class BoundaryView(AnalysisView):
    @transaction.atomic
    def patch(self, request, book_id, chapter_id):
        book = get_book(request, book_id, owner=True)
        if AnalysisRun.objects.filter(book=book, state__in=['queued', 'running']).exists():
            raise AnalysisError('请先停止分析，再修正章节边界', 409)
        chapter = get_object_or_404(Chapter, pk=chapter_id, book=book, source_hash=current_hash(book), is_valid=True)
        serializer = BoundaryInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        edit_boundary(book, chapter, **serializer.validated_data)
        return success_result(msg='章节已修正')


class NodeMutationView(AnalysisView):
    def patch(self, request, book_id, node_id):
        book = get_book(request, book_id, owner=True)
        correct_node(published(book), node_id, dict(request.data))
        return success_result(msg='节点修正已保存，重新分析会保留')


class RelationView(AnalysisView):
    def post(self, request, book_id):
        book = get_book(request, book_id, owner=True)
        key = correct_edge(published(book), uuid.uuid4().hex, dict(request.data), new=True)
        return success_result({'id': key})


class RelationMutationView(AnalysisView):
    def patch(self, request, book_id, relation_id):
        book = get_book(request, book_id, owner=True)
        correct_edge(published(book), relation_id, dict(request.data))
        return success_result(msg='关系修正已保存')

    def delete(self, request, book_id, relation_id):
        book = get_book(request, book_id, owner=True)
        correct_edge(published(book), relation_id, {'hidden': True})
        return success_result(msg='关系已移除')

class ProfileMutationView(AnalysisView):
    @transaction.atomic
    def post(self, request, book_id, node_id):
        from .models import Correction, GraphNode
        from .parsers import stable_id
        from .serializers import ProfileCorrectionInput
        book = get_book(request, book_id, owner=True)
        revision = published(book)
        node = get_object_or_404(GraphNode, revision=revision, canonical_id=node_id)
        serializer = ProfileCorrectionInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        value = dict(serializer.validated_data)
        row, _ = Correction.objects.get_or_create(id=stable_id(book.pk, 'profile', node_id), defaults={'book': book, 'kind': 'profile', 'key': node_id, 'introduced_ordinal': max(Chapter.objects.filter(chapterresult__revision=revision).values_list('ordinal', flat=True), default=0)})
        attributes = [item for item in row.patch.get('attributes', []) if item.get('attribute') != value['attribute'] or item.get('time_label', '') != value['time_label']]
        row.patch = {**row.patch, 'attributes': [*attributes, value]}
        row.save()
        return success_result(msg='人物画像修正已保存')
