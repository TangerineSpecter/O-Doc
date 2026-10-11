"""旅行展示文本统一为简体，来源原文与业务标识保持原样。"""
import re
from opencc import OpenCC

_converter = OpenCC('t2s')
_URL = re.compile(r'https?://[^\s<>\[\]()]+')
_DISPLAY_FIELDS = frozenset({
    'feature', 'name', 'description', 'reason', 'reaction', 'choice',
    'title', 'content', 'reflection', 'photo_scene',
})


def simplified_text(value: str) -> str:
    # 游记 Markdown 中的引用链接可能包含中文路径，保持可访问地址不变。
    parts, start = [], 0
    for match in _URL.finditer(value):
        parts.extend((_converter.convert(value[start:match.start()]), match.group()))
        start = match.end()
    parts.append(_converter.convert(value[start:]))
    return ''.join(parts)


def normalize_generated_text(value: dict) -> dict:
    """只转换模型生成的展示字段，不转换 ID、URL 和证据引句。"""
    def convert(item):
        if isinstance(item, list):
            return [convert(entry) for entry in item]
        if isinstance(item, dict):
            return {
                key: simplified_text(entry) if key in _DISPLAY_FIELDS and isinstance(entry, str)
                else convert(entry)
                for key, entry in item.items()
            }
        return item

    return convert(value)
