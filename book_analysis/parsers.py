"""Text-only parsers. Never rasterize pages or run OCR."""
import hashlib
import posixpath
import re
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree as ET

from bs4 import BeautifulSoup
from django.conf import settings

from .errors import AnalysisError
from .chapter_detection import PARSER_VERSION, find_headings

MAX_MEMBER = 16 * 1024 * 1024
MAX_EXPANDED = 100 * 1024 * 1024


def stable_id(*parts: object) -> str:
    return hashlib.sha256('\0'.join(str(p) for p in parts).encode()).hexdigest()


@dataclass
class ParsedChapter:
    title: str
    text: str
    locator: dict


def decode_text(data: bytes) -> str:
    if data.startswith((b'\xff\xfe', b'\xfe\xff')):
        return data.decode('utf-16')
    try:
        return data.decode('utf-8-sig')
    except UnicodeDecodeError:
        try:
            return data.decode('gb18030')
        except UnicodeDecodeError as exc:
            raise AnalysisError('无法解码图书正文，请转换为 UTF-8 TXT') from exc


def source_path(book) -> Path:
    root = Path(settings.MEDIA_ROOT).resolve()
    path = (root / book.asset.file_path).resolve()
    if not path.is_relative_to(root) or path == root:
        raise AnalysisError('图书文件路径无效')
    if not book.asset.is_valid or not path.is_file():
        raise AnalysisError('本机没有图书正文，请先从书架恢复或补传文件', 409)
    return path


def slice_locator(locator: dict, start: int, end: int) -> dict:
    result = {k: v for k, v in locator.items() if k != 'spans'}
    if locator.get('format') == 'txt':
        result['offset'] = locator.get('offset', 0) + start
    spans = []
    for span in locator.get('spans', []):
        if span['end'] > start and span['start'] < end:
            spans.append({**span, 'start': max(span['start'], start) - start, 'end': min(span['end'], end) - start})
    if spans:
        result['spans'] = spans
        result.update({k: spans[0][k] for k in ('page', 'href') if k in spans[0]})
    return result


def split_text(text: str, locator: dict, fallback: str) -> tuple[list[ParsedChapter], bool]:
    useful = find_headings(text)
    sections = []
    if useful:
        titles = {heading.start: heading.title for heading in useful}
        starts = [m.start for m in useful]
        if text[:starts[0]].strip():
            starts.insert(0, 0)
        for i, start in enumerate(starts):
            end = starts[i + 1] if i + 1 < len(starts) else len(text)
            title = titles.get(start, '书前内容')
            sections.append(ParsedChapter(title[:255], text[start:end], slice_locator(locator, start, end)))
        return sections, False
    # Paragraph-aligned fallback sections cover the entire source, including its tail.
    start = 0
    while start < len(text):
        end = min(len(text), start + 16000)
        if end < len(text):
            boundary = text.rfind('\n', start + 8000, end)
            if boundary > start:
                end = boundary + 1
        body = text[start:end]
        if body.strip():
            sections.append(ParsedChapter(f'{fallback} · 分段 {len(sections) + 1}', body, slice_locator(locator, start, end)))
        start = end
    return sections, True


