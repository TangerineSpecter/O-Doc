from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from article.models import Article
from article.serializers import ArticleSerializer, ArticleTreeSerializer
from utils.error_codes import ErrorCode
# 导入封装工具
from utils.response_utils import success_result, error_result, valid_result


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

        # 使用序列化器验证请求数据并更新文章
        serializer = ArticleSerializer(article, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        # 保存更新
        article = serializer.save()

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
                return error_result(error=ErrorCode.PARAMETER_ERROR, data="文集ID不能为空")

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
