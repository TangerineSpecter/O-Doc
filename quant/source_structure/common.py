"""Bounded source coordinates, lossless slices and conservative reference candidates."""
from bisect import bisect_right
import re
from quant.research.contracts import digest

MAX_NODES = 256
MAX_REFERENCES = 2048
MAX_TOKENS = 50000


def source_lines(code: str) -> list[str]:
    """Match editor/Python physical lines; Unicode separators in strings are data."""
    return [match[0] for match in re.finditer(r'[^\r\n]*(?:\r\n|\r|\n|$)', code) if match[0]]


class Outline:
    def __init__(self, code: str, language: str):
        self.code, self.language = code, language
        self.lines = source_lines(code)
        self.offsets = [0]
        for line in self.lines:
            self.offsets.append(self.offsets[-1] + len(line))
        self.nodes, self.references, self.imports, self.diagnostics = [], [], [], []
        self.ranges, self.names = {}, {}

    def line(self, offset: int) -> int:
        return min(len(self.lines), bisect_right(self.offsets, offset))

    def warn(self, message: str, line: int | None = None):
        item = {'message': message, 'line': line}
        if item not in self.diagnostics:
            self.diagnostics.append(item)

    def node(self, name: str, kind: str, start: int, end: int, parent: str, basis: str) -> str:
        if len(self.nodes) >= MAX_NODES:
            self.warn('结构节点达到 256 项上限；未列出的源码仍保留在完整片段中。')
            return parent
        key = (parent, kind, name)
        count = self.names.get(key, 0) + 1
        self.names[key] = count
        identity = digest([parent, kind, name, count])[:24]
        self.nodes.append({'id': identity, 'name': name, 'kind': kind, 'parent_id': parent,
            'start_line': self.line(start), 'end_line': self.line(max(start, end - 1)),
            'content_hash': digest(self.code[start:end]), 'basis': basis})
        self.ranges[identity] = (start, end)
        return identity

    def owner(self, offset: int) -> str:
        matches = [row for row in self.nodes if self.ranges[row['id']][0] <= offset < self.ranges[row['id']][1]]
        return min(matches, key=lambda row: self.ranges[row['id']][1] - self.ranges[row['id']][0])['id'] if matches else ''

    def reference(self, owner: str, name: str, line: int, kind: str):
        if len(self.references) >= MAX_REFERENCES:
            self.warn('符号引用达到 2048 项上限；图谱只展示部分引用。')
            return
        self.references.append({'from_id': owner, 'name': name, 'line': line, 'kind': kind, 'candidate_ids': []})

    def imported(self, name: str, alias: str, line: int):
        if len(self.imports) >= 256:
            self.warn('外部导入超过 256 项，剩余声明保留在原文中。')
            return
        self.imports.append({'name': name, 'alias': alias, 'line': line, 'status': 'external_not_loaded'})

    def finish(self, status: str, parser: str) -> dict:
        # Matching names are candidates only: shadowing, dynamic dispatch,
        # conditional definitions and external imports are not resolved here.
        by_name = {}
        for row in self.nodes:
            if row['kind'] != 'module':
                name = row['name'].upper() if self.language == 'tongdaxin' else row['name']
                by_name.setdefault(name, []).append(row['id'])
        for row in self.references:
            name = row['name'].upper() if self.language == 'tongdaxin' else row['name']
            row['candidate_ids'] = by_name.get(name, [])
        # Every line, including unsupported syntax/comments, occurs exactly once.
        cuts = {0, len(self.lines)}
        for node in self.nodes:
            cuts.update((node['start_line'] - 1, node['end_line']))
        ordered, slices = sorted(cuts), []
        for left, right in zip(ordered, ordered[1:]):
            for start in range(left, right, 200):
                end = min(start + 200, right)
                text = ''.join(self.lines[start:end])
                slices.append({'id': f'lines-{start + 1}-{end}', 'start_line': start + 1, 'end_line': end,
                    'content_hash': digest(text)})
        return {'version': 1, 'language': self.language, 'parser': parser, 'status': status,
            'code_hash': digest(self.code), 'line_count': len(self.lines), 'nodes': self.nodes,
            'references': self.references, 'imports': self.imports, 'slices': slices, 'diagnostics': self.diagnostics,
            'reference_semantics': 'syntactic_name_candidates_not_runtime_dependencies'}
