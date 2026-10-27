from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from utils.drf_utils import CurrentUserOrAdminDefault, get_current_user_identifier
from .models import Anthology
from django.db import transaction


class AnthologySerializer(serializers.ModelSerializer):
    """文集序列化器"""
    user_id = serializers.HiddenField(
        default=CurrentUserOrAdminDefault()
    )
    title = serializers.CharField(max_length=100, required=False, allow_blank=True)
    # Novel directions live in Project; the legacy anthology column is only 100 chars.
    description = serializers.CharField(max_length=30000, required=False, allow_blank=True)

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
        return value

    def validate(self, attrs):
        kind = attrs.get('type', self.instance.type if self.instance else 'article')
        if kind != 'novel' and 'description' in attrs:
            if not attrs['description'] or len(attrs['description']) > 100:
                raise serializers.ValidationError({'description': '文集简介不能为空且不能超过100个字符'})
        title = attrs.get('title', self.instance.title if self.instance else '').strip()
        if kind == 'novel' and not title and not self.instance:
            base, suffix = '未命名小说', 1
            owner = attrs.get('user_id')
            title = base
            while Anthology.objects.filter(user_id=owner, title=title, type='novel').exists():
                suffix += 1
                title = f'{base} {suffix}'
        limit = 100 if kind == 'novel' else 20
        if not title or len(title) > limit:
            raise serializers.ValidationError(f'文集名称不能为空且不能超过{limit}字')
        attrs['title'] = title
        if self.instance and kind != self.instance.type and any(item in (kind, self.instance.type) for item in ('quant', 'backtest')):
            raise serializers.ValidationError('量化文集和回测文集不能与其他类型互相转换')
        if kind in ('quant', 'backtest'):
            request = self.context.get('request')
            if not request or not request.user.is_authenticated:
                raise serializers.ValidationError('请登录后创建私密文集')
            if self.instance and attrs.get('permission') == 'public':
                raise serializers.ValidationError('量化文集和回测文集仅限本人私密使用')
            attrs['permission'] = 'private'
        if self.instance and kind != self.instance.type and 'novel' in (kind, self.instance.type):
            raise serializers.ValidationError('小说文集不能与其他类型互相转换')
        if kind == 'novel':
            request = self.context.get('request')
            if not request or not request.user.is_authenticated:
                raise serializers.ValidationError('请登录后创建小说')
            if not self.instance:
                attrs.setdefault('permission', 'private')
        if self.instance and kind != self.instance.type and 'learning' in (kind, self.instance.type):
            raise serializers.ValidationError('学习文集不能与其他类型互相转换')
        if kind == 'learning':
            if self.instance and attrs.get('permission') == 'public':
                raise serializers.ValidationError('学习文集一期仅限本人私密使用')
            if not self.context.get('request') or not self.context['request'].user.is_authenticated:
                raise serializers.ValidationError('请登录后创建学习文集')
            attrs['permission'] = 'private'
        return attrs

    def create(self, validated_data):
        if validated_data.get('type') != 'novel':
            with transaction.atomic():
                return super().create(validated_data)
        from novel.models import Project
        from novel.locking import project_lock
        with project_lock('create-' + str(validated_data['user_id'])), transaction.atomic():
            direction = validated_data.pop('description', '暂无简介')
            validated_data['description'] = ''
            if not self.initial_data.get('title', '').strip():
                base, suffix = '未命名小说', 1
                title = base
                while Anthology.objects.filter(user_id=validated_data['user_id'], title=title, type='novel').exists():
                    suffix += 1
                    title = f'{base} {suffix}'
                validated_data['title'] = title
            from django.db import IntegrityError
            try:
                anthology = super().create(validated_data)
            except IntegrityError as exc:
                raise serializers.ValidationError('同类型下文集名称不能重复') from exc
            Project.objects.create(anthology=anthology, direction=direction)
            return anthology

    def update(self, instance, validated_data):
        if instance.type != 'novel':
            return super().update(instance, validated_data)
        from novel.models import Project
        from novel.locking import project_lock
        with project_lock(instance.pk), transaction.atomic():
            project = Project.objects.select_for_update().get(anthology=instance)
            if 'description' in validated_data:
                project.direction = validated_data.pop('description')
                project.save(update_fields=['direction', 'updated_at'])
            instance = super().update(instance, validated_data)
            instance.novel = project
            return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.type == 'novel':
            from novel.presentation import anthology_description
            request = self.context.get('request')
            owner = bool(request and request.user.is_authenticated and instance.user_id == get_current_user_identifier(request))
            data['description'] = anthology_description(instance, owner=owner)
        return data

    def run_validators(self, value):
        # The generated provisional title must reach uniqueness validation.
        if value.get('type') == 'novel' and not value.get('title'):
            return
        super().run_validators(value)
