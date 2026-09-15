"""Static HTML archives: bounded package parsing, isolated preview and text extraction."""
import base64
import hashlib
import logging
import mimetypes
import posixpath
import re
import shutil
import tempfile
import uuid
import zipfile
from io import BytesIO
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

from bs4 import BeautifulSoup
from django.conf import settings
from django.db import transaction
from PIL import Image

from article.models import Article, ArticleAsset
from article.html_note_locking import lock_html_owner
from article.html_note_css import wrap_import_conditions
from assets.models import Asset
from utils.web_parser import ArticleMarkdownConverter, WebParserError

logger = logging.getLogger(__name__)
MAX_BYTES = 100 * 1024 * 1024
MAX_FILES = 500
MAX_UPLOAD = 30 * 1024 * 1024
URL_RE = re.compile(r'url\(\s*([\"\']?)(.*?)\1\s*\)', re.I | re.S)
IMPORT_RE = re.compile(r'@import\s+(?:url\(\s*([\"\']?)(.*?)\1\s*\)|[\"\']([^\"\']+)[\"\'])([^;]*);', re.I)
BLOCKED_TAGS = ['script', 'noscript', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'base', 'template']


def media_path(relative: str) -> Path:
    root = Path(settings.MEDIA_ROOT).resolve()
    path = (root / relative).resolve()
    if not relative or path == root or root not in path.parents:
        raise ValueError('资源文件路径无效')
    return path


def load_package(uploaded_file) -> dict[str, bytes]:
    data = uploaded_file.read(MAX_UPLOAD + 1)
    if not data or len(data) > MAX_UPLOAD:
        raise WebParserError('导入文件为空或超过 30 MB。')
    name = Path(uploaded_file.name).name
    if name.lower().endswith(('.html', '.htm')):
        return {name: data}
    if not name.lower().endswith('.zip'):
        raise WebParserError('原样导入仅支持 HTML、HTM 和 ZIP。')
    result = {}
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            total = 0
            if len(archive.infolist()) > MAX_FILES:
                raise WebParserError('ZIP 最多包含 500 个文件。')
            for entry in archive.infolist():
                path = PurePosixPath(entry.filename.replace('\\', '/'))
                if path.is_absolute() or '..' in path.parts or ':' in str(path) or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                    raise WebParserError('ZIP 包含不安全的文件路径。')
                if entry.is_dir():
                    continue
                total += entry.file_size
                if total > MAX_BYTES:
                    raise WebParserError('ZIP 解压后超过 100 MB。')
                if str(path) in result:
                    raise WebParserError('ZIP 包含重复路径。')
                result[str(path)] = archive.read(entry)
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError) as exc:
        raise WebParserError('ZIP 文件无效或不支持加密。') from exc
    return result


