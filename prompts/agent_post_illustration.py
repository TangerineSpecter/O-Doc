"""Queue and recover illustrations for agent posts without blocking publication."""

import logging
import re
import uuid
from datetime import timedelta
from urllib.parse import urljoin, urlsplit

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from article.models import Article
from system_settings.grsai_images import GrsaiImageClient, GrsaiImageError, get_default_image_generation_model
from system_settings.image_generation_options import resolve_agent_post_illustration_request
from system_settings.models import AIModel
from system_settings.newapi_images import NewApiImageClient

from .article_illustration import (
    build_article_illustration_prompt,
    save_first_grsai_illustration,
    save_first_newapi_illustration,
)
from .models import AgentPostIllustration

logger = logging.getLogger(__name__)

MAX_ILLUSTRATIONS = 2
MAX_GENERATE_ATTEMPTS = 2
MAX_DOWNLOAD_ATTEMPTS = 8
GENERATING_TIMEOUT = timedelta(hours=2)
# Covers the bounded provider request and download; crashed workers become retryable.
CLAIM_TIMEOUT = timedelta(minutes=10)
ILLUSTRATION_BLOCK_RE = re.compile(
    r'\{\{illustration(?:\s+ratio="([^"]*)")?\s*\}\}(.*?)\{\{/illustration\}\}',
    re.IGNORECASE | re.DOTALL,
)
PLACEHOLDER_TEMPLATE = '![{alt}](odoc-illustration:{job_id})'


def prepare_post_illustrations(*, content: str, title: str, enabled: bool, skip: bool):
    """Replace illustration markers with placeholders and return jobs to create."""
    matches = list(ILLUSTRATION_BLOCK_RE.finditer(content))
    if not enabled or skip:
        notes = []
        if matches and skip:
            notes.append('已按要求不配图。')
        elif matches:
            notes.append('当前 Agent 未绑定生图 MCP，配图标记已还原为文字，未生成图片。')
        return _replace_matches(content, [(match, _brief_text(match)) for match in matches]), [], notes

    notes = []
    if not matches:
        content = _insert_default_block(content, _default_brief(title, content))
        matches = list(ILLUSTRATION_BLOCK_RE.finditer(content))
        notes.append('正文未写配图标记，已在第一段后补一张配图。')
    if len(matches) > MAX_ILLUSTRATIONS:
        notes.append('配图超过 2 张，仅保留前两张。')

    model, config_error = _current_model()
    replacements = []
    specs = []
    for index, match in enumerate(matches):
        if index >= MAX_ILLUSTRATIONS:
            replacements.append((match, _brief_text(match)))
            continue
        spec = _build_spec(match, model, config_error)
        specs.append(spec)
        replacements.append((match, _placeholder(spec['id'], failed=spec['status'] == AgentPostIllustration.STATUS_FAILED)))
        if spec['note']:
            notes.append(spec['note'])

    if any(spec['status'] == AgentPostIllustration.STATUS_QUEUED for spec in specs):
        notes.append('帖子已发布。配图在后台生成，完成后会替换正文中的占位符。请不要声称图片已经可见。')
    elif specs:
        notes.append('帖子已发布。配图未能开始，正文保留失败占位。')
    return _replace_matches(content, replacements), specs, notes


def create_illustration_jobs(*, article: Article, user_id: str, specs: list[dict]) -> list[dict]:
    public = []
    for spec in specs:
        note = spec.pop('note', '')
        AgentPostIllustration.objects.create(user_id=user_id, article_id=article.article_id, **spec)
        public.append({
            'job_id': spec['id'],
            'status': spec['status'],
            'aspect_ratio': spec['aspect_ratio'],
            'note': note,
        })
    return public


def process_due_illustrations(*, now=None, limit=5) -> int:
    now = now or timezone.now()
    due = AgentPostIllustration.objects.filter(
        status__in=[
            AgentPostIllustration.STATUS_QUEUED,
            AgentPostIllustration.STATUS_GENERATING,
            AgentPostIllustration.STATUS_DOWNLOAD_PENDING,
        ],
    ).filter(Q(next_attempt_at__isnull=True) | Q(next_attempt_at__lte=now)).order_by('created_at')[:limit]
    processed = 0
    for job in list(due):
        try:
            advance_agent_post_illustration(job, now=now)
        except Exception:
            logger.exception('Agent post illustration failed: id=%s', job.id)
        processed += 1
    return processed


