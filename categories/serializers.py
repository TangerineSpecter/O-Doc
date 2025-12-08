from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from utils.drf_utils import CurrentUserOrAdminDefault
from .models import Category


class CategorySerializer(serializers.ModelSerializer):
    """分类序列化器"""
    userid = serializers.HiddenField(
        default=CurrentUserOrAdminDefault()
    )

    class Meta:
        model = Category
        fields = ['category_id', 'name', 'description', 'userid', 'is_valid', 'sort', 'created_at', 'updated_at']

        validators = [
            UniqueTogetherValidator(
                queryset=Category.objects.all(),
                fields=['userid', 'name'],
                message="该分类名称已存在"  # 自定义错误提示文字
            )
        ]

    def validate_name(self, value):
        """验证分类名称长度"""
        if len(value) > 10:
            raise serializers.ValidationError("分类名称不能超过10个字符")
        return value

    def validate_description(self, value):
        """验证分类描述长度"""
        if value and len(value) > 100:
            raise serializers.ValidationError("分类描述不能超过100个字符")
        return value