class HtmlPreparer:
    def __init__(self, files: dict[str, bytes]):
        self.files = files
        self.materials = {}
        self.missing = set()
        self.warnings = set()
        self.document_styles = set()

    def stylesheet(self, path, seen=()):
        data = self.files[path]
        key = hashlib.md5(data).hexdigest()
        self.materials[key] = (Path(path).name, data)
        self.document_styles.add(key)
        try:
            text = data.decode('utf-8-sig')
        except UnicodeDecodeError as exc:
            raise WebParserError(f'样式文件必须使用 UTF-8 编码：{path}') from exc
        return self.css(text, path, seen)

    def resource(self, value: str, document: str) -> str:
        value = value.strip()
        if not value or value.startswith('#'):
            return value
        parsed = urlsplit(value)
        if parsed.scheme == 'odoc-material' and parsed.path in self.materials:
            # Expanded @import CSS has already rewritten nested material URLs.
            return value
        if parsed.scheme == 'data':
            try:
                header, payload = value.split(',', 1)
                if not header.lower().startswith('data:image/') or ';base64' not in header.lower():
                    raise ValueError()
                content = base64.b64decode(payload, validate=True)
                with Image.open(BytesIO(content)) as image:
                    fmt = image.format
                    image.verify()
                ext = {'JPEG': '.jpg', 'PNG': '.png', 'GIF': '.gif', 'WEBP': '.webp'}.get(fmt)
                if not ext or len(content) > 15 * 1024 * 1024:
                    raise ValueError()
                name = 'embedded' + ext
            except Exception as exc:
                raise WebParserError('内嵌图片无效或格式不支持。') from exc
        elif parsed.scheme or parsed.netloc or value.startswith('/'):
            self.warnings.add('远程素材或绝对路径素材已阻止加载。')
            return ''
        else:
            name = posixpath.normpath(posixpath.join(posixpath.dirname(document), unquote(parsed.path)))
            if name not in self.files:
                self.missing.add(name)
                return ''
            content = self.files[name]
        ext = Path(name).suffix.lower()
        # Only inert images and fonts are exposed to the static document.
        if ext not in {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.woff', '.woff2', '.ttf', '.otf'}:
            raise WebParserError(f'不支持的正文素材：{name}')
        if ext in {'.jpg', '.jpeg', '.png', '.gif', '.webp'}:
            try:
                with Image.open(BytesIO(content)) as image:
                    image.verify()
            except Exception as exc:
                raise WebParserError(f'图片内容无效：{name}') from exc
        key = hashlib.md5(content).hexdigest()
        self.materials[key] = (Path(name).name, content)
        if sum(len(data) for _, data in self.materials.values()) > MAX_BYTES:
            raise WebParserError('正文素材总大小超过 100 MB。')
        return f'odoc-material:{key}'

    def css(self, text: str, document: str, seen=()) -> str:
        def include(match):
            value = (match.group(2) or match.group(3)).strip()
            if urlsplit(value).scheme or value.startswith(('/', '//')):
                self.warnings.add('远程样式已阻止加载。')
                return ''
            path = posixpath.normpath(posixpath.join(posixpath.dirname(document), unquote(urlsplit(value).path)))
            if path not in self.files:
                self.missing.add(path)
                return ''
            if path in seen or len(seen) > 10:
                raise WebParserError('样式引用循环或嵌套过深。')
            return wrap_import_conditions(self.stylesheet(path, (*seen, path)), match.group(4))
        text = IMPORT_RE.sub(include, text)
        # Unrecognized imports cannot execute because preview CSP disallows style requests.
        return URL_RE.sub(lambda m: 'url("' + self.resource(m.group(2), document) + '")', text).replace('<', '\\3c ')

    def prepare(self, name: str) -> tuple[str, str, str, set[str]]:
        self.document_styles = set()
        soup = BeautifulSoup(self.files[name], 'html.parser')
        title = (soup.title.get_text(' ', strip=True) if soup.title else Path(name).stem)[:255] or 'HTML 笔记'
        for tag in list(soup.find_all(BLOCKED_TAGS)):
            if tag.name:
                tag.decompose()
        for tag in list(soup.find_all('meta')):
            tag.decompose()
        used_keys = set()
        for tag in list(soup.find_all(True)):
            if tag.name == 'link':
                if 'stylesheet' in tag.get('rel', []):
                    href = tag.get('href', '')
                    if urlsplit(href).scheme or href.startswith(('/', '//')):
                        self.warnings.add('远程样式已阻止加载。')
                        tag.decompose()
                        continue
                    path = posixpath.normpath(posixpath.join(posixpath.dirname(name), unquote(urlsplit(href).path)))
                    if path not in self.files:
                        self.missing.add(path)
                        tag.decompose()
                        continue
                    style = soup.new_tag('style')
                    if tag.get('media'):
                        style['media'] = tag['media']
                    style.string = self.stylesheet(path, (path,))
                    tag.replace_with(style)
                else:
                    tag.decompose()
                continue
            for attr in list(tag.attrs):
                if attr.lower().startswith('on') or attr.lower() in {'srcset', 'action', 'formaction', 'srcdoc', 'xlink:href'}:
                    del tag[attr]
            if tag.name == 'style':
                tag.string = self.css(tag.get_text(), name)
            if tag.get('style'):
                tag['style'] = self.css(tag['style'], name)
            for attr in ('src', 'poster', 'background'):
                if tag.get(attr):
                    tag[attr] = self.resource(tag[attr], name)
            if tag.get('href'):
                href = str(tag['href'])
                if tag.name != 'a' or urlsplit(href).scheme not in {'', 'http', 'https'}:
                    del tag['href']
                else:
                    tag['target'] = '_blank'
                    tag['rel'] = 'noopener noreferrer'
        preview = str(soup)
        used_keys.update(re.findall(r'odoc-material:([a-f0-9]{32})', preview))
        used_keys.update(self.document_styles)
        text_soup = BeautifulSoup(preview, 'html.parser')
        for tag in text_soup.find_all(['style', 'head', 'svg', *BLOCKED_TAGS]):
            if tag.name:
                tag.decompose()
        visible_text = text_soup.get_text(' ', strip=True) or any(img.get('alt', '').strip() for img in text_soup.find_all('img'))
        markdown = ArticleMarkdownConverter(heading_style='ATX').convert_soup(text_soup).strip() if visible_text else ''
        if not markdown:
            self.warnings.add('没有可提取的文字正文，可原样阅读，但无法同步 RAG 或转换正文。')
        return title, markdown, preview, used_keys


def import_original(uploaded_file, coll_id: str, author: str) -> tuple[list[Article], list[str]]:
    raw_package = None
    if uploaded_file.name.lower().endswith('.zip'):
        raw_package = uploaded_file.read(MAX_UPLOAD + 1)
        uploaded_file.seek(0)
    files = load_package(uploaded_file)
    html_files = [n for n in files if n.lower().endswith(('.html', '.htm'))]
    if not html_files:
        raise WebParserError('ZIP 中没有 HTML 笔记。')
    preparer = HtmlPreparer(files)
    prepared = [(name, preparer.prepare(name)) for name in html_files]
    if preparer.missing:
        raise WebParserError('缺失本地素材：' + '、'.join(sorted(preparer.missing)))
    paths = []
    articles = []
    try:
        with tempfile.TemporaryDirectory(prefix='odoc-html-import-') as staging, transaction.atomic():
            lock_html_owner(author)
            # Serialize imports/conversions/deletes for one owner's collection.
            from anthology.models import Anthology
            collection = Anthology.objects.select_for_update().get(coll_id=coll_id, user_id=author, is_valid=True, type='article')
            def store(name, data, role):
                digest = hashlib.md5(data).hexdigest()
                existing = Asset.objects.filter(uploader=author, file_hash=digest, is_valid=True).first()
                if existing and media_path(existing.file_path).is_file():
                    return existing
                asset_id = uuid.uuid4().hex[:16]
                suffix = Path(name).suffix.lower()
                relative = f'html_notes/{asset_id}{suffix}'
                path = media_path(relative)
                path.parent.mkdir(parents=True, exist_ok=True)
                temporary = Path(staging) / asset_id
                with temporary.open('xb') as output:
                    output.write(data)
                with temporary.open('rb') as source, path.open('xb') as output:
                    paths.append(path)
                    shutil.copyfileobj(source, output)
                return Asset.objects.create(id=asset_id, name=name, original_name=name, file_type='image' if suffix in {'.jpg', '.jpeg', '.png', '.gif', '.webp'} else 'archive' if suffix == '.zip' else 'code' if suffix in {'.html', '.htm', '.css'} else 'other', file_size=len(data), file_path=relative, file_extension=suffix, mime_type=mimetypes.guess_type(name)[0] or 'application/octet-stream', file_hash=digest, uploader=author, source_type='content', metadata={'html_import_owned': True, 'role': role})
            materials = {key: store(name, data, 'material') for key, (name, data) in preparer.materials.items()}
            package = store(Path(uploaded_file.name).name, raw_package, 'package') if raw_package else None
            for name, (title, markdown, preview, keys) in prepared:
                base_title = title[:230]
                number = 1
                while Article.objects.filter(author=author, coll_id=coll_id, title=title).exists():
                    number += 1
                    title = f'{base_title} ({number})'
                for key in keys:
                    url = f'/api/resource/view/{materials[key].id}'
                    preview = preview.replace(f'odoc-material:{key}', url)
                    markdown = markdown.replace(f'odoc-material:{key}', url)
                article = Article.objects.create(title=title, content=markdown, content_format='html', coll_id=coll_id, author=author)
                source = store(Path(name).name, files[name], 'source')
                rendered = store('preview.html', preview.encode('utf-8'), 'preview')
                for asset, role in [(source, 'source'), (rendered, 'preview'), *[(materials[key], 'material') for key in keys]]:
                    ArticleAsset.objects.get_or_create(article=article, asset=asset, role=role)
                if package:
                    ArticleAsset.objects.create(article=article, asset=package, role='package')
                articles.append(article)
            collection.count = Article.objects.filter(coll_id=coll_id, is_valid=True).count()
            collection.save(update_fields=['count', 'updated_at'])
        return articles, sorted(preparer.warnings)
    except Exception:
        for path in paths:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                logger.exception('HTML import rollback cleanup failed: file=%s', path.name)
        raise
