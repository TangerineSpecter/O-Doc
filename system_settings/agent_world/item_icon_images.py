"""物品专用的位图处理；只输出小图，不保存上传原件。"""
from io import BytesIO
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError

ICON_SIZE = 256
MAX_BYTES = 20 * 1024 * 1024
MAX_PIXELS = 16_000_000


def compress_icon(upload) -> tuple[bytes, dict]:
    if upload.size <= 0 or upload.size > MAX_BYTES:
        raise ValueError('图片文件必须小于或等于 20MB')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            upload.seek(0)
            with Image.open(upload) as image:
                if image.format not in {'PNG', 'JPEG', 'WEBP'}:
                    raise ValueError('仅支持静态 PNG、JPEG、WebP 图片')
                if getattr(image, 'is_animated', False):
                    raise ValueError('物品图标不支持动画图片')
                if image.width * image.height > MAX_PIXELS:
                    raise ValueError('图片总像素不能超过 1600 万')
                original_width, original_height = image.size
                image.load()
                bitmap = ImageOps.exif_transpose(image).convert('RGBA')
                bitmap.thumbnail((ICON_SIZE, ICON_SIZE), Image.Resampling.LANCZOS)
                canvas = Image.new('RGBA', (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
                canvas.alpha_composite(bitmap, ((ICON_SIZE - bitmap.width) // 2, (ICON_SIZE - bitmap.height) // 2))
                output = BytesIO()
                canvas.save(output, format='WEBP', quality=90, method=6)
                data = output.getvalue()
                return data, {
                    'width': ICON_SIZE, 'height': ICON_SIZE,
                    'content_width': bitmap.width, 'content_height': bitmap.height,
                    'original_width': original_width, 'original_height': original_height,
                    'original_size': upload.size, 'icon_version': 1,
                    'confirmed_names': [],
                }
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError('图片损坏、格式无效或尺寸过大') from exc
