"""Python 3.11 AST coordinates, scope ownership and syntactic references."""
import ast
from .common import Outline


def dotted(node) -> str:
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if not isinstance(node, ast.Name):
        return '<动态调用>'
    return '.'.join([node.id, *reversed(parts)])


class Visitor(ast.NodeVisitor):
    def __init__(self, outline: Outline, root: str):
        self.outline, self.scope = outline, root

    def definition(self, node, kind):
        # Decorators/defaults/bases execute in the surrounding scope; the body
        # has its own syntactic owner. This still does not claim runtime order.
        for key, value in ast.iter_fields(node):
            if key == 'body':
                continue
            if isinstance(value, ast.AST): self.visit(value)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, ast.AST): self.visit(item)
        first = min([node.lineno, *[item.lineno for item in node.decorator_list]])
        parent = self.scope
        self.scope = self.outline.node(node.name, kind, self.outline.offsets[first - 1],
            self.outline.offsets[node.end_lineno], parent, 'python_ast')
        for statement in node.body:
            self.visit(statement)
        self.scope = parent

    def visit_FunctionDef(self, node): self.definition(node, 'function')
    def visit_AsyncFunctionDef(self, node): self.definition(node, 'async_function')
    def visit_ClassDef(self, node): self.definition(node, 'class')

    def visit_Call(self, node):
        self.outline.reference(self.scope, dotted(node.func), node.lineno, 'call')
        self.generic_visit(node)

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            self.outline.reference(self.scope, node.id, node.lineno, 'read')

    def assignment(self, node, targets):
        # Bindings remain name candidates, including locals and reassignments.
        # No constant folding or inference about actual runtime configuration.
        for target in targets:
            for item in ast.walk(target):
                if isinstance(item, ast.Name) and isinstance(item.ctx, ast.Store):
                    self.outline.node(item.id, 'variable', self.outline.offsets[node.lineno - 1],
                        self.outline.offsets[node.end_lineno], self.scope, 'python_ast')
        self.generic_visit(node)

    def visit_Assign(self, node): self.assignment(node, node.targets)
    def visit_AnnAssign(self, node): self.assignment(node, [node.target])

    def visit_Import(self, node):
        for item in node.names:
            self.outline.imported(item.name, item.asname or '', node.lineno)

    def visit_ImportFrom(self, node):
        for item in node.names:
            self.outline.imported('.' * node.level + (node.module + '.' if node.module else '') + item.name,
                item.asname or '', node.lineno)


def parse(outline: Outline) -> tuple[str, str]:
    parser = 'python-3.11-ast-v1'
    try:
        tree = ast.parse(outline.code, feature_version=(3, 11))
        if sum(1 for _ in ast.walk(tree)) > 30000:
            outline.warn('Python 语法树超过 30000 节点；保留原文片段，未建立结构图。')
            return 'limited', parser
        root = outline.node('<module>', 'module', 0, len(outline.code), '', 'python_ast')
        Visitor(outline, root).visit(tree)
    except (SyntaxError, ValueError, RecursionError, MemoryError) as exc:
        outline.nodes.clear(); outline.references.clear(); outline.imports.clear()
        outline.warn('Python 3.11 结构解析未完成；可能是语法错误、其他版本语法或解析资源限制。',
            getattr(exc, 'lineno', None))
        return 'unparsed', parser
    outline.warn('语法树解析不等于编译或运行通过；同名引用只是候选关系，动态调用、变量遮蔽及外部依赖尚未解析。')
    return 'parsed', parser
