"""Parse AI generation JSON, preserving the original output for audit."""
import json
import re
from quant.factors.contracts import Candidate

MAX_OUTPUT = 300000
REPAIR_NOTE = '模型输出漏了一个候选定义结束符，系统在唯一可解析且字段完整时补全；AI原稿已保留。'
RELATION_KEY = re.compile(r',\s*"parent_relations"\s*:')


def complete_candidates(value):
    if not isinstance(value, dict) or not isinstance(value.get('candidates'), list) or not value['candidates']:
        return False
    expected = set(Candidate().fields) - {'evidence'}
    required = {'parents', 'parent_relations', 'operation', 'definition', 'rationale', 'decision', 'scores', 'risks'}
    for row in value['candidates']:
        if (not isinstance(row, dict) or not required.issubset(row)
                or not isinstance(row['definition'], dict) or set(row['definition']) != expected
                or not isinstance(row['parents'], list) or not isinstance(row['parent_relations'], list)
                or not isinstance(row['scores'], list) or not isinstance(row['risks'], list)):
            return False
    return True


def parse_generation(raw, version):
    text = re.sub(r'^```(?:json)?\s*', '', raw.strip()).removesuffix('```').strip()
    if len(text) > MAX_OUTPUT: raise ValueError('研究输出过长')
    try:
        return json.loads(text), ''
    except json.JSONDecodeError as error:
        if version < 5: raise
        matches = list(RELATION_KEY.finditer(text))
        if len(matches) > 16: raise error
        options = []
        for match in matches:
            if not text[:match.start()].rstrip().endswith(('}', ']')): continue
            repaired = text[:match.start()] + '}' + text[match.start():]
            try: value = json.loads(repaired)
            except json.JSONDecodeError: continue
            if complete_candidates(value): options.append(value)
        if len(options) != 1: raise error
        return options[0], REPAIR_NOTE
