import logging

from django.db.models import Q
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from system_settings.sync_state import permanent_deletion

from utils.drf_utils import get_current_user_identifier
from utils.error_codes import ErrorCode
from utils.rag_client import RagClient
from utils.response_utils import success_result, error_result
from .models import Memo
from .serializers import MemoSerializer
from .vector_sync import schedule_memo_vector_sync


logger = logging.getLogger(__name__)


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
        schedule_memo_vector_sync(str(memo.memo_id))
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
            schedule_memo_vector_sync(str(updated_memo.memo_id))
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
            RagClient.delete_memo(memo.memo_id)
            return success_result()
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class MemoTrashListView(APIView):
    """List the authenticated user's deleted memos."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        memos = Memo.objects.filter(
            user_id=get_current_user_identifier(request),
            is_valid=False,
        ).only('memo_id', 'content', 'tag', 'created_at', 'updated_at').order_by('-updated_at')
        return success_result(data=[
            {
                'item_type': 'memo',
                'id': memo.memo_id,
                'memo_id': memo.memo_id,
                'preview': memo.content[:360].strip(),
                'tag': memo.tag,
                'created_at': memo.created_at,
                # updated_at is already refreshed by the existing soft-delete path.
                'deleted_at': memo.updated_at,
            }
            for memo in memos
        ])


class MemoTrashRestoreView(APIView):
    """Restore a deleted memo on its owning account."""

    permission_classes = [IsAuthenticated]

    def post(self, request, memo_id):
        with transaction.atomic():
            memo = get_object_or_404(
                Memo.objects.select_for_update(),
                memo_id=memo_id,
                user_id=get_current_user_identifier(request),
                is_valid=False,
            )
            memo.is_valid = True
            memo.save()
        # Vector rebuilding is intentionally left to the existing manual/background sync.
        return success_result(data={'memo_id': memo.memo_id})


class MemoTrashPurgeView(APIView):
    """Permanently delete a memo and record its sync-v2 tombstone."""

    permission_classes = [IsAuthenticated]

    def delete(self, request, memo_id):
        with transaction.atomic():
            memo = get_object_or_404(
                Memo.objects.select_for_update(),
                memo_id=memo_id,
                user_id=get_current_user_identifier(request),
                is_valid=False,
            )
            with permanent_deletion():
                memo.delete()
        return success_result()


class MemoVectorSyncView(APIView):
    """同步当前用户历史闪念向量"""

    def post(self, request):
        try:
            memos = list(get_current_user_memo_queryset(request).order_by('-updated_at'))
            synced_count = RagClient.sync_memos(memos)
            return success_result(data={
                "total_count": len(memos),
                "synced_count": synced_count,
            })
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class MemoKnowledgeGraphView(APIView):
    """闪念知识图谱接口"""

    def get(self, request):
        try:
            keyword = request.GET.get('keyword', '').strip()
            tag = request.GET.get('tag', '').strip()
            creator_type = request.GET.get('creator_type', '').strip()
            creator_id = request.GET.get('creator_id', '').strip()
            creator_name = request.GET.get('creator_name', '').strip()
            limit = min(int(request.GET.get('limit', 80) or 80), 160)
            threshold = float(request.GET.get('threshold', 0.72) or 0.72)

            memos = get_current_user_memo_queryset(request)

            if keyword:
                memos = memos.filter(Q(content__icontains=keyword) | Q(tag__icontains=keyword))

            if tag:
                memos = memos.filter(Q(tag=tag) | Q(tag__startswith=f'{tag}/'))

            if creator_type:
                memos = memos.filter(creator_type=creator_type)
            if creator_id:
                memos = memos.filter(creator_id=creator_id)
            elif creator_name:
                memos = memos.filter(creator_name=creator_name)

            memo_list = list(memos.order_by('-is_pinned', '-created_at')[:limit])
            RagClient.sync_memos(memo_list)

            serialized_memos = MemoSerializer(memo_list, many=True).data
            memo_nodes = []
            tag_nodes = {}
            links = []

            for memo, serialized in zip(memo_list, serialized_memos):
                memo_id = str(memo.memo_id)
                content = (memo.content or '').strip()
                memo_nodes.append({
                    "id": memo_id,
                    "name": content[:24] + ('...' if len(content) > 24 else ''),
                    "category": "memo",
                    "value": len(content),
                    "symbol_size": 18 + min(24, max(0, len(content) // 45)) + (6 if memo.is_pinned else 0),
                    "memo": serialized,
                })

                normalized_tag = (memo.tag or '').strip()
                if normalized_tag:
                    parts = [part.strip() for part in normalized_tag.split('/') if part.strip()]
                    for index in range(len(parts)):
                        tag_path = '/'.join(parts[:index + 1])
                        tag_id = f'tag:{tag_path}'
                        tag_nodes[tag_id] = {
                            "id": tag_id,
                            "name": tag_path,
                            "category": "tag",
                            "value": tag_nodes.get(tag_id, {}).get("value", 0) + 1,
                            "symbol_size": 20 + min(18, tag_nodes.get(tag_id, {}).get("value", 0) * 2),
                        }

                    links.append({
                        "source": memo_id,
                        "target": f'tag:{normalized_tag}',
                        "relation": "标签",
                        "value": 2,
                    })

            semantic_links = RagClient.build_memo_similarity_links(
                memo_list,
                threshold=max(0.1, min(0.98, threshold)),
                max_neighbors=4
            )

            return success_result(data={
                "nodes": memo_nodes + list(tag_nodes.values()),
                "links": links + semantic_links,
                "stats": {
                    "memo_count": len(memo_nodes),
                    "tag_count": len(tag_nodes),
                    "semantic_link_count": len(semantic_links),
                }
            })
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))
