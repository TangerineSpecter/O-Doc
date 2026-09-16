import hashlib

from django.db import transaction

from .errors import AnalysisError
from .models import AnalysisRun, BookAnalysis, Chapter, SourceCache
from .parsers import ParsedChapter, parse_book, slice_locator, source_path, stable_id
from .chapter_detection import PARSER_VERSION


def current_hash(book) -> str:
    return book.asset.file_hash


def recommend_mode(title: str, chapters: list[ParsedChapter]) -> str:
    sample = title + '\n' + '\n'.join(ch.title + ch.text[:600] for ch in chapters[:8])
    knowledge_words = ('算法', '技术', '编程', '数据库', '原理', '方法论', '管理', '经济', '教材', '定义', '学习目标', '代码', '计算', '概念')
    story_words = ('小说', '侦探', '推理', '故事', '凶手', '谋杀', '说道', '问道', '低声', '他走', '她说')
    return 'story' if sum(sample.count(w) for w in story_words) > sum(sample.count(w) for w in knowledge_words) else 'knowledge'


def save_chapters(book, source_hash: str, parsed: list[ParsedChapter]) -> list[Chapter]:
    result = []
    for i, chapter in enumerate(parsed):
        identity = stable_id(book.pk, source_hash, chapter.locator, i + 1)
        row, _ = Chapter.objects.update_or_create(id=identity, defaults={'book': book, 'source_hash': source_hash, 'ordinal': i + 1, 'title': chapter.title, 'char_count': len(chapter.text), 'locator': chapter.locator, 'is_valid': True})
        SourceCache.objects.update_or_create(chapter=row, defaults={'text': chapter.text})
        result.append(row)
    Chapter.objects.filter(book=book, is_valid=True).exclude(id__in=[c.id for c in result]).update(is_valid=False)
    # Bulk invalidation must participate in sync revision tracking.
    from system_settings.sync_state import record_bulk_change
    record_bulk_change(Chapter.objects.filter(book=book, is_valid=False))
    return result


def inspect_book(book) -> BookAnalysis:
    analysis, _ = BookAnalysis.objects.get_or_create(book=book)
    try:
        path = source_path(book)
        digest = hashlib.md5()
        with path.open('rb') as source:
            for block in iter(lambda: source.read(1024 * 1024), b''):
                digest.update(block)
        if digest.hexdigest() != current_hash(book):
            raise AnalysisError('图书正文与文件记录不一致，请从书架补传原文件', 409)
        parsed, report = parse_book(book)
    except AnalysisError as exc:
        analysis.inspection = {'supported': False, 'reason': str(exc), 'warnings': [], 'chapter_count': 0, 'char_count': 0}
        analysis.save(update_fields=['inspection', 'updated_at'])
        return analysis
    with transaction.atomic():
        analysis = BookAnalysis.objects.select_for_update().get(book=book)
        if AnalysisRun.objects.filter(book=book, state__in=['queued', 'running']).exists():
            raise AnalysisError('请先停止当前任务，再重新检测', 409)
        existing = list(Chapter.objects.filter(book=book, source_hash=current_hash(book), is_valid=True))
        custom = analysis.inspection.get('custom_boundaries', False) or any(c.locator.get('source_regions') for c in existing)
        # Older manual renames have no flag; an automatic title should still
        # occur at the start of its cached source. Preserve unrecognized layouts.
        if not custom and analysis.inspection.get('parser_version', 0) < PARSER_VERSION:
            caches = {c.chapter_id: c.text for c in SourceCache.objects.filter(chapter__in=existing)}
            custom = any(c.id not in caches or (c.title != '前言' and ' · 分段 ' not in c.title and not caches[c.id].lstrip().startswith(c.title)) for c in existing)
        changed_source = analysis.source_hash != current_hash(book) or not analysis.inspection.get('supported')
        upgrade = analysis.inspection.get('parser_version', 0) < PARSER_VERSION and not custom
        if changed_source or upgrade:
            save_chapters(book, current_hash(book), parsed)
            if changed_source:
                analysis.mode = recommend_mode(book.title, parsed)
                custom = False
            analysis.settings_version += 1
        elif SourceCache.objects.filter(chapter__book=book, chapter__source_hash=current_hash(book), chapter__is_valid=True).count() != Chapter.objects.filter(book=book, source_hash=current_hash(book), is_valid=True).count():
            # Synced custom boundaries are rebuilt below rather than overwritten.
            rebuild_source_cache(book, parsed)
        analysis.source_hash = current_hash(book)
        current_chapters = Chapter.objects.filter(book=book, source_hash=current_hash(book), is_valid=True)
        analysis.inspection = {**report, 'supported': True, 'custom_boundaries': bool(custom), 'chapter_count': current_chapters.count(), 'char_count': sum(current_chapters.values_list('char_count', flat=True)), 'recommended_mode': recommend_mode(book.title, parsed)}
        analysis.save()
    return analysis


