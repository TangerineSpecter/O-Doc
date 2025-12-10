from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from article.models import Article
from utils.error_codes import ErrorCode
from utils.response_utils import success_result, error_result
from .models import Anthology
from .serializers import AnthologySerializer


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
        anthology = get_object_or_404(Anthology, coll_id=coll_id, userid='admin')

        # 使用统一的成功响应格式，使用预定义的成功错误码
        return success_result(data=anthology)


class AnthologyListView(APIView):
    """
    文集列表视图
    固定查询admin用户的所有文集，每个文集包含前3个文章
    """

    def get(self, request):
        try:
            # 查询admin用户的所有有效文集，按置顶、更新时间降序、排序升序排序
            anthologies = Anthology.objects.filter(userid='admin', is_valid=True).order_by('-is_top', 'sort')

            # 准备返回数据
            result_list = []

            for anthology in anthologies:
                # 查询该文集下的前3个有效文章，按排序、更新时间排序
                articles = Article.objects.filter(coll_id=anthology.coll_id, is_valid=True).order_by('sort',
                                                                                                     '-updated_at')[:3]

                # 构建文章摘要列表
                article_summaries = []
                for article in articles:
                    # 格式化日期为MM-DD格式
                    date_str = article.updated_at.strftime('%m-%d')
                    article_summaries.append({
                        'article_id': article.article_id,
                        'title': article.title,
                        'date': date_str
                    })

                # 构建文集数据
                anthology_data = {
                    'coll_id': anthology.coll_id,
                    'title': anthology.title,
                    'count': anthology.count,
                    'icon_id': anthology.icon_id,  # 返回icon_id，前端根据这个生成图标
                    'isTop': anthology.is_top,
                    'description': anthology.description,
                    'articles': article_summaries,
                    'permission': anthology.permission
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
            anthology = get_object_or_404(Anthology, coll_id=coll_id, userid='admin', is_valid=True)

            # 检查是否为置顶文集，如果是则不允许排序
            if anthology.is_top:
                return error_result(error=ErrorCode.PARAM_ERROR, message="置顶文集不允许排序")

            # 获取当前所有非置顶且有效的文集，按当前排序规则排序
            all_non_top_anthologies = list(Anthology.objects.filter(
                userid='admin',
                is_valid=True,
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
            anthology = get_object_or_404(Anthology, coll_id=coll_id, userid='admin', is_valid=True)
            
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
            anthology = get_object_or_404(Anthology, coll_id=coll_id, userid='admin', is_valid=True)
            
            # 执行逻辑删除
            anthology.is_valid = False
            anthology.save()
            
            return success_result()
            
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))
