"""Bounded source-derived output inventory, without executing uploaded code."""
import copy
from functools import lru_cache
from rest_framework.exceptions import ValidationError
from .pine import parse_source, compile_parsed


@lru_cache(maxsize=8)
def _pine_outputs(code: str, legacy: bool) -> list[dict]:
    try:
        steps, parameters, errors = parse_source(code, legacy=legacy)
    except (ValueError, SyntaxError, TypeError):
        return []  # A non-supported construct can still be converted explicitly.
    names = {}

    def collect(rows):
        for row in rows:
            if row['kind'] == 'if':
                collect(row['then']); collect(row['else'])
            elif row.get('_line', 0) > 0:
                names.setdefault(row['name'], row.get('_type'))

    collect(steps)
    result = []
    for name, declared_type in list(names.items())[:256]:
        kinds = ['boolean_series'] if declared_type == 'bool' else ['numeric_series'] if declared_type else ['numeric_series', 'boolean_series']
        for kind in kinds:
            try:
                program, inputs, required = compile_parsed(steps, parameters, errors, name, kind)
                if not inputs:
                    continue  # Constants and display settings are not factors.
            except (ValueError, SyntaxError, TypeError, ValidationError):
                continue
            result.append({'name': name, 'output_type': kind, 'inputs': inputs,
                'parameters': list(required), 'steps': len(program['steps'])})
            break
    return result


def source_outputs(payload: dict, *, legacy=False) -> list[dict]:
    if payload.get('language') != 'pine' or not payload.get('code'):
        return []
    return copy.deepcopy(_pine_outputs(payload['code'], legacy))
