import os
from urllib.parse import unquote, urlparse

from django.conf import settings


RESOURCE_VIEW_PREFIX = '/api/resource/view/'


def get_resource_view_url(resource_id):
    return f'{RESOURCE_VIEW_PREFIX}{resource_id}'


def extract_resource_id_from_view_url(url):
    if not url:
        return None

    path = unquote(urlparse(url).path)
    if not path.startswith(RESOURCE_VIEW_PREFIX):
        return None

    resource_id = path[len(RESOURCE_VIEW_PREFIX):].strip('/')
    return resource_id or None


def is_asset_used_by_image(resource_id, exclude_image_id=None):
    from article.models import Image

    queryset = Image.objects.filter(
        is_valid=True,
        image_url=get_resource_view_url(resource_id),
    )
    if exclude_image_id:
        queryset = queryset.exclude(image_id=exclude_image_id)

    return queryset.exists()


def get_image_resource_usage(resource_ids=None):
    from article.models import Image

    prefix = RESOURCE_VIEW_PREFIX
    queryset = Image.objects.filter(is_valid=True, image_url__startswith=prefix)

    usage = {}
    for image in queryset.only('image_id', 'title', 'coll_id', 'image_url'):
        resource_id = extract_resource_id_from_view_url(image.image_url)
        if not resource_id:
            continue
        if resource_ids is not None and resource_id not in resource_ids:
            continue
        usage.setdefault(resource_id, {
            'id': image.image_id,
            'title': image.title,
            'collId': image.coll_id,
        })

    return usage


def delete_asset_physical_file(asset):
    if not asset.file_path:
        return

    file_abs_path = os.path.join(settings.MEDIA_ROOT, asset.file_path)
    try:
        if os.path.exists(file_abs_path):
            os.remove(file_abs_path)
    except Exception as exc:
        print(f"删除文件失败: {exc}")


def delete_asset_record_and_file(asset):
    delete_asset_physical_file(asset)
    asset.delete()
