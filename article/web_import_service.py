import base64
import binascii
import hashlib
import logging
import os
import re
import shutil
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, wait
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote, unquote_to_bytes, urlsplit

import requests
from django.conf import settings
from django.db import models, transaction
from PIL import Image as PILImage

from anthology.models import Anthology
from article.models import Article
from article.prompts import (
    POLISH_ARTICLE_PROMPT_TEMPLATE,
    WEB_IMPORT_AI_SYSTEM_PROMPT,
    WEB_IMPORT_AI_USER_PROMPT_TEMPLATE,
)
from assets.models import Asset
from system_settings.sync_state import record_bulk_change
from utils.ai_service import AIService
from utils.resource_assets import get_resource_view_url
from utils.web_parser import (
    ParsedWebContent,
    WebContentCandidate,
    WebParserError,
    extract_html_content,
    extract_web_content,
    fetch_remote_image,
)


logger = logging.getLogger(__name__)

MAX_AI_PRIMARY_CANDIDATE_CHARS = 48000
MAX_AI_SECONDARY_CANDIDATE_CHARS = 6000
MAX_POLISH_CHUNK_CHARS = 8000
MAX_IMPORT_IMAGES = 40
MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_TOTAL_IMAGE_BYTES = 100 * 1024 * 1024
IMAGE_DOWNLOAD_WORKERS = 4
IMAGE_DOWNLOAD_DEADLINE_SECONDS = 30
MAX_IMPORT_FILE_BYTES = 30 * 1024 * 1024

MARKDOWN_IMAGE_RE = re.compile(
    r'!\[(?P<alt>[^\]]*)\]\((?P<url>https?://[^)\s]+)(?P<title>\s+["\'][^"\']*["\'])?\)',
    re.IGNORECASE,
)
ALL_MARKDOWN_IMAGE_RE = re.compile(
    r'!\[(?P<alt>[^\]]*)\]\((?P<url>[^)\s]+)(?P<title>\s+["\'][^"\']*["\'])?\)',
    re.IGNORECASE,
)
FENCED_CODE_RE = re.compile(r'```[^\n]*\n.*?\n```', re.DOTALL)
PROTECTED_TOKEN_RE = re.compile(r'\[\[OD_(?:IMAGE|CODE)_[A-Z0-9_]+\]\]')
AI_RESPONSE_RE = re.compile(
    r'^\s*OD_SELECTED:(candidate_\d+)\s*\nOD_CONTENT_BEGIN\s*\n(.*?)\nOD_CONTENT_END\s*$',
    re.DOTALL,
)

IMAGE_FORMATS = {
    'JPEG': ('.jpg', 'image/jpeg'),
    'PNG': ('.png', 'image/png'),
    'GIF': ('.gif', 'image/gif'),
    'WEBP': ('.webp', 'image/webp'),
    'BMP': ('.bmp', 'image/bmp'),
}
SUPPORTED_IMPORT_EXTENSIONS = {'.html', '.htm', '.md', '.markdown'}


class AIExtractionError(RuntimeError):
    """Raised when AI extraction cannot produce a validated article body."""


class ImageDownloadBudget:
    """Thread-safe byte budget retained by successful image downloads."""

    def __init__(self, limit):
        self.limit = limit
        self.remaining = limit
        self._lock = threading.Lock()

    def claim(self, size):
        with self._lock:
            if size > self.remaining:
                raise WebParserError('正文图片总大小超过 100 MB，超出部分已保留外链。')
            self.remaining -= size

    def release(self, size):
        with self._lock:
            self.remaining = min(self.remaining + size, self.limit)


@dataclass(frozen=True)
class WebImportReport:
    extraction_mode: str
    confidence: str
    localized_image_count: int
    external_image_count: int
    warnings: tuple[str, ...]

    def as_dict(self):
        return {
            'extraction_mode': self.extraction_mode,
            'confidence': self.confidence,
            'localized_image_count': self.localized_image_count,
            'external_image_count': self.external_image_count,
            'warnings': list(self.warnings),
        }


@dataclass(frozen=True)
class WebImportResult:
    article: Article
    report: WebImportReport


@dataclass(frozen=True)
class DownloadedImage:
    source_url: str
    final_url: str
    content: bytes
    extension: str
    mime_type: str
    original_name: str
    file_hash: str


@dataclass(frozen=True)
class StagedAsset:
    asset_id: str
    source_url: str
    temp_path: str
    file_name: str
    original_name: str
    extension: str
    mime_type: str
    file_size: int
    file_hash: str


