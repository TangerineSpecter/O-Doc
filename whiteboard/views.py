from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.views import APIView

from utils.drf_utils import get_current_user_identifier
from utils.error_codes import ErrorCode
from utils.response_utils import error_result, success_result
from system_settings.sync_state import suspend_tracking
from .models import Whiteboard
from .serializers import WhiteboardSerializer
from .services import MAX_DOCUMENTS_PER_IMPORT, normalize_document_payload, normalize_timestamp


def current_user_whiteboards(request):
    return Whiteboard.objects.filter(user_id=get_current_user_identifier(request), is_valid=True)


class WhiteboardListView(APIView):
    def get(self, request):
        return success_result(data=WhiteboardSerializer(current_user_whiteboards(request), many=True).data)


class WhiteboardCreateView(APIView):
    def post(self, request):
        serializer = WhiteboardSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        return success_result(data=WhiteboardSerializer(serializer.save()).data)


class WhiteboardDetailView(APIView):
    def get(self, request, whiteboard_id):
        whiteboard = get_object_or_404(current_user_whiteboards(request), id=whiteboard_id)
        return success_result(data=WhiteboardSerializer(whiteboard).data)


class WhiteboardUpdateView(APIView):
    def put(self, request, whiteboard_id):
        whiteboard = get_object_or_404(current_user_whiteboards(request), id=whiteboard_id)
        serializer = WhiteboardSerializer(whiteboard, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        return success_result(data=WhiteboardSerializer(serializer.save()).data)


class WhiteboardDeleteView(APIView):
    def delete(self, request, whiteboard_id):
        whiteboard = get_object_or_404(current_user_whiteboards(request), id=whiteboard_id)
        whiteboard.is_valid = False
        whiteboard.save(update_fields=['is_valid', 'updated_at'])
        return success_result()


class WhiteboardLegacyImportView(APIView):
    """一次性导入旧版浏览器 localStorage 中的白板。"""

    def post(self, request):
        documents = request.data.get('documents', [])
        if not isinstance(documents, list) or len(documents) > MAX_DOCUMENTS_PER_IMPORT:
            return error_result(error=ErrorCode.PARAM_ERROR, data=f'一次最多导入 {MAX_DOCUMENTS_PER_IMPORT} 张白板')

        user_id = get_current_user_identifier(request)
        prepared_documents = []
        seen_ids = set()
        for document in documents:
            document_id = document.get('id') if isinstance(document, dict) else None
            if not isinstance(document_id, str) or not document_id.strip():
                return error_result(error=ErrorCode.PARAM_ERROR, data='旧白板缺少 ID')

            normalized_id = document_id.strip()[:32]
            if normalized_id in seen_ids:
                return error_result(error=ErrorCode.PARAM_ERROR, data=f'旧白板 ID 重复：{normalized_id}')
            seen_ids.add(normalized_id)

            existing = Whiteboard.objects.filter(id=normalized_id).first()
            if existing:
                if existing.user_id != user_id:
                    return error_result(error=ErrorCode.PARAM_ERROR, data=f'旧白板 ID 已被其他用户占用：{normalized_id}')
                continue

            try:
                payload = normalize_document_payload(document)
            except ValueError as exc:
                return error_result(error=ErrorCode.PARAM_ERROR, data=str(exc))
            created_at = normalize_timestamp(document.get('createdAt', document.get('created_at'))) or timezone.now()
            updated_at = normalize_timestamp(document.get('updatedAt', document.get('updated_at'))) or created_at
            prepared_documents.append((normalized_id, payload, created_at, updated_at))

        imported = []
        with transaction.atomic():
            for document_id, payload, created_at, updated_at in prepared_documents:
                # 首次生成同步修订时沿用旧数据的更新时间，而不是导入时刻。
                with suspend_tracking():
                    whiteboard = Whiteboard.objects.create(
                        id=document_id,
                        user_id=user_id,
                        created_at=created_at,
                        **payload,
                    )
                    Whiteboard.objects.filter(pk=document_id).update(
                        created_at=created_at,
                        updated_at=updated_at,
                    )
                whiteboard.refresh_from_db()
                imported.append(whiteboard)
        return success_result(data={
            'imported_count': len(imported),
            'documents': WhiteboardSerializer(imported, many=True).data,
        })
