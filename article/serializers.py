from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from article.models import Article
from categories.models import Category
from tags.models import Tag
from tags.serializers import TagSerializer
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

    # 直接接收前端传递的categoryId和parentId
    category_id = serializers.CharField(
        allow_null=True,
        allow_blank=True,
        required=False,
        write_only=True
    )

    parent_id = serializers.CharField(
        allow_null=True,
        allow_blank=True,
        required=False,
        write_only=True
    )

    def create(self, validated_data):
        # 1. 这里的 pop 操作非常关键！
        # 它将 tags 从验证数据中取出，防止 DRF 的默认 create 方法尝试直接保存它导致报错
        tags_names = validated_data.pop('tags', [])
        
        # 处理category_id和parent_id字段映射
        category_id = validated_data.pop('category_id', None)
        parent_id = validated_data.pop('parent_id', None)
        
        # 设置外键关系
        if category_id:
            validated_data['category_id'] = category_id
        if parent_id:
            validated_data['parent_id'] = parent_id

        # 2. 创建文章实例
        article = super().create(validated_data)

        # 3. 手动处理标签逻辑
        self._handle_tags(article, tags_names)

        return article

    def update(self, instance, validated_data):
        # 更新时同样需要接管 tags
        tags_names = validated_data.pop('tags', None)
        
        # 处理category_id和parent_id字段映射
        category_id = validated_data.pop('category_id', None)
        parent_id = validated_data.pop('parent_id', None)
        
        # 设置外键关系
        if category_id is not None:
            validated_data['category_id'] = category_id
        if parent_id is not None:
            validated_data['parent_id'] = parent_id

        article = super().update(instance, validated_data)

        if tags_names is not None:
            self._handle_tags(article, tags_names)

        return article

    def _handle_tags(self, article, tags_names):
        """
        统一处理标签的查找与创建逻辑
        """
        if not tags_names:
            article.tags.clear()
            return

        tag_objects = []
        request = self.context.get('request')

        # 确定当前用户ID (用于查找私有标签)
        current_user_id = 'admin'
        if request and request.user and request.user.is_authenticated:
            current_user_id = str(request.user.id)

        for name in tags_names:
            name = name.strip()
            if not name:
                continue

            # 1. 查找逻辑：优先找 admin 的公共标签，再找当前用户的私有标签
            tag = Tag.objects.filter(name=name, userid='admin').first()
            if not tag and current_user_id != 'admin':
                tag = Tag.objects.filter(name=name, userid=current_user_id).first()

            # 2. 如果不存在，则创建新标签
            if not tag:
                # 使用 TagSerializer 进行创建以确保符合校验规则
                # 注意：这里需要确保 TagSerializer 已正确导入
                try:
                    tag_data = {'name': name}
                    # 传入 context 以便 TagSerializer 能处理 CurrentUserOrAdminDefault
                    tag_ser = TagSerializer(data=tag_data, context=self.context)
                    if tag_ser.is_valid():
                        tag = tag_ser.save()
                except Exception as e:
                    # 忽略创建失败的标签，避免打断文章保存
                    print(f"Error creating tag {name}: {e}")
                    continue

            if tag:
                tag_objects.append(tag)

        # 3. 建立关联
        article.tags.set(tag_objects)

    class Meta:
        model = Article
        fields = [
            'article_id', 'title', 'content', 'coll_id',
            'author', 'created_at', 'updated_at', 'permission', 'is_valid',
            'read_count', 'category_id', 'sort', 'parent_id', 'tags'
        ]
        # 只读字段
        read_only_fields = ['article_id', 'created_at', 'updated_at', 'read_count']

        validators = [
            UniqueTogetherValidator(
                queryset=Article.objects.all(),
                fields=['author', 'coll_id', 'title'],
                message="文章标题已存在"
            )
        ]

    def validate_category_id(self, value):
        # 验证分类ID是否真实存在
        if not value:
            return None

        try:
            Category.objects.get(category_id=value)
        except Category.DoesNotExist:
            raise serializers.ValidationError(f"分类不存在: '{value}'")

        return value

    def validate_parent_id(self, value):
        # 验证父级文章ID是否存在于Article表中
        if not value:
            return None

        try:
            Article.objects.get(article_id=value)
        except Article.DoesNotExist:
            raise serializers.ValidationError(f"父级文章不存在：'{value}'")

        return value


class ArticleTreeSerializer(serializers.ModelSerializer):
    """
    树形结构文章序列化器
    """
    children = serializers.SerializerMethodField()

    class Meta:
        model = Article
        fields = [
            'article_id', 'title', 'content', 'coll_id',
            'author', 'created_at', 'updated_at', 'permission', 'is_valid',
            'read_count', 'category_id', 'sort', 'parent_id', 'children'
        ]
        # 只读字段
        read_only_fields = ['article_id', 'created_at', 'updated_at', 'read_count', 'children']

    def get_children(self, obj):
        """
        递归获取子文章
        """
        # 获取当前文章的所有有效子文章，并按sort和更新时间排序
        children = Article.objects.filter(parent=obj, is_valid=True).order_by('sort', '-updated_at')
        return ArticleTreeSerializer(children, many=True).data
