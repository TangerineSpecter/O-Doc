"""Deterministic version-1 outline and bounded model projection."""
from .common import Outline


def analyze(payload: dict) -> dict:
    code, language = payload.get('code', ''), payload.get('language', 'text')
    outline = Outline(code, language)
    if not code.strip():
        return outline.finish('no_code', 'none')
    if len(code) > 150000:
        outline.warn('源码超过结构解析上限，原文不截断。')
        return outline.finish('limited', 'none')
    if language == 'python':
        from .python_outline import parse
    elif language in ('pine', 'mql4', 'tongdaxin'):
        from .lexical import parse
    else:
        outline.warn('此语言尚无结构解析器；保留完整源码片段，不猜测函数和依赖。')
        return outline.finish('unsupported', 'none')
    status, parser = parse(outline)
    return outline.finish(status, parser)


def model_context(structure: dict) -> dict:
    # Do not send another copy of source, internal IDs or hundreds of raw reads.
    names = {row['id']: row['name'] for row in structure['nodes']}
    calls = [row for row in structure['references'] if row['kind'] == 'call']
    return {'parser': structure['parser'], 'status': structure['status'], 'diagnostics': structure['diagnostics'],
        'nodes': [{key: row[key] for key in ('name', 'kind', 'start_line', 'end_line', 'basis')} for row in structure['nodes']],
        'calls': [{'owner': names.get(row['from_id'], ''), 'name': row['name'], 'line': row['line'],
            'same_named_candidates': [names[key] for key in row['candidate_ids']]} for row in calls[:128]],
        'calls_omitted': max(0, len(calls) - 128), 'imports': structure['imports'][:64],
        'imports_omitted': max(0, len(structure['imports']) - 64),
        'reference_semantics': structure['reference_semantics']}
