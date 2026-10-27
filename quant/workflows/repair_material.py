"""Provide complete known dependency bodies, or retain the complete source.

This is a view for AI definition repair only. Global source review never uses
this reduced view. Any ambiguity conservatively retains the existing context.
"""
import copy
from bisect import bisect_right
from quant.source_structure.common import source_lines


def scope(payload, outputs, plan):
    from quant.repairs.contracts import plan as targets
    selected = targets(outputs['extract']['factors'])['selected']
    if not selected or not plan or plan.get('version') != 4:
        return None
    code = payload.get('code', '')
    lines = source_lines(code)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))
    chosen = {}
    for index in selected:
        if outputs['extract']['factors'][index]['dependencies'] or payload.get('dependencies'):
            return None
        quotes = [row['quote'] for row in outputs['extract']['factors'][index]['evidence'] if row['field'] == 'code']
        if not quotes:
            return None
        for quote in quotes:
            first = code.find(quote)
            if first < 0 or code.find(quote, first + 1) >= 0:
                return None
            left, right = bisect_right(offsets, first), bisect_right(offsets, first + len(quote) - 1)
            matches = [unit for unit in plan['units'] if any(location['start_line'] <= left <= right <= location['end_line']
                for location in unit['locations'])]
            if not matches:
                return None
            smallest = min(location['end_line'] - location['start_line'] for unit in matches for location in unit['locations'])
            matches = [unit for unit in matches if any(location['end_line'] - location['start_line'] == smallest for location in unit['locations'])]
            for unit in matches:
                component = unit['component']
                if component['mode'] != 'static_declared_dependencies':
                    return None
                for part in component['parts']:
                    chosen[part['name'], part['start_line'], part['end_line']] = part
    return {'selected': selected, 'parts': sorted(chosen.values(), key=lambda row: (row['start_line'], row['end_line'], row['name']))}


def context(payload, outputs, plan, original):
    value = copy.deepcopy(original)
    current = scope(payload, outputs, plan)
    if current is not None:
        lines = source_lines(payload['code'])
        visible = sorted({line for part in current['parts'] for line in range(part['start_line'], part['end_line'] + 1)})
        value['source']['code'] = '\n'.join(f'{line}: {lines[line - 1].rstrip(chr(13) + chr(10))}' for line in visible)
        # Graph, comments and other components cannot silently reintroduce an
        # unrelated function into this repair input. Description/web text and
        # declared execution context remain available in full.
        value.pop('source_structure', None)
        value.pop('local_reading_and_source_changes', None)
        value['previous'] = {'extract': {**{key: copy.deepcopy(outputs['extract'][key])
            for key in ('extraction_version', 'extraction_note')}, 'selected_factors': [{'factor_index': index,
            'factor': copy.deepcopy(outputs['extract']['factors'][index])} for index in current['selected']]}}
        value['repair_material_scope'] = {'mode': 'provided_declaration_closure',
            'parts': [{key: part[key] for key in ('name', 'start_line', 'end_line')} for part in current['parts']],
            'notice': '只提供本次选中候选的明确声明依赖；其他模块由全局阶段重新审查。未提供的正文不得补造或引用。'}
    else:
        value['repair_material_scope'] = {'mode': 'complete_source',
            'notice': '依赖、引用或覆盖不完整；保留完整源码，任意相关输入变化均重新分析。'}
    # Only a system-owned provenance hash is omitted, never defaults, ranges,
    # IDs, quotes, dependencies, uncertainty or proposed settings. The server
    # attaches the current source identity again after output validation.
    factors = value['previous'].get('extract', {})
    rows = [row['factor'] for row in factors.get('selected_factors', [])] or factors.get('factors', [])
    for factor in rows:
        for parameter in factor['parameters']:
            if isinstance(parameter.get('source_binding'), dict):
                parameter['source_binding'].pop('source_hash', None)
    return value


def validate_evidence(value, payload, outputs, plan):
    current = scope(payload, outputs, plan)
    if current is None:
        return
    from rest_framework.exceptions import ValidationError
    lines = source_lines(payload['code'])
    ranges = []
    for part in current['parts']:
        if ranges and part['start_line'] <= ranges[-1][1] + 1:
            ranges[-1][1] = max(ranges[-1][1], part['end_line'])
        else:
            ranges.append([part['start_line'], part['end_line']])
    bodies = [''.join(lines[start - 1:end]) for start, end in ranges]
    for item in value['items']:
        for evidence in item['evidence']:
            if evidence['field'] == 'code' and not any(evidence['quote'] in body for body in bodies):
                raise ValidationError('修订引文不在本次提供的候选依赖正文内，不能借用未提供源码')
