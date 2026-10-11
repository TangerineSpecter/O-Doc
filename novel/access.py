from django.db.models import Q, Exists, OuterRef
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotAuthenticated
from utils.drf_utils import get_current_user_identifier
from .models import Project, Chapter


def visible_anthologies(queryset, request):
    published = Chapter.objects.filter(project_id=OuterRef('pk'), is_valid=True).exclude(published_id='')
    owner = get_current_user_identifier(request) if request.user.is_authenticated else None
    return queryset.annotate(novel_has_publication=Exists(published)).filter(
        ~Q(type='novel') | Q(user_id=owner) | Q(novel_has_publication=True)
    )


def owned_project(request, coll_id):
    if not request.user.is_authenticated:
        raise NotAuthenticated()
    return get_object_or_404(Project.objects.select_related('anthology'), pk=coll_id,
        anthology__type='novel', anthology__is_valid=True,
        anthology__user_id=get_current_user_identifier(request))


def readable_project(request, coll_id):
    qs = Project.objects.select_related('anthology').filter(anthology__type='novel', anthology__is_valid=True)
    owner = get_current_user_identifier(request) if request.user.is_authenticated else None
    return get_object_or_404(qs.filter(Q(anthology__user_id=owner) | Q(anthology__permission='public')), pk=coll_id)

