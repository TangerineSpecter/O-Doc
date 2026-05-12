from django.contrib.auth import get_user_model
from rest_framework.views import APIView

from utils.response_utils import success_result
from memos.models import Memo
from .models import Notification
from .serializers import NotificationSerializer

User = get_user_model()


class NotificationView(APIView):
    # permission_classes = [IsAuthenticated]
    # serializer_class = NotificationSerializer

    def get(self, request):
        # 只看自己的通知
        admin_user = User.objects.filter(username='admin').first()
        msg_list = Notification.objects.filter(user=admin_user)
        json_data = NotificationSerializer(msg_list, many=True).data
        return success_result(json_data)

    def post(self, request):
        # 只处理自己的通知
        admin_user = User.objects.filter(username='admin').first()
        Notification.objects.filter(user=admin_user).update(is_read=True)
        return success_result()


class NotificationDetailView(APIView):
    def patch(self, request, notification_id):
        admin_user = User.objects.filter(username='admin').first()
        Notification.objects.filter(id=notification_id, user=admin_user).update(is_read=True)
        return success_result()

    def delete(self, request, notification_id):
        admin_user = User.objects.filter(username='admin').first()
        Notification.objects.filter(id=notification_id, user=admin_user).delete()
        return success_result()


class MemoNotificationPushView(APIView):
    def post(self, request):
        admin_user = User.objects.filter(username='admin').first()
        memo = Memo.objects.filter(user_id='admin', is_valid=True).order_by('?').first()

        if not admin_user or not memo:
            return success_result(data=None)

        title = f"Memos · {memo.tag}" if memo.tag else "Memos 定时推送"
        notification = Notification.objects.create(
            user=admin_user,
            title=title,
            content=memo.content,
            type='info',
            link='/memos'
        )
        return success_result(NotificationSerializer(notification).data)
