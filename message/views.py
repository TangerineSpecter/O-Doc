from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from utils.response_utils import success_result
from utils.drf_utils import get_current_user_identifier
from memos.models import Memo
from .models import Notification
from .serializers import NotificationSerializer


def get_notification_queryset(user, status='unread'):
    queryset = Notification.objects.filter(user=user)
    if status == 'deleted':
        return queryset.filter(is_deleted=True)
    queryset = queryset.filter(is_deleted=False)
    if status == 'read':
        return queryset.filter(is_read=True)
    if status == 'all':
        return queryset
    return queryset.filter(is_read=False)


class NotificationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # 只看自己的通知
        status = request.query_params.get('status', 'unread')
        msg_list = get_notification_queryset(request.user, status)
        json_data = NotificationSerializer(msg_list, many=True).data
        return success_result(json_data)

    def post(self, request):
        # 只处理自己的通知
        Notification.objects.filter(user=request.user, is_deleted=False).update(is_read=True)
        return success_result()


class NotificationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, notification_id):
        Notification.objects.filter(id=notification_id, user=request.user, is_deleted=False).update(is_read=True)
        return success_result()

    def delete(self, request, notification_id):
        Notification.objects.filter(id=notification_id, user=request.user, is_deleted=False).update(
            is_deleted=True,
            deleted_at=timezone.now()
        )
        return success_result()


class NotificationRestoreView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, notification_id):
        Notification.objects.filter(id=notification_id, user=request.user, is_deleted=True).update(
            is_deleted=False,
            deleted_at=None
        )
        return success_result()


class NotificationPermanentDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, notification_id):
        Notification.objects.filter(id=notification_id, user=request.user, is_deleted=True).delete()
        return success_result()


class NotificationTrashView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        Notification.objects.filter(user=request.user, is_deleted=True).delete()
        return success_result()


class MemoNotificationPushView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        memo = Memo.objects.filter(
            user_id=get_current_user_identifier(request),
            is_valid=True
        ).order_by('?').first()

        if not memo:
            return success_result(data=None)

        title = f"Memos · {memo.tag}" if memo.tag else "Memos 定时推送"
        notification = Notification.objects.create(
            user=request.user,
            title=title,
            content=memo.content,
            type='info',
            link='/memos'
        )
        return success_result(NotificationSerializer(notification).data)
