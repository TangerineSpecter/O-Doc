from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    # 格式化时间，让前端显示更友好
    created_at = serializers.DateTimeField(format="%Y-%m-%d %H:%M:%S", read_only=True)
    deleted_at = serializers.DateTimeField(format="%Y-%m-%d %H:%M:%S", read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'title', 'content', 'type', 'link', 'is_read', 'is_deleted', 'created_at', 'deleted_at']
        read_only_fields = ['id', 'created_at', 'deleted_at', 'user']  # user 由后端自动从 request 获取，不需要前端传
