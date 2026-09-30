"""自主正文的代码围栏及简单图表校验；不改变历史正文渲染。"""
import math
import re


def validate_format(content):
    opening = None
    lines = []
    for line in content.splitlines():
        if opening:
            marker, language = opening
            if re.fullmatch(r'\s{0,3}' + re.escape(marker[0]) + '{' + str(len(marker)) + r',}\s*', line):
                if language == 'chart':
                    validate_chart(lines)
                elif language == 'mermaid':
                    meaningful = [s.strip() for s in lines if s.strip() and not s.strip().startswith('%%')]
                    if not meaningful or not re.match(r'^(flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|classDiagram|erDiagram|mindmap)\b', meaningful[0]):
                        raise ValueError('mermaid 必须包含受支持的非数值示意图声明')
                opening, lines = None, []
            else:
                lines.append(line)
        else:
            match = re.match(r'^\s{0,3}(`{3,}|~{3,})([^`~]*)$', line)
            if match:
                opening = (match[1], match[2].strip().lower())
    if opening:
        raise ValueError('正文代码块未闭合')


def validate_chart(lines):
    chart_type, values = None, []
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        option = re.match(r'^(type|title)\s*:\s*(.+)$', line)
        if option:
            if option[1] == 'type':
                chart_type = option[2].strip()
            continue
        cells = line.split(',')
        if len(cells) != 2 or not cells[0].strip():
            raise ValueError('chart 数据须为 标签,数值，每行一组')
        if not re.fullmatch(r'[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?', cells[1].strip()):
            raise ValueError('chart 数值须为有限数字，不含单位或表头')
        try:
            number = float(cells[1])
        except ValueError as exc:
            raise ValueError('chart 数值须为有限数字，不含单位或表头') from exc
        if not math.isfinite(number):
            raise ValueError('chart 数值须为有限数字')
        values.append(number)
    if chart_type not in ('bar', 'line', 'pie', 'wordcloud') or not values:
        raise ValueError('chart 类型无效或缺少有效数据')
    if chart_type in ('pie', 'wordcloud'):
        if any(v < 0 for v in values):
            raise ValueError('pie/wordcloud 数值不能为负')
        if not any(v > 0 for v in values):
            raise ValueError('pie/wordcloud 至少需要一个正数')
