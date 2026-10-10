"""Output contracts and provenance; no network or ORM."""
import json
import re
from urllib.parse import urlsplit


def parse_object(raw: str) -> dict:
    text = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw.strip())
    obj = json.loads(text)
    if not isinstance(obj, dict):
        raise ValueError('模型未返回有效对象')
    return obj


def body_length(body: str) -> int:
    return len(re.sub(r'\s', '', body))


def collect_sources(value) -> list[dict]:
    """Only URLs actually returned by tools can be cited."""
    found = {}
    def visit(item):
        if isinstance(item, dict):
            url = item.get('url') or item.get('link')
            if isinstance(url, str) and urlsplit(url).scheme in ('http', 'https') and urlsplit(url).netloc:
                found[url] = {'url': url, 'title': str(item.get('title') or url)[:300],
                              'excerpt': str(item.get('content') or item.get('snippet') or item.get('text') or '')[:6000]}
            for child in item.values():
                visit(child)
        elif isinstance(item, list):
            for child in item:
                visit(child)
        elif isinstance(item, str):
            try:
                visit(json.loads(item))
            except (ValueError, TypeError):
                for url in re.findall(r'https?://[^\s<>\]\)"\u3002]+', item):
                    if urlsplit(url).netloc:
                        found.setdefault(url, {'url': url, 'title': url, 'excerpt': item[:6000]})
    visit(value)
    return list(found.values())[:20]


def validate_result(data: dict, sources: list[dict]) -> dict:
    kind = data.get('kind')
    if kind not in ('article', 'insight', 'no_direction'):
        raise ValueError('结果类型不正确')
    body = data.get('body')
    title = data.get('title')
    if not isinstance(body, str) or not isinstance(title, str) or not title.strip() or not body.strip():
        raise ValueError('结果缺少标题或正文')
    if body_length(body) > (1200 if kind == 'article' else 400):
        raise ValueError('正文超过长度限制，请精炼后完整输出')
    refs = data.get('source_urls', [])
    if not isinstance(refs, list) or any(not isinstance(url, str) for url in refs):
        raise ValueError('引用来源格式不正确')
    allowed = {s['url'] for s in sources}
    inline_urls = re.findall(r'https?://[^\s<>\]\)"\u3002]+', body)
    if any(url not in allowed for url in [*refs, *inline_urls]):
        raise ValueError('引用了未经工具返回的来源')
    return {'kind': kind, 'title': title.strip()[:150], 'body': body.strip(),
            'references': [s for s in sources if s['url'] in {*refs, *inline_urls}], 'length': body_length(body)}


def article_content(sprout, body: str | None = None) -> str:
    text = body if body is not None else sprout.result['body']
    lines = [text, '\n---\n### 灵感来源']
    for source in sprout.sources:
        # Snapshots survive source edits/deletions; no live private links in public articles.
        lines.append(f"\n**{source.get('creator_name') or '用户'} · {source.get('tag') or '未归类'}**\n")
        lines.extend('> ' + line for line in source['content'].splitlines())
    if sprout.result.get('references'):
        lines.append('\n### 参考资料')
        lines.extend(f"- [{r['title'].replace('[', '').replace(']', '')}]({r['url']})" for r in sprout.result['references'])
    return '\n'.join(lines)