def advance_agent_post_illustration(job: AgentPostIllustration, now=None) -> None:
    now = now or timezone.now()
    lease_until = now + CLAIM_TIMEOUT
    claimed = AgentPostIllustration.objects.filter(
        pk=job.pk,
        status__in=['queued', 'generating', 'download_pending'],
    ).filter(Q(next_attempt_at__isnull=True) | Q(next_attempt_at__lte=now)).update(
        next_attempt_at=lease_until,
    )
    if not claimed:
        return
    try:
        _advance_claimed_illustration(job, now)
    finally:
        # Do not overwrite the next retry time saved by a completed transition.
        AgentPostIllustration.objects.filter(pk=job.pk, next_attempt_at=lease_until).update(
            next_attempt_at=now + timedelta(seconds=30),
        )


def _advance_claimed_illustration(job: AgentPostIllustration, now) -> None:
    job.refresh_from_db()
    if job.status not in {
        AgentPostIllustration.STATUS_QUEUED,
        AgentPostIllustration.STATUS_GENERATING,
        AgentPostIllustration.STATUS_DOWNLOAD_PENDING,
    }:
        return
    if not Article.objects.filter(article_id=job.article_id, is_valid=True).exists():
        job.status = AgentPostIllustration.STATUS_FAILED
        job.error_message = '帖子已删除'
        job.next_attempt_at = None
        job.save(update_fields=['status', 'error_message', 'next_attempt_at', 'updated_at'])
        return
    if job.image_url and job.status != AgentPostIllustration.STATUS_DOWNLOAD_PENDING:
        job.status = AgentPostIllustration.STATUS_DOWNLOAD_PENDING
        job.save(update_fields=['status', 'updated_at'])
    if job.status == AgentPostIllustration.STATUS_DOWNLOAD_PENDING or job.image_url:
        _retry_download(job, now)
        return
    if job.status == AgentPostIllustration.STATUS_GENERATING or job.provider_task_id:
        _poll_generation(job, now)
        return
    _generate(job, now)


def _current_model():
    try:
        return get_default_image_generation_model(), ''
    except GrsaiImageError as exc:
        return None, str(exc)


def _build_spec(match, model, config_error: str) -> dict:
    spec = {
        'id': uuid.uuid4().hex,
        'prompt': _brief_text(match)[:4000],
        'aspect_ratio': (match.group(1) or '').strip() or '16:9',
        'image_size': '1K',
        'status': AgentPostIllustration.STATUS_QUEUED,
        'model_id': '',
        'provider_type': '',
        'error_message': '',
        'note': '',
    }
    if config_error or model is None:
        spec['status'] = AgentPostIllustration.STATUS_FAILED
        spec['error_message'] = (config_error or '请先在设置中选择默认生图模型')[:200]
        return spec
    try:
        _options, applied, note = resolve_agent_post_illustration_request(model, spec['aspect_ratio'])
    except ValueError as exc:
        spec['status'] = AgentPostIllustration.STATUS_FAILED
        spec['error_message'] = str(exc)[:200]
        return spec
    spec['aspect_ratio'] = applied
    spec['note'] = note
    spec['model_id'] = model.id
    spec['provider_type'] = model.provider.type
    return spec


def _brief_text(match) -> str:
    return re.sub(r'\s+', ' ', match.group(2) or '').strip()


def _default_brief(title: str, content: str) -> str:
    opening = content.strip().split('\n\n', 1)[0].strip()
    return f'{title}\n{opening}'.strip()[:4000]


def _insert_default_block(content: str, brief: str) -> str:
    block = '{{illustration}}\n' + (brief or '帖子配图') + '\n{{/illustration}}'
    body = content.strip('\n')
    opening, separator, rest = body.partition('\n\n')
    if not separator:
        return f'{opening}\n\n{block}\n'
    return f'{opening}\n\n{block}\n\n{rest}\n'


def _placeholder(job_id: str, *, failed: bool) -> str:
    alt = '配图失败' if failed else '配图生成中'
    return PLACEHOLDER_TEMPLATE.format(alt=alt, job_id=job_id)


def _replace_matches(content: str, replacements: list[tuple[re.Match, str]]) -> str:
    result = content
    for match, replacement in reversed(replacements):
        result = result[:match.start()] + replacement + result[match.end():]
    return result


