"""Generate prompt images and save successful results as normal prompt assets."""

import hashlib
import os
import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.core import signing
from django.db import transaction
from PIL import Image as PILImage

from assets.models import Asset
from system_settings.grsai_images import GrsaiImageClient, GrsaiImageError, GrsaiImageResult
from system_settings.newapi_images import NewApiImageClient, NewApiImageResult
from utils.web_parser import WebParserError, fetch_remote_image

from .models import PromptResultImage, PromptTemplate, PromptUsage


TOKEN_SALT = 'prompt-grsai-image-generation-v1'
MAX_PROMPT_CHARS = 8000
MAX_RESULT_IMAGES = 4
MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
IMAGE_FORMATS = {'PNG': ('.png', 'image/png'), 'JPEG': ('.jpg', 'image/jpeg'), 'WEBP': ('.webp', 'image/webp')}


@dataclass(frozen=True)
class GeneratedImage:
    content: bytes
    extension: str
    mime_type: str
    file_hash: str


def render_generation_prompt(template: PromptTemplate, input_values: dict) -> tuple[str, str, dict, str]:
    from .rendering import render_template

    positive, stored_values = render_template(template.positive_template, template.field_schema, input_values)
    negative, _ = render_template(template.negative_template, template.field_schema, input_values)
    if not positive:
        raise GrsaiImageError('生图提示词不能为空', status_code=400)
    combined = f'{positive}\n\n避免以下内容：{negative}' if negative else positive
    if len(combined) > MAX_PROMPT_CHARS:
        raise GrsaiImageError('生图提示词过长，请控制在 8000 字以内', status_code=400)
    return positive, negative, stored_values, combined


def sign_generation_task(*, result: GrsaiImageResult, template: PromptTemplate, user_id: str,
                         model_id: str, input_values: dict, positive: str, negative: str) -> str:
    return signing.dumps({
        'task_id': result.task_id,
        'template_id': template.id,
        'user_id': user_id,
        'model_id': model_id,
        'input_values': input_values,
        'positive': positive,
        'negative': negative,
    }, salt=TOKEN_SALT, compress=True)


def load_generation_task(token: str, *, user_id: str) -> dict:
    try:
        payload = signing.loads(token, salt=TOKEN_SALT, max_age=3600)
    except (signing.BadSignature, signing.SignatureExpired) as exc:
        raise GrsaiImageError('生图任务已过期，请重新生成', status_code=400) from exc
    if not isinstance(payload, dict) or payload.get('user_id') != user_id:
        raise GrsaiImageError('生图任务无效', status_code=403)
    if not all(isinstance(payload.get(key), str) for key in ('task_id', 'template_id', 'model_id', 'positive', 'negative')):
        raise GrsaiImageError('生图任务数据不完整', status_code=400)
    if not isinstance(payload.get('input_values'), dict):
        raise GrsaiImageError('生图任务数据不完整', status_code=400)
    return payload


def _download_generated_images(urls: tuple[str, ...]) -> list[GeneratedImage]:
    images = []
    total_size = 0
    for url in dict.fromkeys(urls[:MAX_RESULT_IMAGES]):
        try:
            fetched = fetch_remote_image(url, max_bytes=MAX_IMAGE_BYTES)
        except WebParserError as exc:
            raise GrsaiImageError('生成成功，但图片下载失败，请稍后重试获取结果', retryable=True) from exc
        content = fetched.content
        total_size += len(content)
        if total_size > MAX_TOTAL_IMAGE_BYTES:
            raise GrsaiImageError('生成图片总大小超过 40 MB')
        images.append(_validate_image_content(content))
    if not images:
        raise GrsaiImageError('Grsai 没有返回可保存的图片')
    return images


def _validate_image_content(content: bytes) -> GeneratedImage:
    if len(content) > MAX_IMAGE_BYTES:
        raise GrsaiImageError('生成图片超过 15 MB')
    try:
        with PILImage.open(BytesIO(content)) as image:
            image_format = image.format
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise GrsaiImageError('生成图片尺寸过大')
            image.verify()
    except (OSError, ValueError, PILImage.DecompressionBombError) as exc:
        raise GrsaiImageError('生图服务返回了无效的图片文件') from exc
    if image_format not in IMAGE_FORMATS:
        raise GrsaiImageError('生图服务返回的图片格式暂不支持')
    extension, mime_type = IMAGE_FORMATS[image_format]
    return GeneratedImage(content, extension, mime_type, hashlib.md5(content).hexdigest())


