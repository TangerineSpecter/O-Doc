"""Filter clearly identified report annotations and MT4 order identifiers."""
import re


def is_report_annotation(item):
    name = item.get('name', '').strip()
    value = item.get('value', '').strip()
    compact = re.sub(r'[\s_\-]+', '', name).casefold()
    if re.fullmatch(r'(?:comm|comment|comments|note|notes|注释|备注)\d*', compact):
        return True
    if re.fullmatch(r'(?:(?:inp|expert|ea)?magic(?:number|num|no|id)?|魔法号|魔术号)\d*', compact):
        return True
    # A settings-named text ending in a colon is a section heading, not a
    # numeric/boolean setting. Preserve arbitrary string-valued parameters.
    quoted = len(value) >= 2 and value[0] in ('"', "'") and value[-1] == value[0]
    text = value[1:-1].strip() if quoted else value
    return bool(re.search(r'(?:settings|setting|heading|header|separator|section)$', compact)
                and quoted and text.endswith((':', '：')))


def filter_report_parameters(parameters):
    return [item for item in parameters if not is_report_annotation(item)]


def project_report_parameters(report):
    result = dict(report)
    if isinstance(result.get('parameters'), list):
        result['parameters'] = filter_report_parameters(result['parameters'])
    if isinstance(result.get('fields'), dict):
        result['fields'] = {key: value for key, value in result['fields'].items() if key != 'parameters'}
    return result


def preserve_hidden_parameters(original, submitted):
    """Merge filtered-out source rows back into an edited report snapshot."""
    result = dict(submitted)
    old_parameters = original.get('parameters')
    if isinstance(old_parameters, list):
        if 'parameters' not in result:
            result['parameters'] = old_parameters
        else:
            visible = iter(result['parameters'])
            merged = []
            for item in old_parameters:
                if is_report_annotation(item):
                    merged.append(item)
                else:
                    replacement = next(visible, None)
                    if replacement is not None:
                        merged.append(replacement)
            merged.extend(visible)
            result['parameters'] = merged
    old_fields = original.get('fields')
    if isinstance(old_fields, dict) and 'parameters' in old_fields:
        result['fields'] = {**result.get('fields', {}), 'parameters': old_fields['parameters']}
    return result
