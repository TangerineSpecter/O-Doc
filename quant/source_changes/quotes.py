"""Match old report quotes literally; presence never certifies unaffected logic."""
from bisect import bisect_right
from quant.source_structure.common import source_lines
from .diff import overlaps

FIELDS = ('code', 'description', 'web_markdown')
MAX_POSITIONS = 8
MAX_QUOTE = 600
MAX_QUOTES = 10


class QuoteMatcher:
    def __init__(self, old: dict, new: dict):
        self.old, self.new, self.cache, self.line_ends = old, new, {}, {}

    def locations(self, side: str, field: str, quote: str) -> tuple[int, list[dict]]:
        key = (side, field, quote)
        if key in self.cache:
            return self.cache[key]
        text = (self.old if side == 'old' else self.new).get(field, '')
        # Non-overlapping occurrences give an exact bounded count using the
        # native matcher; only the first few coordinates are materialized.
        count, locations, offset = text.count(quote), [], 0
        if count and (side, field) not in self.line_ends:
            ends, cursor = [], 0
            for line in source_lines(text):
                cursor += len(line)
                ends.append(cursor)
            self.line_ends[(side, field)] = ends
        ends = self.line_ends.get((side, field), [])
        for _ in range(min(count, MAX_POSITIONS)):
            start = text.find(quote, offset)
            locations.append({'start_line': bisect_right(ends, start) + 1,
                              'end_line': bisect_right(ends, start + len(quote) - 1) + 1})
            offset = start + len(quote)
        self.cache[key] = count, locations
        return count, locations

    def quote(self, field: str, quote: str) -> dict:
        old_count, old_lines = self.locations('old', field, quote)
        new_count, new_lines = self.locations('new', field, quote)
        status = ('unknown' if not old_count else 'missing' if not new_count else
                  'ambiguous' if old_count > 1 or new_count > 1 else
                  'moved' if old_lines != new_lines else 'present')
        return {'field': field, 'quote': quote[:MAX_QUOTE], 'status': status,
                'old_lines': old_lines, 'new_lines': new_lines,
                'old_occurrences': old_count, 'new_occurrences': new_count,
                'truncated': max(old_count, new_count) > MAX_POSITIONS or len(quote) > MAX_QUOTE}


def evidence_rows(item: dict, old: dict, *, factor: bool) -> list[tuple[str, str]]:
    evidence = item.get('evidence', [])
    rows = list(evidence) if isinstance(evidence, list) else []
    domain = item.get('domain')
    if isinstance(domain, dict):
        rows.extend(domain.get('evidence', []))
    if factor:
        for parameter in item.get('parameters', []):
            if isinstance(parameter, dict) and isinstance(parameter.get('domain'), dict):
                rows.extend(parameter['domain'].get('evidence', []))
    # Historical parameter evidence is free prose, not a quote contract. Only
    # an exact occurrence in the old snapshot can supply a location clue.
    if isinstance(evidence, str) and evidence.strip():
        rows.extend({'field': field, 'quote': evidence} for field in FIELDS
                    if evidence in old.get(field, ''))
    result = []
    for row in rows:
        if (isinstance(row, dict) and row.get('field') in FIELDS
                and isinstance(row.get('quote'), str) and row['quote'].strip()):
            key = (row['field'], row['quote'])
            if key not in result:
                result.append(key)
    return result


def project_items(items: list, matcher: QuoteMatcher, structures: tuple[dict, dict],
                  nodes: list[dict], ranges: list[dict], *, factor: bool,
                  uncertain: bool, code_limited: bool) -> list[dict]:
    output = []
    old_nodes, new_nodes = structures[0]['nodes'], structures[1]['nodes']
    node_by_id = {row['id']: row for row in nodes}
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            item = {}
        keys = evidence_rows(item, matcher.old, factor=factor)
        quotes = [matcher.quote(field, quote) for field, quote in keys[:MAX_QUOTES]]
        related, direct = set(), False
        for quote in quotes:
            if quote['status'] == 'missing':
                direct = True
            if quote['field'] != 'code':
                continue
            for side, candidates in (('old', old_nodes), ('new', new_nodes)):
                for location in quote[side + '_lines']:
                    for node in candidates:
                        if node['kind'] != 'module' and overlaps(location['start_line'], location['end_line'], node):
                            related.add(node['id'])
                    if not code_limited and any(overlaps(row[side + '_start'], row[side + '_end'], location)
                                                for row in ranges):
                        direct = True
        impacts = {node_by_id[key]['impact'] for key in related if key in node_by_id}
        hidden = len(keys) > MAX_QUOTES or any(row['truncated'] for row in quotes)
        status = ('direct' if direct else 'potential' if impacts & {'direct', 'potential'} else
                  'unknown' if uncertain or hidden or not quotes or
                  any(row['status'] in ('unknown', 'ambiguous') for row in quotes) or 'unknown' in impacts
                  else 'quote_present')
        limitations = ['原文引文仍在或位置移动不代表候选、参数或运行语义未受影响。']
        if not quotes:
            limitations.append('旧记录没有可逐字定位的原文依据；不能从名称或自由说明推断安全复用。')
        if len(keys) > MAX_QUOTES:
            limitations.append(f'其余 {len(keys) - MAX_QUOTES} 条引文未展示，影响判定保留未知。')
        if hidden:
            limitations.append('引文摘录或位置展示达到上限，不能据此排除其他位置的影响。')
        if len(related) > 32:
            limitations.append(f'其余 {len(related) - 32} 个涉及节点未展示。')
        output.append({'index': index, 'name': str(item.get('name', ''))[:200], 'status': status,
                       'quotes': quotes, 'node_ids': sorted(related)[:32], 'limitations': limitations})
    return output