def parse_pdf(path: Path) -> tuple[list[ParsedChapter], dict]:
    import pymupdf as fitz
    try:
        document = fitz.open(path)
    except (RuntimeError, ValueError) as exc:
        raise AnalysisError('PDF 无法打开或文件已损坏') from exc
    with document:
        if document.needs_pass:
            raise AnalysisError('加密 PDF 不支持 AI 分析，请提供未加密文字版')
        pages = []
        repeated = Counter()
        for page in document:
            lines = page.get_text('text', sort=True).splitlines()
            repeated.update(set(s.strip() for s in lines[:2] + lines[-2:] if s.strip()))
            image_area = sum(rect.get_area() for image in page.get_images(full=True) for rect in page.get_image_rects(image[0]))
            body_letters = sum(c.isalpha() for block in page.get_text('blocks') if block[6] == 0 and block[3] > page.rect.y0 + page.rect.height * .10 and block[1] < page.rect.y0 + page.rect.height * .90 for c in block[4])
            pages.append((lines, min(1, image_area / max(page.rect.get_area(), 1)), body_letters))
        headers = {s for s, count in repeated.items() if len(pages) >= 3 and count >= max(3, len(pages) * .6)}
        parts, spans, scanned, images, cursor = [], [], 0, 0, 0
        for i, (lines, image_ratio, body_letters) in enumerate(pages):
            body = '\n'.join(line for position, line in enumerate(lines) if not ((position < 2 or position >= len(lines) - 2) and line.strip() in headers) and not re.fullmatch(r'\s*[-—]?\s*\d+\s*[-—]?\s*', line)) + '\n'
            if image_ratio >= .65 and body_letters < 100:
                scanned += 1
            if image_ratio:
                images += 1
            spans.append({'start': cursor, 'end': cursor + len(body), 'page': i + 1})
            parts.append(body)
            cursor += len(body)
        text = ''.join(parts)
        if sum(c.isalpha() for c in text) < 100 or scanned / max(len(pages), 1) >= .2:
            raise AnalysisError('不支持 AI 分析：PDF 为扫描版或正文文字严重缺失，请提供文字版 PDF、EPUB 或 TXT')
        # PDF outlines take precedence over heuristic heading recognition.
        toc = [row for row in document.get_toc() if row[0] == 1 and 1 <= row[2] <= len(pages)]
        chapters = []
        for i, (_, title, page) in enumerate(toc):
            start = spans[page - 1]['start']
            end = spans[toc[i + 1][2] - 1]['start'] if i + 1 < len(toc) else len(text)
            if i == 0 and start:
                chapters.append(ParsedChapter('前言', text[:start], slice_locator({'format': 'pdf', 'spans': spans}, 0, start)))
            if end > start:
                chapters.append(ParsedChapter(title[:255], text[start:end], slice_locator({'format': 'pdf', 'spans': spans}, start, end)))
        fallback = False
        if not chapters:
            chapters, fallback = split_text(text, {'format': 'pdf', 'spans': spans}, 'PDF')
        return chapters, {'page_count': len(pages), 'image_pages': images, 'unreadable_pages': scanned, 'fallback_sections': fallback}


def read_member(archive: zipfile.ZipFile, name: str) -> bytes:
    name = posixpath.normpath(name)
    if name.startswith(('/', '../')):
        raise AnalysisError('EPUB 内容路径无效')
    try:
        info = archive.getinfo(name)
        if info.file_size > MAX_MEMBER:
            raise AnalysisError('EPUB 单个内容文件过大')
        with archive.open(info) as member:
            data = member.read(MAX_MEMBER + 1)
        if len(data) > MAX_MEMBER:
            raise AnalysisError('EPUB 内容文件过大')
        return data
    except KeyError as exc:
        raise AnalysisError('EPUB 缺少必要内容文件') from exc


