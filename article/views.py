import base64
from io import BytesIO
import json
import logging
from system_logs.context import diagnostic_operation
import mimetypes
import os
import re
import threading
from urllib.parse import unquote

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction, models, close_old_connections
from django.db.models import Avg, Q
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from PIL import Image as PILImage
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from system_settings.sync_state import permanent_deletion

from article.annotation_service import (
    AnnotationError,
    add_comment,
    build_anchor_from_offsets,
    can_delete_annotation,
    can_delete_comment,
    create_annotation_with_comment,
    get_user_identity,
    locate_unique_text,
    serialize_annotation,
    serialize_comment,
)
from article.access import (
    can_access_anthology,
    can_manage_anthology,
    get_visible_anthology_queryset,
    get_visible_article_queryset,
)
from article.annotation_views import (
    ArticleAnnotationCommentCreateView,
    ArticleAnnotationCommentDeleteView,
    ArticleAnnotationDeleteView,
    ArticleAnnotationListCreateView,
)
from article.agent_post_views import (
    AgentPostCommentListCreateView,
    AgentPostLatestCommentListView,
    AgentPostRatingView,
)
from article.html_note_locking import lock_html_owner
from article.models import Article, ArticleAnnotation, ArticleAnnotationComment, ArticlePostComment, ArticlePostRating, Image
from article.version_service import create_article_version, has_versionable_changes
from article.prompts import ARTICLE_MIND_MAP_PROMPT_TEMPLATE, POLISH_ARTICLE_PROMPT_TEMPLATE
from article.serializers import (
    AgentPostLatestCommentSerializer,
    ArticlePostCommentSerializer,
    ArticleSerializer,
    ArticleTreeSerializer,
    ImageSerializer,
)
from article.web_import_service import (
    import_content_file_as_article,
    import_webpage_as_article,
    polish_markdown_content,
)
from utils.ai_service import AIService
from utils.error_codes import ErrorCode
from utils.drf_utils import get_current_user_identifier
from utils.notification_service import NotificationService
from utils.rag_client import RagClient
from utils.resource_assets import (
    delete_asset_record_and_file,
    extract_resource_id_from_view_url,
    is_asset_used_by_image,
)
from utils.response_utils import success_result, error_result, valid_result
from utils.web_parser import WebParserError
from anthology.models import Anthology
from assets.models import Asset

User = get_user_model()

logger = logging.getLogger(__name__)

IMAGE_DESCRIPTION_MAX_EDGE = 1280
IMAGE_DESCRIPTION_JPEG_QUALITY = 82
MIND_MAP_MAX_CONTENT_CHARS = 10000
MIND_MAP_MAX_DEPTH = 4
MIND_MAP_MAX_CHILDREN = 6


from article.image_service import (
    build_image_data_url,
    build_image_description_data_url,
    compress_image_data_url,
)


def refresh_anthology_stats(coll_id):
    """辅助函数：刷新指定文集的统计数据"""
    if not coll_id:
        return
    try:
        anthology = Anthology.objects.get(coll_id=coll_id)
        anthology.update_stats()
    except Anthology.DoesNotExist:
        pass


def _extract_json_object(raw_text):
    if not raw_text:
        raise ValueError("AI 未返回内容")

    text = AIService.strip_thinking(raw_text).strip()
    fenced_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL | re.IGNORECASE)
    if fenced_match:
        text = fenced_match.group(1).strip()
    elif not text.startswith('{'):
        start = text.find('{')
        end = text.rfind('}')
        if start >= 0 and end > start:
            text = text[start:end + 1]

    return json.loads(text)


def _normalize_mind_map_node(node, fallback_title, depth=1):
    if not isinstance(node, dict):
        return None

    title = str(node.get('title') or fallback_title or '思维导图').strip()
    if not title:
        title = fallback_title or '思维导图'
    title = title[:48]

    normalized = {
        'title': title,
        'children': [],
    }

    if depth >= MIND_MAP_MAX_DEPTH:
        return normalized

    raw_children = node.get('children') if isinstance(node.get('children'), list) else []
    children = []
    for child in raw_children[:MIND_MAP_MAX_CHILDREN]:
        normalized_child = _normalize_mind_map_node(child, '', depth + 1)
        if normalized_child:
            children.append(normalized_child)
    normalized['children'] = children

    return normalized


