from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from utils.response_utils import success_result
from .models import Anthology
from .serializers import AnthologySerializer


class AnthologyCreateView(APIView):
    """创建文集接口"""

    def post(self, request):
        # 使用序列化器验证和保存数据
        serializer = AnthologySerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # 保存新的文集
        anthology = serializer.save()
        # 构建返回数据，包含自动生成的coll_id字段
        anthology_data = {
            'id': anthology.id,
            'coll_id': anthology.coll_id,  # 使用模型中自动生成的coll_id
            'title': anthology.title,
            'count': anthology.count,
            'icon': None,  # 前端会根据icon_id生成图标
            'isTop': anthology.is_top,
            'description': anthology.description,
            'articles': [],
            'permission': anthology.permission
        }
        # 使用统一的成功响应格式，使用预定义的成功错误码
        return success_result(data=anthology_data)


class AnthologyDetailView(APIView):
    """根据coll_id获取文集详情接口"""

    def get(self, request, coll_id):
        # 使用coll_id查询文集
        anthology = get_object_or_404(Anthology, coll_id=coll_id)

        # 构建返回数据
        anthology_data = {
            'id': anthology.id,
            'coll_id': anthology.coll_id,
            'title': anthology.title,
            'count': anthology.count,
            'icon': None,  # 前端会根据icon_id生成图标
            'isTop': anthology.is_top,
            'description': anthology.description,
            'articles': [],  # 这里可以根据需求添加文章列表
            'permission': anthology.permission
        }

        # 使用统一的成功响应格式，使用预定义的成功错误码
        return success_result(data=anthology_data)