def parse_epub(path: Path) -> tuple[list[ParsedChapter], dict]:
    try:
        with zipfile.ZipFile(path) as archive:
            if sum(i.file_size for i in archive.infolist()) > MAX_EXPANDED:
                raise AnalysisError('EPUB 解压内容超过分析上限')
            if 'META-INF/encryption.xml' in archive.namelist():
                encryption = ET.fromstring(read_member(archive, 'META-INF/encryption.xml'))
                for entry in encryption.findall('.//{*}EncryptedData'):
                    method = entry.find('.//{*}EncryptionMethod')
                    reference = entry.find('.//{*}CipherReference')
                    algorithm = method.get('Algorithm', '') if method is not None else ''
                    uri = reference.get('URI', '') if reference is not None else ''
                    if algorithm not in ('http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC') or not uri.lower().endswith(('.ttf', '.otf', '.woff', '.woff2')):
                        raise AnalysisError('加密 EPUB 不支持 AI 分析')
            container = ET.fromstring(read_member(archive, 'META-INF/container.xml'))
            rootfile = container.find('.//{*}rootfile')
            if rootfile is None:
                raise AnalysisError('EPUB 缺少内容索引')
            opf_path = rootfile.attrib['full-path']
            package = ET.fromstring(read_member(archive, opf_path))
            items = {i.attrib['id']: i.attrib for i in package.findall('.//{*}manifest/{*}item')}
            titles = {}
            for item in items.values():
                if 'nav' in item.get('properties', '').split():
                    nav_path = posixpath.join(posixpath.dirname(opf_path), item['href'])
                    nav = BeautifulSoup(read_member(archive, nav_path), 'html.parser')
                    for a in nav.select('nav a[href]'):
                        href = posixpath.normpath(posixpath.join(posixpath.dirname(nav_path), a['href'].split('#')[0]))
                        titles[href] = a.get_text(' ', strip=True)
            chapters, image_count = [], 0
            for itemref in package.findall('.//{*}spine/{*}itemref'):
                if itemref.get('linear') == 'no':
                    continue
                item = items.get(itemref.get('idref'), {})
                href = item.get('href', '').split('#')[0]
                if not href or item.get('media-type') not in ('application/xhtml+xml', 'text/html'):
                    continue
                member_path = posixpath.normpath(posixpath.join(posixpath.dirname(opf_path), href))
                soup = BeautifulSoup(read_member(archive, member_path), 'html.parser')
                image_count += len(soup.find_all('img'))
                heading = soup.find(re.compile('^h[1-3]$'))
                title = titles.get(member_path) or (heading.get_text(' ', strip=True) if heading else '') or f'章节 {len(chapters) + 1}'
                for tag in soup(['script', 'style', 'nav', 'noscript']):
                    tag.decompose()
                body = soup.body or soup
                text = body.get_text('\n', strip=True)
                if text:
                    chapters.append(ParsedChapter(title[:255], text, {'format': 'epub', 'href': member_path, 'spans': [{'start': 0, 'end': len(text), 'href': member_path}]}))
            return chapters, {'image_count': image_count, 'fallback_sections': False}
    except (zipfile.BadZipFile, ET.ParseError, KeyError, OSError) as exc:
        raise AnalysisError('EPUB 结构损坏或无法解析') from exc


def parse_book(book) -> tuple[list[ParsedChapter], dict]:
    if book.book_format == 'mobi':
        raise AnalysisError('MOBI 不支持 AI 分析，请先转换为 EPUB、TXT 或文字版 PDF')
    path = source_path(book)
    if book.book_format == 'txt':
        text = decode_text(path.read_bytes())
        chapters, fallback = split_text(text, {'format': 'txt', 'offset': 0}, book.title)
        report = {'fallback_sections': fallback}
    elif book.book_format == 'pdf':
        chapters, report = parse_pdf(path)
    elif book.book_format == 'epub':
        chapters, report = parse_epub(path)
    else:
        raise AnalysisError('此格式不支持 AI 分析')
    if not chapters or sum(sum(c.isalpha() for c in ch.text) for ch in chapters) < 20:
        raise AnalysisError('无法提取有效正文，不支持 AI 分析')
    report['char_count'] = sum(len(ch.text) for ch in chapters)
    report['parser_version'] = PARSER_VERSION
    report['chapter_count'] = len(chapters)
    report['warnings'] = ['结果基于可提取文字，未理解图片、图表和公式内容。']
    if report.get('fallback_sections'):
        report['warnings'].append('未发现可靠目录，当前为自动分段，可修正章节边界。')
    if report.get('unreadable_pages'):
        report['warnings'].append('存在少量无法提取文字的页面，相关内容不会进入分析。')
    return chapters, report


def iter_segments(text: str, size: int = 4500):
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            boundary = text.rfind('\n', start + size // 2, end)
            if boundary > start:
                end = boundary + 1
        yield start, text[start:end]
        start = end
