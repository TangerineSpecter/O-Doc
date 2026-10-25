"""Bounded categorical inputs and reversible lowering for numeric-only formulas."""
import copy
import json


def literal(value):
    # Source text is always a quoted literal, never an identifier or comment.
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


def text_node(node, parameters):
    return (node['op'] == 'constant' and isinstance(node['value'], str)
            or node['op'] == 'parameter' and isinstance(parameters[node['name']], str))


def choices(candidate, spec):
    rows = {row['name']: row for row in candidate['parameters']}
    return {name: list(rows[original]['domain']['choices'])
            for name, original in spec['parameter_names'].items()
            if isinstance(spec['parameters'][name], str)}


def numeric_categories(spec):
    """One global bijection preserves equality across parameters and constants."""
    result = copy.deepcopy(spec)
    vocabulary = set()
    for values in spec.get('string_choices', {}).values():
        vocabulary.update(values)

    def collect(node):
        if node['op'] == 'constant' and isinstance(node['value'], str):
            vocabulary.add(node['value'])
        for child in node.get('args', []):
            collect(child)
    collect(spec['expression'])
    codes = {value: index + 1 for index, value in enumerate(sorted(vocabulary))}

    def replace(node):
        if node['op'] == 'constant' and isinstance(node['value'], str):
            node['value'] = codes[node['value']]
        for child in node.get('args', []):
            replace(child)
    replace(result['expression'])
    result['category_choices'] = {name: [codes[value] for value in values]
                                  for name, values in spec.get('string_choices', {}).items()}
    for name in result['category_choices']:
        result['parameters'][name] = codes[spec['parameters'][name]]
    mapping = {'encoding': 'exact_case_sensitive_global_integer_codes',
               'values': [{'code': code, 'value': value} for value, code in codes.items()],
               'parameters': {name: {'source_name': spec['parameter_names'][name],
                   'default_code': result['parameters'][name], 'allowed_codes': values}
                   for name, values in result['category_choices'].items()}}
    return result, mapping
