import logging
import threading

from django.contrib.auth import get_user_model
from django.db import transaction, models, close_old_connections
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from article.models import Article, Image
from article.prompts import POLISH_ARTICLE_PROMPT_TEMPLATE
from article.serializers import ArticleSerializer, ArticleTreeSerializer, ImageSerializer
from utils.ai_service import AIService
from utils.error_codes import ErrorCode
from utils.notification_service import NotificationService
from utils.resource_assets import (
    delete_asset_record_and_file,
    extract_resource_id_from_view_url,
    is_asset_used_by_image,
)
from utils.response_utils import success_result, error_result
from utils.web_parser import parse_web_content
from anthology.models import Anthology

User = get_user_model()

logger = logging.getLogger(__name__)


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
                    user='admin',
                    title=f"《{article.title}》润色完成",
                    content=f"您提交的链接：{self.source_url} 已成功保存到知识库。",
                    level="success",
                    link=f"/article/{article.coll_id}/{article.article_id}"
                )

        except Exception as e:
            logger.error(f"Polishing Task Exception for article {self.article_id}: {e}", exc_info=True)
            # 发送失败通知
            NotificationService.send(
                user='admin',
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
            article = get_object_or_404(Article, article_id=article_id)

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
        article = get_object_or_404(Article, article_id=article_id)
        old_coll_id = article.coll_id

        # 使用序列化器验证请求数据并更新文章
        serializer = ArticleSerializer(article, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)

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
            article = get_object_or_404(Article, article_id=article_id)

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
            articles = Article.objects.filter(is_valid=True).order_by('sort', '-updated_at')

            # 文集ID过滤
            if coll_id:
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
                    author=request.user.username if request.user.is_authenticated else 'admin'
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
            if not Anthology.objects.filter(coll_id=coll_id, type='image', is_valid=True).exists():
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
                if not Anthology.objects.filter(coll_id=serializer.validated_data['coll_id'], type='image',
                                                is_valid=True).exists():
                    return error_result(ErrorCode.RESOURCE_NOT_FOUND)
                image = serializer.save()

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
            image = get_object_or_404(Image, image_id=image_id, is_valid=True)
            serializer = ImageSerializer(image, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return success_result(data=serializer.data)
            else:
                return error_result(ErrorCode.PARAM_ERROR, str(serializer.errors))

        except Exception as e:
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


class ImageDeleteView(APIView):
    """
    删除图片（软删除）
    """

    def delete(self, request, image_id):
        try:
            image = get_object_or_404(Image, image_id=image_id, is_valid=True)
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
