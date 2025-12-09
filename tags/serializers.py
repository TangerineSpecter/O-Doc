from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from utils.drf_utils import CurrentUserOrAdminDefault
from .models import Tag


class TagSerializer(serializers.ModelSerializer):
    """标签序列化器"""

    # 用户ID默认值（使用当前登录用户或admin）
    userid = serializers.HiddenField(
        default=CurrentUserOrAdminDefault()
    )

    class Meta:
        model = Tag
        fields = ['tag_id', 'name', 'theme_id', 'userid', 'is_valid', 'sort', 'created_at', 'updated_at']
        read_only_fields = ['tag_id', 'is_valid', 'created_at', 'updated_at']

        validators = [
            UniqueTogetherValidator(
                queryset=Tag.objects.all(),
                fields=['userid', 'name'],
                message="标签名称已存在"
            )
        ]

    def validate_name(self, value):
        # 检查名称长度
        if len(value) > 10:
            raise serializers.ValidationError("标签名称不能超过10个字符")

        return value
