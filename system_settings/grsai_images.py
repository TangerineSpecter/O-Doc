"""Grsai nano-banana image generation API adapter."""

import re
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit

import requests

from .models import AIModel, SystemSetting


TASK_ID_RE = re.compile(r'^[A-Za-z0-9_-]{1,128}$')
PENDING_STATUSES = {'pending', 'processing', 'queued', 'running', 'submitted', 'in_progress'}
FAILED_STATUSES = {'failed', 'error', 'cancelled', 'canceled'}


class GrsaiImageError(Exception):
    """A safe, user-facing generation error without provider response secrets."""

    def __init__(self, message: str, *, status_code: int = 502, retryable: bool = False):
        self.status_code = status_code
        self.retryable = retryable
        super().__init__(message)


@dataclass(frozen=True)
class GrsaiImageResult:
    task_id: str
    status: str
    image_urls: tuple[str, ...] = ()


def get_default_image_generation_model() -> AIModel:
    setting = SystemSetting.objects.filter(key='system_ai_config').first()
    value = setting.value if setting and isinstance(setting.value, dict) else {}
    model_id = value.get('defaultImageGenerationModelId') or value.get('default_image_generation_model_id')
    if not model_id:
        raise GrsaiImageError('请先在设置中选择默认生图模型', status_code=400)
    model = AIModel.objects.select_related('provider').filter(pk=model_id, type='image_generation').first()
    if model is None:
        raise GrsaiImageError('默认生图模型已失效，请重新选择', status_code=400)
    if model.provider.type not in ('Grsai', 'NewAPI'):
        raise GrsaiImageError('当前仅支持 Grsai 或 New API 生图模型', status_code=400)
    return model


class GrsaiImageClient:
    def __init__(self, model: AIModel):
        provider = model.provider
        if model.type != 'image_generation' or provider.type != 'Grsai':
            raise GrsaiImageError('所选模型不是 Grsai 生图模型', status_code=400)
        if not provider.api_key:
            raise GrsaiImageError('请先配置 Grsai API Key', status_code=400)

        base_url = (provider.base_url or '').strip().rstrip('/')
        parsed = urlsplit(base_url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise GrsaiImageError('Grsai Base URL 必须是 HTTPS 地址', status_code=400)
        path = parsed.path.rstrip('/')
        if path not in ('', '/v1'):
            raise GrsaiImageError('Grsai Base URL 请填写服务地址或以 /v1 结尾的地址', status_code=400)

        root = urlunsplit((parsed.scheme, parsed.netloc, '', '', '')).rstrip('/')
        self.api_root = f'{root}/v1/api'
        self.api_key = provider.api_key
        self.model_name = model.name

    def _request(self, method: str, path: str, *, payload: dict | None = None, params: dict | None = None) -> dict:
        try:
            response = requests.request(
                method,
                f'{self.api_root}/{path}',
                headers={'Authorization': f'Bearer {self.api_key}', 'Content-Type': 'application/json'},
                json=payload,
                params=params,
                timeout=(10, 45 if method == 'POST' else 20),
                allow_redirects=False,
            )
        except requests.Timeout as exc:
            raise GrsaiImageError('Grsai 请求超时，请稍后重试', status_code=504) from exc
        except requests.RequestException as exc:
            raise GrsaiImageError('无法连接 Grsai 服务，请检查服务地址') from exc

        if response.status_code in (401, 403):
            raise GrsaiImageError('Grsai API Key 无效或无权使用当前模型', status_code=400)
        if response.status_code == 429:
            raise GrsaiImageError('Grsai 请求过于频繁，请稍后重试')
        if not 200 <= response.status_code < 300:
            status_code = 400 if 400 <= response.status_code < 500 else 502
            raise GrsaiImageError(f'Grsai 请求失败（HTTP {response.status_code}）', status_code=status_code)
        try:
            data = response.json()
        except ValueError as exc:
            raise GrsaiImageError('Grsai 返回了无法解析的结果') from exc
        if not isinstance(data, dict):
            raise GrsaiImageError('Grsai 返回格式不正确')
        return data

    @staticmethod
    def _parse_result(data: dict, *, expected_id: str = '') -> GrsaiImageResult:
        task_id = str(data.get('id') or expected_id)
        if not TASK_ID_RE.fullmatch(task_id):
            raise GrsaiImageError('Grsai 返回的任务 ID 无效')
        if expected_id and task_id != expected_id:
            raise GrsaiImageError('Grsai 返回的任务 ID 与查询不一致')
        status = str(data.get('status') or '').lower()
        if status in FAILED_STATUSES:
            raise GrsaiImageError('Grsai 生图失败，请调整提示词后重试', status_code=422)
        results = data.get('results')
        image_urls = tuple(
            item['url'] for item in results[:12]
            if isinstance(item, dict) and isinstance(item.get('url'), str) and item['url']
        ) if isinstance(results, list) else ()
        if image_urls and status in ('', 'succeeded', 'completed', 'success'):
            return GrsaiImageResult(task_id=task_id, status='succeeded', image_urls=image_urls)
        if status in PENDING_STATUSES:
            return GrsaiImageResult(task_id=task_id, status='pending')
        raise GrsaiImageError('Grsai 返回的生成状态不完整')

    def generate(self, prompt: str) -> GrsaiImageResult:
        data = self._request('POST', 'generate', payload={
            'model': self.model_name,
            'prompt': prompt,
            'images': [],
            'aspectRatio': '1:1',
            'imageSize': '1K',
            'replyType': 'json',
        })
        return self._parse_result(data)

    def get_result(self, task_id: str) -> GrsaiImageResult:
        if not TASK_ID_RE.fullmatch(task_id):
            raise GrsaiImageError('Grsai 任务 ID 无效', status_code=400)
        data = self._request('GET', 'result', params={'id': task_id})
        return self._parse_result(data, expected_id=task_id)
