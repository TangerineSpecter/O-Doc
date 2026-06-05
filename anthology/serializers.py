from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from utils.drf_utils import CurrentUserOrAdminDefault
from .models import Anthology


class AnthologySerializer(serializers.ModelSerializer):
    """文集序列化器"""
    user_id = serializers.HiddenField(
        default=CurrentUserOrAdminDefault()
    )

    class Meta:
        model = Anthology
        fields = ['coll_id', 'title', 'description', 'icon_id', 'user_id', 'permission', 'is_top', 'hide_cover_content',
                  'rag_not_synced_count', 'count', 'created_at', 'updated_at', 'type']

        validators = [
            UniqueTogetherValidator(
                queryset=Anthology.objects.all(),
                fields=['user_id', 'title', 'type'],
                message="同类型下文集名称不能重复"  # 自定义错误提示文字
            )
        ]

    def validate_title(self, value):
        """验证标题长度"""
        if len(value) > 20:
            raise serializers.ValidationError("文集名称不能超过20个字符")
        return value

    def validate_description(self, value):
        """验证简介长度"""
        if value and len(value) > 100:
            raise serializers.ValidationError("文集简介不能超过100个字符")
        return value
