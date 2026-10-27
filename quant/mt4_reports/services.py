from hashlib import sha256
from io import BytesIO
from pathlib import Path

from django.conf import settings
from rest_framework.exceptions import ValidationError
from PIL import Image

from assets.models import Asset
from .archive import read_zip
from .parser import MAX_HTML_BYTES, ReportError, parse_report


def owned_asset(owner, identity):
    asset = Asset.objects.filter(pk=identity, uploader=owner, is_valid=True).first()
    if not asset:
        raise ValidationError('附件不存在或不属于当前账号')
    return asset


def asset_bytes(asset, limit):
    root = Path(settings.MEDIA_ROOT).resolve()
    path = (root / asset.file_path).resolve()
    if root not in path.parents or not path.is_file():
        raise ValidationError('附件文件不存在')
    if path.stat().st_size > limit:
        raise ValidationError('附件超过允许大小')
    return path.read_bytes()


def validate_image(asset):
    if asset.file_type != 'image':
        raise ValidationError('曲线图或截图必须是图片')
    contents = asset_bytes(asset, 50 * 1024 * 1024)
    try:
        with Image.open(BytesIO(contents)) as image:
            image.verify()
            if image.format not in ('GIF', 'PNG', 'JPEG', 'WEBP'):
                raise ValidationError('仅支持 GIF、PNG、JPEG 或 WebP 图片')
    except ValidationError:
        raise
    except Exception as exc:
        raise ValidationError('图片文件内容无效') from exc


def inspect_asset(asset):
    try:
        suffix = Path(asset.original_name).suffix.lower()
        if suffix == '.zip':
            from .archive import MAX_ZIP_BYTES
            bundle = read_zip(asset_bytes(asset, MAX_ZIP_BYTES))
            return bundle.report, sha256(bundle.html).hexdigest(), bool(bundle.image)
        if suffix in ('.htm', '.html'):
            html = asset_bytes(asset, MAX_HTML_BYTES)
            return parse_report(html), sha256(html).hexdigest(), False
        raise ValidationError('请选择 MT4 的 HTML 或 ZIP 报告')
    except ReportError as exc:
        raise ValidationError(str(exc)) from exc
