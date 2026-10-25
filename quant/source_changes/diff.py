"""Bound line matching before using SequenceMatcher on user supplied text."""
from difflib import SequenceMatcher
from quant.source_structure.common import source_lines

MAX_LINES = 6000
MAX_LINE_PRODUCT = 2000000
MAX_HUNKS = 64
MAX_EXCERPT = 1200


def compare_code(old: str, new: str) -> tuple[dict, list[dict]]:
    """Return bounded display data and all changed ranges for impact matching.

    Ranges are inclusive, one based, with null on the empty side. A limited
    replacement is deliberately broader than the true edit, never a no-op.
    """
    left, right = source_lines(old), source_lines(new)
    result = {'old_line_count': len(left), 'new_line_count': len(right),
              'status': 'identical', 'total_hunks': 0, 'omitted_hunks': 0,
              'hunks': [], 'limitations': []}
    if old == new:
        return result, []
    limited = (max(len(left), len(right)) > MAX_LINES
               or len(left) * len(right) > MAX_LINE_PRODUCT
               or max(len(old), len(new)) > 150000)
    if limited:
        opcodes = [('replace' if left and right else 'delete' if left else 'insert',
                    0, len(left), 0, len(right))]
        result['status'] = 'limited'
        result['limitations'] = ['源码超过行数、字符或行匹配工作量预算；以整段潜在变更代替精确差异。']
    else:
        opcodes = [row for row in SequenceMatcher(None, left, right, autojunk=False).get_opcodes()
                   if row[0] != 'equal']
        result['status'] = 'exact'
    ranges = []
    for kind, a, b, c, d in opcodes:
        row = {'kind': kind, 'old_start': a + 1 if b > a else None,
               'old_end': b if b > a else None, 'new_start': c + 1 if d > c else None,
               'new_end': d if d > c else None}
        ranges.append(row)
        if len(result['hunks']) < MAX_HUNKS:
            old_text, new_text = ''.join(left[a:b]), ''.join(right[c:d])
            result['hunks'].append({**row, 'old_text': old_text[:MAX_EXCERPT],
                'new_text': new_text[:MAX_EXCERPT], 'old_truncated': len(old_text) > MAX_EXCERPT,
                'new_truncated': len(new_text) > MAX_EXCERPT})
    result['total_hunks'] = len(ranges)
    result['omitted_hunks'] = max(0, len(ranges) - MAX_HUNKS)
    if result['omitted_hunks']:
        result['limitations'].append('差异摘录仅显示前 64 项；结构影响仍使用全部已计算的变更范围。')
    return result, ranges


def overlaps(start: int | None, end: int | None, node: dict) -> bool:
    return start is not None and end is not None and start <= node['end_line'] and end >= node['start_line']
