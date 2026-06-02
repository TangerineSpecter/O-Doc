from django.shortcuts import get_object_or_404
from django.db.models import Count, Q
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from article.models import Article
from utils.drf_utils import get_current_user_identifier
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
        return success_result(data=serialize_tag_with_article_count(tag))


class TagDetailView(APIView):
    """根据tag_id获取标签详情接口"""

    def get(self, request, tag_id):
        # 使用tag_id查询标签
        tag = get_visible_tag_or_404(request, tag_id)

        # 返回标签详情
        return success_result(data=TagSerializer(tag).data)


class TagListView(APIView):
    """标签列表视图"""

    def get(self, request):
        try:
            # 获取查询参数
            name = request.GET.get('name', '')
            current_user_id = get_current_user_identifier(request)
            visible_user_ids = ['admin']
            if current_user_id != 'admin':
                visible_user_ids.append(current_user_id)

            # 查询系统公共标签与当前用户标签，保持与文章保存时创建标签的口径一致
            tags = Tag.objects.filter(
                user_id__in=visible_user_ids,
                is_valid=True
            ).annotate(
                article_count=Count(
                    'articles',
                    filter=Q(articles__is_valid=True),
                    distinct=True
                )
            )
            
            # 如果有名称过滤条件
            if name:
                tags = tags.filter(name__icontains=name)

            # 按排序值和更新时间排序
            tags = tags.order_by('sort', '-created_at')

            return success_result(data=[serialize_tag_with_article_count(tag) for tag in tags])

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class TagSortView(APIView):
    """标签排序接口"""

    def put(self, request, tag_id):
        try:
            # 获取排序值
            sort = request.data.get('sort', 0)
            
            # 查询标签
            tag = get_visible_tag_or_404(request, tag_id)
            
            # 更新排序值
            tag.sort = sort
            tag.save()
            
            return success_result()
            
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class TagUpdateView(APIView):
    """更新标签接口"""

    def put(self, request, tag_id):
        try:
            # 查询标签
            tag = get_visible_tag_or_404(request, tag_id)
            
            # 使用序列化器验证和更新数据
            serializer = TagSerializer(tag, data=request.data, partial=True, context={'request': request})
            serializer.is_valid(raise_exception=True)
            
            # 保存更新后的标签
            updated_tag = serializer.save()
            
            return success_result(data=serialize_tag_with_article_count(updated_tag))
            
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


def serialize_tag_with_article_count(tag):
    article_count = getattr(tag, 'article_count', None)
    if article_count is None:
        article_count = Article.objects.filter(tags=tag, is_valid=True).count()

    return {
        'tag_id': tag.tag_id,
        'name': tag.name,
        'theme_id': tag.theme_id,
        'sort': tag.sort,
        'article_count': article_count,
        'created_at': tag.created_at,
        'updated_at': tag.updated_at
    }


def get_visible_tag_or_404(request, tag_id):
    current_user_id = get_current_user_identifier(request)
    visible_user_ids = ['admin']
    if current_user_id != 'admin':
        visible_user_ids.append(current_user_id)

    return get_object_or_404(
        Tag,
        tag_id=tag_id,
        user_id__in=visible_user_ids,
        is_valid=True
    )


class TagDeleteView(APIView):
    """删除标签接口"""

    def delete(self, request, tag_id):
        try:
            # 查询标签
            tag = get_visible_tag_or_404(request, tag_id)
            
            # 逻辑删除：将is_valid设置为False
            tag.is_valid = False
            tag.save()
            
            return success_result()
            
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))
