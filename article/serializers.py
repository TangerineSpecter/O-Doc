from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from article.models import Article
from categories.models import Category
from utils.drf_utils import CurrentUserOrAdminDefault


class ArticleSerializer(serializers.ModelSerializer):
    """
    文章序列化器
    """
    # 标签字段，接收前端传递的标签名称数组
    tags = serializers.ListField(
        child=serializers.CharField(max_length=30),
        allow_null=True,
        allow_empty=True,
        required=False,
        write_only=True
    )
    
    # 作者字段，设置默认值为"admin"
    author = serializers.HiddenField(
        default=CurrentUserOrAdminDefault()
    )

    class Meta:
        model = Article
        fields = [
            'id', 'article_id', 'title', 'content', 'coll_id',
            'author', 'created_at', 'updated_at', 'permission', 'is_valid',
            'read_count', 'category_id', 'sort', 'parent_id', 'tags'
        ]
        # 只读字段
        read_only_fields = ['id', 'article_id', 'created_at', 'updated_at', 'read_count']

        validators = [
            UniqueTogetherValidator(
                queryset=Article.objects.all(),
                fields=['author', 'coll_id', 'title'],
                message="文章标题已存在"
            )
        ]

    def validate_category_id(self, value):
        # 验证category_id是否存在于categories表中
        if value:
            try:
                Category.objects.get(category_id=value)
            except Category.DoesNotExist:
                raise serializers.ValidationError(f"Category with ID '{value}' does not exist")
        return value

    def validate_parent(self, value):
        # 验证parent_id是否存在于Article表中
        if value:
            try:
                Article.objects.get(article_id=value)
            except Article.DoesNotExist:
                raise serializers.ValidationError(f"Parent article with ID '{value}' does not exist")
        return value


class ArticleTreeSerializer(serializers.ModelSerializer):
    """
    树形结构文章序列化器
    """
    children = serializers.SerializerMethodField()

    class Meta:
        model = Article
        fields = [
            'id', 'article_id', 'title', 'content', 'coll_id',
            'author', 'created_at', 'updated_at', 'permission', 'is_valid',
            'read_count', 'category_id', 'sort', 'parent_id', 'children'
        ]
        # 只读字段
        read_only_fields = ['id', 'article_id', 'created_at', 'updated_at', 'read_count', 'children']

    def get_children(self, obj):
        """
        递归获取子文章
        """
        # 获取当前文章的所有有效子文章，并按sort和更新时间排序
        children = Article.objects.filter(parent=obj, is_valid=True).order_by('sort', '-updated_at')
        return ArticleTreeSerializer(children, many=True).data
