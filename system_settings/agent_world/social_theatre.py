"""News normalization preserving Tavily snippets for resident discussions."""
import html
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl, unquote, urlparse
from zoneinfo import ZoneInfo

NEWS_DAYS = 1
NEWS_QUERIES = ('科技产品 发布 新规 报道', '消费 产品安全 新规 报道', '公共服务 社会 新进展 报道')
LANDING_PAGE_SEGMENTS = {
    'archive', 'archives', 'business', 'cate', 'category', 'categories', 'china', 'culture',
    'economy', 'headlines', 'index', 'international', 'latest', 'latest-news', 'news',
    'opinion', 'politics', 'section', 'sports', 'tag', 'tags', 'technology', 'topic',
    'topics', 'world', 'world-news',
}


def news_query(day):
    # Search real subjects, rather than instructions that match "today's headlines" sites.
    return f'{day.isoformat()} {NEWS_QUERIES[day.toordinal() % len(NEWS_QUERIES)]}'


def _is_recent(value, now):
    if not value:
        return True
    try:
        published = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return True
    if published.tzinfo is None:
        published = published.replace(tzinfo=ZoneInfo('Asia/Shanghai'))
    return now - timedelta(days=1) <= published <= now


def _clean_text(text):
    value = html.unescape(str(text or ''))
    value = re.sub(r'<[^>]*>', ' ', value)
    value = re.sub(r'https?://\S+', '', value, flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', value).strip()


def _compact(text, limit):
    value = _clean_text(text)
    if len(value) <= limit:
        return value
    clipped = value[:limit]
    boundary = max((clipped.rfind(mark) for mark in ('。', '！', '？', '.', '!', '?', '；', ';')), default=-1)
    if boundary >= limit * 0.65:
        return clipped[:boundary + 1].strip()
    return clipped.rstrip(' ，、;；') + '…'


def _is_article_url(url):
    parsed = urlparse(url)
    parts = [unquote(part).strip().lower() for part in parsed.path.split('/') if part.strip()]
    if not parts:
        return False
    if any(key.lower() in {'q', 'query', 'search', 'page', 'offset'} for key, _ in parse_qsl(parsed.query)):
        return False
    if parts[-1] in {'index', 'index.html', 'index.htm', 'latest', 'search'}:
        return False
    # A one-segment section URL is a category landing page, not a source for one story.
    if len(parts) == 1 and parts[0] in LANDING_PAGE_SEGMENTS:
        return False
    if len(parts) > 1 and parts[-2] in {'archive', 'cate', 'category', 'categories', 'section', 'tag', 'tags', 'topic', 'topics'}:
        return False
    return True


def _is_multi_story_result(value, title=''):
    raw = html.unescape(str(value or ''))
    title_text = html.unescape(str(title or ''))
    if re.search(r'^[【\[][^】\]]*(?:周报|早报|汇总)[】\]]|^(?:每日热点早报|今日新闻|早间新闻|新闻汇总)', title_text):
        return True
    if len(set(re.findall(r'20\d{2}-\d{2}-\d{2}', raw))) >= 3:
        return True
    if len(re.findall(r'[；;]', title_text)) >= 2:
        return True
    # Live-news feeds often combine several items, each prefixed by a timestamp.
    if len(re.findall(r'(?<!\d)(?:[01]?\d|2[0-3]):[0-5]\d(?!\d)', raw)) >= 3:
        return True
    # Tavily may expose a news index as several Markdown headline blocks in one result.
    if len(re.findall(r'(?<!#)#{2,6}(?!#)', raw)) >= 3:
        return True
    # Search pages often expose numbered headline blocks in Tavily's content field.
    if len(re.findall(r'(?<!\w)\d{1,3}[.)、]\s*#{1,6}\s*\S', raw)) >= 2:
        return True
    numbered = [(int(match.group(1)), match.start()) for match in
                re.finditer(r'(?<!\d)(\d{1,3})[.)、]\s+(?=\S)', raw)]
    for index in range(len(numbered) - 2):
        first, second, third = numbered[index:index + 3]
        if second[0] == first[0] + 1 and third[0] == second[0] + 1 and third[1] - first[1] < 1600:
            return True
    return False


def normalize_news(rows, limit=3, *, now=None):
    """Keep distinct article sources without clipping their search snippets."""
    result, seen_urls, seen_titles = [], set(), set()
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=ZoneInfo('Asia/Shanghai'))
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        raw_summary = row.get('summary')
        title = _compact(row.get('title'), 200)
        if (_is_multi_story_result(raw_summary, row.get('title'))
                or not _is_recent(row.get('published_at'), now)):
            continue
        summary = _clean_text(raw_summary)
        url = str(row.get('url') or '').strip()
        parsed = urlparse(url)
        title_key = re.sub(r'\W+', '', title).casefold()
        if (not title or not summary or parsed.scheme not in ('http', 'https') or not parsed.netloc
                or not _is_article_url(url) or url in seen_urls or title_key in seen_titles):
            continue
        seen_urls.add(url)
        seen_titles.add(title_key)
        result.append({'title': title, 'summary': summary, 'url': url,
                       'published_at': row.get('published_at') or '',
                       'fetched_at': row.get('fetched_at') or ''})
        if len(result) >= limit:
            break
    return result
