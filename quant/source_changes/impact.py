"""Deterministic syntactic clues, deliberately separate from stage reuse."""
from collections import Counter, defaultdict, deque
import re
from rest_framework.exceptions import ValidationError
from quant.source_structure import analyze
from quant.source_structure.common import Outline
from quant.workflows.contracts import source_context
from .diff import compare_code
from .quotes import QuoteMatcher, project_items
from .python_bindings import PARSER as SCOPED_PARSER, scoped_preview


def preview_outline(payload: dict, *, scoped: bool = True, bundle: bool = False) -> dict:
    """HTTP previews have tighter work bounds than persisted workflow parsing.

    In particular the existing lexical parser scans tokens per declaration.
    Do not change that versioned parser: old workflow replay must stay exact.
    Raw punctuation/token counts deliberately overestimate comments and strings.
    """
    code, language = payload.get('code', ''), payload.get('language', 'text')
    outline = Outline(code, language)
    over_budget = len(code) > 30000 or len(outline.lines) > 2000
    if not over_budget and language in ('pine', 'mql4', 'tongdaxin'):
        tokens = sum(1 for _ in re.finditer(r'[^\W\d]\w*|\d+(?:\.\d+)?|=>|:=|::|[^\s]', code))
        declarations = max(1, sum(code.count(char) for char in ('=', ';', '(')))
        over_budget = tokens > 6000 or tokens * declarations > 1000000
    if over_budget:
        outline.warn('只读影响预览超过更紧的结构解析工作量上限；保留原文位置，结构依赖记为未知。')
        return outline.finish('limited', 'none')
    if bundle and language == 'python':
        from .python_bundle import analyze_bundle
        return analyze_bundle(payload)
    value = analyze(payload)
    return scoped_preview(payload, value) if scoped else value


def _range(node: dict | None) -> dict | None:
    return ({key: node[key] for key in ('start_line', 'end_line')} if node else None)


def _node_coverage(nodes: list[dict], start: int, end: int) -> bool:
    """Does this hunk lie wholly inside named nodes, excluding the module?"""
    cursor = start
    for node in sorted(nodes, key=lambda row: (row['start_line'], -row['end_line'])):
        if node['kind'] == 'module' or node['end_line'] < cursor:
            continue
        if node['start_line'] > cursor:
            break
        cursor = max(cursor, node['end_line'] + 1)
        if cursor > end:
            return True
    return False


def structure_impact(old: dict, new: dict, ranges: list[dict], *, limited: bool,
                     context_changed: bool, scoped: bool = True) -> tuple[dict, bool]:
    before, after = {row['id']: row for row in old['nodes']}, {row['id']: row for row in new['nodes']}
    uncertain_reasons = []
    for value in (old, new):
        for reason in value.get('binding_uncertainties', []):
            if reason not in uncertain_reasons:
                uncertain_reasons.append(reason)
    if old['language'] != new['language']:
        uncertain_reasons.append('源码语言改变，结构节点之间不能证明对应关系。')
    if any(value['status'] not in ('parsed', 'no_code') for value in (old, new)):
        uncertain_reasons.append('至少一侧结构解析为部分、失败、不支持或资源受限状态，未列出的依赖保留未知。')
    if limited:
        uncertain_reasons.append('精确源码差异超过预算，整段潜在变化不能证明每个函数已经改变。')
    if context_changed:
        uncertain_reasons.append('说明、配置、平台或其他模型输入字段改变，函数文本相同不能排除分析结论变化。')
    if any(any(token in row['message'] for token in ('上限', '超过', '未完成'))
           for value in (old, new) for row in value['diagnostics']):
        uncertain_reasons.append('结构节点、符号引用或解析资源可能达到上限，依赖集合不完整。')
    imports = lambda value: [(row['name'], row['alias'] if 'alias' in row else '') for row in value['imports']]
    if imports(old) != imports(new):
        uncertain_reasons.append('外部导入声明变化；没有读取外部文件，无法确定影响范围。')
    references = [*old['references'], *new['references']]
    if any(row['name'] == '<动态调用>' or len(row['candidate_ids']) > 1 for row in references):
        uncertain_reasons.append('存在动态调用或多个同名候选，引用不能唯一解析。')
    for side, value in (('old', old), ('new', new)):
        if any(row[side + '_start'] is not None and not _node_coverage(
                value['nodes'], row[side + '_start'], row[side + '_end']) for row in ranges):
            uncertain_reasons.append('变更涉及模块级文本或未识别语句，不能只按已命名函数限制影响。')
            break
    duplicates = set()
    for value in (old, new):
        groups = Counter((row['parent_id'], row['kind'], row['name']) for row in value['nodes'])
        duplicates.update(row['id'] for row in value['nodes']
                          if groups[(row['parent_id'], row['kind'], row['name'])] > 1)
    if duplicates:
        uncertain_reasons.append('同一作用域存在重复声明，基于名称及序号的节点对应关系有歧义。')
    uncertain = bool(uncertain_reasons)
    result, seeds = [], set()
    for key in sorted(set(before) | set(after)):
        left, right = before.get(key), after.get(key)
        node = right or left
        change = ('added' if left is None else 'removed' if right is None else
                  'changed' if left['content_hash'] != right['content_hash'] else
                  'moved' if _range(left) != _range(right) else 'identical')
        reasons = []
        direct = node['kind'] != 'module' and change in ('added', 'removed', 'changed')
        if direct:
            seeds.add(key)
            reasons.append('命名节点的原文字节新增、删除或改变；这只是文本结构事实。')
        if key in duplicates or old['language'] != new['language']:
            impact = 'unknown'
            reasons.append('节点对应关系存在歧义。')
        elif direct:
            impact = 'direct'
        elif uncertain:
            impact = 'unknown'
        else:
            impact = 'not_observed'
        if node['kind'] == 'module':
            reasons.append('模块整体哈希变化不等于每个函数都变化，不由包含关系传播。')
        result.append({'id': key, 'name': node['name'], 'kind': node['kind'], 'change': change,
                       'impact': impact, 'old_range': _range(left), 'new_range': _range(right),
                       'reasons': reasons})
    reverse = defaultdict(set)
    for row in references:
        for target in row['candidate_ids']:
            reverse[target].add(row['from_id'])
    queue, visited = deque(sorted(seeds)), set(seeds)
    while queue:
        for owner in sorted(reverse[queue.popleft()]):
            if owner not in visited:
                visited.add(owner)
                queue.append(owner)
    for row in result:
        if row['id'] in visited - seeds and row['impact'] != 'direct':
            row['impact'] = 'potential'
            resolved = old['parser'] == new['parser'] == SCOPED_PARSER
            provided = old['parser'] == new['parser'] == 'python-provided-file-bindings-v1'
            row['reasons'].append('旧或新源码的逐文件词法绑定、显式导入及赋值读取链可到达变更节点；不是实际导入或运行时数据流证明。' if provided else
                                  '旧或新源码的词法绑定及赋值读取链可到达变更节点；不是运行时数据流证明。'
                                  if resolved else '旧或新源码的同名候选读取/调用可到达变更节点；不是运行时依赖证明。')
    counts = {key: sum(row['change'] == key for row in result)
              for key in ('added', 'removed', 'changed', 'moved', 'identical')}
    counts.update({key: sum(row['impact'] == key for row in result) for key in ('direct', 'potential', 'unknown')})
    return ({'old_status': old['status'], 'new_status': new['status'],
             'old_parser': old['parser'], 'new_parser': new['parser'],
             'total_nodes': len(result), 'omitted_nodes': 0, 'counts': counts, 'nodes': result,
             'limitations': [('Python作用域预览仅解析词法绑定与赋值读取，其余保留语法同名候选；均不证明运行时依赖或等价。'
                              if scoped else '结构图仅记录语法同名候选，不证明运行时依赖或等价。'),
                             *uncertain_reasons]}, uncertain)