def _image_from_bytes(content, *, source_url, original_name):
    if len(content) > MAX_IMAGE_BYTES:
        raise WebParserError('图片超过 15 MB，已跳过本地化。')
    try:
        with PILImage.open(BytesIO(content)) as image:
            image_format = str(image.format or '').upper()
            image.verify()
    except Exception as exc:
        raise WebParserError('图片内容无法验证') from exc

    extension_and_mime = IMAGE_FORMATS.get(image_format)
    if not extension_and_mime:
        raise WebParserError('图片格式暂不支持本地化')
    extension, mime_type = extension_and_mime
    file_hash = hashlib.md5(content).hexdigest()
    if original_name and not Path(original_name).suffix:
        original_name = f'{original_name}{extension}'
    return DownloadedImage(
        source_url=source_url,
        final_url=source_url,
        content=content,
        extension=extension,
        mime_type=mime_type,
        original_name=original_name or f'embedded-{file_hash[:12]}{extension}',
        file_hash=file_hash,
    )


def _decode_data_image(value):
    if not isinstance(value, str) or not value.lower().startswith('data:image/'):
        raise WebParserError('内嵌图片格式不受支持')
    try:
        header, payload = value.split(',', 1)
    except ValueError as exc:
        raise WebParserError('内嵌图片编码无效') from exc
    mime_type = header[5:].split(';', 1)[0].lower()
    if mime_type == 'image/svg+xml':
        raise WebParserError('内嵌图片格式不受支持')
    try:
        if header.lower().endswith(';base64'):
            return base64.b64decode(payload, validate=True)
        return unquote_to_bytes(payload)
    except (ValueError, binascii.Error) as exc:
        raise WebParserError('内嵌图片编码无效') from exc


def _discover_html_source_url(soup):
    meta = soup.find('meta', attrs={'property': 'og:url'})
    candidates = [str(meta.get('content') or '').strip()] if meta else []
    canonical = soup.find('link', attrs={'rel': lambda value: value and 'canonical' in value})
    if canonical:
        candidates.append(str(canonical.get('href') or '').strip())
    for candidate in candidates:
        if urlsplit(candidate).scheme.lower() in {'http', 'https'}:
            return candidate
    return ''


