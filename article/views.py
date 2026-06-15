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
from article.models import Article, ArticleAnnotation, ArticleAnnotationComment, ArticlePostComment, ArticlePostRating, Image
from article.prompts import ARTICLE_MIND_MAP_PROMPT_TEMPLATE, POLISH_ARTICLE_PROMPT_TEMPLATE
from article.serializers import ArticlePostCommentSerializer, ArticleSerializer, ArticleTreeSerializer, ImageSerializer
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


def build_image_description_data_url(image_bytes, mime_type='image/jpeg'):
    """压缩图片，减少视觉模型请求耗时和请求体大小。"""
    original_size = len(image_bytes)
    try:
        with PILImage.open(BytesIO(image_bytes)) as image:
            original_dimensions = image.size
            image.thumbnail((IMAGE_DESCRIPTION_MAX_EDGE, IMAGE_DESCRIPTION_MAX_EDGE), PILImage.Resampling.LANCZOS)
            if image.mode not in ('RGB', 'L'):
                image = image.convert('RGB')

            output = BytesIO()
            image.save(output, format='JPEG', quality=IMAGE_DESCRIPTION_JPEG_QUALITY, optimize=True)
            compressed_bytes = output.getvalue()
            compressed_size = len(compressed_bytes)
            logger.warning(
                "Image description compression: original=%d bytes %sx%s, compressed=%d bytes %sx%s, ratio=%.2f%%",
                original_size,
                original_dimensions[0],
                original_dimensions[1],
                compressed_size,
                image.size[0],
                image.size[1],
                (compressed_size / original_size * 100) if original_size else 0,
            )
            encoded = base64.b64encode(compressed_bytes).decode('utf-8')
            return f'data:image/jpeg;base64,{encoded}'
    except Exception as exc:
        logger.warning(f"Image compression failed, fallback to original image: {exc}")
        encoded = base64.b64encode(image_bytes).decode('utf-8')
        logger.warning("Image description compression fallback: original=%d bytes, data_url=%d chars", original_size, len(encoded))
        return f'data:{mime_type};base64,{encoded}'


def compress_image_data_url(image_data_url):
    if not isinstance(image_data_url, str) or not image_data_url.startswith('data:image/'):
        return None

    try:
        header, encoded = image_data_url.split(',', 1)
        mime_type = header.split(';', 1)[0].replace('data:', '') or 'image/jpeg'
        image_bytes = base64.b64decode(unquote(encoded))
        return build_image_description_data_url(image_bytes, mime_type)
    except Exception as exc:
        logger.warning(f"Image data URL compression failed, fallback to original data URL: {exc}")
        logger.warning("Image description compression fallback: data_url=%d chars", len(image_data_url))
        return image_data_url


def build_image_data_url(image_url):
    """将本地资源图片转换为视觉模型可读取的 data URL。"""
    resource_id = extract_resource_id_from_view_url(image_url)
    if not resource_id:
        return None

    asset = Asset.objects.filter(id=resource_id, is_valid=True, file_type='image').first()
    if not asset:
        return None

    abs_file_path = os.path.join(settings.MEDIA_ROOT, asset.file_path)
    if not os.path.exists(abs_file_path):
        return None

    mime_type = asset.mime_type or mimetypes.guess_type(asset.original_name or asset.name)[0] or 'image/jpeg'
    with open(abs_file_path, 'rb') as image_file:
        return build_image_description_data_url(image_file.read(), mime_type)

    return None


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


