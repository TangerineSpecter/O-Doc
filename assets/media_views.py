"""Legacy media serving; imported HTML archives must use authorized API routes."""
from pathlib import Path, PurePosixPath

from django.conf import settings
from django.http import Http404
from django.db.models import Q
from django.views.static import serve
from rest_framework.decorators import api_view

from assets.models import Asset
from utils.resource_assets import is_asset_used_by_diary, is_asset_used_by_image
from assets.views import can_read_asset, can_read_asset_via_article


@api_view(['GET'])
def serve_legacy_media(request, path):
    relative = PurePosixPath(path.replace('\\', '/'))
    parts = relative.parts
    root = Path(settings.MEDIA_ROOT).resolve()
    target = (root / str(relative)).resolve()
    if relative.is_absolute() or '..' in parts or root not in target.parents:
        raise Http404
    # Resolve aliases (including symlinks) before both authorization and serving.
    path = target.relative_to(root).as_posix()
    parts = PurePosixPath(path).parts
    if 'html_notes' in parts:
        raise Http404
    # Private research files always go through the authenticated resource API.
    if Asset.objects.filter(file_path=path).filter(Q(source_type='quant') | Q(quant_references__isnull=False) | Q(mt4_references__isnull=False)).exists():
        raise Http404
    diary_assets = [asset for asset in Asset.objects.filter(file_path=path) if (
        asset.source_type == 'diary'
        or (is_asset_used_by_diary(asset.pk, include_deleted=True) and not is_asset_used_by_image(asset.pk))
    )]
    if diary_assets and not any(asset.is_valid and can_read_asset_via_article(request, asset) for asset in diary_assets):
        raise Http404
    related = Asset.objects.filter(file_path=path).filter(
        Q(article_references__article__content_format='html')
        | Q(article_references__article__enforce_note_privacy=True)
    ).distinct()
    if related.exists():
        if any(a.article_references.filter(role__in=['source', 'preview']).exists() for a in related):
            raise Http404
        if not any(a.is_valid and can_read_asset(request, a) for a in related):
            raise Http404
    return serve(request, path, document_root=settings.MEDIA_ROOT)
