from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from django.db import models

from article.models import Article
from utils.error_codes import ErrorCode
from utils.response_utils import success_result, error_result
from .models import Category
from .serializers import CategorySerializer


# 自定义分页类
class CategoryPagination(PageNumberPagination):
    page_size = 20  # 默认每页20条
    page_size_query_param = 'page_size'  # 允许通过参数指定每页大小
    max_page_size = 100  # 最大每页100条


class CategoryCreateView(APIView):
    """创建分类接口"""

    def post(self, request):
        # 使用序列化器验证和保存数据
        serializer = CategorySerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # 保存新的分类
        category = serializer.save()

        # 返回创建的分类数据
        return success_result(data=CategorySerializer(category).data)


class CategoryDetailView(APIView):
    """根据category_id获取分类详情接口"""

    def get(self, request, category_id):
        # 使用category_id查询分类
        category = get_object_or_404(Category, category_id=category_id, userid='admin')

        # 返回分类详情
        return success_result(data=CategorySerializer(category).data)


class CategoryListView(APIView):
    """分类列表视图"""
    pagination_class = CategoryPagination

    def get(self, request):
        try:
            # 获取查询参数
            name = request.GET.get('name', '')
            include_uncategorized = request.GET.get('include_uncategorized', 'false').lower() == 'true'

            # 查询admin用户的所有有效分类
            categories = Category.objects.filter(userid='admin', is_valid=True)
            
            # 如果有名称过滤条件
            if name:
                categories = categories.filter(name__icontains=name)

            # 按排序值和更新时间排序
            categories = categories.order_by('sort', '-created_at')

            # 准备返回数据
            result_list = []

            # 序列化分类数据
            for category in categories:
                # 统计该分类下的文章数量
                article_count = Article.objects.filter(
                    category=category, 
                    userid='admin', 
                    is_valid=True
                ).count()

                category_data = {
                    'category_id': category.category_id,
                    'name': category.name,
                    'description': category.description,
                    'sort': category.sort,
                    'article_count': article_count,
                    'created_at': category.created_at,
                    'updated_at': category.updated_at
                }
                result_list.append(category_data)

            # 如果需要包含未分类文章的统计
            if include_uncategorized:
                uncategorized_count = Article.objects.filter(
                    userid='admin', 
                    is_valid=True,
                    category__isnull=True
                ).count()
                
                # 添加未分类的虚拟分类
                result_list.append({
                    'category_id': 'uncategorized',  # 使用特殊标识
                    'name': '未分类',
                    'description': '未关联分类的文章',
                    'sort': 9999,  # 放在最后
                    'article_count': uncategorized_count,
                    'created_at': None,
                    'updated_at': None
                })

            return success_result(data=result_list)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class CategorySortView(APIView):
    """分类排序接口"""

    def put(self, request, category_id):
        try:
            # 获取排序参数
            sort = request.data.get('sort', 0)
            if not isinstance(sort, int) or sort < 1:
                return error_result(error=ErrorCode.PARAM_ERROR, message="排序参数必须是大于0的整数")

            # 获取要排序的分类
            category = get_object_or_404(Category, category_id=category_id, userid='admin', is_valid=True)

            # 获取当前所有有效分类
            all_categories = list(Category.objects.filter(
                userid='admin',
                is_valid=True
            ).order_by('sort', '-created_at'))

            # 找到当前分类在列表中的位置
            current_index = None
            for i, item in enumerate(all_categories):
                if item.category_id == category_id:
                    current_index = i
                    break

            if current_index is None:
                return error_result(error=ErrorCode.PARAM_ERROR, message="分类不存在")

            # 确保目标位置在有效范围内
            max_position = len(all_categories)
            target_position = min(max(sort, 1), max_position)
            target_index = target_position - 1  # 转换为0-based索引

            # 从列表中移除当前分类并插入到目标位置
            moved_category = all_categories.pop(current_index)
            all_categories.insert(target_index, moved_category)

            # 重新分配所有分类的sort值，确保连续且唯一
            for i, item in enumerate(all_categories):
                new_sort = i + 1  # 从1开始的连续整数
                if item.sort != new_sort:
                    item.sort = new_sort
                    item.save()

            return success_result()

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class CategoryUpdateView(APIView):
    """分类编辑接口"""

    def put(self, request, category_id):
        try:
            # 获取要编辑的分类
            category = get_object_or_404(Category, category_id=category_id, userid='admin', is_valid=True)
            
            # 使用序列化器验证和更新数据
            serializer = CategorySerializer(category, data=request.data, partial=True, context={'request': request})
            serializer.is_valid(raise_exception=True)
            
            # 保存更新
            updated_category = serializer.save()
            
            # 返回更新后的数据
            return success_result(data=CategorySerializer(updated_category).data)
            
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class CategoryDeleteView(APIView):
    """分类删除接口"""

    def delete(self, request, category_id):
        try:
            # 获取要删除的分类
            category = get_object_or_404(Category, category_id=category_id, userid='admin', is_valid=True)
            
            # 执行逻辑删除
            category.is_valid = False
            category.save()
            
            return success_result()
            
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class CategoryArticlesView(APIView):
    """获取分类下的文章列表接口"""
    pagination_class = CategoryPagination

    def get(self, request):
        try:
            # 获取查询参数
            category_id = request.GET.get('category_id', '')
            page_size = request.GET.get('page_size', 20)

            # 查询条件：默认查询admin用户的有效文章
            queryset = Article.objects.filter(userid='admin', is_valid=True)

            # 如果指定了分类ID
            if category_id:
                if category_id == 'uncategorized':
                    # 查询未分类的文章
                    queryset = queryset.filter(category__isnull=True)
                else:
                    # 查询指定分类的文章
                    category = get_object_or_404(Category, category_id=category_id, userid='admin', is_valid=True)
                    queryset = queryset.filter(category=category)
            # 否则查询所有文章

            # 排序：按更新时间降序
            queryset = queryset.order_by('-updated_at')

            # 分页
            paginator = CategoryPagination()
            paginator.page_size = int(page_size)
            result_page = paginator.paginate_queryset(queryset, request)

            # 准备返回数据
            articles_list = []
            for article in result_page:
                article_data = {
                    'article_id': article.article_id,
                    'title': article.title,
                    'content': article.content[:200] + '...' if len(article.content) > 200 else article.content,  # 内容摘要
                    'coll_id': article.coll_id,
                    'author': article.author,
                    'read_count': article.read_count,
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
