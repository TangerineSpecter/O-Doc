"""Consistent external-symbol renaming for parameter variants and combinations."""
import ast
import copy


def rename_program(program, mapping):
    class Rename(ast.NodeTransformer):
        def visit_Name(self, node):
            return ast.copy_location(ast.Name(id=mapping.get(node.id, node.id), ctx=node.ctx), node)
        def visit_Call(self, node):
            node = self.generic_visit(node)
            if isinstance(node.func, ast.Name) and node.func.id == 'history' and isinstance(node.args[0], ast.Constant):
                node.args[0].value = mapping.get(node.args[0].value, node.args[0].value)
            return node
    def text(value): return ast.unparse(ast.fix_missing_locations(Rename().visit(ast.parse(value, mode='eval'))).body)
    result = copy.deepcopy(program)
    def walk(rows):
        for row in rows:
            if row['kind'] == 'if': row['test'] = text(row['test']); walk(row['then']); walk(row['else'])
            else: row['value'] = text(row['value'])
    walk(result['steps']); result['output'] = text(result['output'])
    return result
