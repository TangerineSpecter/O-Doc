"""Scope-qualified Python declarations; no evaluation or runtime configuration."""
import ast
from collections import defaultdict
from .source_values import python_node, UNKNOWN


class InventoryLimit(ValueError):
    pass


class Collector(ast.NodeVisitor):
    def __init__(self, code: str):
        self.code, self.scope, self.kind = code, '<module>', 'module'
        self.rows, self.counts, self.definitions = [], defaultdict(int), defaultdict(int)
        self.conditional = 0

    def add(self, name, node, default, kind, annotation=None, end=None):
        self.counts[self.scope, name, kind] += 1
        raw = ast.get_source_segment(self.code, default) if default is not None else ''
        quote_node = node
        if end is not None:
            quote_node = ast.Constant(value=None, lineno=node.lineno, col_offset=node.col_offset,
                end_lineno=end.end_lineno, end_col_offset=end.end_col_offset)
        value = python_node(default) if default is not None else dict(UNKNOWN)
        hinted = annotation.id if isinstance(annotation, ast.Name) and annotation.id in ('int', 'float', 'bool', 'str') else ''
        self.rows.append({'source_name': name, 'scope': self.scope, 'kind': kind,
            'ordinal': self.counts[self.scope, name, kind], 'type': {'str': 'string'}.get(hinted, hinted) or value['kind'],
            'default_raw': raw or '', 'literal': value, 'line': node.lineno,
            'end_line': quote_node.end_lineno, 'quote': ast.get_source_segment(self.code, quote_node) or '',
            'conditional': bool(self.conditional)})
        if len(self.rows) > 300: raise InventoryLimit('Python参数声明超过300项')

    def function(self, node):
        previous = self.scope, self.kind
        self.definitions[self.scope, node.name] += 1
        self.scope = self.scope + '/' + node.name + '#' + str(self.definitions[self.scope, node.name])
        self.kind = 'function'
        positional = [*node.args.posonlyargs, *node.args.args]
        defaults = [None] * (len(positional) - len(node.args.defaults)) + list(node.args.defaults)
        for arg, default in zip([*positional, *node.args.kwonlyargs], [*defaults, *node.args.kw_defaults]):
            self.add(arg.arg, arg, default, 'function_default' if default is not None else 'function_argument', arg.annotation, default)
        for arg in (node.args.vararg, node.args.kwarg):
            if arg is not None: self.add(arg.arg, arg, None, 'variadic_argument', arg.annotation)
        for statement in node.body: self.visit(statement)
        self.scope, self.kind = previous

    visit_FunctionDef = function
    visit_AsyncFunctionDef = function

    def visit_ClassDef(self, node):
        previous = self.scope, self.kind
        self.definitions[self.scope, node.name] += 1
        # Keep class and function paths distinct even when their names match.
        self.scope = previous[0] + '/class:' + node.name + '#' + str(self.definitions[previous[0], node.name])
        self.kind = 'class'
        for statement in node.body: self.visit(statement)
        self.scope, self.kind = previous

    def assignment(self, node, targets):
        for target in targets:
            if isinstance(target, ast.Name):
                self.add(target.id, node, node.value, self.kind + '_assignment', getattr(node, 'annotation', None))
        self.generic_visit(node)

    def visit_Assign(self, node): self.assignment(node, node.targets)
    def visit_AnnAssign(self, node): self.assignment(node, [node.target])

    def visit_If(self, node):
        self.conditional += 1
        self.generic_visit(node)
        self.conditional -= 1

    visit_For = visit_If
    visit_AsyncFor = visit_If
    visit_While = visit_If
    visit_Try = visit_If
    visit_With = visit_If
    visit_AsyncWith = visit_If
    visit_Match = visit_If
    visit_TryStar = visit_If


def declarations(code: str) -> tuple[list[dict], list[str], str]:
    try:
        tree = ast.parse(code, feature_version=(3, 11))
        if sum(1 for _ in ast.walk(tree)) > 12000: raise InventoryLimit('Python参数解析超过12000语法节点')
        collector = Collector(code); collector.visit(tree)
        bindings = defaultdict(int)
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store): bindings[node.id] += 1
            elif isinstance(node, ast.arg): bindings[node.arg] += 1
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)): bindings[node.name] += 1
            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                for alias in node.names: bindings[alias.asname or (alias.name.split('.')[0] if isinstance(node, ast.Import) else alias.name)] += 1
        represented = defaultdict(int)
        for row in collector.rows: represented[row['source_name']] += 1
        for row in collector.rows: row['auto_match'] = bindings[row['source_name']] == represented[row['source_name']]
        return collector.rows, ['只识别声明和初始语法；条件、类/函数调用、重写和动态配置不等于实际运行参数。'], 'partial'
    except (SyntaxError, ValueError, RecursionError, MemoryError) as exc:
        return [], ['Python参数作用域无法完整读取，未执行源码或猜造默认值。'], 'limited' if isinstance(exc, InventoryLimit) else 'unparsed'
