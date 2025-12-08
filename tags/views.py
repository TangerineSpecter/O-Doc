from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from article.models import Article
from utils.error_codes import ErrorCode
from utils.response_utils import success_result, error_result
from .models import Tag
from .serializers import TagSerializer


# 自定义分页类
class TagPagination(PageNumberPagination):
    page_size = 20  # 默认每页20条
    page_size_query_param = 'page_size'  # 允许通过参数指定每页大小
    max_page_size = 100  # 最大每页100条


class TagCreateView(APIView):
    """创建标签接口"""

    def post(self, request):
        # 使用序列化器验证和保存数据
        serializer = TagSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # 保存新的标签
        tag = serializer.save()

        # 返回创建的标签数据
        return success_result(data=TagSerializer(tag).data)


class TagDetailView(APIView):
    """根据tag_id获取标签详情接口"""

    def get(self, request, tag_id):
        # 使用tag_id查询标签
        tag = get_object_or_404(Tag, tag_id=tag_id, userid='admin')

        # 返回标签详情
        return success_result(data=TagSerializer(tag).data)


class TagListView(APIView):
    """标签列表视图"""

    def get(self, request):
        try:
            # 获取查询参数
            name = request.GET.get('name', '')

            # 查询admin用户的所有有效标签
            tags = Tag.objects.filter(userid='admin', is_valid=True)
            
            # 如果有名称过滤条件
            if name:
                tags = tags.filter(name__icontains=name)

            # 按排序值和更新时间排序
            tags = tags.order_by('sort', '-created_at')

            # 准备返回数据
            result_list = []

            # 序列化标签数据
            for tag in tags:
                # 统计该标签下的文章数量
                article_count = Article.objects.filter(
                    tags=tag, 
                    userid='admin', 
                    is_valid=True
                ).count()

                tag_data = {
                    'tag_id': tag.tag_id,
                    'name': tag.name,
                    'themeId': tag.themeId,
                    'sort': tag.sort,
                    'article_count': article_count,
                    'created_at': tag.created_at,
                    'updated_at': tag.updated_at
                }
                result_list.append(tag_data)

            return success_result(data=result_list)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class TagSortView(APIView):
    """标签排序接口"""

    def put(self, request, tag_id):
        try:
            # 获取排序值
            sort = request.data.get('sort', 0)
            
            # 查询标签
            tag = get_object_or_404(Tag, tag_id=tag_id, userid='admin', is_valid=True)
            
            # 更新排序值
            tag.sort = sort
            tag.save()
            
            return success_result(message="排序成功")
            
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class TagUpdateView(APIView):
    """更新标签接口"""

    def put(self, request, tag_id):
        try:
            # 查询标签
            tag = get_object_or_404(Tag, tag_id=tag_id, userid='admin', is_valid=True)
            
            # 使用序列化器验证和更新数据
            serializer = TagSerializer(tag, data=request.data, partial=True, context={'request': request})
            serializer.is_valid(raise_exception=True)
            
            # 保存更新后的标签
            updated_tag = serializer.save()
            
            return success_result(data=TagSerializer(updated_tag).data)
            
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class TagDeleteView(APIView):
    """删除标签接口"""

    def delete(self, request, tag_id):
        try:
            # 查询标签
            tag = get_object_or_404(Tag, tag_id=tag_id, userid='admin')
            
            # 逻辑删除：将is_valid设置为False
            tag.is_valid = False
            tag.save()
            
            return success_result(message="删除成功")
            
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class TagArticlesView(APIView):
    """获取标签下的文章列表接口"""
    pagination_class = TagPagination

    def get(self, request):
        try:
            # 获取查询参数
            tag_id = request.GET.get('tag_id', '')
            page_size = request.GET.get('page_size', 20)

            # 查询条件：默认查询admin用户的有效文章
            queryset = Article.objects.filter(userid='admin', is_valid=True)

            # 如果指定了标签ID
            if tag_id:
                # 查询指定标签的文章
                tag = get_object_or_404(Tag, tag_id=tag_id, userid='admin', is_valid=True)
                queryset = queryset.filter(tags=tag)
            # 否则查询所有文章

            # 排序：按更新时间降序
            queryset = queryset.order_by('-updated_at')

            # 分页
            paginator = TagPagination()
            paginator.page_size = int(page_size)
            result_page = paginator.paginate_queryset(queryset, request)

            # 准备返回数据
            articles_list = []
            for article in result_page:
                article_data = {
                    'article_id': article.article_id,
                    'title': article.title,
                    'coll_id': article.coll_id,
                    'parent': article.parent,
                    'category': article.category.category_id if article.category else None,
                    'tags': [tag.tag_id for tag in article.tags.all()],
                    'sort': article.sort,
                    'is_valid': article.is_valid,
                    'created_at': article.created_at,
                    'updated_at': article.updated_at
                }
                articles_list.append(article_data)

            # 构建分页响应数据
            pagination_data = {
                'current_page': paginator.page.number,
                'page_size': paginator.page_size,
                'total_pages': paginator.page.paginator.num_pages,
                'total_count': paginator.page.paginator.count
            }

            return success_result(
                data={
                    'articles': articles_list,
                    'pagination': pagination_data
                }
            )

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))