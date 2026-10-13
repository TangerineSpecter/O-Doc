"""Owner-scoped storage validation for Agent battle head artwork."""
from pathlib import Path
import math

from django.conf import settings
from PIL import Image
from rest_framework import serializers

from assets.models import Asset
from utils.resource_assets import get_resource_view_url

HEAD_SIZE = (374, 310)


class BattleAppearanceSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1, max_value=1)
    source_asset_id = serializers.CharField(max_length=32)
    cutout_asset_id = serializers.CharField(max_length=32)
    head_asset_id = serializers.CharField(max_length=32)
    transform = serializers.DictField()

    def validate_transform(self, value):
        allowed = {'x', 'y', 'scale', 'crop'}
        if set(value) - allowed:
            raise serializers.ValidationError('位置参数包含未知字段')
        for key in ('x', 'y', 'scale'):
            number = value.get(key)
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number):
                raise serializers.ValidationError(f'{key} 必须为数字')
        if not -374 <= value['x'] <= 374 or not -310 <= value['y'] <= 310:
            raise serializers.ValidationError('头部位置超出可保存范围')
        if not .1 <= value['scale'] <= 4:
            raise serializers.ValidationError('头部缩放范围为 0.1 到 4')
        crop = value.get('crop')
        if crop is not None:
            if (not isinstance(crop, dict) or set(crop) != {'x', 'y', 'width', 'height'}
                    or any(isinstance(crop[key], bool) or not isinstance(crop[key], int) for key in crop)):
                raise serializers.ValidationError('头部选区格式无效')
            if crop['x'] < 0 or crop['y'] < 0 or crop['width'] < 1 or crop['height'] < 1:
                raise serializers.ValidationError('头部选区范围无效')
        return value


def _owned_image(resource_id: str, owner_id: str) -> Asset:
    asset = Asset.objects.filter(pk=resource_id, uploader=owner_id, is_valid=True, file_type='image').first()
    if asset is None:
        raise ValueError('战斗形象图片不存在、不是图片或不属于当前账号')
    root = Path(settings.MEDIA_ROOT).resolve()
    path = (root / asset.file_path).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError('战斗形象图片文件不可用，请重新上传')
    return asset


def validate_and_save_appearance(agent, owner_id: str, payload: object) -> dict:
    serializer = BattleAppearanceSerializer(data=payload)
    serializer.is_valid(raise_exception=True)
    values = serializer.validated_data
    source = _owned_image(values['source_asset_id'], owner_id)
    cutout = _owned_image(values['cutout_asset_id'], owner_id)
    head = _owned_image(values['head_asset_id'], owner_id)
    root = Path(settings.MEDIA_ROOT).resolve()
    try:
        with Image.open(root / source.file_path) as original, Image.open(root / cutout.file_path) as matte, Image.open(root / head.file_path) as final:
            original.load();matte.load();final.load()
            if original.format not in ('PNG', 'JPEG', 'WEBP') or max(original.size) > 16384 or original.width * original.height > 40_000_000:
                raise ValueError('原图格式或尺寸无效')
            if matte.format != 'PNG' or matte.size != original.size or matte.mode not in ('RGBA', 'LA'):
                raise ValueError('去背景图必须是与原图同尺寸的透明 PNG')
            if matte.getchannel('A').getextrema() == (255, 255):
                raise ValueError('去背景图没有透明像素')
            if final.format != 'PNG' or final.size != HEAD_SIZE or final.mode not in ('RGBA', 'LA'):
                raise ValueError('最终头部必须是 374×310 的透明 PNG')
            alpha_extrema = final.getchannel('A').getextrema()
            if alpha_extrema == (255, 255):
                raise ValueError('最终头部没有透明像素，请检查去背景结果')
            if alpha_extrema[1] == 0:
                raise ValueError('最终头部为空，请调整范围后重试')
            crop = values['transform'].get('crop')
            if crop and (crop['x'] + crop['width'] > original.width or crop['y'] + crop['height'] > original.height):
                raise ValueError('头部选区超出原图范围')
    except OSError as exc:
        raise ValueError('战斗形象图片无法读取，请重新上传') from exc
    agent.battle_appearance = {
        'version': values['version'], 'source_asset_id': source.pk,
        'cutout_asset_id': cutout.pk, 'head_asset_id': head.pk,
        'transform': values['transform'],
    }
    agent.save(update_fields=['battle_appearance', 'updated_at'])
    return appearance_view(agent.battle_appearance)


def appearance_view(value: dict | None) -> dict | None:
    if not value:
        return None
    return {
        **value,
        'source_image_url': get_resource_view_url(value['source_asset_id']),
        'cutout_image_url': get_resource_view_url(value['cutout_asset_id']),
        'head_image_url': get_resource_view_url(value['head_asset_id']),
    }
