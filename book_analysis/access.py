from django.shortcuts import get_object_or_404

from anthology.models import Book
from anthology.views import get_owned_anthology_queryset, get_visible_anthology_queryset

from .errors import AnalysisError
from .inspection import current_hash
from .models import BookAnalysis, Revision


def get_book(request, book_id: str, owner: bool = False):
    if owner and not request.user.is_authenticated:
        raise AnalysisError('请先登录', 401)
    collections = get_owned_anthology_queryset(request) if owner else get_visible_anthology_queryset(request)
    return get_object_or_404(Book.objects.select_related('asset', 'anthology'), pk=book_id, is_valid=True, anthology__in=collections)


def published(book):
    analysis = BookAnalysis.objects.filter(book=book).first()
    if not analysis or not analysis.published_revision:
        raise AnalysisError('尚无已发布的分析结果，请先开始分析', 409)
    revision = Revision.objects.filter(pk=analysis.published_revision, book=book).first()
    if not revision or revision.source_hash != current_hash(book) or revision.settings_version != analysis.settings_version or revision.mode != analysis.mode:
        raise AnalysisError('图书正文或分析设置已变化，请重新分析', 409)
    return revision


def readable_revision(book, revision_id=''):
    if not revision_id:
        return published(book)
    revision = get_object_or_404(Revision, pk=revision_id, book=book)
    analysis = BookAnalysis.objects.filter(book=book).first()
    if revision.state not in ('partial', 'complete') and (not analysis or analysis.published_revision != revision.pk):
        raise AnalysisError('该分析版本尚未发布', 404)
    return revision
