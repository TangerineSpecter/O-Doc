"""CommonMark link targets; unescape only Markdown, never arbitrary raw URLs."""
import re

from markdown_it import MarkdownIt

_PARSER = MarkdownIt('commonmark', {'html': False})


def single_link_target(value: str) -> str | None:
    tokens = _PARSER.parseInline(value)[0].children or []
    if (len(tokens) >= 2 and tokens[0].type == 'link_open'
            and tokens[-1].type == 'link_close'
            and sum(token.type == 'link_open' for token in tokens) == 1
            and all(token.type in {'text', 'code_inline', 'em_open', 'em_close',
                                   'strong_open', 'strong_close'} for token in tokens[1:-1])):
        return tokens[0].attrGet('href')
    return None


def normalize_link_uri(value: str) -> str:
    """Use the same IRI/IDNA conversion for raw URLs and CommonMark targets."""
    return _PARSER.normalizeLink(value)


def _reject_broken_link(state, silent: bool) -> bool:
    # This runs only after CommonMark link/escape/code rules have had their turn.
    # Inspect original source, never text tokens whose escapes have been decoded.
    if state.src[state.pos] == '[':
        end = state.md.helpers.parseLinkLabel(state, state.pos, True)
        if end >= 0 and re.match(r'\s*[\[(]', state.src[end + 1:state.posMax]):
            raise ValueError('正文引用格式损坏或不受支持；请核对完整 Markdown 链接，草稿未发布')
    elif re.match(r'<a\b[^>]*\bhref\s*=', state.src[state.pos:state.posMax], re.I):
        raise ValueError('正文 HTML 引用不受支持；请使用完整 Markdown 链接，草稿未发布')
    return False


_BODY_PARSER = MarkdownIt('commonmark', {'html': False})
_BODY_PARSER.inline.ruler.after('link', 'reject_broken_link', _reject_broken_link)


def is_top_level_paragraph(content: str, line: int, text: str) -> bool:
    tokens = _PARSER.parse(content)
    return any(token.type == 'paragraph_open' and token.level == 0
               and token.map == [line, line + 1]
               and tokens[index + 1].content == text
               for index, token in enumerate(tokens[:-1]))


def markdown_link_targets(content: str) -> list[str]:
    blocks = _BODY_PARSER.parse(content)
    for block in blocks:
        if block.type == 'fence':
            start, end = block.map
            # Token maps include a closing marker only when it actually exists;
            # use parsed content so quote/list indentation does not affect this.
            content_lines = block.content.count('\n') + bool(block.content and not block.content.endswith('\n'))
            if end - start != content_lines + 2:
                raise ValueError('正文代码围栏未闭合；请保留并修正草稿后再发布')
    return [token.attrGet('href') or ''
            for block in blocks if block.type == 'inline'
            for token in block.children or [] if token.type == 'link_open']