def _generate(job: AgentPostIllustration, now) -> None:
    job.generate_attempts += 1
    job.save(update_fields=['generate_attempts', 'updated_at'])
    if job.generate_attempts > MAX_GENERATE_ATTEMPTS:
        _fail(job, job.error_message or '配图生成失败')
        return
    model = _load_model(job)
    if model is None:
        _fail(job, '请先在设置中选择默认生图模型')
        return
    try:
        options, applied, _note = resolve_agent_post_illustration_request(model, job.aspect_ratio)
        prompt = build_article_illustration_prompt((job.prompt or '帖子配图')[:4000])
    except (ValueError, GrsaiImageError) as exc:
        _fail(job, str(exc))
        return
    job.aspect_ratio = applied
    job.model_id = model.id
    job.provider_type = model.provider.type
    job.save(update_fields=['aspect_ratio', 'model_id', 'provider_type', 'updated_at'])
    try:
        if model.provider.type == 'NewAPI':
            _start_newapi(job, model, prompt, now)
        elif model.provider.type == 'Grsai':
            _start_grsai(job, model, prompt, options, now)
        else:
            _fail(job, '当前仅支持 Grsai 或 New API 生图模型')
    except GrsaiImageError as exc:
        if job.provider_task_id or job.image_url:
            job.status = AgentPostIllustration.STATUS_GENERATING if not job.image_url else AgentPostIllustration.STATUS_DOWNLOAD_PENDING
            if job.status == AgentPostIllustration.STATUS_GENERATING and not job.generating_started_at:
                job.generating_started_at = now
            job.save()
            return
        if job.generate_attempts >= MAX_GENERATE_ATTEMPTS:
            _fail(job, str(exc))
            return
        job.status = AgentPostIllustration.STATUS_QUEUED
        job.error_message = str(exc)[:200]
        job.next_attempt_at = _backoff(job.generate_attempts, now)
        job.save(update_fields=['status', 'error_message', 'next_attempt_at', 'updated_at'])


def _start_grsai(job, model, prompt, options, now) -> None:
    result = GrsaiImageClient(model).generate(prompt, generation_options=options)
    job.provider_task_id = result.task_id
    job.provider_type = 'Grsai'
    if result.status == 'succeeded' and result.image_urls:
        _complete_from_urls(job, result.image_urls, now)
        return
    job.status = AgentPostIllustration.STATUS_GENERATING
    job.generating_started_at = now
    job.next_attempt_at = now + timedelta(seconds=20)
    job.error_message = ''
    job.save()


def _start_newapi(job, model, prompt, now) -> None:
    client = NewApiImageClient(model)
    image_data = client.generate(prompt).images[0]
    job.provider_type = 'NewAPI'
    job.provider_task_id = job.id
    if not isinstance(image_data, str):
        asset = save_first_newapi_illustration(image_data, client, user_id=job.user_id, task_id=job.id)
        _succeed(job, asset)
        return
    image_url = urljoin(f'{client.base_url}/', image_data)
    try:
        asset = save_first_newapi_illustration(image_data, client, user_id=job.user_id, task_id=job.id)
    except GrsaiImageError as exc:
        _mark_download_pending(job, image_url, str(exc), now)
        return
    _succeed(job, asset)


def _poll_generation(job: AgentPostIllustration, now) -> None:
    started = _same_clock(job.generating_started_at or job.created_at, now)
    if started and now - started > GENERATING_TIMEOUT:
        _fail(job, '配图生成超时')
        return
    model = _load_model(job)
    if model is None or model.provider.type != 'Grsai':
        _fail(job, '生图模型已删除，无法查询配图任务')
        return
    try:
        result = GrsaiImageClient(model).get_result(job.provider_task_id)
    except GrsaiImageError as exc:
        if exc.status_code == 422:
            _retry_generation_after_provider_failure(job, str(exc), now)
            return
        job.error_message = str(exc)[:200]
        job.next_attempt_at = now + timedelta(seconds=30)
        job.save(update_fields=['error_message', 'next_attempt_at', 'updated_at'])
        return
    if result.status != 'succeeded':
        job.next_attempt_at = now + timedelta(seconds=20)
        job.save(update_fields=['next_attempt_at', 'updated_at'])
        return
    _complete_from_urls(job, result.image_urls, now)


def _retry_generation_after_provider_failure(job, message: str, now) -> None:
    if job.generate_attempts >= MAX_GENERATE_ATTEMPTS:
        _fail(job, message)
        return
    job.provider_task_id = ''
    job.status = AgentPostIllustration.STATUS_QUEUED
    job.generating_started_at = None
    job.error_message = message[:200]
    job.next_attempt_at = _backoff(job.generate_attempts, now)
    job.save()


