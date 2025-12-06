from rest_framework import serializers
from article.models import Article
from djangorestframework_camel_case.util import camelize, underscoreize

class ArticleSerializer(serializers.ModelSerializer):
    """
    文章序列化器
    """
    class Meta:
        model = Article
        fields = [
            'id', 'article_id', 'title', 'content', 'coll_id',
            'author', 'created_at', 'updated_at', 'permission', 'is_valid',
            'read_count', 'category_id', 'sort'
        ]
        # 只读字段
        read_only_fields = ['id', 'article_id', 'created_at', 'updated_at', 'read_count']
        
    def to_internal_value(self, data):
        # 将前端的驼峰命名转换为后端的下划线命名
        data = underscoreize(data)
        return super().to_internal_value(data)
    
    def to_representation(self, instance):
        # 将后端的下划线命名转换为前端的驼峰命名
        data = super().to_representation(instance)
        return camelize(data)
