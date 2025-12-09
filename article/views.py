from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from article.models import Article
from article.serializers import ArticleSerializer, ArticleTreeSerializer
from tags.models import Tag
from tags.serializers import TagSerializer
from utils.error_codes import ErrorCode
# 导入封装工具
from utils.response_utils import success_result, error_result, valid_result


class ArticleCreateView(APIView):
    """
    创建文章视图
    """

    def post(self, request):
        # try:
            # 使用事务包装所有数据库操作，确保原子性
            with transaction.atomic():
                # 使用序列化器验证请求数据
                serializer = ArticleSerializer(data=request.data)

                if not serializer.is_valid():
                    return valid_result(data=serializer.errors)

                # 保存文章
                article = serializer.save()

                # 处理标签数据
                tags_data = request.data.get('tags', [])
                if tags_data:
                    tag_objects = []

                    for tag_name in tags_data:
                        # 去除标签名称两端的空格
                        tag_name = tag_name.strip()
                        if tag_name:
                            try:
                                # 先尝试获取已存在的标签
                                tag = Tag.objects.get(name=tag_name, userid='admin')
                            except Tag.DoesNotExist:
                                # 如果标签不存在，使用TagSerializer创建
                                tag_data = {
                                    'name': tag_name,
                                    'userid': 'admin'
                                }
                                tag_serializer = TagSerializer(data=tag_data, context={'request': request})
                                tag_serializer.is_valid(raise_exception=True)
                                tag = tag_serializer.save()
                            
                            tag_objects.append(tag)
                    
                    # 关联标签到文章
                    article.tags.set(tag_objects)

                # 序列化响应数据（在处理完标签后）
                response_data = ArticleSerializer(article).data

                return success_result(data=response_data)

        # except IntegrityError as e:
        #     if 'unique constraint' in str(e).lower() or 'duplicate' in str(e).lower():
        #         return error_result(error=ErrorCode.TITLE_DUPLICATE, data=str(e))
        #     else:
        #         return error_result(error=ErrorCode.DATABASE_ERROR, data=str(e))
        #
        # except Exception as e:
        #     return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


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
        try:
            # 查找文章
            article = get_object_or_404(Article, article_id=article_id)

            # 使用序列化器验证请求数据并更新文章
            serializer = ArticleSerializer(article, data=request.data, partial=True)

            if not serializer.is_valid():
                return valid_result(data=serializer.errors)

            # 保存更新
            article = serializer.save()

            # 序列化响应数据
            response_data = ArticleSerializer(article).data

            return success_result(response_data)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class ArticleDeleteView(APIView):
    """
    删除文章视图（软删除）
    """

    def delete(self, request, article_id):
        try:
            # 查找文章
            article = get_object_or_404(Article, article_id=article_id)

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