class ArticleAnnotationListCreateView(APIView):
    """
    文章划线批注列表与创建接口。
    """

    def get(self, request):
        try:
            article_id = request.GET.get('articleId') or request.GET.get('article_id')
            if not article_id:
                return error_result(ErrorCode.PARAM_ERROR, "articleId 不能为空")

            article = get_object_or_404(Article, article_id=article_id, is_valid=True)
            if not can_access_anthology(request, article.coll_id):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            annotations = ArticleAnnotation.objects.filter(article=article, is_valid=True).prefetch_related('comments')
            data = [serialize_annotation(annotation) for annotation in annotations]
            return success_result(data={
                'annotations': data,
                'count': len(data),
            })
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))

    def post(self, request):
        try:
            if not request.user or not request.user.is_authenticated:
                return error_result(ErrorCode.PERMISSION_DENIED, "请先登录后再评论")

            article_id = request.data.get('article_id') or request.data.get('articleId')
            selected_text = request.data.get('selected_text') or request.data.get('selectedText')
            comment = request.data.get('comment')
            article = get_object_or_404(Article, article_id=article_id, is_valid=True)
            if not can_access_anthology(request, article.coll_id):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            if 'start_offset' in request.data or 'startOffset' in request.data:
                anchor = build_anchor_from_offsets(
                    article,
                    selected_text,
                    request.data.get('start_offset', request.data.get('startOffset')),
                    request.data.get('end_offset', request.data.get('endOffset')),
                )
            else:
                anchor = locate_unique_text(article, selected_text)
                if not anchor:
                    return error_result(ErrorCode.PARAM_ERROR, "未找到选中文本")

            annotation = create_annotation_with_comment(article, anchor, comment, get_user_identity(request))
            return success_result(data={'annotation': serialize_annotation(annotation)})
        except AnnotationError as e:
            return error_result(ErrorCode.PARAM_ERROR, str(e))
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class ArticleAnnotationCommentCreateView(APIView):
    """
    文章划线批注追加评论接口。
    """

    def post(self, request, annotation_id):
        try:
            if not request.user or not request.user.is_authenticated:
                return error_result(ErrorCode.PERMISSION_DENIED, "请先登录后再评论")

            annotation = get_object_or_404(ArticleAnnotation, annotation_id=annotation_id, is_valid=True)
            if not can_access_anthology(request, annotation.article.coll_id):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            comment = add_comment(annotation, request.data.get('comment'), get_user_identity(request))
            return success_result(data={'comment': serialize_comment(comment)})
        except AnnotationError as e:
            return error_result(ErrorCode.PARAM_ERROR, str(e))
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class ArticleAnnotationDeleteView(APIView):
    """
    删除整条文章批注。
    """

    def delete(self, request, annotation_id):
        try:
            annotation = get_object_or_404(ArticleAnnotation, annotation_id=annotation_id, is_valid=True)
            if not can_access_anthology(request, annotation.article.coll_id):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            if not can_delete_annotation(request, annotation):
                return error_result(ErrorCode.PERMISSION_DENIED)

            annotation.is_valid = False
            annotation.save(update_fields=['is_valid', 'updated_at'])
            return success_result(data={'annotation_id': annotation_id, 'deleted': True})
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class ArticleAnnotationCommentDeleteView(APIView):
    """
    删除文章批注下的单条评论。
    """

    def delete(self, request, comment_id):
        try:
            comment = get_object_or_404(ArticleAnnotationComment, comment_id=comment_id, is_valid=True)
            if not can_access_anthology(request, comment.annotation.article.coll_id):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            if not can_delete_comment(request, comment):
                return error_result(ErrorCode.PERMISSION_DENIED)

            comment.is_valid = False
            comment.save(update_fields=['is_valid', 'updated_at'])
            return success_result(data={'comment_id': comment_id, 'deleted': True})
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class AgentPostCommentListCreateView(APIView):
    """
    Agent 帖子评论列表与创建接口。
    """

    def get(self, request, article_id):
        try:
            article = Article.objects.filter(article_id=article_id, is_valid=True).first()
            if not article:
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            if not can_access_anthology(request, article.coll_id, 'agent'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            comments = ArticlePostComment.objects.filter(article=article, is_valid=True)
            return success_result(data={
                'comments': ArticlePostCommentSerializer(comments, many=True).data,
                'count': comments.count(),
            })
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))

    def post(self, request, article_id):
        try:
            if not request.user or not request.user.is_authenticated:
                return error_result(ErrorCode.PERMISSION_DENIED, "请先登录后再评论")

            article = Article.objects.filter(article_id=article_id, is_valid=True).first()
            if not article:
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            if not can_access_anthology(request, article.coll_id, 'agent'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            content = str(request.data.get('content') or '').strip()
            if not content:
                return error_result(ErrorCode.PARAM_ERROR, "评论内容不能为空")
            if len(content) > 1000:
                return error_result(ErrorCode.PARAM_ERROR, "评论内容不能超过 1000 字")

            identity = get_user_identity(request)
            comment = ArticlePostComment.objects.create(
                article=article,
                content=content,
                creator_id=identity.get('creator_id', ''),
                creator_name=identity.get('creator_name', ''),
                creator_avatar=identity.get('creator_avatar', ''),
            )
            return success_result(data={'comment': ArticlePostCommentSerializer(comment).data})
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class AgentPostRatingView(APIView):
    """
    Agent 帖子评分接口。每个登录用户对同一帖子保留一条有效评分。
    """

    def get(self, request, article_id):
        try:
            article = Article.objects.filter(article_id=article_id, is_valid=True).first()
            if not article:
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            if not can_access_anthology(request, article.coll_id, 'agent'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            ratings = ArticlePostRating.objects.filter(article=article, is_valid=True)
            my_rating = None
            if request.user and request.user.is_authenticated:
                rater_id = get_current_user_identifier(request)
                rating = ratings.filter(rater_id=rater_id).first()
                my_rating = rating.rating if rating else None
            return success_result(data={
                'rating': article.agent_post_rating,
                'rating_count': ratings.count(),
                'my_rating': my_rating,
            })
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))

    def post(self, request, article_id):
        try:
            if not request.user or not request.user.is_authenticated:
                return error_result(ErrorCode.PERMISSION_DENIED, "请先登录后再评分")

            article = Article.objects.filter(article_id=article_id, is_valid=True).first()
            if not article:
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            if not can_access_anthology(request, article.coll_id, 'agent'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            try:
                value = int(request.data.get('rating'))
            except (TypeError, ValueError):
                return error_result(ErrorCode.PARAM_ERROR, "评分必须是 1 到 10 的整数")
            if value < 1 or value > 10:
                return error_result(ErrorCode.PARAM_ERROR, "评分必须是 1 到 10 的整数")

            identity = get_user_identity(request)
            ArticlePostRating.objects.update_or_create(
                article=article,
                rater_id=identity.get('creator_id', ''),
                is_valid=True,
                defaults={
                    'rating': value,
                    'rater_name': identity.get('creator_name', ''),
                    'rater_avatar': identity.get('creator_avatar', ''),
                }
            )
            ratings = ArticlePostRating.objects.filter(article=article, is_valid=True)
            average_rating = ratings.aggregate(value=Avg('rating'))['value'] or 0
            article.agent_post_rating = int(round(average_rating))
            article.save(update_fields=['agent_post_rating', 'updated_at'])

            return success_result(data={
                'rating': article.agent_post_rating,
                'rating_count': ratings.count(),
                'my_rating': value,
            })
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
                Anthology.objects.filter(coll_id=coll_id).update(count=models.F('count') + 1)

            # 3. 如果需要润色，启动异步线程
            if need_polishing:
                thread = threading.Thread(target=run_polish_task, args=(article.article_id,))
                thread.daemon = True  # 设置为守护线程
                thread.start()

            return success_result(data=ArticleSerializer(article).data)

        except Exception as e:
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


class ImageListView(APIView):
    """
    图片列表视图 - 获取指定文集下的所有图片
    """

    def get(self, request, coll_id):
        try:
            if not can_access_anthology(request, coll_id, 'image'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            # 获取文集下的所有有效图片
            images = Image.objects.filter(
                is_valid=True,
                coll_id=coll_id
            ).annotate(
                sort_time=Coalesce('shooting_time', 'created_at')
            ).order_by('-sort_time', '-created_at')

            serializer = ImageSerializer(images, many=True)
            return success_result(data=serializer.data)

        except Exception as e:
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


class ImageDetailView(APIView):
    """
    图片详情视图 - 获取单张图片详情
    """

    def get(self, request, image_id):
        try:
            image = get_object_or_404(Image, image_id=image_id, is_valid=True)
            if not can_access_anthology(request, image.coll_id, 'image'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            serializer = ImageSerializer(image)
            return success_result(data=serializer.data)

        except Exception as e:
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


class ImageCreateView(APIView):
    """
    创建图片
    """

    def post(self, request):
        try:
            serializer = ImageSerializer(data=request.data)
            if serializer.is_valid():
                if not can_manage_anthology(request, serializer.validated_data['coll_id'], 'image'):
                    return error_result(ErrorCode.RESOURCE_NOT_FOUND)
                image = serializer.save(author=get_current_user_identifier(request))

                # 更新文集计数
                Anthology.objects.filter(coll_id=image.coll_id).update(count=models.F('count') + 1)

                return success_result(data=ImageSerializer(image).data)
            else:
                # 改进错误信息返回
                errors = serializer.errors
                error_msg = {field: str(error[0]) if isinstance(error, list) else str(error) for field, error in errors.items()}
                logger.error(f"Image validation errors: {error_msg}")
                return error_result(ErrorCode.PARAM_ERROR, error_msg)

        except Exception as e:
            logger.error(f"Image create error: {str(e)}", exc_info=True)
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


class ImageUpdateView(APIView):
    """
    更新图片
    """

    def put(self, request, image_id):
        try:
            image = get_object_or_404(Image, image_id=image_id, author=get_current_user_identifier(request), is_valid=True)
            serializer = ImageSerializer(image, data=request.data, partial=True)
            if serializer.is_valid():
                target_coll_id = serializer.validated_data.get('coll_id', image.coll_id)
                if not can_manage_anthology(request, target_coll_id, 'image'):
                    return error_result(ErrorCode.RESOURCE_NOT_FOUND)
                serializer.save()
                return success_result(data=serializer.data)
            else:
                return error_result(ErrorCode.PARAM_ERROR, str(serializer.errors))

        except Exception as e:
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


class ImageDescriptionGenerateView(APIView):
    """
    AI 生成图片描述说明
    """

    def post(self, request):
        try:
            title = (request.data.get('title') or '').strip()
            country = (request.data.get('country') or '').strip()
            city = (request.data.get('city') or '').strip()
            place_name = (request.data.get('placeName') or request.data.get('place_name') or '').strip()
            location = ' / '.join([item for item in [country, city, place_name] if item])
            image_data = request.data.get('imageData') or request.data.get('image_data')
            image_url = request.data.get('imageUrl') or request.data.get('image_url')
            uploaded_image = request.FILES.get('image')

            image_data_url = None
            if uploaded_image:
                mime_type = uploaded_image.content_type or mimetypes.guess_type(uploaded_image.name)[0] or 'image/jpeg'
                image_data_url = build_image_description_data_url(uploaded_image.read(), mime_type)

            if not image_data_url and isinstance(image_data, str) and image_data.startswith('data:image/'):
                image_data_url = compress_image_data_url(image_data)
            if not image_data_url and image_url:
                image_data_url = build_image_data_url(image_url)

            if not image_data_url:
                return error_result(ErrorCode.PARAM_ERROR, '请先选择图片')

            logger.warning(
                "Calling image description model: image_data_url=%d chars, title=%s, location=%s",
                len(image_data_url),
                title or '未填写',
                location or '未填写',
            )

            description = AIService.image_description(
                image_data_url=image_data_url,
                title=title,
                location=location
            )

            if not description:
                return error_result(ErrorCode.AI_SERVICE_ERROR, 'AI 未生成描述')

            return success_result({'description': description})
        except ValueError as e:
            return error_result(ErrorCode.AI_SERVICE_ERROR, str(e))
        except Exception as e:
            logger.error(f"Image description generation error: {str(e)}", exc_info=True)
            return error_result(ErrorCode.AI_SERVICE_ERROR, str(e))


class ImageDeleteView(APIView):
    """
    删除图片（软删除）
    """

    def delete(self, request, image_id):
        try:
            image = get_object_or_404(Image, image_id=image_id, author=get_current_user_identifier(request), is_valid=True)
            resource_id = extract_resource_id_from_view_url(image.image_url)
            image.is_valid = False
            image.save()

            if resource_id and not is_asset_used_by_image(resource_id, exclude_image_id=image.image_id):
                from assets.models import Asset

                asset = Asset.objects.filter(id=resource_id, is_valid=True, linked_article__isnull=True).first()
                if asset:
                    delete_asset_record_and_file(asset)

            # 更新文集计数
            Anthology.objects.filter(coll_id=image.coll_id).update(count=models.F('count') - 1)

            return success_result(msg="删除成功")

        except Exception as e:
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))
