"""Causal subtree crossover with conservative, structural unit inference.

OHLC columns share a price dimension on the same dataset; volume is separate.
Numeric parameter units are unknown, not silently dimensionless. Window slots
and literal/parameter-only recipient nodes are never genetic splice points.
"""
import copy
import random
from rest_framework.exceptions import ValidationError
from quant.factors.expression import ROLLING

Signature = tuple[str, tuple[int, ...] | None]


def path_valid(path: object, *, recipient: bool = False) -> bool:
    return (isinstance(path, list) and (not recipient or bool(path)) and len(path) <= 12
            and all(type(index) is int and index in (0, 1) for index in path))


def at(expression: dict, path: list[int] | tuple[int, ...]) -> dict:
    node = expression
    for index in path:
        if index >= len(node.get('args', [])):
            raise ValidationError('公式交叉路径不对应父代节点')
        node = node['args'][index]
    return node


def signatures(spec: dict) -> dict[tuple[int, ...], Signature]:
    """Map eligible paths to (kind, (price exponent, volume exponent)).

    An unknown numeric dimension is omitted; boolean expressions are unitless.
    This proves structural compatibility, not market validity or source units.
    """
    found: dict[tuple[int, ...], Signature] = {}

    def visit(node: dict, path: tuple[int, ...] = ()) -> Signature:
        op = node['op']
        if op == 'input':
            signature = ('number', (0, 1) if spec['bindings'][node['name']] == 'volume' else (1, 0))
        elif op in ('constant', 'parameter'):
            value = node['value'] if op == 'constant' else spec['parameters'][node['name']]
            signature = ('string', ()) if isinstance(value, str) else ('boolean', ()) if type(value) is bool else ('number', (0, 0) if op == 'constant' else None)
        else:
            left = visit(node['args'][0], path + (0,))
            # A lookback is configuration, not a time series eligible for grafting.
            right = visit(node['args'][1], path + (1,)) if len(node['args']) == 2 and op not in ROLLING else None
            if op in ('eq', 'gt', 'lt', 'and', 'or'):
                signature = ('boolean', ())
            elif op == 'ts_rank':
                signature = ('number', (0, 0))
            elif op in ROLLING or op in ('neg', 'abs', 'gate'):
                signature = left
            elif op == 'log':
                signature = ('number', (0, 0) if left == ('number', (0, 0)) else None)
            elif op in ('add', 'sub', 'min', 'max'):
                signature = left if left == right else ('number', None)
            else:
                dimension = None
                if left[1] is not None and right[1] is not None:
                    sign = -1 if op == 'div' else 1
                    dimension = tuple(a + sign * b for a, b in zip(left[1], right[1]))
                signature = ('number', dimension)
        if signature[0] in ('number', 'boolean') and signature[1] is not None and op not in ('constant', 'parameter'):
            found[path] = signature
        return signature

    visit(spec['expression'])
    return found


def selected(left: dict, right: dict, randomizer: random.Random, limit: int = 16) -> list[dict]:
    """Seeded reservoir across all compatible paths, bounded per parent pair."""
    destinations, donors = signatures(left), signatures(right)
    choices, count = [], 0
    for recipient, signature in destinations.items():
        if not recipient or not at(left['expression'], recipient).get('args'):
            continue
        for donor, donor_signature in donors.items():
            if signature != donor_signature:
                continue
            count += 1
            value = {'recipient_path': list(recipient), 'donor_path': list(donor)}
            if len(choices) < limit:
                choices.append(value)
            else:
                index = randomizer.randrange(count)
                if index < limit:
                    choices[index] = value
    return choices


def graft(left: dict, right: dict, recipient: list[int], donor: list[int],
          joined_left: dict, joined_right: dict) -> dict:
    destination = at(left['expression'], recipient)
    a, b = signatures(left).get(tuple(recipient)), signatures(right).get(tuple(donor))
    if not recipient or not destination.get('args') or a is None or a != b:
        raise ValidationError('公式交叉要求内部计算节点与供体具有相同类型和可确定的结构单位；窗口、未知单位不能交叉')
    at(joined_left, recipient[:-1])['args'][recipient[-1]] = copy.deepcopy(at(joined_right, donor))
    return joined_left
