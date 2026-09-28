from rest_framework import serializers
from .models import Asset


class AssetSerializer(serializers.ModelSerializer):
    """资源序列化器"""
    # 计算属性，不需要存储到数据库
    formatted_size = serializers.ReadOnlyField()
    download_url = serializers.ReadOnlyField()
    sourceArticle = serializers.SerializerMethodField()
    # file_path和linked_article字段只用于写入数据库，不暴露给前端
    file_path = serializers.CharField(write_only=True)
    linked_article = serializers.CharField(write_only=True, required=False)
    
    class Meta:
        model = Asset
        fields = ['id', 'name', 'original_name', 'file_type', 'file_size', 'formatted_size', 
                  'file_path', 'file_extension', 'mime_type', 'uploader', 'linked_article', 
                  'is_linked', 'is_valid', 'upload_time', 'update_time', 'file_hash', 'metadata',
                  'download_url', 'sourceArticle', 'source_type']
        read_only_fields = ['is_valid', 'upload_time', 'update_time', 'formatted_size', 
                           'download_url', 'sourceArticle']
    
    def get_sourceArticle(self, obj):
        """获取关联文章信息"""
        return obj.get_source_info()
    
    def validate(self, attrs):
        """验证数据"""
        if self.instance and self.instance.source_type == "item_icon":
            if set(attrs) - {"name"}:
                raise serializers.ValidationError("物品图标文件不可覆盖，请使用专用图标接口")
        elif attrs.get("source_type") == "item_icon":
            raise serializers.ValidationError("请使用专用物品图标上传接口")
        # 确保文件大小为正数
        if 'file_size' in attrs and attrs['file_size'] <= 0:
            raise serializers.ValidationError("文件大小必须大于0")
        
        return attrs