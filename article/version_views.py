from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from article.access import can_manage_anthology
from article.models import Article, ArticleVersion
from article.serializers import ArticleSerializer
from article.version_serializers import ArticleVersionDetailSerializer, ArticleVersionSummarySerializer
from article.version_service import create_article_version, has_versionable_changes
from categories.models import Category
from tags.models import Tag
from utils.drf_utils import get_current_user_identifier
from utils.error_codes import ErrorCode
from utils.resource_assets import sync_article_content_assets
from utils.response_utils import error_result, success_result, valid_result

def get_owned_markdown_article(request, article_id, *, lock=False):
    queryset = Article.objects.filter(
        article_id=article_id,
        author=get_current_user_identifier(request),
        is_valid=True,
        content_format='markdown',
    ).prefetch_related('tags')
    if lock:
        queryset = queryset.select_for_update()
    return get_object_or_404(queryset)


class ArticleVersionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, article_id):
        article = get_owned_markdown_article(request, article_id)
        versions = ArticleVersion.objects.filter(article=article).order_by('-created_at', '-version_id')
        return success_result(data=ArticleVersionSummarySerializer(versions, many=True).data)


class ArticleVersionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, article_id, version_id):
        article = get_owned_markdown_article(request, article_id)
        version = get_object_or_404(ArticleVersion, article=article, version_id=version_id)
        return success_result(data=ArticleVersionDetailSerializer(version).data)


class ArticleVersionRestoreView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, article_id, version_id):
        article = get_owned_markdown_article(request, article_id, lock=True)
        version = get_object_or_404(ArticleVersion, article=article, version_id=version_id)
        operator_id = get_current_user_identifier(request)
        warnings = []

        target_coll_id = article.coll_id
        if version.coll_id == article.coll_id or can_manage_anthology(request, version.coll_id, 'article'):
            target_coll_id = version.coll_id
        else:
            warnings.append('原文集已不可用，已保留当前文集。')

        if not can_manage_anthology(request, target_coll_id, 'article'):
            return error_result(ErrorCode.RESOURCE_NOT_FOUND, status=404)

        target_category_id = article.category_id
        if not version.category_id:
            target_category_id = None
        else:
            category = Category.objects.filter(
                category_id=version.category_id,
                user_id__in=[operator_id, 'admin'],
                is_valid=True,
            ).first()
            if category:
                target_category_id = category.category_id
            else:
                warnings.append('历史版本的分类已不可用，已保留当前分类。')

        stored_tag_ids = version.tag_ids if isinstance(version.tag_ids, list) else []
        stored_tag_ids = [str(tag_id) for tag_id in stored_tag_ids if isinstance(tag_id, str)]
        restored_tags = list(Tag.objects.filter(
            tag_id__in=stored_tag_ids,
            user_id__in=[operator_id, 'admin'],
            is_valid=True,
        ))
        if len(restored_tags) < len(set(stored_tag_ids)):
            warnings.append('部分历史标签已不存在，恢复时已跳过。')

        target_fields = {
            'title': version.title,
            'content': version.content,
            'coll_id': target_coll_id,
            'category_id': target_category_id or '',
            'post_summary': version.post_summary,
        }
        if not has_versionable_changes(article, target_fields, target_tag_ids=[tag.tag_id for tag in restored_tags]):
            return success_result(
                data={'article': ArticleSerializer(article).data, 'warnings': warnings},
                msg='当前文章已经是该版本内容。',
            )

        if target_coll_id != article.coll_id and article.children.filter(is_valid=True).exists():
            return valid_result('包含子文章时不能跨文集移动。', status=400)

        if Article.objects.filter(
            author=article.author,
            coll_id=target_coll_id,
            title=version.title,
        ).exclude(pk=article.pk).exists():
            return error_result(ErrorCode.TITLE_DUPLICATE, status=409)

        old_coll_id = article.coll_id
        create_article_version(article, source='restore', operator_id=operator_id)

        article.title = version.title
        article.content = version.content
        article.coll_id = target_coll_id
        if old_coll_id != target_coll_id:
            article.parent = None
        article.category_id = target_category_id
        article.post_summary = version.post_summary
        article.mind_map = {}
        article.is_rag_synced = False
        article.tags.set(restored_tags)
        article.save()
        sync_article_content_assets(article)

        from article.views import refresh_anthology_stats
        refresh_anthology_stats(article.coll_id)
        if old_coll_id != article.coll_id:
            refresh_anthology_stats(old_coll_id)

        message = '文章已恢复。'
        if warnings:
            message += ' ' + ' '.join(warnings)
        return success_result(
            data={'article': ArticleSerializer(article).data, 'warnings': warnings},
            msg=message,
        )
