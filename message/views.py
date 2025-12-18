from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

from utils.response_utils import success_result
from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        # 只看自己的通知
        return Notification.objects.filter(user='admin')

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """一键已读"""
        self.get_queryset().update(is_read=True)
        return success_result()