def preview(old_payload: dict, new_payload: dict, report_data: dict, *, scoped: bool = True, bundle: bool = False) -> dict:
    """Compare immutable inputs without altering reports, candidates or runs."""
    if any(not isinstance(value, dict) for value in (old_payload, new_payload, report_data)):
        raise ValidationError('源码影响预览需要两份来源对象和原始报告对象')
    for payload in (old_payload, new_payload):
        if any(key in payload and not isinstance(payload[key], str)
               for key in ('code', 'language', 'description', 'web_markdown')):
            raise ValidationError('来源源码、语言和引文文本必须是字符串')
    old_code, new_code = old_payload.get('code', ''), new_payload.get('code', '')
    code, ranges = compare_code(old_code, new_code)
    files = bundle
    old, new = (preview_outline(value, scoped=scoped, bundle=files) for value in (old_payload, new_payload))
    changed_fields = sorted(key for key in set(old_payload) | set(new_payload)
                            if (key not in old_payload or key not in new_payload
                                or old_payload[key] != new_payload[key]))
    old_context, new_context = source_context(old_payload), source_context(new_payload)
    context_changed = old_context != new_context
    # Code changes have their own hunk/structure evidence. Other context must
    # never be silently ignored merely because an AST body looks the same.
    other_context = {key: value for key, value in old_context.items() if key != 'code'} != {
        key: value for key, value in new_context.items() if key != 'code'}
    structure, uncertain = structure_impact(old, new, ranges, limited=code['status'] == 'limited',
                                          context_changed=other_context, scoped=scoped)
    matcher = QuoteMatcher(old_payload, new_payload)
    groups, omitted = {}, {}
    for key, limit in (('parameters', 100), ('factors', 20)):
        items = report_data.get(key, [])
        if not isinstance(items, list):
            items = []
        omitted[key] = max(0, len(items) - limit)
        groups[key] = project_items(items[:limit], matcher, (old, new), structure['nodes'], ranges,
                                   factor=key == 'factors', uncertain=uncertain and bool(changed_fields),
                                   code_limited=code['status'] == 'limited')
    return {'version': 1, 'method': 'conservative-source-impact-v1',
            'status': 'limited' if code['status'] == 'limited' or any(
                value['status'] == 'limited' for value in (old, new)) else 'changed' if changed_fields else 'identical',
            'changed_fields': changed_fields, 'source_context_changed': context_changed,
            'code': code, 'structure': structure, **groups, 'omitted': omitted,
            'recommendation': {'action': 'full_reanalysis', 'start_stage': 'normalize', 'can_reuse_stages': False,
                'reasons': ['新源码分析须创建独立请求并重新验证所有原文依据；本预览不复用旧阶段。',
                            '旧报告、人工修订、候选与实验仍绑定原始来源，不随预览改写。']},
            'limitations': ['本结果是只读文本和语法线索，不是语义依赖求解、运行验证或安全复用证明。',
                            'quote_present 和 not_observed 仅表示原文仍在或未观察到线索，不能解释为未受影响。',
                            '引文位置按不重叠的逐字文本匹配，最多展示前八处；未执行或导入上传代码。']}
