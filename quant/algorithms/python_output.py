"""Catch an unambiguous generated-output mismatch without executing user code."""
import ast
from rest_framework.exceptions import ValidationError


def validate_generated_outputs(value: dict) -> None:
    if not isinstance(value.get('factors'), list):
        return
    for index, factor in enumerate(value.get('factors', [])):
        if not isinstance(factor, dict) or factor.get('output_type') not in ('numeric_series', 'boolean_series'):
            continue
        expression = factor.get('expression') or {}
        if not isinstance(expression, dict) or expression.get('op') != 'python':
            continue
        code = expression.get('code')
        if not isinstance(code, str):
            continue  # The definition owner reports malformed or missing code.
        try:
            tree = ast.parse(code)
        except (SyntaxError, ValueError, RecursionError):
            continue
        compute = next((node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'compute'), None)
        if compute is None:
            continue
        nodes, pending = [], list(compute.body)
        while pending:
            node = pending.pop()
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
                continue
            nodes.append(node)
            pending.extend(ast.iter_child_nodes(node))
        structured = {node.func.value.id for node in nodes
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
            and node.func.attr == 'append' and isinstance(node.func.value, ast.Name)
            and node.args and isinstance(node.args[0], (ast.Dict, ast.DictComp))}
        if any(isinstance(node, ast.Return) and isinstance(node.value, ast.Name)
               and node.value.id in structured for node in nodes):
            raise ValidationError({'factors': {index: {'expression':
                'compute 声明为数值/布尔序列，却返回逐根字典。请保留内部完整计算，选择与因子名称对应的一个输出字段返回；其他输出可提取为独立算法。'}}})
