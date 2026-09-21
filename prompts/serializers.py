from rest_framework import serializers

from .models import PromptCategory, PromptResultImage, PromptTag, PromptTemplate, PromptTheme, PromptUsage
from .rendering import validate_schema, validate_template_tokens


class PromptTaxonomySerializer(serializers.ModelSerializer):
    class Meta:
        fields = ['id', 'name', 'description', 'color', 'sort', 'is_valid', 'created_at', 'updated_at']


class PromptCategorySerializer(PromptTaxonomySerializer):
    class Meta(PromptTaxonomySerializer.Meta):
        model = PromptCategory


class PromptThemeSerializer(PromptTaxonomySerializer):
    class Meta(PromptTaxonomySerializer.Meta):
        model = PromptTheme


class PromptTagSerializer(PromptTaxonomySerializer):
    class Meta(PromptTaxonomySerializer.Meta):
        model = PromptTag


class PromptResultImageSerializer(serializers.ModelSerializer):
    asset_id = serializers.CharField(read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = PromptResultImage
        fields = ['id', 'asset_id', 'image_url', 'caption', 'sort', 'created_at']

    def get_image_url(self, obj):
        return f'/api/resource/view/{obj.asset_id}'


class PromptUsageSerializer(serializers.ModelSerializer):
    result_images = PromptResultImageSerializer(many=True, read_only=True)

    class Meta:
        model = PromptUsage
        fields = [
            'id', 'input_values', 'rendered_positive', 'rendered_negative', 'model_name', 'note', 'source_url',
            'is_valid', 'deleted_at', 'created_at', 'updated_at', 'result_images',
        ]
        read_only_fields = ['rendered_positive', 'rendered_negative', 'is_valid', 'deleted_at', 'created_at', 'updated_at']


class PromptTemplateSerializer(serializers.ModelSerializer):
    category = PromptCategorySerializer(read_only=True)
    category_id = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    themes = PromptThemeSerializer(many=True, read_only=True)
    tags = PromptTagSerializer(many=True, read_only=True)
    theme_ids = serializers.ListField(child=serializers.CharField(), write_only=True, required=False)
    tag_ids = serializers.ListField(child=serializers.CharField(), write_only=True, required=False)
    cover_image = serializers.SerializerMethodField()
    latest_usage = serializers.SerializerMethodField()

    class Meta:
        model = PromptTemplate
        fields = [
            'id', 'title', 'description', 'prompt_type', 'positive_template', 'negative_template',
            'field_schema_version', 'field_schema', 'category', 'category_id', 'themes', 'theme_ids', 'tags', 'tag_ids',
            'is_favorite', 'cover_image', 'latest_usage', 'is_valid', 'deleted_at', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'field_schema_version', 'cover_image', 'latest_usage', 'is_valid', 'deleted_at', 'created_at', 'updated_at']

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('标题不能为空')
        return value[:120]

    def validate(self, attrs):
        schema = validate_schema(attrs.get('field_schema', self.instance.field_schema if self.instance else []))
        positive = attrs.get('positive_template', self.instance.positive_template if self.instance else '')
        negative = attrs.get('negative_template', self.instance.negative_template if self.instance else '')
        if not positive.strip():
            raise serializers.ValidationError({'positiveTemplate': '正向提示词不能为空'})
        validate_template_tokens(positive, schema)
        validate_template_tokens(negative, schema)
        attrs['field_schema'] = schema
        return attrs

    def get_cover_image(self, obj):
        image = obj.cover_result_image
        if image is not None and not image.usage.is_valid:
            image = None
        if image is None:
            image = PromptResultImage.objects.filter(usage__template=obj, usage__is_valid=True).order_by('-created_at').first()
        return PromptResultImageSerializer(image).data if image else None

    def get_latest_usage(self, obj):
        usage = obj.usages.filter(is_valid=True).prefetch_related('result_images').first()
        return PromptUsageSerializer(usage).data if usage else None
