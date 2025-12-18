from django.contrib.auth import get_user_model
from rest_framework.decorators import action
from rest_framework.views import APIView

from utils.response_utils import success_result
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
