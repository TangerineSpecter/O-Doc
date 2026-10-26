"""Preview-only Python lexical bindings; never a runtime or reuse certificate.

Keep the persisted AST-v1 outline unchanged. This overlay reads the same source
and resolves ordinary lexical names, including assignment-to-assignment edges.
Unsupported scopes keep the original conservative name candidates.
"""
import ast
import builtins
from collections import defaultdict
import symtable

PARSER = 'python-3.11-scoped-preview-v1'
MAX_AST_NODES = 12000
MAX_REFERENCES = 2048
UNSUPPORTED = (ast.ClassDef, ast.Lambda, ast.ListComp, ast.SetComp, ast.DictComp,
               ast.GeneratorExp, ast.NamedExpr, ast.Match, ast.Delete,
               ast.Global, ast.Nonlocal, ast.For, ast.AsyncFor, ast.With, ast.AsyncWith,
               ast.ExceptHandler)
DYNAMIC_BUILTINS = {'eval', 'exec', 'globals', 'locals', 'vars', 'getattr', 'setattr', '__import__'}


class BindingGraph(ast.NodeVisitor):
    def __init__(self, outline, table):
        self.root = next(row['id'] for row in outline['nodes'] if row['kind'] == 'module')
        self.table, self.scope, self.owners = table, self.root, [self.root]
        self.frames = [(table, self.root)]
        self.bindings, self.functions = defaultdict(list), {}
        self.kinds = {row['id']: row['kind'] for row in outline['nodes']}
        for row in outline['nodes']:
            self.bindings[row['parent_id'], row['name']].append(row['id'])
            if row['kind'] in ('function', 'async_function'):
                self.functions[row['parent_id'], row['name'], row['start_line']] = row['id']
        self.references, self.issues, self.seen = [], set(), set()

    def targets(self, name):
        try:
            symbol = self.table.lookup(name)
        except KeyError:
            self.issues.add('存在无法解析的名称或星号导入，未列出关系不能视为无依赖。')
            return []
        if symbol.is_imported():
            self.issues.add('外部导入仅保留声明，未加载文件或求解其运行时依赖。')
            return []
        if symbol.is_global():
            owner = self.root
        elif symbol.is_local():
            if symbol.is_parameter():
                # A parameter shadows a same-named module declaration. A local
                # write to it is still uncertain; do not claim data-flow order.
                if self.bindings[self.scope, name]:
                    self.issues.add('形参在函数内重新赋值，未求解运行时数据流及分支顺序。')
                    return self.bindings[self.scope, name]
                return [self.scope]
            owner = self.scope
        elif symbol.is_free():
            owner = None
            for table, scope in reversed(self.frames[:-1]):
                try:
                    parent = table.lookup(name)
                except KeyError:
                    continue
                if parent.is_local():
                    if parent.is_parameter() and not self.bindings[scope, name]:
                        # A closure captures the enclosing call's parameter.
                        # Its value is not a same-named module constant.
                        return [scope]
                    owner = scope
                    break
            if owner is None:
                self.issues.add('闭包绑定无法定位，依赖保留未知。')
                return []
        else:
            self.issues.add('名称绑定不属于已支持的词法作用域，依赖保留未知。')
            return []
        binding_table = next(table for table, scope in self.frames if scope == owner)
        try:
            imported = binding_table.lookup(name).is_imported()
        except KeyError:
            # Implicit globals used only inside a function need not appear in
            # the module table (including ordinary builtins such as len).
            imported = False
        if imported:
            self.issues.add('外部导入仅保留声明，未加载文件或求解其运行时依赖。')
            return []
        targets = self.bindings[owner, name]
        if not targets:
            if owner == self.root and name in vars(builtins):
                if name in DYNAMIC_BUILTINS:
                    self.issues.add('存在动态命名空间或反射调用，静态绑定不能确定完整依赖。')
            else:
                self.issues.add('名称缺少可定位的声明（含导入、循环及异常绑定），依赖保留未知。')
        if len(targets) > 1:
            self.issues.add('同一词法作用域有多次声明或赋值，保留全部候选，不推断执行顺序。')
        return targets

    def edge(self, name, line, kind, targets):
        for owner in self.owners:
            key = (owner, name, line, kind, tuple(targets))
            if key in self.seen:
                continue
            if len(self.references) >= MAX_REFERENCES:
                self.issues.add('作用域引用超过 2048 项上限，未列出的关系保留未知。')
                return
            self.seen.add(key)
            self.references.append(dict(from_id=owner, name=name, line=line, kind=kind,
                                        candidate_ids=targets))

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            self.edge(node.id, node.lineno, 'read', self.targets(node.id))

    def visit_Call(self, node):
        if isinstance(node.func, ast.Name):
            targets = self.targets(node.func.id)
            symbol = self.table.lookup(node.func.id)
            if symbol.is_parameter() or any(self.kinds[target] not in ('function', 'async_function') for target in targets):
                self.issues.add('名称调用通过形参或变量间接取得目标，词法绑定不证明实际被调用函数。')
            self.edge(node.func.id, node.lineno, 'call', targets)
        else:
            # Reading obj is useful, but obj.method() is not a statically
            # resolved call to any same-named method elsewhere in the file.
            self.edge('<动态调用>', node.lineno, 'call', [])
            self.issues.add('属性或间接调用的目标未求解，保留对象读取但不猜测方法目标。')
        self.generic_visit(node)

    def definition(self, node):
        first = min([node.lineno, *[item.lineno for item in node.decorator_list]])
        owner = self.functions[self.scope, node.name, first]
        # Defaults/decorators/annotations belong to the enclosing scope and
        # also determine the resulting function declaration.
        previous = self.owners
        self.owners = list(dict.fromkeys([*previous, owner]))
        for field, value in ast.iter_fields(node):
            if field == 'body':
                continue
            if isinstance(value, ast.AST):
                self.visit(value)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, ast.AST):
                        self.visit(item)
        children = [table for table in self.table.get_children()
                    if table.get_type() == 'function' and table.get_name() == node.name
                    and table.get_lineno() == node.lineno]
        if len(children) != 1:
            raise ValueError('function scope does not uniquely match source')
        previous_table, previous_scope = self.table, self.scope
        self.table, self.scope, self.owners = children[0], owner, [owner]
        self.frames.append((self.table, owner))
        for statement in node.body:
            self.visit(statement)
        self.frames.pop()
        self.table, self.scope, self.owners = previous_table, previous_scope, previous

    visit_FunctionDef = definition
    visit_AsyncFunctionDef = definition

    def assignment(self, node, targets):
        # Destructuring and attribute writes are intentionally not modeled as
        # simple definitions; keep reads, but expose the missing write graph.
        if any(not isinstance(target, ast.Name) for target in targets):
            self.issues.add('存在解包、属性或下标写入，尚未求解别名及可变对象的写依赖。')
            self.generic_visit(node)
            return
        ids = [item for target in targets for item in self.bindings[self.scope, target.id]]
        if not ids:
            self.issues.add('赋值缺少结构节点，依赖图不完整。')
            self.generic_visit(node)
            return
        previous = self.owners
        for target in targets:
            self.edge(target.id, node.lineno, 'read', self.bindings[self.scope, target.id])
        self.owners = ids
        self.generic_visit(node)
        self.owners = previous

    def visit_Assign(self, node): self.assignment(node, node.targets)
    def visit_AnnAssign(self, node): self.assignment(node, [node.target])
    def visit_AugAssign(self, node):
        # AST-v1 does not create an augmented-assignment declaration node.
        self.issues.add('存在增量赋值，未推断状态更新的执行顺序。')
        self.generic_visit(node)


