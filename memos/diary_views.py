from django.shortcuts import get_object_or_404
from rest_framework.exceptions import MethodNotAllowed, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result
from .diary_models import DiaryEntry
from .diary_serializers import DiarySerializer


class DiaryView(APIView):
    permission_classes = [IsAuthenticated]

    def handle_exception(self, exc):
        response = super().handle_exception(exc)
        if isinstance(exc, ValidationError):
            response.status_code = 400
        if 'code' not in response.data:
            response.data = {'code': response.status_code, 'msg': str(response.data.get('detail', '请求失败')), 'data': None}
        return response

    def entries(self, request):
        return DiaryEntry.objects.filter(user_id=get_current_user_identifier(request), is_valid=True).select_related('cover_asset')

    def get(self, request, diary_id=None):
        entries = self.entries(request)
        if diary_id:
            return success_result(data=DiarySerializer(get_object_or_404(entries, pk=diary_id)).data)
        return success_result(data=DiarySerializer(entries, many=True).data)

    def post(self, request, diary_id=None):
        if diary_id is not None:
            raise MethodNotAllowed('POST')
        serializer = DiarySerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        return success_result(data=DiarySerializer(serializer.save()).data)

    def put(self, request, diary_id=None):
        if diary_id is None:
            raise MethodNotAllowed('PUT')
        entry = get_object_or_404(self.entries(request), pk=diary_id)
        serializer = DiarySerializer(entry, data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        return success_result(data=DiarySerializer(serializer.save()).data)

    def delete(self, request, diary_id=None):
        if diary_id is None:
            raise MethodNotAllowed('DELETE')
        entry = get_object_or_404(self.entries(request), pk=diary_id)
        entry.is_valid = False
        entry.save(update_fields=['is_valid', 'updated_at'])
        return success_result()