def save_generation_result(*, template: PromptTemplate, user_id: str, client: GrsaiImageClient,
                           result: GrsaiImageResult, input_values: dict, positive: str, negative: str) -> PromptUsage:
    source_url = f'{client.api_root}/result?id={result.task_id}'
    existing = PromptUsage.objects.filter(template=template, source_url=source_url, is_valid=True).first()
    if existing:
        return existing
    images = _download_generated_images(result.image_urls)
    return _save_images(
        template=template, user_id=user_id, images=images, input_values=input_values,
        positive=positive, negative=negative, model_name=client.model_name, source_url=source_url,
    )


def save_newapi_generation_result(*, template: PromptTemplate, user_id: str, client: NewApiImageClient,
                                  result: NewApiImageResult, input_values: dict, positive: str,
                                  negative: str) -> PromptUsage:
    images = []
    total_size = 0
    for item in result.images:
        content = item if isinstance(item, bytes) else client.fetch_image(item)
        total_size += len(content)
        if total_size > MAX_TOTAL_IMAGE_BYTES:
            raise GrsaiImageError('生成图片总大小超过 40 MB')
        images.append(_validate_image_content(content))
    return _save_images(
        template=template, user_id=user_id, images=images, input_values=input_values,
        positive=positive, negative=negative, model_name=client.model_name, source_url='',
    )


def _save_images(*, template: PromptTemplate, user_id: str, images: list[GeneratedImage], input_values: dict,
                 positive: str, negative: str, model_name: str, source_url: str) -> PromptUsage:
    if source_url:
        existing = PromptUsage.objects.filter(template=template, source_url=source_url, is_valid=True).first()
        if existing:
            return existing
    media_root = Path(settings.MEDIA_ROOT).resolve()
    image_dir = media_root / 'image'
    image_dir.mkdir(parents=True, exist_ok=True)
    if image_dir.resolve().parent != media_root:
        raise GrsaiImageError('图片存储目录无效')

    staged_paths: list[Path] = []
    final_paths: list[Path] = []
    try:
        for image in images:
            staged_path = image_dir / f'.generated-{uuid.uuid4().hex}.tmp'
            with staged_path.open('xb') as output:
                output.write(image.content)
            staged_paths.append(staged_path)

        with transaction.atomic():
            PromptTemplate.objects.select_for_update().get(pk=template.pk, user_id=user_id, is_valid=True)
            if source_url:
                existing = PromptUsage.objects.filter(template=template, source_url=source_url, is_valid=True).first()
                if existing:
                    return existing
            usage = PromptUsage.objects.create(
                template=template,
                input_values=input_values,
                rendered_positive=positive,
                rendered_negative=negative,
                model_name=model_name[:120],
                source_url=source_url[:500],
            )
            for index, (image, staged_path) in enumerate(zip(images, staged_paths)):
                asset_id = uuid.uuid4().hex[:16]
                filename = f'{asset_id}{image.extension}'
                final_path = image_dir / filename
                os.replace(staged_path, final_path)
                final_paths.append(final_path)
                asset = Asset.objects.create(
                    id=asset_id,
                    name=filename,
                    original_name=filename,
                    file_type='image',
                    file_size=len(image.content),
                    file_path=os.path.join('image', filename),
                    file_extension=image.extension,
                    mime_type=image.mime_type,
                    file_hash=image.file_hash,
                    uploader=user_id,
                    is_linked=True,
                    source_type='prompt',
                )
                PromptResultImage.objects.create(usage=usage, asset=asset, sort=index)
            return usage
    except Exception:
        for path in final_paths:
            path.unlink(missing_ok=True)
        raise
    finally:
        for path in staged_paths:
            path.unlink(missing_ok=True)
