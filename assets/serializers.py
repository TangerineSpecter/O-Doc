from rest_framework import serializers
from .models import Asset


class AssetSerializer(serializers.ModelSerializer):
    """资源序列化器"""
    # 计算属性，不需要存储到数据库
    formatted_size = serializers.ReadOnlyField()
    download_url = serializers.ReadOnlyField()
    sourceArticle = serializers.SerializerMethodField()
    
    class Meta:
        model = Asset
        fields = ['id', 'name', 'original_name', 'file_type', 'file_size', 'formatted_size', 
                  'file_path', 'file_extension', 'mime_type', 'uploader', 'linked_article', 
                  'is_linked', 'is_valid', 'upload_time', 'update_time', 'file_hash', 'metadata',
                  'download_url', 'sourceArticle']
        read_only_fields = ['is_valid', 'upload_time', 'update_time', 'formatted_size', 
                           'download_url', 'sourceArticle']
    
    def get_sourceArticle(self, obj):
        """获取关联文章信息"""
        return obj.get_source_info()
    
    def validate(self, attrs):
        """验证数据"""
        # 确保文件大小为正数
        if 'file_size' in attrs and attrs['file_size'] <= 0:
            raise serializers.ValidationError("文件大小必须大于0")
        
        return attrs