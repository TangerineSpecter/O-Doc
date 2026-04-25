from rest_framework import serializers

from utils.drf_utils import CurrentUserOrAdminDefault
from .models import Memo


class MemoSerializer(serializers.ModelSerializer):
    """闪念备忘序列化器"""

    user_id = serializers.HiddenField(default=CurrentUserOrAdminDefault())

    class Meta:
        model = Memo
        fields = [
            'memo_id',
            'content',
            'tag',
            'is_pinned',
            'user_id',
            'is_valid',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['memo_id', 'is_valid', 'created_at', 'updated_at']

    def validate_content(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("内容不能为空")
        if len(value) > 2000:
            raise serializers.ValidationError("内容不能超过2000个字符")
        return value.strip()
