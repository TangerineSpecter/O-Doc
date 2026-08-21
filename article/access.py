from django.db.models import Q

from anthology.models import Anthology
from article.models import Article
from utils.drf_utils import get_current_user_identifier


def get_visible_anthology_queryset(request):
    queryset = Anthology.objects.filter(is_valid=True)
    if request.user and request.user.is_authenticated:
        current_user_id = get_current_user_identifier(request)
        return queryset.filter(Q(permission='public') | Q(user_id=current_user_id))
    return queryset.filter(permission='public')


def can_access_anthology(request, coll_id, coll_type=None):
    queryset = get_visible_anthology_queryset(request).filter(coll_id=coll_id)
    if coll_type:
        queryset = queryset.filter(type=coll_type)
    return queryset.exists()


def can_manage_anthology(request, coll_id, coll_type=None):
    queryset = Anthology.objects.filter(
        coll_id=coll_id,
        user_id=get_current_user_identifier(request),
        is_valid=True,
    )
    if coll_type:
        queryset = queryset.filter(type=coll_type)
    return queryset.exists()


def get_visible_article_queryset(request):
    visible_coll_ids = get_visible_anthology_queryset(request).values_list('coll_id', flat=True)
    return Article.objects.filter(is_valid=True, coll_id__in=visible_coll_ids)
