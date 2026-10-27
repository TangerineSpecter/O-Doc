"""Exact actual model-input reuse, followed by current-source validation."""
import copy
import json
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest

STAGES = {'identify', 'parameters', 'research', 'extract', 'repair', 'review', 'plan'}


def request(stage, payload, requirements, outputs, version, plan, vocabulary):
    if version != 28 or stage not in STAGES:
        return None, None, None
    from .prompts import prompt
    try:
        text = prompt(stage, payload, requirements, outputs, version, plan, vocabulary)
    except ValidationError as exc:
        # Persist the failed stage before reporting a deterministic context
        # error; restore can reproduce this without making a model request.
        return {'version': 1, 'status': 'blocked', 'reason': 'model_context_rejected'}, None, exc
    contract = {'version': 1, 'status': 'ready', 'prompt_hash': digest(text),
        'max_tokens': 32000, 'json_output': True}
    if stage == 'repair':
        contract['material_scope'] = json.loads(text.split('\n材料：', 1)[1])['repair_material_scope']
    return contract, text, None


def compatible(old, current):
    return (old.get('version') == current.get('version') == 28 and old.get('stage') == current.get('stage') in STAGES
        and old.get('model') == current.get('model')
        and current.get('model_input', {}).get('status') == 'ready'
        and old.get('model_input') == current['model_input'])


def revalidate(stage, output, outputs, payload, version, plan, vocabulary):
    from .contracts import validate_output
    value = copy.deepcopy(output)
    if stage == 'repair':
        for item in value['items']:
            if isinstance(item.get('definition'), dict):
                for parameter in item['definition']['parameters']:
                    parameter.pop('source_binding', None)
    result = validate_output(stage, value, outputs, payload, version, plan)
    from quant.taxonomy.prompts import validate_tags
    validate_tags(stage, result, vocabulary)
    return result
