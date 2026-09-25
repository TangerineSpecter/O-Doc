"""OpenAI-compatible image generation through a configured New API gateway."""

import base64
import binascii
import json
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import requests

from .grsai_images import GrsaiImageError
from .models import AIModel


MAX_RESPONSE_BYTES = 60 * 1024 * 1024
MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_IMAGES = 4


@dataclass(frozen=True)
class NewApiImageResult:
    images: tuple[bytes | str, ...]


class NewApiImageClient:
    def __init__(self, model: AIModel):
        provider = model.provider
        if model.type != 'image_generation' or provider.type != 'NewAPI':
            raise GrsaiImageError('所选模型不是 New API 生图模型', status_code=400)
        if not provider.api_key:
            raise GrsaiImageError('请先配置 New API 的 API Key', status_code=400)

        base_url = (provider.base_url or '').strip().rstrip('/')
        parsed = urlsplit(base_url)
        if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or parsed.path.endswith('/chat/completions')):
            raise GrsaiImageError('New API Base URL 应填写实例地址或以 /v1 结尾的地址', status_code=400)
        path = parsed.path.rstrip('/')
        if path and not path.endswith('/v1'):
            raise GrsaiImageError('New API Base URL 应以 /v1 结尾', status_code=400)
        self.base_url = base_url if path else f'{base_url}/v1'
        self.api_key = provider.api_key
        self.model_name = model.name

    def generate(self, prompt: str) -> NewApiImageResult:
        try:
            with requests.post(
                f'{self.base_url}/images/generations',
                json={'model': self.model_name, 'prompt': prompt, 'n': 1},
                headers={'Authorization': f'Bearer {self.api_key}', 'Content-Type': 'application/json'},
                timeout=(10, 120), allow_redirects=False, stream=True,
            ) as response:
                if response.status_code in (401, 403):
                    raise GrsaiImageError('New API 的 API Key 无效或无权使用当前模型')
                if response.status_code == 429:
                    raise GrsaiImageError('New API 请求过于频繁，请稍后重试')
                if not 200 <= response.status_code < 300:
                    raise GrsaiImageError(f'New API 生图失败（HTTP {response.status_code}）')
                content = _read_limited(response, MAX_RESPONSE_BYTES)
        except requests.Timeout as exc:
            raise GrsaiImageError('New API 生图请求超时，请检查模型或稍后重试', status_code=504) from exc
        except requests.RequestException as exc:
            raise GrsaiImageError('无法连接 New API 实例，请检查服务地址') from exc

        try:
            data = json.loads(content)
        except (ValueError, UnicodeDecodeError) as exc:
            raise GrsaiImageError('New API 返回了无法解析的结果') from exc
        rows = data.get('data') if isinstance(data, dict) else None
        if not isinstance(rows, list) or not rows or len(rows) > MAX_IMAGES:
            raise GrsaiImageError('New API 未返回有效的图片列表')
        images: list[bytes | str] = []
        for row in rows:
            if not isinstance(row, dict):
                raise GrsaiImageError('New API 返回的图片数据格式不正确')
            encoded = row.get('b64_json')
            url = row.get('url')
            if isinstance(encoded, str) and encoded:
                if len(encoded) > MAX_IMAGE_BYTES * 4 // 3 + 8:
                    raise GrsaiImageError('New API 返回的图片超过 15 MB')
                try:
                    image = base64.b64decode(encoded, validate=True)
                except binascii.Error as exc:
                    raise GrsaiImageError('New API 返回的图片编码无效') from exc
                if len(image) > MAX_IMAGE_BYTES:
                    raise GrsaiImageError('New API 返回的图片超过 15 MB')
                images.append(image)
            elif isinstance(url, str) and url:
                images.append(url)
            else:
                raise GrsaiImageError('New API 未返回图片地址或图片数据')
        return NewApiImageResult(images=tuple(images))

    def fetch_image(self, url: str) -> bytes:
        from utils.web_parser import WebParserError, fetch_remote_image

        resolved = urljoin(f'{self.base_url}/', url)
        base = urlsplit(self.base_url)
        target = urlsplit(resolved)
        same_origin = (base.scheme, base.hostname, base.port) == (target.scheme, target.hostname, target.port)
        if not same_origin:
            try:
                return fetch_remote_image(resolved, max_bytes=MAX_IMAGE_BYTES).content
            except WebParserError as exc:
                raise GrsaiImageError('生成成功，但图片下载失败', retryable=False) from exc
        if target.username or target.password or target.fragment:
            raise GrsaiImageError('New API 返回的图片地址无效')
        try:
            with requests.get(
                resolved, headers={'Authorization': f'Bearer {self.api_key}'},
                timeout=(10, 30), allow_redirects=False, stream=True,
            ) as response:
                if response.status_code != 200:
                    raise GrsaiImageError(f'New API 图片下载失败（HTTP {response.status_code}）')
                return _read_limited(response, MAX_IMAGE_BYTES)
        except requests.RequestException as exc:
            raise GrsaiImageError('New API 图片下载失败，请检查图片地址') from exc


def _read_limited(response: requests.Response, max_bytes: int) -> bytes:
    chunks = []
    size = 0
    for chunk in response.iter_content(chunk_size=64 * 1024):
        size += len(chunk)
        if size > max_bytes:
            raise GrsaiImageError('New API 返回内容过大')
        chunks.append(chunk)
    return b''.join(chunks)
