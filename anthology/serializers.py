from rest_framework import serializers
from .models import Anthology

class AnthologySerializer(serializers.ModelSerializer):
    """文集序列化器"""
    class Meta:
        model = Anthology
        fields = ['coll_id', 'title', 'description', 'icon_id', 'permission', 'is_top', 'count', 'created_at', 'updated_at']
        
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