from django.contrib.auth import get_user_model
from rest_framework.views import APIView

from utils.response_utils import success_result
from utils.drf_utils import get_current_user_identifier
from memos.models import Memo
from .models import Notification
from .serializers import NotificationSerializer

User = get_user_model()


def get_notification_user(request):
    if request.user and request.user.is_authenticated:
        return request.user
    return User.objects.filter(username='admin').first()


class NotificationView(APIView):
    # permission_classes = [IsAuthenticated]
    # serializer_class = NotificationSerializer

    def get(self, request):
        # 只看自己的通知
        current_user = get_notification_user(request)
        msg_list = Notification.objects.filter(user=current_user)
        json_data = NotificationSerializer(msg_list, many=True).data
        return success_result(json_data)

    def post(self, request):
        # 只处理自己的通知
        current_user = get_notification_user(request)
        Notification.objects.filter(user=current_user).update(is_read=True)
        return success_result()


class NotificationDetailView(APIView):
    def patch(self, request, notification_id):
        current_user = get_notification_user(request)
        Notification.objects.filter(id=notification_id, user=current_user).update(is_read=True)
        return success_result()

    def delete(self, request, notification_id):
        current_user = get_notification_user(request)
        Notification.objects.filter(id=notification_id, user=current_user).delete()
        return success_result()


class MemoNotificationPushView(APIView):
    def post(self, request):
        current_user = get_notification_user(request)
        memo = Memo.objects.filter(
            user_id=get_current_user_identifier(request),
            is_valid=True
        ).order_by('?').first()

        if not current_user or not memo:
            return success_result(data=None)

        title = f"Memos · {memo.tag}" if memo.tag else "Memos 定时推送"
        notification = Notification.objects.create(
            user=current_user,
            title=title,
            content=memo.content,
            type='info',
            link='/memos'
        )
        return success_result(NotificationSerializer(notification).data)
