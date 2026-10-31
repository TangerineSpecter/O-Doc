"""Factor metadata for scoring/planning; full implementations stay in the library."""
import copy


def compact(context):
    value = copy.deepcopy(context)
    def factor(row):
        # The full original source remains available to review. Planning needs
        # parameter values/domains and output units, not N repeated state machines.
        result = {k:v for k,v in row.items() if k not in ('expression', 'formula')}
        result['parameters'] = [{k:v for k,v in p.items() if k not in ('source_binding','evidence')} for p in row['parameters']]
        expression = row.get('expression') or {}
        result['implementation'] = {'format':expression.get('op'), 'output':expression.get('output', 'compute' if expression.get('op') == 'python' else row['name'])}
        result['experiment_execution'] = {
            'runtime': 'python' if expression.get('op') == 'python' else 'local_expression',
            'local_engine_supported': bool(expression) and expression.get('op') != 'python',
            'required_inputs': [item['name'] if isinstance(item, dict) else item for item in row.get('inputs', [])],
        }
        return result
    extracted = value.get('previous', {}).get('extract')
    if extracted:
        extracted['factors'] = [factor(row) for row in extracted['factors']]
    if 'factors_for_initial_plan' in value:
        value['factors_for_initial_plan'] = [factor(row) for row in value['factors_for_initial_plan']]
    if 'ai_definition_revisions' in value:
        for item in value['ai_definition_revisions'].get('items', []):
            if item.get('definition'): item['definition'] = factor(item['definition'])
    return value
