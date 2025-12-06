from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from utils.drf_utils import CurrentUserOrAdminDefault
from .models import Anthology


class AnthologySerializer(serializers.ModelSerializer):
    """文集序列化器"""
    userid = serializers.HiddenField(
        default=CurrentUserOrAdminDefault()
    )

    class Meta:
        model = Anthology
        fields = ['coll_id', 'title', 'description', 'icon_id', 'userid', 'permission', 'is_top', 'count', 'created_at',
                  'updated_at']

        validators = [
            UniqueTogetherValidator(
                queryset=Anthology.objects.all(),
                fields=['userid', 'title'],
                message="该文集名称已存在"  # 自定义错误提示文字
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
