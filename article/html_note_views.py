import base64

from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from anthology.models import Anthology
from article.access import get_visible_article_queryset
from article.html_note_service import media_path
from article.html_note_resources import deletion_summary
from article.html_note_locking import lock_html_owner
from article.models import Article, ArticleAsset
from article.serializers import ArticleSerializer
from utils.drf_utils import get_current_user_identifier
from utils.error_codes import ErrorCode
from utils.response_utils import error_result, success_result

PREVIEW_CSP = "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none';"


class HtmlPreviewView(APIView):
    def get(self, request, article_id):
        article = get_object_or_404(get_visible_article_queryset(request), pk=article_id, content_format='html')
        reference = get_object_or_404(ArticleAsset, article=article, role='preview', asset__is_valid=True)
        try:
            html = media_path(reference.asset.file_path).read_text(encoding='utf-8')
            # Inline authorized materials: sandbox documents cannot send the app's Token header.
            for ref in article.asset_references.filter(role='material', asset__is_valid=True).select_related('asset'):
                asset = ref.asset
                data = base64.b64encode(media_path(asset.file_path).read_bytes()).decode('ascii')
                html = html.replace(f'/api/resource/view/{asset.id}', f'data:{asset.mime_type};base64,{data}')
        except (OSError, ValueError):
            return error_result(ErrorCode.RESOURCE_NOT_FOUND, 'HTML 笔记素材缺失', status=404)
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        if not soup.head:
            head = soup.new_tag('head')
            (soup.html or soup).insert(0, head)
        meta = soup.new_tag('meta')
        meta['http-equiv'] = 'Content-Security-Policy'
        meta['content'] = PREVIEW_CSP
        soup.head.insert(0, meta)
        response = HttpResponse(str(soup), content_type='text/html; charset=utf-8')
        response['Content-Security-Policy'] = PREVIEW_CSP + ' sandbox;'
        response['Cache-Control'] = 'no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response


class HtmlConversionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, article_id):
        owner = get_current_user_identifier(request)
        source = get_object_or_404(Article, pk=article_id, author=owner, is_valid=True, content_format='html')
        with transaction.atomic():
            lock_html_owner(owner)
            collection = get_object_or_404(Anthology.objects.select_for_update(), coll_id=source.coll_id, user_id=owner, is_valid=True, type='article')
            source.refresh_from_db()
            if not source.is_valid:
                return error_result(ErrorCode.RESOURCE_NOT_FOUND, status=404)
            if not source.content.strip():
                return error_result(ErrorCode.PARAM_ERROR, '没有可转换的文字正文', status=400)
            title = source.title[:225] + '（可编辑副本）'
            base = title
            i = 1
            while Article.objects.filter(author=owner, coll_id=source.coll_id, title=title).exists():
                i += 1
                title = f'{base} ({i})'
            copy = Article.objects.create(title=title, content=source.content, coll_id=source.coll_id, author=owner, category=source.category, parent=source.parent, permission=source.permission, enforce_note_privacy=True)
            copy.tags.set(source.tags.all())
            from utils.resource_assets import extract_resource_ids_from_content
            content_assets = extract_resource_ids_from_content(source.content)
            from assets.models import Asset
            list(Asset.objects.select_for_update().filter(pk__in=content_assets).order_by('pk'))
            for ref in source.asset_references.filter(role='material', asset_id__in=content_assets):
                ArticleAsset.objects.create(article=copy, asset=ref.asset, role='material')
            collection.count = Article.objects.filter(coll_id=source.coll_id, is_valid=True).count()
            collection.save(update_fields=['count', 'updated_at'])
        return success_result(ArticleSerializer(copy, context={'request': request}).data)


class HtmlDeletionSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, article_id):
        article = get_object_or_404(Article, pk=article_id, author=get_current_user_identifier(request), is_valid=True, content_format='html')
        return success_result(deletion_summary(article))
