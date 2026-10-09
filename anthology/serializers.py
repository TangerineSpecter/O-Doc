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

    def validate(self, attrs):
        kind = attrs.get('type', self.instance.type if self.instance else 'article')
        if self.instance and kind != self.instance.type and 'learning' in (kind, self.instance.type):
            raise serializers.ValidationError('学习文集不能与其他类型互相转换')
        if kind == 'learning':
            if self.instance and attrs.get('permission') == 'public':
                raise serializers.ValidationError('学习文集一期仅限本人私密使用')
            if not self.context.get('request') or not self.context['request'].user.is_authenticated:
                raise serializers.ValidationError('请登录后创建学习文集')
            attrs['permission'] = 'private'
        return attrs