def prepare_html_archive(content):
    """Prepare saved browser HTML without executing scripts and retain embedded originals."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(content, 'html.parser')
    source_url = _discover_html_source_url(soup)
    embedded_images = {}
    warnings = []
    discarded_image_urls = set()
    lazy_attributes = ('data-original', 'data-actualsrc', 'data-src', 'data-lazy-src')

    for index, image in enumerate(soup.find_all('img'), start=1):
        inline_source = str(image.get('src') or '')
        if not inline_source.startswith('data:image/'):
            continue
        remote_url = next((
            str(image.get(attribute) or '').strip()
            for attribute in lazy_attributes
            if str(image.get(attribute) or '').strip().startswith(('http://', 'https://'))
        ), '')
        try:
            image_bytes = _decode_data_image(inline_source)
            file_hash = hashlib.md5(image_bytes).hexdigest()
            image_url = remote_url or f'https://embedded.odoc.invalid/{file_hash}'
            downloaded = _image_from_bytes(
                image_bytes,
                source_url=image_url,
                original_name=_safe_original_name(image_url, '', index),
            )
            embedded_images[image_url] = downloaded
            image['src'] = image_url
            image['data-original'] = image_url
        except WebParserError:
            if remote_url:
                image['src'] = remote_url
                image['data-original'] = remote_url
            else:
                failed_hash = hashlib.md5(inline_source.encode('utf-8')).hexdigest()
                failed_url = f'https://embedded-unsupported.odoc.invalid/{failed_hash}'
                image['src'] = failed_url
                image['data-original'] = failed_url
                discarded_image_urls.add(failed_url)

    return (
        str(soup), source_url, embedded_images,
        list(dict.fromkeys(warnings)), discarded_image_urls,
    )


def _protect_markdown_literals(markdown, prefix):
    mapping = {}
    counters = {'CODE': 0, 'IMAGE': 0}

    def replace(kind):
        def replacer(match):
            counters[kind] += 1
            token = f'[[OD_{kind}_{prefix}_{counters[kind]:04d}]]'
            mapping[token] = match.group(0)
            return token
        return replacer

    protected = FENCED_CODE_RE.sub(replace('CODE'), markdown)
    protected = ALL_MARKDOWN_IMAGE_RE.sub(replace('IMAGE'), protected)
    return protected, mapping


def _restore_markdown_literals(markdown, mapping):
    found = PROTECTED_TOKEN_RE.findall(markdown)
    if set(found) != set(mapping) or any(found.count(token) != 1 for token in mapping):
        raise AIExtractionError('AI 未完整保留文章中的图片或代码块')
    restored = markdown
    for token, original in mapping.items():
        restored = restored.replace(token, original)
    return restored


def _clip_candidate(markdown, limit):
    if len(markdown) <= limit:
        return markdown, False
    boundary = markdown.rfind('\n\n', int(limit * 0.7), limit)
    if boundary < 0:
        boundary = limit
    return markdown[:boundary].rstrip(), True


def extract_content_with_ai(parsed: ParsedWebContent):
    prepared = {}
    sections = []
    for index, candidate in enumerate(parsed.candidates[:3]):
        protected, token_mapping = _protect_markdown_literals(
            candidate.markdown,
            candidate.candidate_id.upper(),
        )
        limit = MAX_AI_PRIMARY_CANDIDATE_CHARS if index == 0 else MAX_AI_SECONDARY_CANDIDATE_CHARS
        clipped, truncated = _clip_candidate(protected, limit)
        prepared[candidate.candidate_id] = {
            'candidate': candidate,
            'content': clipped,
            'truncated': truncated,
            'mapping': {token: value for token, value in token_mapping.items() if token in clipped},
        }
        sections.append(
            f'--- {candidate.candidate_id} / 来源 {candidate.source} ---\n{clipped}'
        )

    raw_result = AIService.chat_completion_messages([
        {'role': 'system', 'content': WEB_IMPORT_AI_SYSTEM_PROMPT.strip()},
        {
            'role': 'user',
            'content': WEB_IMPORT_AI_USER_PROMPT_TEMPLATE.format(
                candidates='\n\n'.join(sections)
            ).strip(),
        },
    ])
    result = AIService.strip_thinking(raw_result or '').strip()
    match = AI_RESPONSE_RE.match(result)
    if not match:
        raise AIExtractionError('AI 返回格式无效')

    selected_id, protected_markdown = match.groups()
    selected = prepared.get(selected_id)
    if not selected:
        raise AIExtractionError('AI 选择了不存在的正文候选')
    if selected['truncated']:
        raise AIExtractionError('正文过长，AI 无法在不截断内容的情况下完成提取')

    source_length = len(selected['content'].strip())
    output_length = len(protected_markdown.strip())
    if output_length < max(80, int(source_length * 0.25)) or output_length > int(source_length * 1.3) + 200:
        raise AIExtractionError('AI 提取结果长度异常')

    restored = _restore_markdown_literals(protected_markdown.strip(), selected['mapping'])
    return restored, selected['candidate']


def _split_markdown_chunks(markdown, max_chars=MAX_POLISH_CHUNK_CHARS):
    blocks = re.split(r'\n{2,}', markdown)
    chunks = []
    current = []
    current_length = 0
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        added_length = len(block) + (2 if current else 0)
        if current and current_length + added_length > max_chars:
            chunks.append('\n\n'.join(current))
            current = []
            current_length = 0
        if len(block) > max_chars:
            if current:
                chunks.append('\n\n'.join(current))
                current = []
                current_length = 0
            start = 0
            protected_spans = tuple(
                (match.start(), match.end()) for match in PROTECTED_TOKEN_RE.finditer(block)
            )
            while start < len(block):
                end = min(start + max_chars, len(block))
                for token_start, token_end in protected_spans:
                    if token_start < end < token_end:
                        end = token_start if token_start > start else token_end
                        break
                chunks.append(block[start:end])
                start = end
            continue
        current.append(block)
        current_length += len(block) + (2 if len(current) > 1 else 0)
    if current:
        chunks.append('\n\n'.join(current))
    return chunks or ['']


def polish_markdown_content(markdown):
    protected, mapping = _protect_markdown_literals(markdown, 'POLISH')
    polished_chunks = []
    for chunk in _split_markdown_chunks(protected):
        prompt = POLISH_ARTICLE_PROMPT_TEMPLATE.format(content=chunk)
        polished = AIService.strip_thinking(AIService.chat_completion(prompt) or '').strip()
        if not polished:
            raise ValueError('AI 未返回润色内容')
        expected_tokens = {
            token: original for token, original in mapping.items() if token in chunk
        }
        polished_chunks.append(_restore_markdown_literals(polished, expected_tokens))
    return '\n\n'.join(polished_chunks).strip()


def _extract_image_urls(markdown):
    return tuple(dict.fromkeys(
        match.group('url') for match in MARKDOWN_IMAGE_RE.finditer(markdown)
    ))


def _replace_image_urls(markdown, replacements):
    def replace(match):
        replacement = replacements.get(match.group('url'))
        if not replacement:
            return match.group(0)
        title = match.group('title') or ''
        return f"![{match.group('alt')}]({replacement}{title})"

    return MARKDOWN_IMAGE_RE.sub(replace, markdown)


def _remove_image_urls(markdown, removed_urls):
    return MARKDOWN_IMAGE_RE.sub(
        lambda match: '' if match.group('url') in removed_urls else match.group(0),
        markdown,
    )


def _safe_original_name(url, extension, index):
    path_name = unquote(Path(urlsplit(url).path).name)
    stem = Path(path_name).stem if path_name else ''
    stem = re.sub(r'[^0-9A-Za-z._\-\u4e00-\u9fff]+', '-', stem).strip('.-')
    stem = stem[:180] or f'web-image-{index}'
    return f'{stem}{extension}'


def _download_image(url, referer, cookies, index, byte_budget, deadline):
    with requests.Session() as image_session:
        image_session.cookies.update(cookies)
        resource = fetch_remote_image(
            url,
            session=image_session,
            referer=referer,
            max_bytes=MAX_IMAGE_BYTES,
            byte_budget=byte_budget,
            deadline=deadline,
        )
    try:
        if resource.content_type == 'image/svg+xml' or resource.final_url.lower().endswith('.svg'):
            raise WebParserError('SVG 图片暂不进行本地化')
        downloaded = _image_from_bytes(
            resource.content,
            source_url=url,
            original_name='',
        )
    except Exception:
        byte_budget.release(len(resource.content))
        raise
    return DownloadedImage(
        source_url=url,
        final_url=resource.final_url,
        content=downloaded.content,
        extension=downloaded.extension,
        mime_type=downloaded.mime_type,
        original_name=_safe_original_name(resource.final_url, downloaded.extension, index),
        file_hash=downloaded.file_hash,
    )


def _download_images(markdown, referer, session, embedded_images=None):
    urls = _extract_image_urls(markdown)
    selected_urls = urls[:MAX_IMPORT_IMAGES]
    embedded_images = embedded_images or {}
    warnings = []
    if len(urls) > MAX_IMPORT_IMAGES:
        warnings.append(f'正文包含 {len(urls)} 张图片，仅尝试本地化前 {MAX_IMPORT_IMAGES} 张，其余保留外链。')

    cookies = session.cookies.get_dict()
    byte_budget = ImageDownloadBudget(MAX_TOTAL_IMAGE_BYTES)
    deadline = time.monotonic() + IMAGE_DOWNLOAD_DEADLINE_SECONDS
    executor = ThreadPoolExecutor(max_workers=IMAGE_DOWNLOAD_WORKERS)
    futures = {
        executor.submit(
            _download_image, url, referer, cookies, index, byte_budget, deadline,
        ): url
        for index, url in enumerate(selected_urls, start=1)
        if url not in embedded_images
    }
    done, pending = wait(
        futures, timeout=max(deadline - time.monotonic(), 0),
    )
    for future in pending:
        future.cancel()
    executor.shutdown(wait=True, cancel_futures=True)

    downloaded = {
        url: embedded_images[url] for url in selected_urls if url in embedded_images
    }
    failed_count = len(pending)
    for future in done:
        url = futures[future]
        try:
            downloaded[url] = future.result()
        except Exception:
            failed_count += 1
            logger.info('Web image kept external: host=%s', urlsplit(url).hostname or '<unknown>')

    accepted = {}
    total_bytes = 0
    for url in selected_urls:
        image = downloaded.get(url)
        if not image:
            continue
        if total_bytes + len(image.content) > MAX_TOTAL_IMAGE_BYTES:
            failed_count += 1
            continue
        accepted[url] = image
        total_bytes += len(image.content)

    if failed_count:
        warnings.append(f'{failed_count} 张图片下载失败、超时或格式不受支持，已保留原始外链。')
    return urls, accepted, warnings


def _stage_images(downloaded, uploader, stage_dir):
    replacements = {}
    staged_assets = []
    existing_ids = set()
    staged_ids_by_hash = {}
    for source_url, image in downloaded.items():
        staged_id = staged_ids_by_hash.get(image.file_hash)
        if staged_id:
            replacements[source_url] = get_resource_view_url(staged_id)
            continue
        existing = Asset.objects.filter(
            file_hash=image.file_hash,
            uploader=uploader,
            file_type='image',
            is_valid=True,
        ).first()
        if existing and os.path.isfile(os.path.join(settings.MEDIA_ROOT, existing.file_path)):
            replacements[source_url] = get_resource_view_url(existing.id)
            existing_ids.add(existing.id)
            continue

        asset_id = uuid.uuid4().hex[:16]
        file_name = f'{asset_id}{image.extension}'
        temp_path = os.path.join(stage_dir, file_name)
        with open(temp_path, 'wb') as output:
            output.write(image.content)
        staged_assets.append(StagedAsset(
            asset_id=asset_id,
            source_url=source_url,
            temp_path=temp_path,
            file_name=file_name,
            original_name=image.original_name,
            extension=image.extension,
            mime_type=image.mime_type,
            file_size=len(image.content),
            file_hash=image.file_hash,
        ))
        staged_ids_by_hash[image.file_hash] = asset_id
        replacements[source_url] = get_resource_view_url(asset_id)
    return replacements, staged_assets, existing_ids


def _persist_import(
        *, title, markdown, source_url, coll_id, author, need_polishing,
        staged_assets, existing_ids,
):
    media_root = Path(settings.MEDIA_ROOT).resolve()
    image_dir = (media_root / 'image').resolve()
    if image_dir != media_root and media_root not in image_dir.parents:
        raise ValueError('网页图片保存目录无效')
    image_dir.mkdir(parents=True, exist_ok=True)

    created_paths = []
    temporary_paths = []
    try:
        with transaction.atomic():
            article = Article.objects.create(
                title=title,
                content=markdown,
                coll_id=coll_id,
                source_url=source_url,
                is_polishing=need_polishing,
                author=author,
            )

            for staged in staged_assets:
                final_path = image_dir / staged.file_name
                copy_path = image_dir / f'.{staged.file_name}.tmp'
                temporary_paths.append(copy_path)
                shutil.copyfile(staged.temp_path, copy_path)
                os.replace(copy_path, final_path)
                created_paths.append(final_path)
                Asset.objects.create(
                    id=staged.asset_id,
                    name=staged.original_name,
                    original_name=staged.original_name,
                    file_type='image',
                    file_size=staged.file_size,
                    file_path=os.path.join('image', staged.file_name),
                    file_extension=staged.extension,
                    mime_type=staged.mime_type,
                    uploader=author,
                    linked_article=article,
                    is_linked=True,
                    source_type='content',
                    file_hash=staged.file_hash,
                    metadata={
                        'source_url': staged.source_url,
                        'source_page_url': source_url,
                    },
                )

            if existing_ids:
                existing_queryset = Asset.objects.filter(id__in=existing_ids, is_valid=True)
                record_bulk_change(existing_queryset)
                existing_queryset.update(is_linked=True)

            anthology_queryset = Anthology.objects.filter(coll_id=coll_id)
            record_bulk_change(anthology_queryset)
            anthology_queryset.update(count=models.F('count') + 1)
        return article
    except Exception:
        for path in (*temporary_paths, *created_paths):
            try:
                if path.exists() and path.is_file():
                    path.unlink()
            except OSError:
                logger.exception('Failed to clean staged web image: path=%s', path.name)
        raise


def _save_parsed_import(
        *, parsed, source_url, coll_id, author, use_ai_extraction,
        need_polishing, session, embedded_images=None, initial_warnings=None,
        discarded_image_urls=None,
):
    warnings = list(initial_warnings or [])
    extraction_mode = 'standard'
    candidate = parsed.best_candidate
    markdown = candidate.markdown

    if candidate.confidence == 'low':
        warnings.append('普通提取的正文可信度较低，建议核对导入内容。')

    if use_ai_extraction:
        try:
            markdown, candidate = extract_content_with_ai(parsed)
            extraction_mode = 'ai'
        except Exception as exc:
            extraction_mode = 'standardFallback'
            warnings.append('AI 正文提取未生效，已使用普通提取结果保存。')
            logger.warning('AI import extraction fallback: error_type=%s', type(exc).__name__)

    selected_discarded_urls = set(_extract_image_urls(markdown)).intersection(
        discarded_image_urls or (),
    )
    if selected_discarded_urls:
        markdown = _remove_image_urls(markdown, selected_discarded_urls)
        warnings.append(
            f'{len(selected_discarded_urls)} 张正文内嵌图片格式不受支持，已跳过。'
        )

    image_urls, downloaded, image_warnings = _download_images(
        markdown,
        parsed.final_url,
        session,
        embedded_images=embedded_images,
    )
    warnings.extend(image_warnings)

    with tempfile.TemporaryDirectory(prefix='odoc-web-import-') as stage_dir:
        replacements, staged_assets, existing_ids = _stage_images(downloaded, author, stage_dir)
        localized_markdown = _replace_image_urls(markdown, replacements)

        article = _persist_import(
            title=parsed.title,
            markdown=localized_markdown,
            source_url=source_url or None,
            coll_id=coll_id,
            author=author,
            need_polishing=need_polishing,
            staged_assets=staged_assets,
            existing_ids=existing_ids,
        )

    localized_count = sum(1 for image_url in image_urls if image_url in replacements)
    return WebImportResult(
        article=article,
        report=WebImportReport(
            extraction_mode=extraction_mode,
            confidence=candidate.confidence,
            localized_image_count=localized_count,
            external_image_count=max(len(image_urls) - localized_count, 0),
            warnings=tuple(dict.fromkeys(warnings)),
        ),
    )


def import_webpage_as_article(
        *, url, coll_id, author, use_ai_extraction=False, need_polishing=False,
):
    with requests.Session() as session:
        parsed = extract_web_content(url, session=session)
        return _save_parsed_import(
            parsed=parsed,
            source_url=url,
            coll_id=coll_id,
            author=author,
            use_ai_extraction=use_ai_extraction,
            need_polishing=need_polishing,
            session=session,
        )


def _markdown_title(markdown, filename):
    match = re.search(r'^#\s+(.+?)\s*$', markdown, re.MULTILINE)
    if match:
        return match.group(1).strip()[:255]
    return Path(filename).stem[:255] or '未命名文档'


def import_content_file_as_article(
        *, uploaded_file, coll_id, author, use_ai_extraction=False,
        need_polishing=False,
):
    filename = Path(uploaded_file.name or '').name
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_IMPORT_EXTENSIONS:
        raise WebParserError('仅支持 .html、.htm、.md 和 .markdown 文件。')
    declared_size = getattr(uploaded_file, 'size', 0) or 0
    if declared_size > MAX_IMPORT_FILE_BYTES:
        raise WebParserError('导入文件超过 30 MB。')
    content = uploaded_file.read(MAX_IMPORT_FILE_BYTES + 1)
    if len(content) > MAX_IMPORT_FILE_BYTES:
        raise WebParserError('导入文件超过 30 MB。')
    if not content:
        raise WebParserError('导入文件为空。')

    warnings = []
    embedded_images = {}
    discarded_image_urls = set()
    source_url = ''
    if extension in {'.html', '.htm'}:
        (
            prepared_html, source_url, embedded_images, warnings,
            discarded_image_urls,
        ) = prepare_html_archive(content)
        parsed = extract_html_content(prepared_html, source_url)
    else:
        try:
            markdown = content.decode('utf-8-sig')
        except UnicodeDecodeError as exc:
            raise WebParserError('Markdown 文件必须使用 UTF-8 编码。') from exc
        markdown = markdown.strip()
        if not markdown:
            raise WebParserError('Markdown 文件没有可读取的内容。')
        text_length = len(re.sub(r'\s+', '', markdown))
        confidence = 'high' if text_length >= 500 else 'medium'
        parsed = ParsedWebContent(
            title=_markdown_title(markdown, filename),
            final_url='https://imported.local/',
            candidates=(WebContentCandidate(
                candidate_id='candidate_1',
                source='markdown-file',
                markdown=markdown,
                score=text_length,
                confidence=confidence,
                text_length=text_length,
                meaningful_blocks=max(len(re.split(r'\n{2,}', markdown)), 1),
                link_density=0.0,
                image_urls=_extract_image_urls(markdown),
            ),),
        )
        if re.search(r'!\[[^\]]*\]\((?!https?://|/api/resource/)[^)]+\)', markdown):
            warnings.append('Markdown 中的相对路径图片未随文件上传，已保留原地址。')

    with requests.Session() as session:
        return _save_parsed_import(
            parsed=parsed,
            source_url=source_url,
            coll_id=coll_id,
            author=author,
            use_ai_extraction=use_ai_extraction,
            need_polishing=need_polishing,
            session=session,
            embedded_images=embedded_images,
            initial_warnings=warnings,
            discarded_image_urls=discarded_image_urls,
        )