def _complete_from_urls(job, image_urls, now) -> None:
    image_url = image_urls[0] if image_urls else ''
    if not _valid_remote_url(image_url):
        _fail(job, '生图服务返回的图片地址无效')
        return
    try:
        asset = save_first_grsai_illustration((image_url,), user_id=job.user_id, task_id=job.id)
    except GrsaiImageError as exc:
        _mark_download_pending(job, image_url, str(exc), now)
        return
    _succeed(job, asset)


def _retry_download(job: AgentPostIllustration, now) -> None:
    if not _valid_remote_url(job.image_url):
        _fail(job, '没有可下载的图片地址')
        return
    job.download_attempts += 1
    job.save(update_fields=['download_attempts', 'updated_at'])
    try:
        asset = _download_stored_url(job)
    except GrsaiImageError as exc:
        job.error_message = str(exc)[:200]
        if job.download_attempts >= MAX_DOWNLOAD_ATTEMPTS:
            _fail(job, job.error_message)
            return
        job.next_attempt_at = _backoff(job.download_attempts, now)
        job.save(update_fields=['error_message', 'next_attempt_at', 'updated_at'])
        return
    _succeed(job, asset)


def _download_stored_url(job: AgentPostIllustration) -> dict:
    if job.provider_type == 'NewAPI':
        model = _load_model(job)
        if model is None:
            raise GrsaiImageError('生图模型已删除，无法下载配图')
        return save_first_newapi_illustration(
            job.image_url, NewApiImageClient(model), user_id=job.user_id, task_id=job.id,
        )
    return save_first_grsai_illustration((job.image_url,), user_id=job.user_id, task_id=job.id)


def _mark_download_pending(job, image_url: str, message: str, now) -> None:
    if not _valid_remote_url(image_url):
        _fail(job, '生图服务返回的图片地址无效')
        return
    job.image_url = image_url
    job.status = AgentPostIllustration.STATUS_DOWNLOAD_PENDING
    job.error_message = message[:200]
    job.download_attempts += 1
    if job.download_attempts >= MAX_DOWNLOAD_ATTEMPTS:
        _fail(job, job.error_message)
        return
    job.next_attempt_at = _backoff(max(job.download_attempts, 1), now)
    job.save()


def _succeed(job, asset: dict) -> None:
    _replace_placeholder(job, f'![]({asset["image_url"]})')
    job.status = AgentPostIllustration.STATUS_SUCCEEDED
    job.asset_id = asset['id']
    job.image_url = ''
    job.error_message = ''
    job.next_attempt_at = None
    job.save()


def _fail(job, message: str) -> None:
    job.status = AgentPostIllustration.STATUS_FAILED
    job.error_message = message[:200]
    job.next_attempt_at = None
    job.save()
    _replace_placeholder(job, _placeholder(job.id, failed=True))


@transaction.atomic
def _replace_placeholder(job, replacement: str) -> None:
    article = Article.objects.select_for_update().filter(article_id=job.article_id, is_valid=True).first()
    if not article:
        return
    pattern = re.compile(r'!\[[^\]]*\]\(odoc-illustration:' + re.escape(job.id) + r'\)')
    if not pattern.search(article.content or ''):
        return
    article.content = pattern.sub(replacement, article.content, count=1)
    article.save()


def _load_model(job):
    if job.model_id:
        return AIModel.objects.select_related('provider').filter(pk=job.model_id, type='image_generation').first()
    try:
        return get_default_image_generation_model()
    except GrsaiImageError:
        return None


def _valid_remote_url(image_url: str) -> bool:
    try:
        parsed = urlsplit(image_url)
    except (TypeError, ValueError):
        return False
    return bool(
        image_url and len(image_url) <= 2048 and parsed.scheme in {'http', 'https'} and parsed.hostname
        and not parsed.username and not parsed.password
    )


def _same_clock(value, now):
    if value is None or timezone.is_aware(value) == timezone.is_aware(now):
        return value
    if timezone.is_aware(value):
        return timezone.make_naive(value, timezone.get_current_timezone())
    return timezone.make_aware(value, timezone.get_current_timezone())


def _backoff(attempts: int, now):
    seconds = min(900, 30 * (2 ** max(attempts - 1, 0)))
    return now + timedelta(seconds=seconds)