def build_article_mind_map(article):
    content_snippet = (article.content or '')[:MIND_MAP_MAX_CONTENT_CHARS]
    prompt = ARTICLE_MIND_MAP_PROMPT_TEMPLATE.format(
        title=article.title,
        content=content_snippet,
    )
    raw_result = AIService.chat_completion(prompt, use_simple_model=True)
    parsed = _extract_json_object(raw_result)
    mind_map = _normalize_mind_map_node(parsed, article.title)

    if not mind_map or not mind_map.get('children'):
        raise ValueError("AI 未生成可用的思维导图")

    return mind_map


class ArticlePolisher:
    """文章润色任务封装类"""

    def __init__(self, article_id):
        self.article_id = article_id
        self.source_url = ""

    @diagnostic_operation('article', resource_attr='article_id')
    def run(self):
        # 线程中确保数据库连接正常
        close_old_connections()
        try:
            logger.info(f"Starting polish task for article {self.article_id}")

            # 1. 获取文章
            article = Article.objects.get(article_id=self.article_id)
            if article.content_format == 'html' or not article.is_valid:
                return
            article.is_polishing = True
            article.save()
            self.source_url = article.source_url

            # 2. 分块润色整篇文章；图片和代码块使用占位符原样保护。
            polished_content = polish_markdown_content(article.content)

            # 4. 更新文章
            if polished_content:
                with transaction.atomic():
                    article = Article.objects.select_for_update().get(
                        article_id=self.article_id,
                        is_valid=True,
                        content_format='markdown',
                    )
                    if article.content != polished_content:
                        create_article_version(article, source='polish', operator_id=article.author)
                        article.content = polished_content
                        article.save()

                logger.info(f"Article {self.article_id} polished successfully.")

                # 5. 发送成功通知
                NotificationService.send(
                    user=article.author,
                    title=f"《{article.title}》润色完成",
                    content=f"您提交的链接：{self.source_url} 已成功保存到知识库。",
                    level="success",
                    link=f"/article/{article.coll_id}/{article.article_id}"
                )

        except Exception as e:
            logger.error(f"Polishing Task Exception for article {self.article_id}: {e}", exc_info=True)
            # 发送失败通知
            NotificationService.send(
                user=article.author if 'article' in locals() else 'admin',
                title="网页解析/润色失败",
                content=f"链接 {self.source_url} 处理出错: {str(e)}",
                level="error"
            )
        finally:
            self._finalize_status()
            close_old_connections()

    def _finalize_status(self):
        try:
            article = Article.objects.get(article_id=self.article_id)
            if article.is_polishing:
                article.is_polishing = False
                article.save()
        except Article.DoesNotExist:
            logger.warning(f"Article {self.article_id} deleted during polishing.")
        except Exception as e:
            logger.error(f"Error finalizing status: {e}")


# 包装函数供线程调用
def run_polish_task(article_id):
    polisher = ArticlePolisher(article_id)
    polisher.run()


class ArticlePolishView(APIView):
    """
    文章润色同步API
    接收文章内容，返回润色后的内容
    """

    def post(self, request):
        try:
            # 获取请求参数
            content = request.data.get('content', '')
            if not content:
                return error_result(ErrorCode.PARAM_ERROR, "文章内容不能为空")

            # 截取内容防止超长
            content_snippet = content[:8000]
            
            # 准备Prompt
            prompt = POLISH_ARTICLE_PROMPT_TEMPLATE.format(content=content_snippet)
            
            # 调用AI服务
            polished_content = AIService.chat_completion(prompt)
            polished_content = AIService.strip_thinking(polished_content)
            
            if not polished_content:
                return error_result(ErrorCode.AI_SERVICE_ERROR, "AI润色失败")
            
            return success_result(data={"polished_content": polished_content})
            
        except Exception as e:
            logger.error(f"ArticlePolishView Exception: {e}", exc_info=True)
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


