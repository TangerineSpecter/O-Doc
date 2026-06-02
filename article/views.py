import base64
from io import BytesIO
import logging
import mimetypes
import os
import threading
from urllib.parse import unquote

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction, models, close_old_connections
from django.db.models import Q
from django.shortcuts import get_object_or_404
from PIL import Image as PILImage
from rest_framework.views import APIView

from article.models import Article, Image
from article.prompts import POLISH_ARTICLE_PROMPT_TEMPLATE
from article.serializers import ArticleSerializer, ArticleTreeSerializer, ImageSerializer
from utils.ai_service import AIService
from utils.error_codes import ErrorCode
from utils.drf_utils import get_current_user_identifier
from utils.notification_service import NotificationService
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

        # 保存更新
        article = serializer.save(is_rag_synced=False)

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
            ).order_by('-created_at')

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
            location = ' / '.join([item for item in [country, city] if item])
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
