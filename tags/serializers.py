from rest_framework import serializers
from .models import Tag
from utils.response_utils import error_result
from utils.error_codes import ErrorCode


class TagSerializer(serializers.ModelSerializer):
    """标签序列化器"""
    
    # 用户ID默认值（使用当前登录用户或admin）
    userid = serializers.CharField(default='admin', required=False)
    
    class Meta:
        model = Tag
        fields = ['tag_id', 'name', 'userid', 'is_valid', 'sort', 'created_at', 'updated_at']
        read_only_fields = ['tag_id', 'is_valid', 'created_at', 'updated_at']
    
    def validate_name(self, value):
        """验证标签名称是否唯一"""
        # 检查名称是否已存在
        if Tag.objects.filter(name=value, userid='admin', is_valid=True).exists():
            raise serializers.ValidationError("标签名称已存在")
        
        # 检查名称长度
        if len(value) > 10:
            raise serializers.ValidationError("标签名称不能超过10个字符")
            
        return value
    
    def create(self, validated_data):
        """创建新标签"""
        # 设置默认用户ID为admin
        validated_data['userid'] = 'admin'
        
        # 创建并返回标签
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """更新标签"""
        # 检查名称是否已存在（排除当前标签）
        if 'name' in validated_data:
            name = validated_data['name']
            if Tag.objects.filter(name=name, userid='admin', is_valid=True).exclude(tag_id=instance.tag_id).exists():
                raise serializers.ValidationError("标签名称已存在")
        
        # 更新标签
        return super().update(instance, validated_data)