def rebuild_source_cache(book, parsed: list[ParsedChapter] | None = None):
    if parsed is None:
        parsed, _ = parse_book(book)
    existing = list(Chapter.objects.filter(book=book, source_hash=current_hash(book), is_valid=True))
    # Chapter locators contain the source region, so custom splits can be rebuilt.
    by_format = {c.locator.get('format') for c in existing}
    if by_format == {'txt'}:
        from .parsers import decode_text
        full = decode_text(source_path(book).read_bytes())
        for chapter in existing:
            offset = chapter.locator.get('offset', 0)
            SourceCache.objects.update_or_create(chapter=chapter, defaults={'text': full[offset:offset + chapter.char_count]})
        return
    originals = {stable_id(book.pk, current_hash(book), c.locator, i + 1): c for i, c in enumerate(parsed)}
    for chapter in existing:
        if chapter.id in originals:
            SourceCache.objects.update_or_create(chapter=chapter, defaults={'text': originals[chapter.id].text})
        else:
            regions = chapter.locator.get('source_regions')
            if regions:
                parts = []
                for region in regions:
                    original = originals.get(region['id'])
                    if original is None:
                        raise AnalysisError('章节原文定位无法恢复，请重新检测', 409)
                    parts.append(original.text[region['start']:region['start'] + region['length']])
                body = ''.join(parts)
                if len(body) != chapter.char_count:
                    raise AnalysisError('章节原文长度不一致，请重新检测', 409)
                SourceCache.objects.update_or_create(chapter=chapter, defaults={'text': body})
                continue
            # Compatibility for earlier custom split locators.
            origin = chapter.locator.get('origin_id')
            original = originals.get(origin)
            if original is None:
                raise AnalysisError('章节定位已变化，请重新检测并修正章节边界', 409)
            start = chapter.locator.get('origin_offset', 0)
            SourceCache.objects.update_or_create(chapter=chapter, defaults={'text': original.text[start:start + chapter.char_count]})


def edit_boundary(book, chapter: Chapter, action: str, offset: int = 0, title: str = ''):
    analysis = BookAnalysis.objects.select_for_update().get(book=book)
    if AnalysisRun.objects.filter(book=book, state__in=['queued', 'running']).exists():
        raise AnalysisError('请先停止分析，再修正章节边界', 409)
    current = Chapter.objects.filter(book=book, source_hash=analysis.source_hash, is_valid=True)
    if SourceCache.objects.filter(chapter__in=current).count() != current.count():
        rebuild_source_cache(book)
    text = SourceCache.objects.get(chapter=chapter).text
    if action == 'rename':
        if not title.strip() or len(title) > 255:
            raise AnalysisError('章节标题长度应为 1 到 255 字')
        chapter.title = title.strip()
        chapter.save()
        analysis.inspection = {**analysis.inspection, 'custom_boundaries': True}
        analysis.save(update_fields=['inspection', 'updated_at'])
        return
    chapters = list(current.order_by('ordinal'))
    if action == 'remove' and len(chapters) == 1:
        raise AnalysisError('至少保留一个可分析章节')
    if action == 'merge' and chapter.id == chapters[-1].id:
        raise AnalysisError('最后一章没有可合并的下一章')
    if action not in ('split', 'merge', 'remove'):
        raise AnalysisError('不支持的章节边界操作')
    def regions(row):
        return row.locator.get('source_regions') or [{'id': row.locator.get('origin_id', row.id), 'start': row.locator.get('origin_offset', 0), 'length': row.char_count}]
    def sliced_regions(items, start, end):
        result, cursor = [], 0
        for item in items:
            left, right = max(start, cursor), min(end, cursor + item['length'])
            if right > left:
                result.append({'id': item['id'], 'start': item['start'] + left - cursor, 'length': right - left})
            cursor += item['length']
        return result
    parsed = []
    skipped = set()
    for index, row in enumerate(chapters):
        if row.id in skipped:
            continue
        if row.id != chapter.id:
            parsed.append(ParsedChapter(row.title, SourceCache.objects.get(chapter=row).text, {**row.locator, 'source_regions': regions(row)}))
            continue
        if action == 'remove':
            continue
        if action == 'merge':
            following = chapters[index + 1]
            following_text = SourceCache.objects.get(chapter=following).text
            loc = {**chapter.locator, 'source_regions': regions(chapter) + regions(following)}
            if loc.get('spans') or following.locator.get('spans'):
                loc['spans'] = [*loc.get('spans', []), *[{**span, 'start': span['start'] + len(text), 'end': span['end'] + len(text)} for span in following.locator.get('spans', [])]]
            parsed.append(ParsedChapter((title or chapter.title)[:255], text + following_text, loc))
            skipped.add(following.id)
            continue
        if offset <= 0 or offset >= len(text):
            raise AnalysisError('拆分位置必须位于章节正文内部')
        for start, end, label in ((0, offset, chapter.title), (offset, len(text), title or chapter.title + '（续）')):
            loc = slice_locator(chapter.locator, start, end)
            loc['source_regions'] = sliced_regions(regions(chapter), start, end)
            parsed.append(ParsedChapter(label[:255], text[start:end], loc))
    save_chapters(book, analysis.source_hash, parsed)
    analysis.settings_version += 1
    analysis.inspection = {**analysis.inspection, 'chapter_count': len(parsed), 'char_count': sum(len(item.text) for item in parsed), 'custom_boundaries': True}
    analysis.save()
