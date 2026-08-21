import base64
from io import BytesIO
import logging
import mimetypes
import os
from urllib.parse import unquote

from django.conf import settings
from PIL import Image as PILImage

from assets.models import Asset
from utils.resource_assets import extract_resource_id_from_view_url


logger = logging.getLogger(__name__)
IMAGE_DESCRIPTION_MAX_EDGE = 1280
IMAGE_DESCRIPTION_JPEG_QUALITY = 82


def build_image_description_data_url(image_bytes, mime_type='image/jpeg'):
    """压缩图片，减少视觉模型请求耗时和请求体大小。"""
    original_size = len(image_bytes)
    try:
        with PILImage.open(BytesIO(image_bytes)) as image:
            original_dimensions = image.size
            image.thumbnail((IMAGE_DESCRIPTION_MAX_EDGE, IMAGE_DESCRIPTION_MAX_EDGE), PILImage.Resampling.LANCZOS)
            if image.mode not in ('RGB', 'L'):
                image = image.convert('RGB')

            output = BytesIO()
            image.save(output, format='JPEG', quality=IMAGE_DESCRIPTION_JPEG_QUALITY, optimize=True)
            compressed_bytes = output.getvalue()
            compressed_size = len(compressed_bytes)
            logger.warning(
                "Image description compression: original=%d bytes %sx%s, compressed=%d bytes %sx%s, ratio=%.2f%%",
                original_size,
                original_dimensions[0],
                original_dimensions[1],
                compressed_size,
                image.size[0],
                image.size[1],
                (compressed_size / original_size * 100) if original_size else 0,
            )
            encoded = base64.b64encode(compressed_bytes).decode('utf-8')
            return f'data:image/jpeg;base64,{encoded}'
    except Exception as exc:
        logger.warning(f"Image compression failed, fallback to original image: {exc}")
        encoded = base64.b64encode(image_bytes).decode('utf-8')
        logger.warning("Image description compression fallback: original=%d bytes, data_url=%d chars", original_size, len(encoded))
        return f'data:{mime_type};base64,{encoded}'


def compress_image_data_url(image_data_url):
    if not isinstance(image_data_url, str) or not image_data_url.startswith('data:image/'):
        return None

    try:
        header, encoded = image_data_url.split(',', 1)
        mime_type = header.split(';', 1)[0].replace('data:', '') or 'image/jpeg'
        image_bytes = base64.b64decode(unquote(encoded))
        return build_image_description_data_url(image_bytes, mime_type)
    except Exception as exc:
        logger.warning(f"Image data URL compression failed, fallback to original data URL: {exc}")
        logger.warning("Image description compression fallback: data_url=%d chars", len(image_data_url))
        return image_data_url


def build_image_data_url(image_url):
    """将本地资源图片转换为视觉模型可读取的 data URL。"""
    resource_id = extract_resource_id_from_view_url(image_url)
    if not resource_id:
        return None

    asset = Asset.objects.filter(id=resource_id, is_valid=True, file_type='image').first()
    if not asset:
        return None

    abs_file_path = os.path.join(settings.MEDIA_ROOT, asset.file_path)
    if not os.path.exists(abs_file_path):
        return None

    mime_type = asset.mime_type or mimetypes.guess_type(asset.original_name or asset.name)[0] or 'image/jpeg'
    with open(abs_file_path, 'rb') as image_file:
        return build_image_description_data_url(image_file.read(), mime_type)

    return None


