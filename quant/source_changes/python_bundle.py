"""Separate provided Python files before resolving literal import candidates."""
import ast
from collections import defaultdict
import copy
import hashlib
import keyword
from pathlib import PurePosixPath
import symtable
from quant.research.contracts import digest
from quant.source_structure import analyze
from quant.source_structure.common import Outline, source_lines
from .python_bindings import scoped_preview, UNSUPPORTED
from .bundle_imports import BundleLimit, FileBindingGraph, ImportResolver, import_index

PARSER = 'python-provided-file-bindings-v1'
MAX_AST_NODES = 12000
MAX_IMPORTS = 256
MAX_NODES = 256
MAX_REFERENCES = 2048


def file_rows(payload):
    """Only immutable supplied text is available; never read a host path."""
    if not payload.get('bundle_version'):
        return [{'name': '__source__.py', 'code': payload.get('code', ''), 'role': 'primary', 'start_line': 1}]
    rows = payload.get('files')
    if type(payload['bundle_version']) is not int or payload['bundle_version'] != 1 or not isinstance(rows, list) or not 1 <= len(rows) <= 8:
        raise ValueError('文件包版本或数量无效，无法验证文件边界。')
    rendered, result, names, line = [], [], set(), 1
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or not isinstance(row.get('name'), str) or not isinstance(row.get('code'), str):
            raise ValueError('文件清单缺少原文或名称。')
        name, code = row['name'], row['code']
        if len(code) > 150000:
            raise BundleLimit('单文件正文超过文件包工作量上限。')
        path = PurePosixPath(name)
        if (name in names or not 1 <= len(name) <= 160 or path.is_absolute()
                or any(part in ('', '.', '..') for part in name.split('/'))
                or row.get('role') != ('primary' if index == 0 else 'dependency')):
            raise ValueError('文件路径、身份或主文件顺序无法确认。')
        names.add(name)
        if row.get('content_hash') != hashlib.sha256(code.encode('utf-8')).hexdigest():
            raise ValueError('文件正文哈希不一致。')
        first, last = line + 1, line + len(source_lines(code))
        if (type(row.get('start_line')) is not int or type(row.get('end_line')) is not int
                or (row['start_line'], row['end_line']) != (first, last)):
            raise ValueError('文件边界与实际正文不一致。')
        origin = 'from parent snapshot' if index == 0 else 'user supplied'
        block = f'# SOURCE FILE: {name} ({row["role"]}; {origin}; not executed)\n' + code + '\n\n'
        rendered.append(block); line += len(source_lines(block))
        result.append({**row, 'start_line': first})
    if ''.join(rendered) != payload.get('code'):
        raise ValueError('展示正文与逐份文件的规范组装不一致。')
    return result


def module_name(name):
    path = PurePosixPath(name)
    parts = list(path.parts)
    if path.suffix != '.py': return None
    if parts[-1] == '__init__.py': parts.pop()
    else: parts[-1] = path.stem
    if not parts or not all(part.isidentifier() and not keyword.iskeyword(part) for part in parts): return None
    return '.'.join(parts)


def states_for(payload):
    states, total_ast, total_imports, total_nodes = [], 0, 0, 0
    for row in file_rows(payload):
        module = module_name(row['name'])
        if module is None:
            raise ValueError('文件名不是可定位的Python模块路径；未把其他语言或任意文件当作Python。')
        outline = analyze({'code': row['code'], 'language': 'python'})
        if outline['status'] == 'limited':
            raise BundleLimit('至少一份文件达到Python语法树解析上限。')
        if outline['status'] not in ('parsed', 'no_code'):
            raise ValueError('至少一份文件无法由Python3.11解析；未合并到其他文件作用域。')
        if any(any(word in entry['message'] for word in ('上限', '超过')) for entry in outline['diagnostics']):
            raise BundleLimit('单文件结构解析达到上限，跨文件图不完整。')
        tree = ast.parse(row['code'], feature_version=(3, 11))
        nodes = list(ast.walk(tree)); total_ast += len(nodes)
        total_nodes += max(1, len(outline['nodes']))
        total_imports += sum(len(node.names) for node in nodes if isinstance(node, (ast.Import, ast.ImportFrom)))
        if total_ast > MAX_AST_NODES or total_nodes > MAX_NODES or total_imports > MAX_IMPORTS:
            raise BundleLimit('文件包超过12000语法节点、256结构节点或256导入项上限，未构建部分冒充完整图。')
        if not outline['nodes']:
            # Empty package initializers still have a module identity. The
            # marker remains a separate display line, never executable code.
            empty = Outline(row['code'], 'python')
            empty.node('<module>', 'module', 0, len(row['code']), '', 'python_ast')
            outline = empty.finish('parsed', 'python-3.11-ast-v1')
        root = next(node['id'] for node in outline['nodes'] if node['kind'] == 'module')
        ids = {node['id']: digest(['provided-python-file-v1', row['name'], node['id']])[:40]
               for node in outline['nodes']}
        bindings = defaultdict(list)
        for node in outline['nodes']:
            if node['kind'] != 'module': bindings[node['parent_id'], node['name']].append(ids[node['id']])
        state = {**row, 'module': module, 'outline': outline, 'root': root, 'ids': ids,
                 'bindings': dict(bindings), 'tree': tree, 'supported': not any(isinstance(node, UNSUPPORTED) for node in nodes)}
        state['imports'] = import_index(state)
        states.append(state)
    return states


