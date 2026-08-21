import base64
from io import BytesIO
import json
import logging
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
from rest_framework.views import APIView

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
from article.models import Article, ArticleAnnotation, ArticleAnnotationComment, ArticlePostComment, ArticlePostRating, Image
from article.prompts import ARTICLE_MIND_MAP_PROMPT_TEMPLATE, POLISH_ARTICLE_PROMPT_TEMPLATE
from article.serializers import (
    AgentPostLatestCommentSerializer,
    ArticlePostCommentSerializer,
    ArticleSerializer,
    ArticleTreeSerializer,
    ImageSerializer,
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
from utils.response_utils import success_result, error_result
from utils.web_parser import parse_web_content
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

    def run(self):
        # 线程中确保数据库连接正常
        close_old_connections()
        try:
            logger.info(f"Starting polish task for article {self.article_id}")

            # 1. 获取文章
            article = Article.objects.get(article_id=self.article_id)
            article.is_polishing = True
            article.save()
            self.source_url = article.source_url

            # 2. 准备 Prompt
            # 截取前8000字符防止超长
            content_snippet = article.content[:8000]
            prompt = POLISH_ARTICLE_PROMPT_TEMPLATE.format(content=content_snippet)

            # 3. 调用 AI 服务
            polished_content = AIService.chat_completion(prompt)
            polished_content = AIService.strip_thinking(polished_content)

            # 4. 更新文章
            if polished_content:
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
            article = get_object_or_404(Article, article_id=article_id, is_valid=True)
            if not can_access_anthology(request, article.coll_id):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            # 更新阅读次数
            article.read_count += 1
            article.save()

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

    def put(self, request, article_id):
        # 查找文章
        article = get_object_or_404(
            Article,
            article_id=article_id,
            author=get_current_user_identifier(request),
            is_valid=True
        )
        old_coll_id = article.coll_id

        # 使用序列化器验证请求数据并更新文章
        serializer = ArticleSerializer(article, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        target_coll_id = serializer.validated_data.get('coll_id', article.coll_id)
        if not can_manage_anthology(request, target_coll_id, 'article'):
            return error_result(ErrorCode.RESOURCE_NOT_FOUND)

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
            root_articles = Article.objects.filter(
                is_valid=True,
                coll_id=coll_id,
                parent__isnull=True
            ).order_by('sort', '-updated_at')

            # 使用树形序列化器序列化响应数据
            serializer = ArticleTreeSerializer(root_articles, many=True)

            return success_result(data=serializer.data)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class ArticleSaveWebView(APIView):
    """
    保存网页为文章
    """

    def post(self, request):
        url = request.data.get('url')
        coll_id = request.data.get('coll_id')
        need_polishing = request.data.get('need_polishing', False)

        if not url or not coll_id:
            return error_result()

        try:
            if not can_manage_anthology(request, coll_id, 'article'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            # 1. 解析网页
            title, content = parse_web_content(url)

            # 2. 保存文章 (事务内)
            with transaction.atomic():
                article = Article.objects.create(
                    title=title,
                    content=content,
                    coll_id=coll_id,
                    source_url=url,
                    is_polishing=need_polishing,  # 如果需要润色，先标记为 True
                    author=get_current_user_identifier(request)
                )

                # 更新文集计数
                from anthology.models import Anthology
                anthology_queryset = Anthology.objects.filter(coll_id=coll_id)
                from system_settings.sync_state import record_bulk_change
                record_bulk_change(anthology_queryset)
                anthology_queryset.update(count=models.F('count') + 1)

            # 3. 如果需要润色，启动异步线程
            if need_polishing:
                thread = threading.Thread(target=run_polish_task, args=(article.article_id,))
                thread.daemon = True  # 设置为守护线程
                thread.start()

            return success_result(data=ArticleSerializer(article).data)

        except Exception as e:
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


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
