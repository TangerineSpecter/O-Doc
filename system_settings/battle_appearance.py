"""Owner-scoped storage validation for Agent battle appearance artwork."""
from pathlib import Path
import math

from django.conf import settings
from PIL import Image
from rest_framework import serializers

from assets.models import Asset
from utils.resource_assets import get_resource_view_url

HEAD_SIZE = (374, 310)
EXTENDED_HEAD_SIZE = (374, 528)


class BattleAppearanceSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1, max_value=3)
    source_asset_id = serializers.CharField(max_length=32)
    cutout_asset_id = serializers.CharField(max_length=32)
    head_asset_id = serializers.CharField(max_length=32, required=False)
    character_asset_id = serializers.CharField(max_length=32, required=False)
    transform = serializers.DictField()
    overlays = serializers.DictField(required=False)

    def validate_transform(self, value):
        allowed = {'x', 'y', 'scale', 'crop', 'neck_anchor', 'hair_layer'}
        if set(value) - allowed:
            raise serializers.ValidationError('位置参数包含未知字段')
        for key in ('x', 'y', 'scale'):
            number = value.get(key)
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number):
                raise serializers.ValidationError(f'{key} 必须为数字')
        if not -374 <= value['x'] <= 374 or not -528 <= value['y'] <= 528:
            raise serializers.ValidationError('头部位置超出可保存范围')
        if not .01 <= value['scale'] <= 4:
            raise serializers.ValidationError('角色缩放范围为 0.01 到 4')
        crop = value.get('crop')
        if value.get('hair_layer', 'front') not in ('front', 'behind'):
            raise serializers.ValidationError('头发层级无效')
        anchor = value.get('neck_anchor')
        if anchor is not None and (not isinstance(anchor, dict) or set(anchor) != {'x', 'y'} or
                any(isinstance(anchor[key], bool) or not isinstance(anchor[key], int) or anchor[key] < 0 for key in anchor)):
            raise serializers.ValidationError('颈部连接点格式无效')
        if crop is not None:
            if (not isinstance(crop, dict) or set(crop) != {'x', 'y', 'width', 'height'}
                    or any(isinstance(crop[key], bool) or not isinstance(crop[key], int) for key in crop)):
                raise serializers.ValidationError('头部选区格式无效')
            if crop['x'] < 0 or crop['y'] < 0 or crop['width'] < 1 or crop['height'] < 1:
                raise serializers.ValidationError('头部选区范围无效')
        return value

    def validate_overlays(self, value):
        allowed = {'left_hand', 'right_hand', 'weapon'}
        if set(value) - allowed or set(value) != allowed:
            raise serializers.ValidationError('手部与武器位置参数不完整')
        for layer, transform in value.items():
            if not isinstance(transform, dict) or set(transform) != {'x', 'y', 'scale', 'rotation'}:
                raise serializers.ValidationError(f'{layer} 的位置参数无效')
            for key in ('x', 'y', 'scale', 'rotation'):
                number = transform[key]
                if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number):
                    raise serializers.ValidationError(f'{layer}.{key} 必须为数字')
            if abs(transform['x']) > 374 or abs(transform['y']) > 528:
                raise serializers.ValidationError(f'{layer} 的位置超出可保存范围')
            if not .3 <= transform['scale'] <= 3 or abs(transform['rotation']) > math.pi:
                raise serializers.ValidationError(f'{layer} 的缩放或旋转范围无效')
        return value

    def validate(self, attrs):
        version = attrs['version']
        if version < 3 and not attrs.get('head_asset_id'):
            raise serializers.ValidationError({'head_asset_id': '旧版本战斗形象需要头部素材'})
        if version == 3 and not attrs.get('character_asset_id'):
            raise serializers.ValidationError({'character_asset_id': '请提供完整角色素材'})
        if version == 3 and not attrs.get('overlays'):
            raise serializers.ValidationError({'overlays': '请提供手部与武器对齐参数'})
        return attrs


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
    head = _owned_image(values['head_asset_id'], owner_id) if values['version'] < 3 else None
    character = _owned_image(values['character_asset_id'], owner_id) if values['version'] == 3 else None
    root = Path(settings.MEDIA_ROOT).resolve()
    try:
        with Image.open(root / source.file_path) as original, Image.open(root / cutout.file_path) as matte:
            original.load();matte.load()
            if original.format not in ('PNG', 'JPEG', 'WEBP') or max(original.size) > 16384 or original.width * original.height > 40_000_000:
                raise ValueError('原图格式或尺寸无效')
            if matte.format != 'PNG' or matte.size != original.size or matte.mode not in ('RGBA', 'LA'):
                raise ValueError('去背景图必须是与原图同尺寸的透明 PNG')
            if matte.getchannel('A').getextrema() == (255, 255):
                raise ValueError('去背景图没有透明像素')
            if values['version'] < 3:
                with Image.open(root / head.file_path) as final:
                    final.load()
                    expected_size = EXTENDED_HEAD_SIZE if values['version'] == 2 else HEAD_SIZE
                    if final.format != 'PNG' or final.size != expected_size or final.mode not in ('RGBA', 'LA'):
                        raise ValueError(f'最终头部必须是 {expected_size[0]}×{expected_size[1]} 的透明 PNG')
                    alpha_extrema = final.getchannel('A').getextrema()
                    if alpha_extrema == (255, 255):
                        raise ValueError('最终头部没有透明像素，请检查去背景结果')
                    if alpha_extrema[1] == 0:
                        raise ValueError('最终头部为空，请调整范围后重试')
            else:
                with Image.open(root / character.file_path) as final:
                    final.load()
                    if final.format != 'PNG' or final.size != (374, 528) or final.mode not in ('RGBA', 'LA'):
                        raise ValueError('完整角色必须是 374×528 的透明 PNG')
                    alpha_extrema = final.getchannel('A').getextrema()
                    if alpha_extrema == (255, 255):
                        raise ValueError('完整角色没有透明像素，请检查去背景结果')
                    if alpha_extrema[1] == 0:
                        raise ValueError('完整角色为空，请重新处理图片')
            crop = values['transform'].get('crop')
            anchor = values['transform'].get('neck_anchor')
            if anchor and (anchor['x'] >= original.width or anchor['y'] >= original.height):
                raise ValueError('颈部连接点超出原图范围')
            if crop and (crop['x'] + crop['width'] > original.width or crop['y'] + crop['height'] > original.height):
                raise ValueError('头部选区超出原图范围')
    except OSError as exc:
        raise ValueError('战斗形象图片无法读取，请重新上传') from exc
    agent.battle_appearance = {
        'version': values['version'], 'source_asset_id': source.pk,
        'cutout_asset_id': cutout.pk,
        **({'head_asset_id': head.pk} if head else {'character_asset_id': character.pk}),
        'transform': values['transform'],
    }
    if values['version'] == 3:
        agent.battle_appearance['overlays'] = values['overlays']
    agent.save(update_fields=['battle_appearance', 'updated_at'])
    return appearance_view(agent.battle_appearance)


def appearance_view(value: dict | None) -> dict | None:
    if not value:
        return None
    response = {**value, 'source_image_url': get_resource_view_url(value['source_asset_id']),
                'cutout_image_url': get_resource_view_url(value['cutout_asset_id'])}
    if value.get('head_asset_id'):
        response['head_image_url'] = get_resource_view_url(value['head_asset_id'])
    if value.get('character_asset_id'):
        response['character_image_url'] = get_resource_view_url(value['character_asset_id'])
    return response
