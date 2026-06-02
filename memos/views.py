from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from utils.drf_utils import get_current_user_identifier
from utils.error_codes import ErrorCode
from utils.response_utils import success_result, error_result
from .models import Memo
from .serializers import MemoSerializer


def get_current_user_memo_queryset(request):
    return Memo.objects.filter(
        user_id=get_current_user_identifier(request),
        is_valid=True
    )


class MemoListView(APIView):
    """闪念列表接口"""

    def get(self, request):
        try:
            keyword = request.GET.get('keyword', '').strip()

            memos = get_current_user_memo_queryset(request)

            if keyword:
                memos = memos.filter(Q(content__icontains=keyword) | Q(tag__icontains=keyword))

            memos = memos.order_by('-is_pinned', '-created_at')
            return success_result(data=MemoSerializer(memos, many=True).data)
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class MemoCreateView(APIView):
    """创建闪念接口"""

    def post(self, request):
        serializer = MemoSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        memo = serializer.save()
        return success_result(data=MemoSerializer(memo).data)


class MemoDetailView(APIView):
    """闪念详情接口"""

    def get(self, request, memo_id):
        memo = get_object_or_404(get_current_user_memo_queryset(request), memo_id=memo_id)
        return success_result(data=MemoSerializer(memo).data)


class MemoUpdateView(APIView):
    """更新闪念接口"""

    def put(self, request, memo_id):
        try:
            memo = get_object_or_404(get_current_user_memo_queryset(request), memo_id=memo_id)
            serializer = MemoSerializer(memo, data=request.data, partial=True, context={'request': request})
            serializer.is_valid(raise_exception=True)
            updated_memo = serializer.save()
            return success_result(data=MemoSerializer(updated_memo).data)
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class MemoDeleteView(APIView):
    """删除闪念接口"""

    def delete(self, request, memo_id):
        try:
            memo = get_object_or_404(get_current_user_memo_queryset(request), memo_id=memo_id)
            memo.is_valid = False
            memo.save()
            return success_result()
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))