class ArticleCreateView(APIView):
    """
    创建文章视图
    """

    def post(self, request):
        # 使用事务包装所有数据库操作，确保原子性
        with transaction.atomic():
            serializer = ArticleSerializer(data=request.data, context={'request': request})
            serializer.is_valid(raise_exception=True)
            if not can_manage_anthology(request, serializer.validated_data['coll_id'], 'article'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            article = serializer.save()

            # 更新统计
            refresh_anthology_stats(article.coll_id)

            return success_result(data=ArticleSerializer(article).data)


class ArticleDetailView(APIView):
    """
    文章详情视图
    """

    def get(self, request, article_id):
        try:
            # 查找文章
            article = get_visible_article_queryset(request).filter(article_id=article_id).first()
            if not article:
                return error_result(ErrorCode.RESOURCE_NOT_FOUND, status=404)
            if not can_access_anthology(request, article.coll_id):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            # 更新阅读次数
            Article.objects.filter(article_id=article.article_id).update(
                read_count=models.F('read_count') + 1
            )
            article.refresh_from_db(fields=['read_count'])

            # 序列化响应数据
            response_data = ArticleSerializer(article).data

            return success_result(response_data)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class ArticleMindMapGenerateView(APIView):
    """
    生成或获取文章思维导图。
    如果文章已记录思维导图，直接返回；否则根据文章内容生成并保存。
    """

    def post(self, request, article_id):
        try:
            article = get_object_or_404(Article, article_id=article_id, is_valid=True)
            if not can_access_anthology(request, article.coll_id):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            if article.mind_map:
                return success_result(data={
                    'mind_map': article.mind_map,
                    'generated': False,
                })

            if not can_manage_anthology(request, article.coll_id, 'article'):
                return error_result(ErrorCode.PERMISSION_DENIED)

            if not (article.content or '').strip():
                return error_result(ErrorCode.PARAM_ERROR, "文章内容为空，无法生成思维导图")

            mind_map = build_article_mind_map(article)
            article.mind_map = mind_map
            article.save(update_fields=['mind_map', 'updated_at'])

            return success_result(data={
                'mind_map': mind_map,
                'generated': True,
            })
        except ValueError as e:
            return error_result(ErrorCode.AI_SERVICE_ERROR, str(e))
        except Exception as e:
            logger.error(f"ArticleMindMapGenerateView Exception: {e}", exc_info=True)
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


class ArticleUpdateView(APIView):
    """
    更新文章视图
    """

    @transaction.atomic
    def put(self, request, article_id):
        operator_id = get_current_user_identifier(request)
        lock_html_owner(operator_id)
        # 查找文章
        article = get_object_or_404(
            Article.objects.select_for_update(),
            article_id=article_id,
            author=operator_id,
            is_valid=True
        )
        old_coll_id = article.coll_id
        if article.content_format == 'html' and not request.user.is_authenticated:
            return error_result(ErrorCode.PERMISSION_DENIED, status=403)

        # 使用序列化器验证请求数据并更新文章
        serializer = ArticleSerializer(article, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        target_coll_id = serializer.validated_data.get('coll_id', article.coll_id)
        if not can_manage_anthology(request, target_coll_id, 'article'):
            return error_result(ErrorCode.RESOURCE_NOT_FOUND)

        if has_versionable_changes(article, serializer.validated_data):
            create_article_version(article, source='save', operator_id=operator_id)

        update_kwargs = {'is_rag_synced': False}
        if 'content' in serializer.validated_data and serializer.validated_data['content'] != article.content:
            update_kwargs['mind_map'] = {}

        # 保存更新
        article = serializer.save(**update_kwargs)

        # 必然更新当前文集
        refresh_anthology_stats(article.coll_id)

        # 如果文集ID发生变化，更新旧文集的文章数量
        from anthology.models import Anthology
        if old_coll_id != article.coll_id:
            refresh_anthology_stats(old_coll_id)

        # 序列化响应数据
        response_data = ArticleSerializer(article).data

        return success_result(response_data)


class ArticleDeleteView(APIView):
    """
    删除文章视图（软删除）
    """

    def delete(self, request, article_id):
        try:
            html_article = Article.objects.filter(pk=article_id, author=get_current_user_identifier(request), content_format='html').first()
            if html_article:
                if not request.user.is_authenticated:
                    return error_result(ErrorCode.PERMISSION_DENIED, status=403)
                from article.html_note_resources import delete_html_note
                if delete_html_note(html_article, get_current_user_identifier(request)):
                    RagClient.delete_article(article_id)
                    refresh_anthology_stats(html_article.coll_id)
                return success_result(data=None)
            # 查找文章
            article = get_object_or_404(
                Article,
                article_id=article_id,
                author=get_current_user_identifier(request),
                is_valid=True
            )

            # 检查是否存在子文章
            has_children = Article.objects.filter(parent=article, is_valid=True).exists()
            if has_children:
                return error_result(ErrorCode.ARTICLE_HAVE_CHILDREN)

            # 软删除：更新is_valid为False
            article.is_valid = False
            article.save()
            RagClient.delete_article(article.article_id)

            # 更新文集文章数量
            refresh_anthology_stats(article.coll_id)

            return success_result(data=None)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class ArticleTrashListView(APIView):
    """List the authenticated user's deleted Markdown articles."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner = get_current_user_identifier(request)
        articles = list(
            Article.objects.filter(
                author=owner,
                content_format='markdown',
                is_valid=False,
            )
            .only('article_id', 'title', 'content', 'coll_id', 'created_at', 'updated_at')
            .order_by('-updated_at')
        )
        anthology_ids = {article.coll_id for article in articles}
        article_ids = [article.article_id for article in articles]
        parent_ids_with_children = set(
            Article.objects.filter(parent_id__in=article_ids)
            .values_list('parent_id', flat=True)
        )
        anthologies = {
            anthology.coll_id: anthology
            for anthology in Anthology.objects.filter(
                coll_id__in=anthology_ids,
                user_id=owner,
                type__in=('article', 'agent'),
            ).only('coll_id', 'title', 'is_valid', 'user_id', 'type')
        }
        return success_result(data=[
            {
                'item_type': 'article',
                'id': article.article_id,
                'article_id': article.article_id,
                'title': article.title,
                'preview': article.content[:360].strip(),
                'coll_id': article.coll_id,
                'anthology_title': anthologies[article.coll_id].title if article.coll_id in anthologies else '',
                'collection_available': bool(
                    article.coll_id in anthologies and anthologies[article.coll_id].is_valid
                ),
                'has_children': article.article_id in parent_ids_with_children,
                'created_at': article.created_at,
                # The existing updated_at field is refreshed by soft-delete and needs no sync schema change.
                'deleted_at': article.updated_at,
            }
            for article in articles
        ])


class ArticleTrashRestoreView(APIView):
    """Restore a deleted Markdown article to its original active collection."""

    permission_classes = [IsAuthenticated]

    def post(self, request, article_id):
        owner = get_current_user_identifier(request)
        with transaction.atomic():
            article = get_object_or_404(
                Article.objects.select_for_update(),
                article_id=article_id,
                author=owner,
                content_format='markdown',
                is_valid=False,
            )
            anthology = Anthology.objects.filter(
                coll_id=article.coll_id,
                user_id=owner,
                type__in=('article', 'agent'),
            ).first()
            if anthology is None or not anthology.is_valid:
                return valid_result(msg='所属文集已删除，暂无法恢复', status=409)

            article.is_valid = True
            article.is_rag_synced = False
            article.last_rag_synced_at = None
            article.save()
            refresh_anthology_stats(article.coll_id)

        return success_result(data={'article_id': article.article_id, 'coll_id': article.coll_id})


class ArticleTrashPurgeView(APIView):
    """Permanently delete a deleted Markdown article and record its sync tombstone."""

    permission_classes = [IsAuthenticated]

    def delete(self, request, article_id):
        owner = get_current_user_identifier(request)
        with transaction.atomic():
            article = get_object_or_404(
                Article.objects.select_for_update(),
                article_id=article_id,
                author=owner,
                content_format='markdown',
                is_valid=False,
            )
            if article.children.exists():
                return valid_result(msg='请先彻底删除该文章的子文章，再删除这篇文章', status=409)
            coll_id = article.coll_id
            # Mark the article and cascaded records as permanent sync tombstones.
            with permanent_deletion():
                article.delete()
            refresh_anthology_stats(coll_id)
        return success_result()


class ArticleListView(APIView):
    """
    文章列表视图，支持多条件查询
    - 支持文集ID查询
    - 支持标签ID查询
    - 支持分类ID查询
    - 支持关键词查询（标题模糊检索）
    """

    def get(self, request):
        try:
            # 获取查询参数
            coll_id = request.GET.get('coll_id')
            tag_id = request.GET.get('tag_id')
            category_id = request.GET.get('category_id')
            keyword = request.GET.get('keyword')

            # 构建查询集
            articles = get_visible_article_queryset(request).order_by('sort', '-updated_at')

            # 文集ID过滤
            if coll_id:
                if not can_access_anthology(request, coll_id):
                    return success_result(data=[])
                articles = articles.filter(coll_id=coll_id)

            # 标签ID过滤
            if tag_id:
                articles = articles.filter(tags__tag_id=tag_id)

            # 分类ID过滤
            if category_id:
                articles = articles.filter(category__category_id=category_id)

            # 关键词过滤（标题模糊检索）
            if keyword:
                articles = articles.filter(title__icontains=keyword)

            # 序列化响应数据
            serializer = ArticleSerializer(articles, many=True)

            return success_result(data=serializer.data)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class ArticleTreeListView(APIView):
    """
    树形结构文章列表视图，按文集ID返回树形结构的文章列表
    - coll_id：文集ID，必传参数
    """

    def get(self, request):
        try:
            # 获取查询参数
            coll_id = request.GET.get('coll_id')

            # 验证文集ID是否存在
            if not coll_id:
                return error_result()

            if not can_access_anthology(request, coll_id, 'article'):
                return success_result(data=[])

            # 构建查询集：只获取文集下的主文章（parent为空），并按sort和更新时间排序
            root_articles = get_visible_article_queryset(request).filter(
                coll_id=coll_id,
                parent__isnull=True
            ).order_by('sort', '-updated_at')

            # 使用树形序列化器序列化响应数据
            serializer = ArticleTreeSerializer(root_articles, many=True, context={'request': request})

            return success_result(data=serializer.data)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class ArticleSaveWebView(APIView):
    """
    保存网页为文章
    """

    def post(self, request):
        # The global camel-case parser normally converts these fields, but the
        # fallback keeps this endpoint compatible with direct API callers and
        # older clients that send either spelling.
        url = request.data.get('url')
        coll_id = request.data.get('coll_id') or request.data.get('collId')
        need_polishing = request.data.get(
            'need_polishing', request.data.get('needPolishing', False))
        use_ai_extraction = request.data.get(
            'use_ai_extraction', request.data.get('useAiExtraction', False))
        if isinstance(need_polishing, str):
            need_polishing = need_polishing.strip().lower() in {'1', 'true', 'yes', 'on'}
        else:
            need_polishing = bool(need_polishing)
        if isinstance(use_ai_extraction, str):
            use_ai_extraction = use_ai_extraction.strip().lower() in {'1', 'true', 'yes', 'on'}
        else:
            use_ai_extraction = bool(use_ai_extraction)

        if isinstance(url, str):
            url = url.strip()

        if not url or not coll_id:
            return error_result(ErrorCode.PARAM_REQUIRED, '缺少网页地址或文集ID')

        try:
            if not can_manage_anthology(request, coll_id, 'article'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            import_result = import_webpage_as_article(
                url=url,
                coll_id=coll_id,
                author=get_current_user_identifier(request),
                use_ai_extraction=use_ai_extraction,
                need_polishing=need_polishing,
            )
            article = import_result.article

            # 3. 如果需要润色，启动异步线程
            if need_polishing:
                thread = threading.Thread(target=run_polish_task, args=(article.article_id,))
                thread.daemon = True  # 设置为守护线程
                thread.start()

            response_data = dict(ArticleSerializer(article).data)
            response_data['import_report'] = import_result.report.as_dict()
            return success_result(data=response_data)

        except WebParserError as exc:
            # Parsing/network failures are expected user-facing errors, not
            # server faults. Keep the actionable parser message in response data.
            return error_result(ErrorCode.PARAM_INVALID, str(exc))
        except Exception:
            logger.exception('Failed to save webpage as article: coll_id=%s', coll_id)
            return error_result(error=ErrorCode.SYSTEM_ERROR)


class ArticleImportFileView(APIView):
    """Import a saved HTML or Markdown file as an article."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        uploaded_file = request.FILES.get('file')
        coll_id = request.data.get('coll_id') or request.data.get('collId')
        need_polishing = request.data.get(
            'need_polishing', request.data.get('needPolishing', False))
        use_ai_extraction = request.data.get(
            'use_ai_extraction', request.data.get('useAiExtraction', False))
        need_polishing = str(need_polishing).strip().lower() in {'1', 'true', 'yes', 'on'}
        use_ai_extraction = str(use_ai_extraction).strip().lower() in {'1', 'true', 'yes', 'on'}

        if not uploaded_file or not coll_id:
            return error_result(ErrorCode.PARAM_REQUIRED, '缺少导入文件或文集ID')

        try:
            if not can_manage_anthology(request, coll_id, 'article'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            import_mode = request.data.get('import_mode', request.data.get('importMode', 'extract'))
            if import_mode not in {'original', 'extract'}:
                return error_result(ErrorCode.PARAM_ERROR, '无效导入方式', status=400)
            if import_mode == 'original':
                from article.html_note_service import import_original
                articles, warnings = import_original(uploaded_file, coll_id, get_current_user_identifier(request))
                results = []
                for item in articles:
                    data = dict(ArticleSerializer(item).data)
                    data['import_report'] = {'extraction_mode': 'standard', 'confidence': 'high', 'localized_image_count': item.asset_references.filter(asset__file_type='image').count(), 'external_image_count': 0, 'warnings': warnings}
                    results.append(data)
                return success_result({'articles': results})
            import_result = import_content_file_as_article(
                uploaded_file=uploaded_file,
                coll_id=coll_id,
                author=get_current_user_identifier(request),
                use_ai_extraction=use_ai_extraction,
                need_polishing=need_polishing,
            )
            article = import_result.article
            if need_polishing:
                thread = threading.Thread(target=run_polish_task, args=(article.article_id,))
                thread.daemon = True
                thread.start()

            response_data = dict(ArticleSerializer(article).data)
            response_data['import_report'] = import_result.report.as_dict()
            return success_result(data=response_data)
        except WebParserError as exc:
            return error_result(ErrorCode.PARAM_INVALID, str(exc))
        except Exception:
            logger.exception('Failed to import article file: coll_id=%s', coll_id)
            return error_result(error=ErrorCode.SYSTEM_ERROR)


from article.image_views import (
    ImageCreateView,
    ImageDeleteView,
    ImageDescriptionGenerateView,
    ImageDetailView,
    ImageGroupCreateView,
    ImageGroupDeleteView,
    ImageGroupUpdateView,
    ImageListView,
    ImageUpdateView,
    cleanup_group_image_assets,
)