def analyze_bundle(payload):
    outer = Outline(payload.get('code', ''), 'python')
    if not payload.get('bundle_version') and not outer.code.strip():
        return outer.finish('no_code', 'none')
    if len(outer.code) > 150000 or len(outer.lines) > 6000:
        outer.warn('跨文件结构超过150000字符或6000行上限；原文保留，依赖未知。')
        return outer.finish('limited', PARSER)
    try:
        states = states_for(payload)
        resolver = ImportResolver(states)
        for state in states:
            for owner, name in sorted(state['imports']): resolver.binding(state, owner, name)
        references, imports, issues = [], [], set()
        for state in states:
            outline = state['outline']; offset = state['start_line'] - 1
            if state['supported']:
                graph = FileBindingGraph(state, symtable.symtable(state['code'], '<provided-file>', 'exec'), resolver)
                graph.visit(state['tree'])
                local_refs = graph.references; issues.update(graph.issues)
            else:
                local_refs = outline['references']
                issues.add('至少一份文件含暂不支持的作用域/写语法；仅保留该文件的同名候选，其他未列依赖未知。')
            for node in outline['nodes']:
                transformed = {**node, 'id': state['ids'][node['id']],
                    'parent_id': state['ids'].get(node['parent_id'], ''), 'name': state['name'] + '::' + node['name'],
                    'start_line': node['start_line'] + offset, 'end_line': node['end_line'] + offset}
                outer.nodes.append(transformed)
                first = max(0, transformed['start_line'] - 1)
                last = min(len(outer.lines), transformed['end_line'])
                outer.ranges[transformed['id']] = (outer.offsets[first], outer.offsets[last])
            for reference in local_refs:
                references.append({**reference, 'from_id': state['ids'][reference['from_id']], 'line': reference['line'] + offset,
                    'candidate_ids': [state['ids'].get(target, target) for target in reference['candidate_ids']]})
            imports.extend({**item, 'name': state['name'] + '::' + item['name'], 'line': item['line'] + offset}
                           for item in outline['imports'])
        resolver.check_cycles(); issues.update(resolver.issues)
        if len(references) > MAX_REFERENCES:
            issues.add('跨文件引用超过2048项上限，未列出的关系保留未知。')
        for message in sorted(issues): outer.warn(message)
        result = outer.finish('partial' if any(not state['supported'] for state in states) or len(references) > MAX_REFERENCES else 'parsed', PARSER)
        result.update(references=references[:MAX_REFERENCES], imports=imports,
            binding_uncertainties=sorted(issues),
            reference_semantics='provided_files_lexical_and_literal_import_candidates_not_runtime_imports')
        return result
    except (BundleLimit, ValueError, SyntaxError, KeyError, RecursionError, MemoryError) as exc:
        # No partial graph silently survives invalid file identities or a work
        # cap. Saved raw files remain available to the model and source reader.
        limited = isinstance(exc, BundleLimit)
        safe = str(exc) if isinstance(exc, ValueError) and not isinstance(exc, SyntaxError) else '文件包语法/作用域解析未完成，依赖保留未知。'
        blank = Outline(payload.get('code', ''), 'python'); blank.warn(safe)
        result = blank.finish('limited' if limited else 'unparsed', PARSER)
        result['binding_uncertainties'] = [safe]
        return result


def analyze_source(payload):
    """New workflow contract only; old normalized outputs stay byte-identical."""
    if payload.get('language') == 'python':
        return analyze_bundle(payload)
    return scoped_preview(payload, analyze(payload))


def model_context(structure):
    """Expose bounded call AND value reads; do not copy code or opaque IDs."""
    names = {row['id']: row['name'] for row in structure['nodes']}
    refs = structure['references']
    # Call/read pairs at the same location are still distinct syntax facts.
    return {'parser': structure['parser'], 'status': structure['status'],
        'diagnostics': copy.deepcopy(structure['diagnostics']),
        'nodes': [{key: node[key] for key in ('name', 'kind', 'start_line', 'end_line', 'basis')} for node in structure['nodes']],
        'references': [{'owner': names.get(row['from_id'], ''), 'name': row['name'], 'line': row['line'], 'kind': row['kind'],
            'static_candidates': [names[key] for key in row['candidate_ids']]} for row in refs[:128]],
        'references_omitted': max(0, len(refs) - 128), 'imports': copy.deepcopy(structure['imports'][:64]),
        'imports_omitted': max(0, len(structure['imports']) - 64), 'reference_semantics': structure['reference_semantics']}
