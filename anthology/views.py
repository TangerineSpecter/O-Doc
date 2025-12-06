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
            # 查询admin用户的所有有效文集，按置顶、排序、更新时间排序
            anthologies = Anthology.objects.filter(userid='admin', is_valid=True).order_by('-is_top', 'sort',
                                                                                           '-updated_at')

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
                    'id': anthology.id,
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
