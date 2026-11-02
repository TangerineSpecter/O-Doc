"""Validate diary photo bytes before the shared resource uploader stores them."""
from pathlib import Path
from PIL import Image, UnidentifiedImageError


def validate_diary_image(uploaded_file):
    if uploaded_file.size > 10 * 1024 * 1024:
        return '日记图片不能超过 10 MB'
    formats = {'JPEG': {'.jpg', '.jpeg'}, 'PNG': {'.png'}, 'GIF': {'.gif'}, 'WEBP': {'.webp'}}
    try:
        with Image.open(uploaded_file) as image:
            if Path(uploaded_file.name).suffix.lower() not in formats.get(image.format, set()):
                return '请选择 JPG、PNG、GIF 或 WebP 图片，文件后缀需与内容一致'
            if image.width * image.height > 40_000_000:
                return '图片像素过大，请压缩后上传'
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        return '图片文件内容无效'
    finally:
        uploaded_file.seek(0)
    return None
