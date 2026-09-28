"""账号内图标复用、不可变文件与物品关联。"""
import hashlib
from pathlib import Path
import re
import unicodedata
import uuid

from django.conf import settings
from django.db import transaction
from assets.models import Asset
from .travel_models import AgentInventoryItem
from .item_icon_images import compress_icon


def normalize_item_name(name: str) -> str:
    text = unicodedata.normalize('NFC', name).strip()
    text = re.sub(r'\s+', ' ', text)
    return re.sub(r'\s*[（(]虚拟商品[）)]$', '', text).strip()


@transaction.atomic
def upload_icon(upload, owner: str, name: str) -> tuple[Asset, bool]:
    data, metadata = compress_icon(upload)
    # 同一账号并发上传串行去重，不给跨设备快照增加哈希唯一约束。
    from user.models import UserProfile
    list(UserProfile.objects.select_for_update().filter(userid=owner).values_list('pk', flat=True))
    digest = hashlib.md5(data).hexdigest()
    existing = Asset.objects.filter(uploader=owner, source_type='item_icon', file_type='image',
                                    file_hash=digest, is_valid=True).first()
    if existing and (Path(settings.MEDIA_ROOT) / existing.file_path).is_file():
        return existing, True
    icon_id = uuid.uuid4().hex
    relative = f'image/item_icons/{icon_id}.webp'
    target = Path(settings.MEDIA_ROOT) / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with target.open('xb') as stream:
            stream.write(data)
        with transaction.atomic():
            asset = Asset.objects.create(
                id=icon_id, name=name, original_name=f'{name}.webp', file_type='image',
                source_type='item_icon', uploader=owner, file_path=relative,
                file_extension='.webp', mime_type='image/webp', file_size=len(data),
                file_hash=digest, metadata=metadata,
            )
        return asset, False
    except Exception:
        target.unlink(missing_ok=True)
        raise


@transaction.atomic
def bind_icon(item_id: str, owner: str, asset_id: str | None) -> AgentInventoryItem:
    # 同图标删除与绑定按资源锁串行；不改变其他物品的关联。
    asset = None
    if asset_id:
        asset = Asset.objects.select_for_update().filter(
            pk=asset_id, uploader=owner, is_valid=True, source_type='item_icon', file_type='image').first()
        if not asset:
            raise ValueError('图标不存在或不属于当前账号')
        if not (Path(settings.MEDIA_ROOT) / asset.file_path).is_file():
            raise ValueError('图标文件尚未下载或已丢失，请恢复资源后重试')
    item = AgentInventoryItem.objects.select_for_update().filter(pk=item_id, owner_id=owner).first()
    if not item:
        raise LookupError('物品不存在')
    if asset:
        metadata = dict(asset.metadata or {})
        names = list(metadata.get('confirmed_names', []))
        normalized = normalize_item_name(item.name)
        if normalized not in names:
            metadata['confirmed_names'] = [*names, normalized]
            asset.metadata = metadata
            asset.save(update_fields=['metadata', 'update_time'])
    item.icon_asset_id = asset.pk if asset else None
    item.save(update_fields=['icon_asset_id'])
    return item
