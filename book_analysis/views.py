from django.http import Http404
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from anthology.views import get_owned_anthology_queryset
from utils.error_codes import ErrorCode
from utils.response_utils import error_result, success_result, valid_result

from .access import get_book, published, readable_revision
from .errors import AnalysisError
from .graph import node_detail, read_graph
from .inspection import current_hash, inspect_book
from .execution import event_data, execution_data
from .models import AnalysisRun, BookAnalysis, Chapter, ChapterResult, Revision, SourceCache
from .serializers import GraphInput


class AnalysisView(APIView):
    permission_classes = [AllowAny]

    def handle_exception(self, exc):
        if isinstance(exc, AnalysisError):
            return valid_result(msg=str(exc), status=exc.status)
        if isinstance(exc, Http404):
            return error_result(ErrorCode.RESOURCE_NOT_FOUND, status=404)
        if isinstance(exc, ValidationError):
            return valid_result(msg='请求参数无效', data=exc.detail, status=400)
        return super().handle_exception(exc)


def run_data(run):
    if not run:
        return None
    return {'id': run.pk, 'state': run.state, 'stage': run.stage, 'error': run.error, 'total': len(run.chapter_ids), 'completed': len(run.completed_ids), 'cancel_requested': run.cancel_requested, 'index_state': run.index_state, 'kind': run.kind, **execution_data(run)}


class StatusView(AnalysisView):
    def get(self, request, book_id):
        book = get_book(request, book_id)
        analysis = BookAnalysis.objects.filter(book=book).first()
        stale = bool(analysis and analysis.source_hash != current_hash(book))
        revision = None
        try:
            revision = readable_revision(book, request.query_params.get('revisionId', request.query_params.get('revision_id', '')))
        except AnalysisError:
            stale = bool(analysis and analysis.published_revision)
        if revision:
            stale = not analysis or revision.source_hash != current_hash(book) or revision.settings_version != analysis.settings_version or revision.mode != analysis.mode
        history = bool(revision and (not analysis or revision.pk != analysis.published_revision))
        versions = list(Revision.objects.filter(book=book, state__in=['partial', 'complete']).order_by('-created_at').values('id', 'mode', 'created_at', 'overview')[:50])
        versions = [{'id': item['id'], 'mode': item['mode'], 'created_at': item['created_at'], 'complete': item['overview'].get('complete', False)} for item in versions]
        return success_result({'book': {'book_id': book.pk, 'title': book.title, 'author': book.author, 'format': book.book_format, 'coll_id': book.anthology.coll_id, 'cover_url': f'/api/anthology/book/{book.pk}/cover', 'local_state': book.local_state}, 'history': history, 'versions': versions, 'can_manage': not history and request.user.is_authenticated and get_owned_anthology_queryset(request).filter(pk=book.anthology_id).exists(), 'mode': revision.mode if revision else analysis.mode if analysis else 'knowledge', 'inspection': analysis.inspection if analysis else {}, 'stale': stale, 'revision_id': revision.pk if revision else '', 'overview': revision.overview if revision else {}, 'run': run_data(AnalysisRun.objects.filter(book=book).order_by('-created_at').first())})


class ExecutionEventsView(AnalysisView):
    def get(self, request, book_id, run_id):
        from django.shortcuts import get_object_or_404
        book = get_book(request, book_id)
        run = get_object_or_404(AnalysisRun, pk=run_id, book=book)
        before = request.query_params.get('before', '')
        if before and (not before.isascii() or not before.isdecimal() or len(before) > 18):
            raise AnalysisError('执行记录游标无效')
        rows = run.events.all()
        if before:
            rows = rows.filter(id__lt=int(before))
        events = list(rows.order_by('-id')[:80])
        events.reverse()
        return success_result({'items': [event_data(e) for e in events], 'has_more': bool(events and rows.filter(id__lt=events[0].pk).exists())})


class InspectView(AnalysisView):
    def post(self, request, book_id):
        book = get_book(request, book_id, owner=True)
        if AnalysisRun.objects.filter(book=book, state__in=['queued', 'running']).exists():
            raise AnalysisError('请先停止当前任务，再重新检测', 409)
        return success_result(inspect_book(book).inspection)


class ChaptersView(AnalysisView):
    def get(self, request, book_id):
        book = get_book(request, book_id)
        query = GraphInput(data=request.query_params)
        query.is_valid(raise_exception=True)
        page, limit = query.validated_data['page'], min(query.validated_data['limit'], 50)
        rows = Chapter.objects.filter(book=book, source_hash=current_hash(book), is_valid=True)
        try:
            revision = readable_revision(book, query.validated_data['revision_id'])
            complete = set(ChapterResult.objects.filter(revision=revision).values_list('chapter_id', flat=True))
            if query.validated_data['revision_id']:
                rows = Chapter.objects.filter(book=book, pk__in=complete).order_by('ordinal')
        except AnalysisError:
            complete = set()
        return success_result({'total': rows.count(), 'page': page, 'limit': limit, 'items': [{'id': ch.pk, 'ordinal': ch.ordinal, 'title': ch.title, 'char_count': ch.char_count, 'locator': ch.locator, 'analyzed': ch.pk in complete} for ch in rows[(page - 1) * limit:page * limit]]})


class ChapterView(AnalysisView):
    def get(self, request, book_id, chapter_id):
        from django.shortcuts import get_object_or_404
        book = get_book(request, book_id)
        requested = request.query_params.get('revisionId', request.query_params.get('revision_id', ''))
        rows = Chapter.objects.filter(book=book)
        if not requested:
            rows = rows.filter(source_hash=current_hash(book), is_valid=True)
        chapter = get_object_or_404(rows, pk=chapter_id)
        try:
            revision = readable_revision(book, requested)
            result = ChapterResult.objects.filter(revision=revision, chapter=chapter).first()
            if requested and not result:
                raise Http404
        except AnalysisError:
            result = None
        cache = SourceCache.objects.filter(chapter=chapter).first()
        return success_result({'id': chapter.pk, 'title': chapter.title, 'ordinal': chapter.ordinal, 'char_count': chapter.char_count, 'locator': chapter.locator, 'digest': result.digest if result else None, 'source_preview': cache.text[:5000] if cache else '', 'source_available': bool(cache)})


class GraphView(AnalysisView):
    def get(self, request, book_id):
        book = get_book(request, book_id)
        serializer = GraphInput(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        options = serializer.validated_data
        revision = readable_revision(book, options.pop('revision_id'))
        if options['chapter_id'] and not Chapter.objects.filter(pk=options['chapter_id'], book=book).exists():
            raise AnalysisError('章节不属于本书', 404)
        return success_result(read_graph(revision, **options))


class NodeView(AnalysisView):
    def get(self, request, book_id, node_id):
        book = get_book(request, book_id)
        serializer = GraphInput(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return success_result(node_detail(readable_revision(book, serializer.validated_data['revision_id']), node_id, serializer.validated_data['page']))
