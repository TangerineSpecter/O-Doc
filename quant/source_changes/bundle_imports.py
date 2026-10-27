"""Literal provided-file import candidates, never Python's import machinery."""
import ast
from collections import defaultdict
from .python_bindings import BindingGraph


class BundleLimit(ValueError):
    pass


def import_index(state):
    """Imports bind in lexical scopes, including declarations below readers."""
    scopes = [row for row in state['outline']['nodes'] if row['kind'] in ('function', 'async_function')]
    root = state['root']
    result = defaultdict(list)
    for node in ast.walk(state['tree']):
        if not isinstance(node, (ast.Import, ast.ImportFrom)):
            continue
        enclosing = [row for row in scopes if row['start_line'] <= node.lineno <= row['end_line']]
        owner = min(enclosing, key=lambda row: row['end_line'] - row['start_line'])['id'] if enclosing else root
        for item in node.names:
            name = item.asname or (item.name.split('.')[0] if isinstance(node, ast.Import) else item.name)
            result[owner, name].append({'kind': 'module' if isinstance(node, ast.Import) else 'symbol',
                'module': item.name if isinstance(node, ast.Import) else node.module or '',
                'level': 0 if isinstance(node, ast.Import) else node.level,
                'symbol': '' if isinstance(node, ast.Import) else item.name,
                'prefix': item.name.split('.')[1:] if isinstance(node, ast.Import) and not item.asname else []})
    return dict(result)


class ImportResolver:
    def __init__(self, states, maximum=4096):
        self.states = states
        self.modules, self.edges = defaultdict(list), defaultdict(set)
        self.issues, self.operations, self.maximum = set(), 0, maximum
        self.kinds = {state['ids'][row['id']]: row['kind'] for state in states
                      for row in state['outline']['nodes']}
        for state in states:
            self.modules[state['module']].append(state)

    def tick(self):
        self.operations += 1
        if self.operations > self.maximum:
            raise BundleLimit('跨文件名称解析超过工作量上限，未建立完整依赖图。')

    def provided(self, origin, module):
        self.tick()
        values = self.modules.get(module, [])
        if not values:
            self.issues.add('部分导入没有在补交文件中找到精确模块路径；未读取本机文件或安装包。')
        if len(values) > 1:
            self.issues.add('模块文件与包入口同名或模块身份有歧义，保留全部候选。')
        for value in values:
            self.edges[origin['name']].add(value['name'])
        return values

    def absolute(self, state, row):
        if not row['level']:
            return row['module']
        package = state['module'].split('.') if state['name'].endswith('/__init__.py') else state['module'].split('.')[:-1]
        if row['level'] > len(package):
            self.issues.add('相对导入超出已提供的包路径；主文件的实际安装包身份未知。')
            return None
        base = package[:len(package) - row['level'] + 1]
        return '.'.join([*base, *([row['module']] if row['module'] else [])])

    def binding(self, state, owner, name, trail=()):
        self.tick()
        key = (state['name'], owner, name)
        if key in trail or len(trail) >= 16:
            self.issues.add('导入或再导出形成循环/超过解析深度；初始化顺序与实际绑定未知。')
            return [], None
        rows = state['imports'].get((owner, name), [])
        ids = list(state['bindings'].get((owner, name), []))
        if len(rows) > 1 or ids:
            self.issues.add('导入别名被重复声明或赋值，保留候选，不猜测运行时覆盖顺序。')
        namespaces = []
        for row in rows:
            module = self.absolute(state, row)
            if module is None or row['symbol'] == '*':
                self.issues.add('星号或无法定位的导入保留未知，不根据同名符号扩展。')
                continue
            if row['kind'] == 'module':
                targets = self.provided(state, module)
                ids.extend(item['ids'][item['root']] for item in targets)
                if targets and not row['prefix']:
                    namespaces.append(module)
            else:
                found, namespace = self.export(state, module, row['symbol'], (*trail, key))
                ids.extend(found)
                if namespace: namespaces.append(namespace)
        namespaces = set(namespaces)
        namespace = next(iter(namespaces)) if len(namespaces) == 1 and len(rows) == 1 and not state['bindings'].get((owner, name)) else None
        return sorted(set(ids)), namespace

    def export(self, origin, module, symbol, trail):
        self.tick()
        ids, namespaces = [], []
        for state in self.provided(origin, module):
            direct = state['bindings'].get((state['root'], symbol), [])
            imported = state['imports'].get((state['root'], symbol))
            ids.extend(direct)
            if imported:
                found, namespace = self.binding(state, state['root'], symbol, trail)
                ids.extend(found)
                if namespace: namespaces.append(namespace)
            elif not direct:
                child = module + '.' + symbol
                candidates = self.modules.get(child, [])
                if candidates:
                    # Python may load this child during from-import. This is
                    # only a candidate: package hooks can change that behavior.
                    self.issues.add('from导入匹配到子模块文件，仅建立候选；包初始化及属性钩子未验证。')
                    self.edges[state['name']].update(item['name'] for item in candidates)
                    ids.extend(item['ids'][item['root']] for item in candidates)
                    namespaces.append(child)
                else:
                    self.issues.add('已提供模块中没有定位到所导出名称；动态导出和缺失文件未知。')
        spaces = set(namespaces)
        return sorted(set(ids)), next(iter(spaces)) if len(spaces) == 1 and len(ids) == 1 else None

    def attribute(self, state, owner, name, parts):
        rows = state['imports'].get((owner, name), [])
        if not rows or state['bindings'].get((owner, name)):
            return None
        if len(rows) != 1:
            self.issues.add('属性根名称有多个导入候选，无法唯一定位。')
            return None
        row = rows[0]
        if row['kind'] == 'module':
            prefix = row['prefix']
            if parts[:len(prefix)] != prefix:
                self.issues.add('模块属性与显式导入路径不一致，未推断动态包属性。')
                return None
            parts = parts[len(prefix):]
            namespace = self.absolute(state, row)
        else:
            _, namespace = self.binding(state, owner, name)
        if not namespace or not parts or len(parts) > 4:
            return None
        for index, part in enumerate(parts):
            ids, next_namespace = self.export(state, namespace, part, ())
            if index == len(parts) - 1:
                return ids
            if not next_namespace:
                self.issues.add('多层属性不是已定位的模块再导出，实际对象依赖未知。')
                return None
            namespace = next_namespace
        return None

    def check_cycles(self):
        def visit(name, active, done):
            if name in active:
                self.issues.add('提供的模块间存在导入环；只建立静态关系，未验证初始化顺序。')
                return
            if name in done: return
            active.add(name)
            for target in sorted(self.edges[name]): visit(target, active, done)
            active.remove(name); done.add(name)
        done = set()
        for state in self.states: visit(state['name'], set(), done)


