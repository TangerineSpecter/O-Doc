"""Preserve conditional scopes when a local CSS import is inlined."""
import re

from utils.web_parser import WebParserError


def _function_argument(text: str) -> tuple[str, str]:
    depth = 0
    quote = ''
    escaped = False
    for index, char in enumerate(text):
        if escaped:
            escaped = False
            continue
        if char == '\\':
            escaped = True
            continue
        if quote:
            if char == quote:
                quote = ''
        elif char in {'"', "'"}:
            quote = char
        elif char == '(':
            depth += 1
        elif char == ')':
            depth -= 1
            if depth == 0:
                return text[1:index].strip(), text[index + 1:].strip()
    raise WebParserError('CSS 导入条件括号不完整。')


def wrap_import_conditions(css: str, conditions: str) -> str:
    """Keep import layer, supports and media semantics, including nested functions."""
    remaining = conditions.strip()
    layer = None
    supports = None
    match = re.match(r'layer\b', remaining, re.I)
    if match:
        remaining = remaining[match.end():].lstrip()
        layer = ''
        if remaining.startswith('('):
            layer, remaining = _function_argument(remaining)
    match = re.match(r'supports\s*(?=\()', remaining, re.I)
    if match:
        supports, remaining = _function_argument(remaining[match.end():])
    if remaining:
        css = f'@media {remaining} {{\n{css}\n}}'
    if supports is not None:
        if re.match(r'[-\w]+\s*:', supports):
            supports = f'({supports})'
        css = f'@supports {supports} {{\n{css}\n}}'
    if layer is not None:
        css = f'@layer {layer} {{\n{css}\n}}'
    return css
