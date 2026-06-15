from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from article.models import Article, ArticlePostComment, ArticlePostRating, Image
from categories.models import Category
from tags.models import Tag
from tags.serializers import TagSerializer
from utils.drf_utils import CurrentUserOrAdminDefault, get_current_user_identifier
from utils.resource_assets import sync_article_content_assets


class ArticleSerializer(serializers.ModelSerializer):
    """
    文章序列化器
    """
    # 标签字段，接收前端传递的标签名称数组（写入）
    tags = serializers.ListField(
        child=serializers.CharField(max_length=30),
        allow_null=True,
        allow_empty=True,
        required=False,
        write_only=True
    )

    # 附件字段，接收前端传递的附件ID数组（写入）
    assets = serializers.ListField(
        child=serializers.CharField(max_length=32),
        allow_null=True,
        allow_empty=True,
        required=False,
        write_only=True
    )

    # 标签详情，用于返回标签完整信息（读取）
    tag_details = TagSerializer(source='tags', many=True, read_only=True)

    # 分类详情，用于返回分类完整信息（读取）
    category_detail = serializers.SerializerMethodField(read_only=True)

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

    # 父级文章详情，用于返回父级文章信息（读取）
    parent_detail = serializers.SerializerMethodField(read_only=True)

    # 附件列表，用于返回关联的附件信息（读取）
    attachments = serializers.SerializerMethodField(read_only=True)

    post_comment_count = serializers.SerializerMethodField(read_only=True)
    agent_post_rating_count = serializers.SerializerMethodField(read_only=True)
    my_agent_post_rating = serializers.SerializerMethodField(read_only=True)

    def create(self, validated_data):
        # 1. 这里的 pop 操作非常关键！
        # 它将 tags 和 assets 从验证数据中取出，防止 DRF 的默认 create 方法尝试直接保存它导致报错
        tags_names = validated_data.pop('tags', [])
        assets_ids = validated_data.pop('assets', [])

        # 2. 创建文章实例
        article = super().create(validated_data)

        # 3. 手动处理标签逻辑
        self._handle_tags(article, tags_names)

        # 4. 手动处理附件逻辑
        self._handle_assets(article, assets_ids)
        sync_article_content_assets(article)

        return article

    def update(self, instance, validated_data):
        # 更新时同样需要接管 tags 和 assets
        tags_names = validated_data.pop('tags', None)
        assets_ids = validated_data.pop('assets', None)

        article = super().update(instance, validated_data)

        if tags_names is not None:
            self._handle_tags(article, tags_names)

        if assets_ids is not None:
            self._handle_assets(article, assets_ids)

        sync_article_content_assets(article)

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

        # 确定当前业务用户ID，统一使用 UserProfile.userid。
        current_user_id = get_current_user_identifier(request)

        for name in tags_names:
            name = name.strip()
            if not name:
                continue

            # 1. 查找逻辑：优先找当前用户标签，再用 admin 公共标签兜底
            tag = Tag.objects.filter(name=name, user_id=current_user_id).first()
            if not tag and current_user_id != 'admin':
                tag = Tag.objects.filter(name=name, user_id='admin').first()

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

    def _handle_assets(self, article, assets_ids):
        """
        统一处理附件的关联逻辑
        """
        from assets.models import Asset

        if not assets_ids:
            # 清空所有附件关联
            assets = Asset.objects.filter(linked_article=article, source_type='attachment')
            for asset in assets:
                asset.linked_article = None
                asset.is_linked = False
                asset.save()
            return

        # 先移除所有现有关联
        assets = Asset.objects.filter(linked_article=article, source_type='attachment')
        for asset in assets:
            asset.linked_article = None
            asset.is_linked = False
            asset.save()

        # 关联新的附件
        request = self.context.get('request')
        current_user_id = get_current_user_identifier(request)
        for asset_id in assets_ids:
            try:
                asset = Asset.objects.get(
                    id=asset_id,
                    uploader=current_user_id,
                    source_type='attachment',
                    is_valid=True,
                )
                asset.linked_article = article
                asset.is_linked = True
                asset.save()
            except Asset.DoesNotExist:
                # 忽略不存在的附件
                continue

    class Meta:
        model = Article
        fields = [
            'article_id', 'title', 'content', 'coll_id',
            'author', 'created_at', 'updated_at', 'permission', 'is_valid',
            'read_count', 'category_id', 'sort', 'parent_id', 'tags', 'assets',
            'tag_details', 'category_detail', 'parent_detail', 'attachments',
            'word_count', 'read_time', 'word_count', 'read_time',
            'source_url', 'is_polishing', 'is_rag_synced', 'last_rag_synced_at',
            'mind_map', 'post_summary', 'agent_post_creator_id',
            'agent_post_creator_name', 'agent_post_creator_avatar',
            'agent_post_category', 'agent_post_rating', 'agent_post_rating_count',
            'my_agent_post_rating', 'post_comment_count'
        ]
        # 只读字段
        read_only_fields = ['article_id', 'created_at', 'updated_at', 'read_count', 'tag_details', 'category_detail',
                            'parent_detail', 'attachments', 'is_polishing', 'is_rag_synced', 'last_rag_synced_at',
                            'mind_map', 'agent_post_rating_count', 'my_agent_post_rating', 'post_comment_count']

        validators = [
            UniqueTogetherValidator(
                queryset=Article.objects.all(),
                fields=['author', 'coll_id', 'title'],
                message="文章标题已存在"
            )
        ]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # 还原 author 字段在序列化输出中的展示
        ret['author'] = instance.author
        
        # 增加 author_name (优先展示昵称)
        from user.models import UserProfile
        profile = UserProfile.objects.filter(userid=instance.author).select_related('user').first()
        if not profile and instance.author == 'admin':
            profile = UserProfile.objects.filter(user__username='admin').select_related('user').first()
        
        if profile:
            ret['author_name'] = profile.nickname or profile.user.first_name or profile.user.username
        else:
            ret['author_name'] = instance.author
            
        return ret


    def validate_category_id(self, value):
        # 验证分类ID是否真实存在
        if not value:
            return None

        request = self.context.get('request')
        current_user_id = get_current_user_identifier(request)
        try:
            Category.objects.get(category_id=value, user_id=current_user_id, is_valid=True)
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

        # 检查父级文章ID是否与当前编辑的文章ID相同，防止循环引用
        if self.instance and self.instance.article_id == value:
            raise serializers.ValidationError("父级文章不能是当前文章自身")

        return value

    def get_category_detail(self, obj):
        """
        返回分类详情信息
        """
        if obj.category:
            return {
                'category_id': obj.category.category_id,
                'name': obj.category.name,
                'theme_id': obj.category.theme_id,
                'icon_key': obj.category.icon_key
            }
        return None

    def get_parent_detail(self, obj):
        """
        返回父级文章详情信息
        """
        if obj.parent:
            return {
                'article_id': obj.parent.article_id,
                'title': obj.parent.title
            }
        return None

    def get_attachments(self, obj):
        """
        返回关联的附件列表
        """
        from assets.models import Asset

        # 获取关联的附件
        # 修改：增加 source_type='attachment' 过滤，排除内容资源（如正文图片）
        assets = Asset.objects.filter(linked_article=obj, is_valid=True, source_type='attachment')

        # 构造附件数据
        assets_data = []
        for asset in assets:
            assets_data.append({
                'id': asset.id,
                'name': asset.name,
                'type': asset.file_type,
                'size': asset.file_size,
                'date': asset.upload_time.strftime('%Y-%m-%d %H:%M:%S'),
                'linked': asset.is_linked,
                'sourceType': asset.source_type,
                'url': f'/api/resource/download/{asset.id}'  # 添加下载链接
            })

        return assets_data

    def get_post_comment_count(self, obj):
        return ArticlePostComment.objects.filter(article=obj, is_valid=True).count()

    def get_agent_post_rating_count(self, obj):
        return ArticlePostRating.objects.filter(article=obj, is_valid=True).count()

    def get_my_agent_post_rating(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return None
        rater_id = get_current_user_identifier(request)
        rating = ArticlePostRating.objects.filter(article=obj, rater_id=rater_id, is_valid=True).first()
        return rating.rating if rating else None


class ArticlePostCommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ArticlePostComment
        fields = [
            'comment_id', 'article', 'content', 'creator_id', 'creator_name',
            'creator_avatar', 'created_at', 'updated_at'
        ]
        read_only_fields = fields


class AgentPostLatestCommentSerializer(serializers.ModelSerializer):
    article_id = serializers.CharField(source='article.article_id', read_only=True)
    post_title = serializers.CharField(source='article.title', read_only=True)
    agent_name = serializers.CharField(source='article.agent_post_creator_name', read_only=True)
    agent_avatar = serializers.CharField(source='article.agent_post_creator_avatar', read_only=True)

    class Meta:
        model = ArticlePostComment
        fields = [
            'comment_id', 'article_id', 'post_title', 'content',
            'agent_name', 'agent_avatar', 'created_at'
        ]
        read_only_fields = fields


class ArticleTreeSerializer(serializers.ModelSerializer):
    """
    树形结构文章序列化器
    """
    children = serializers.SerializerMethodField()
    date = serializers.SerializerMethodField()

    class Meta:
        model = Article
        fields = [
            'article_id', 'title', 'content', 'coll_id',
            'author', 'created_at', 'updated_at', 'permission', 'is_valid',
            'read_count', 'category_id', 'sort', 'parent_id', 'children', 'date',
            'word_count', 'read_time'
        ]
        # 只读字段
        read_only_fields = ['article_id', 'created_at', 'updated_at', 'read_count', 'children', 'date', 'word_count',
                            'read_time']

    def get_date(self, obj):
        """
        返回格式化的日期，用于前端显示
        """
        return obj.created_at.strftime('%Y-%m-%d')

    def get_children(self, obj):
        """
        递归获取子文章
        """
        # 获取当前文章的所有有效子文章，并按sort和更新时间排序
        children = Article.objects.filter(parent=obj, is_valid=True).order_by('sort', '-updated_at')
        return ArticleTreeSerializer(children, many=True).data


class ImageSerializer(serializers.ModelSerializer):
    """
    图片序列化器
    """
    image_url = serializers.CharField(max_length=500)
    shooting_time = serializers.DateTimeField(required=False, allow_null=True)
    tags_list = serializers.SerializerMethodField(read_only=True)
    shooting_time_str = serializers.SerializerMethodField(read_only=True)
    location_id = serializers.CharField(required=False, allow_blank=True, allow_null=True, write_only=True)
    location_detail = serializers.SerializerMethodField(read_only=True)
    author_nickname = serializers.SerializerMethodField(read_only=True)

    # 标签字段，接收前端传递的逗号分隔字符串（写入）
    tags = serializers.CharField(
        allow_blank=True,
        required=False,
        write_only=True
    )

    def get_tags_list(self, obj):
        """返回标签列表"""
        return obj.get_tags_list()

    def get_shooting_time_str(self, obj):
        """返回格式化的拍摄日期"""
        if obj.shooting_time:
            return obj.shooting_time.strftime('%Y-%m-%d')
        return None

    def get_location_detail(self, obj):
        if not obj.location:
            return None
        return {
            'id': obj.location.id,
            'country': obj.location.country,
            'city': obj.location.city,
            'latitude': obj.location.latitude,
            'longitude': obj.location.longitude,
        }

    def get_author_nickname(self, obj):
        from user.models import UserProfile

        profile = UserProfile.objects.filter(userid=obj.author).select_related('user').first()
        if profile:
            return profile.nickname or profile.user.first_name or profile.user.username

        if obj.author == 'admin':
            profile = UserProfile.objects.filter(user__username='admin').select_related('user').first()
            if profile:
                return profile.nickname or profile.user.first_name or profile.user.username

        return obj.author

    def validate(self, attrs):
        country = attrs.get('country')
        city = attrs.get('city')
        place_name = attrs.get('place_name')
        focal_length = attrs.get('focal_length')
        location_id = attrs.pop('location_id', None)

        if country is not None:
            attrs['country'] = country.strip()
        if city is not None:
            attrs['city'] = city.strip()
        if place_name is not None:
            attrs['place_name'] = place_name.strip()
        if focal_length is not None:
            attrs['focal_length'] = focal_length.strip()
            if attrs['focal_length'] and not attrs['focal_length'].isdigit():
                raise serializers.ValidationError({'focal_length': '焦段只能输入数字'})
        if location_id:
            from system_settings.models import GeoLocation

            try:
                location = GeoLocation.objects.get(id=location_id)
            except GeoLocation.DoesNotExist:
                raise serializers.ValidationError({'location_id': '拍摄地点不存在'})

            attrs['location'] = location
            attrs['country'] = location.country
            attrs['city'] = location.city
            attrs['latitude'] = location.latitude
            attrs['longitude'] = location.longitude
        elif location_id == '':
            attrs['location'] = None
            attrs['latitude'] = None
            attrs['longitude'] = None

        return attrs

    class Meta:
        model = Image
        fields = [
            'image_id', 'title', 'description', 'image_url', 'coll_id',
            'shooting_time', 'shooting_time_str', 'country', 'city', 'place_name',
            'location', 'location_id', 'location_detail', 'latitude', 'longitude',
            'focal_length', 'tags', 'tags_list',
            'author', 'author_nickname', 'created_at', 'updated_at', 'is_valid'
        ]
        read_only_fields = [
            'image_id', 'author', 'created_at', 'updated_at',
            'is_valid', 'tags_list', 'shooting_time_str', 'location', 'location_detail', 'author_nickname',
            'latitude', 'longitude'
        ]