class FileBindingGraph(BindingGraph):
    def __init__(self, state, table, resolver):
        super().__init__(state['outline'], table)
        self.state, self.resolver = state, resolver
        self.kinds.update(resolver.kinds)

    def binding_owner(self, name):
        try: symbol = self.table.lookup(name)
        except KeyError: return None
        if symbol.is_global(): return self.root
        if symbol.is_local(): return None if symbol.is_parameter() else self.scope
        if symbol.is_free():
            for table, scope in reversed(self.frames[:-1]):
                try: parent = table.lookup(name)
                except KeyError: continue
                if parent.is_local(): return None if parent.is_parameter() else scope
        return None

    def parameter_scope(self, name):
        try: symbol = self.table.lookup(name)
        except KeyError: return None
        if symbol.is_parameter() and not self.bindings[self.scope, name]: return self.scope
        if symbol.is_free():
            for table, scope in reversed(self.frames[:-1]):
                try: parent = table.lookup(name)
                except KeyError: continue
                if parent.is_local():
                    return scope if parent.is_parameter() and not self.bindings[scope, name] else None
        return None

    def targets(self, name):
        if self.parameter_scope(name) is not None:
            return []
        owner = self.binding_owner(name)
        if (owner, name) in self.state['imports']:
            return self.resolver.binding(self.state, owner, name)[0]
        return super().targets(name)

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            scope = self.parameter_scope(node.id)
            if scope is not None:
                # A captured/default parameter depends on its enclosing call,
                # but is not a value bound to the enclosing function object.
                previous = self.owners
                self.owners = [owner for owner in previous if owner != scope]
                self.edge('<形参所属函数>:' + node.id, node.lineno, 'read', [scope])
                self.owners = previous
        super().visit_Name(node)

    def attribute(self, node):
        parts = []
        while isinstance(node, ast.Attribute):
            parts.append(node.attr); node = node.value
        if not isinstance(node, ast.Name): return None, ''
        parts.reverse()
        owner = self.binding_owner(node.id)
        return self.resolver.attribute(self.state, owner, node.id, parts), '.'.join([node.id, *parts])

    def visit_Call(self, node):
        if isinstance(node.func, ast.Attribute):
            ids, name = self.attribute(node.func)
            if ids is not None:
                self.edge(name, node.lineno, 'call', ids)
                self.generic_visit(node)
                return
        super().visit_Call(node)

    def visit_Attribute(self, node):
        ids, name = self.attribute(node)
        if ids is not None:
            self.edge(name, node.lineno, 'read', ids)
        self.generic_visit(node)