def scoped_preview(payload, outline):
    """Return an independent overlay or conservative original candidates."""
    if payload.get('language') != 'python' or outline['status'] != 'parsed':
        return outline
    try:
        if payload.get('bundle_version') or payload.get('files'):
            raise ValueError('文件包没有解析实际导入，不能把拼接正文当作一个模块作用域。')
        tree = ast.parse(payload.get('code', ''), feature_version=(3, 11))
        count = 0
        for node in ast.walk(tree):
            count += 1
            if count > MAX_AST_NODES:
                raise ValueError('作用域预览超过 12000 语法节点上限，未完成绑定解析。')
            if isinstance(node, UNSUPPORTED):
                raise ValueError('包含类、隐式作用域、模式匹配或全局/非局部写声明，尚未完成绑定解析。')
        graph = BindingGraph(outline, symtable.symtable(payload['code'], '<quant-preview>', 'exec'))
        graph.visit(tree)
    except (SyntaxError, ValueError, KeyError, RecursionError, MemoryError):
        message = 'Python 作用域解析未完成或超出支持范围；沿用同名候选，依赖保留未知。'
        return {**outline, 'binding_uncertainties': [message], 'diagnostics': [*outline['diagnostics'], {
            'message': message, 'line': None}]}
    diagnostics = [row for row in outline['diagnostics']
                   if not row['message'].startswith('语法树解析不等于')]
    diagnostics.extend({'message': message, 'line': None} for message in sorted(graph.issues))
    return {**outline, 'parser': PARSER, 'references': graph.references,
            'diagnostics': diagnostics, 'binding_uncertainties': sorted(graph.issues),
            'reference_semantics': 'lexical_bindings_and_assignment_reads_not_runtime_dataflow'}
