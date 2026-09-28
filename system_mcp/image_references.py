"""仅将允许读取的本地图片转成生图参考，不让供应商抓取应用私有地址。"""

import base64
from pathlib import Path
from types import SimpleNamespace

from django.conf import settings
from django.contrib.auth.models import AnonymousUser

from assets.models import Asset
from assets.views import can_read_asset
from prompts.generation import MAX_IMAGE_BYTES, _validate_image_content

MAX_REFERENCE_IMAGES = 4
MAX_REFERENCE_TOTAL_BYTES = 20 * 1024 * 1024


def readable_reference_assets(resource_ids: list[str], *, user_id: str) -> list[Asset]:
    if not isinstance(resource_ids, list) or len(resource_ids) > MAX_REFERENCE_IMAGES:
        raise ValueError('reference_image_ids 必须是数组，最多 4 张')
    if any(not isinstance(value, str) or not value or len(value) > 32 for value in resource_ids):
        raise ValueError('reference_image_ids 请提供有效的资源 ID，而不是 URL 或图片文集 ID')
    if len(set(resource_ids)) != len(resource_ids):
        raise ValueError('参考图资源 ID 不可重复')
    assets = Asset.objects.in_bulk(resource_ids)
    public_request = SimpleNamespace(user=AnonymousUser())
    ordered = []
    for resource_id in resource_ids:
        asset = assets.get(resource_id)
        if asset is None or not asset.is_valid or asset.file_type != 'image':
            raise ValueError('参考图不存在或不是有效的图片资源')
        if asset.uploader != user_id and not can_read_asset(public_request, asset):
            raise ValueError('无权使用该参考图')
        ordered.append(asset)
    return ordered


def load_reference_images(resource_ids: list[str], *, user_id: str) -> list[str]:
    root = Path(settings.MEDIA_ROOT).resolve()
    encoded = []
    total = 0
    for asset in readable_reference_assets(resource_ids, user_id=user_id):
        path = (root / asset.file_path).resolve()
        if not asset.file_path or not path.is_relative_to(root) or not path.is_file():
            raise ValueError('参考图文件不可用，请先下载或重新上传该图片')
        with path.open('rb') as source:
            content = source.read(MAX_IMAGE_BYTES + 1)
        total += len(content)
        if total > MAX_REFERENCE_TOTAL_BYTES:
            raise ValueError('参考图总大小不能超过 20 MB')
        image = _validate_image_content(content)
        encoded.append(f'data:{image.mime_type};base64,{base64.b64encode(content).decode("ascii")}')
    return encoded
