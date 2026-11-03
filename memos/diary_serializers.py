from django.db import transaction
from rest_framework import serializers
from assets.models import Asset
from utils.drf_utils import get_current_user_identifier
from .diary_models import DiaryEntry


class DiarySerializer(serializers.ModelSerializer):
    content = serializers.CharField(max_length=50000, allow_blank=False, trim_whitespace=False)
    cover_url = serializers.SerializerMethodField()
    cover_asset_id = serializers.PrimaryKeyRelatedField(source='cover_asset', queryset=Asset.objects.filter(is_valid=True, file_type='image'), allow_null=True, required=False)
    image_asset_ids = serializers.ListField(child=serializers.CharField(max_length=32, allow_blank=False), max_length=15, required=False)
    tags = serializers.ListField(child=serializers.CharField(max_length=30, trim_whitespace=True, allow_blank=False), max_length=10, required=False)

    class Meta:
        model = DiaryEntry
        fields = ['diary_id', 'title', 'content', 'entry_date', 'cover_url', 'cover_asset_id', 'image_asset_ids', 'mood', 'weather', 'tags', 'created_at', 'updated_at']
        read_only_fields = ['diary_id', 'created_at', 'updated_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Snapshots created before multi-image support may have only a cover FK.
        data['image_asset_ids'] = instance.image_asset_ids or ([instance.cover_asset_id] if instance.cover_asset_id else [])
        data['cover_asset_id'] = data['image_asset_ids'][0] if data['image_asset_ids'] else None
        return data

    def get_cover_url(self, obj):
        first = obj.image_asset_ids[0] if obj.image_asset_ids else obj.cover_asset_id
        return f'/api/resource/view/{first}' if first else obj.cover_url

    def validate_content(self, value):
        if not value.strip():
            raise serializers.ValidationError('正文不能为空')
        return value

    def validate_image_asset_ids(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError('同一图片不能重复添加')
        return value

    def validate_tags(self, value):
        return list(dict.fromkeys(value))

    def validate_cover_asset_id(self, asset):
        if asset and asset.uploader != get_current_user_identifier(self.context['request']):
            raise serializers.ValidationError('只能使用自己上传的图片')
        return asset

    def _lock_cover(self, validated_data):
        if 'image_asset_ids' in validated_data:
            ids = validated_data['image_asset_ids']
        elif 'cover_asset' in validated_data:
            ids = [validated_data['cover_asset'].pk] if validated_data['cover_asset'] else []
        else:
            return
        owner = get_current_user_identifier(self.context['request'])
        assets = {asset.pk: asset for asset in Asset.objects.select_for_update().filter(
            pk__in=ids, is_valid=True, file_type='image', uploader=owner,
        ).order_by('pk')}
        if len(assets) != len(ids):
            raise serializers.ValidationError({'image_asset_ids': '部分图片不可用或不属于当前用户，请重新上传'})
        validated_data['image_asset_ids'] = ids
        validated_data['cover_asset'] = assets[ids[0]] if ids else None
        validated_data['cover_url'] = ''

    @transaction.atomic
    def create(self, validated_data):
        self._lock_cover(validated_data)
        return DiaryEntry.objects.create(user_id=get_current_user_identifier(self.context['request']), **validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        self._lock_cover(validated_data)
        return super().update(instance, validated_data)
