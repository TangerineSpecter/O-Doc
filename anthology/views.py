from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from article.models import Article, Image
from utils.drf_utils import get_current_user_identifier
from utils.error_codes import ErrorCode
from utils.response_utils import success_result, error_result
from .models import Anthology
from .serializers import AnthologySerializer


def get_visible_anthology_queryset(request):
    """
    游客只能访问公开文集；登录用户可访问公开文集和自己创建的私密文集。
    当前系统的 admin 业务用户通过 get_current_user_identifier 兼容为 user_id='admin'。
    """
    queryset = Anthology.objects.filter(is_valid=True)

    if request.user and request.user.is_authenticated:
        current_user_id = get_current_user_identifier(request)
        return queryset.filter(Q(permission='public') | Q(user_id=current_user_id))

    return queryset.filter(permission='public')


def get_owned_anthology_queryset(request):
    return Anthology.objects.filter(
        user_id=get_current_user_identifier(request),
        is_valid=True
    )


class AnthologyCreateView(APIView):
    """创建文集接口"""

    def post(self, request):
        # time.sleep(10)
        # 使用序列化器验证和保存数据
        serializer = AnthologySerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # 保存新的文集
        anthology = serializer.save()

        # 使用统一的成功响应格式，使用预定义的成功错误码
        json_data = AnthologySerializer(anthology).data
        return success_result(json_data)


class AnthologyDetailView(APIView):
    """根据coll_id获取文集详情接口"""

    def get(self, request, coll_id):
        # 使用coll_id查询文集
        anthology = get_object_or_404(get_visible_anthology_queryset(request), coll_id=coll_id)

        # 使用序列化器将文集对象转换为JSON格式
        json_data = AnthologySerializer(anthology).data

        # 使用统一的成功响应格式，使用预定义的成功错误码
        return success_result(json_data)


class AnthologyListView(APIView):
    """
    文集列表视图
    游客查询公开文集；登录用户查询公开文集和自己创建的私密文集，每个文集包含前3个文章
    """

    def get(self, request):
        try:
            # 获取筛选参数
            coll_type = request.query_params.get('type')

            anthologies = get_visible_anthology_queryset(request)
            if coll_type:
                anthologies = anthologies.filter(type=coll_type)

            # 查询用户可见的有效文集，按置顶、排序升序排序
            anthologies = anthologies.order_by('-is_top', 'sort')

            # 准备返回数据
            result_list = []

            for anthology in anthologies:
                item_summaries = []
                item_count = anthology.count
                if anthology.type == 'image':
                    image_qs = Image.objects.filter(coll_id=anthology.coll_id, is_valid=True)
                    item_count = image_qs.count()
                    images = image_qs.order_by('-created_at')[:3]
                    for image in images:
                        item_summaries.append({
                            'image_id': image.image_id,
                            'title': image.title,
                            'image_url': image.image_url,
                            'date': image.created_at.strftime('%m-%d')
                        })
                else:
                    # 查询该文集下的前3个有效文章，按排序、更新时间排序
                    articles = Article.objects.filter(coll_id=anthology.coll_id, is_valid=True).order_by('sort',
                                                                                                         '-updated_at')[:3]

                    # 构建文章摘要列表
                    for article in articles:
                        # 格式化日期为MM-DD格式
                        date_str = article.updated_at.strftime('%m-%d')
                        item_summaries.append({
                            'article_id': article.article_id,
                            'title': article.title,
                            'date': date_str
                        })

                # 构建文集数据
                anthology_data = {
                    'coll_id': anthology.coll_id,
                    'title': anthology.title,
                    'count': item_count,
                    'rag_not_synced_count': anthology.rag_not_synced_count,
                    'icon_id': anthology.icon_id,
                    'isTop': anthology.is_top,
                    'description': anthology.description,
                    'articles': item_summaries,
                    'permission': anthology.permission,
                    'type': anthology.type
                }

                result_list.append(anthology_data)

            return success_result(data=result_list)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class AnthologySortView(APIView):
    """文集排序接口"""

    def put(self, request, coll_id):
        try:
            # 获取排序参数
            sort = request.data.get('sort', 0)
            if not isinstance(sort, int) or sort < 1:
                return error_result(error=ErrorCode.PARAM_ERROR, message="排序参数必须是大于0的整数")

            # 获取要排序的文集
            anthology = get_object_or_404(get_owned_anthology_queryset(request), coll_id=coll_id)

            # 检查是否为置顶文集，如果是则不允许排序
            if anthology.is_top:
                return error_result(error=ErrorCode.PARAM_ERROR, message="置顶文集不允许排序")

            # 获取当前所有非置顶且有效的文集，按当前排序规则排序
            all_non_top_anthologies = list(get_owned_anthology_queryset(request).filter(
                is_top=False
            ).order_by('-updated_at', 'sort'))

            # 找到当前文集在列表中的位置
            current_index = None
            for i, item in enumerate(all_non_top_anthologies):
                if item.coll_id == coll_id:
                    current_index = i
                    break

            if current_index is None:
                return error_result(error=ErrorCode.PARAM_ERROR, message="文集不存在")

            # 确保目标位置在有效范围内
            max_position = len(all_non_top_anthologies)
            target_position = min(max(sort, 1), max_position)
            target_index = target_position - 1  # 转换为0-based索引

            # 从列表中移除当前文集并插入到目标位置
            moved_anthology = all_non_top_anthologies.pop(current_index)
            all_non_top_anthologies.insert(target_index, moved_anthology)

            # 重新分配所有文集的sort值，确保连续且唯一
            for i, item in enumerate(all_non_top_anthologies):
                new_sort = i + 1  # 从1开始的连续整数
                if item.sort != new_sort:
                    item.sort = new_sort
                    item.save()

            return success_result()

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class AnthologyUpdateView(APIView):
    """文集编辑接口"""

    def put(self, request, coll_id):
        try:
            # 获取要编辑的文集
            anthology = get_object_or_404(get_owned_anthology_queryset(request), coll_id=coll_id)

            # 使用序列化器验证和更新数据
            serializer = AnthologySerializer(anthology, data=request.data, partial=True, context={'request': request})
            serializer.is_valid(raise_exception=True)

            # 保存更新
            updated_anthology = serializer.save()

            # 返回更新后的数据
            return success_result(data=AnthologySerializer(updated_anthology).data)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class AnthologyDeleteView(APIView):
    """文集删除接口"""

    def delete(self, request, coll_id):
        try:
            # 获取要删除的文集
            anthology = get_object_or_404(get_owned_anthology_queryset(request), coll_id=coll_id)

            # 执行逻辑删除
            anthology.is_valid = False
            anthology.save()

            return success_result()

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))
