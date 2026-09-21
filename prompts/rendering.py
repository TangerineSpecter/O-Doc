"""提示词字段 Schema 校验与确定性渲染。"""
import re
from typing import Any

from rest_framework.exceptions import ValidationError


TOKEN_RE = re.compile(r'\{\{field:([^}]+)\}\}')
FIELD_TYPES = {'text', 'textarea', 'select', 'multiselect', 'number', 'boolean'}


def validate_schema(schema: Any) -> list[dict[str, Any]]:
    if not isinstance(schema, list):
        raise ValidationError({'fieldSchema': '字段定义必须是数组'})
    keys: set[str] = set()
    clean: list[dict[str, Any]] = []
    for index, raw in enumerate(schema):
        if not isinstance(raw, dict):
            raise ValidationError({'fieldSchema': f'第 {index + 1} 个字段无效'})
        key = str(raw.get('key') or '').strip()
        label = str(raw.get('label') or '').strip()
        field_type = raw.get('type')
        if not key or not re.fullmatch(r'[\w\-\u4e00-\u9fff]{1,50}', key):
            raise ValidationError({'fieldSchema': f'字段 {index + 1} 的标识只能使用中英文、数字、下划线或短横线'})
        if key in keys:
            raise ValidationError({'fieldSchema': f'字段标识“{key}”重复'})
        if not label or len(label) > 50 or field_type not in FIELD_TYPES:
            raise ValidationError({'fieldSchema': f'字段 {index + 1} 的名称或类型无效'})
        field = {
            'key': key, 'label': label, 'type': field_type,
            'required': bool(raw.get('required', False)),
            'defaultValue': raw.get('defaultValue', False if field_type == 'boolean' else ''),
            'placeholder': str(raw.get('placeholder') or '')[:160],
        }
        if field_type in {'select', 'multiselect'}:
            options = raw.get('options') or []
            if not isinstance(options, list) or not options:
                raise ValidationError({'fieldSchema': f'字段“{label}”至少需要一个选项'})
            parsed = []
            values = set()
            for option in options:
                if not isinstance(option, dict):
                    raise ValidationError({'fieldSchema': f'字段“{label}”的选项无效'})
                value = str(option.get('value') or '')
                option_label = str(option.get('label') or value)
                if not value or value in values:
                    raise ValidationError({'fieldSchema': f'字段“{label}”的选项值重复或为空'})
                values.add(value)
                parsed.append({'label': option_label[:80], 'value': value[:160]})
            field['options'] = parsed
            field['separator'] = str(raw.get('separator') or '、')[:10]
            option_values = {item['value'] for item in parsed}
            default_value = field['defaultValue']
            if field_type == 'select' and default_value not in ('', None) and str(default_value) not in option_values:
                raise ValidationError({'fieldSchema': f'字段“{label}”的默认值不在选项中'})
            if field_type == 'multiselect' and default_value not in ('', None, []):
                defaults = default_value if isinstance(default_value, list) else [default_value]
                if any(str(value) not in option_values for value in defaults):
                    raise ValidationError({'fieldSchema': f'字段“{label}”的默认值不在选项中'})
        if field_type == 'boolean':
            field['trueValue'] = str(raw.get('trueValue') or '是')[:160]
            field['falseValue'] = str(raw.get('falseValue') or '')[:160]
            if not isinstance(field['defaultValue'], bool):
                raise ValidationError({'fieldSchema': f'字段“{label}”的默认值必须为布尔值'})
        keys.add(key)
        clean.append(field)
    return clean


def validate_template_tokens(template: str, schema: list[dict[str, Any]]) -> None:
    known = {field['key'] for field in schema}
    unknown = sorted({match.group(1).strip() for match in TOKEN_RE.finditer(template or '') if match.group(1).strip() not in known})
    if unknown:
        raise ValidationError({'positiveTemplate': f'存在未定义字段：{", ".join(unknown)}'})


def normalize_values(schema: list[dict[str, Any]], values: Any) -> dict[str, str]:
    source = values if isinstance(values, dict) else {}
    normalized: dict[str, str] = {}
    missing = []
    for field in schema:
        key = field['key']
        raw = source[key] if key in source else field.get('defaultValue', '')
        field_type = field['type']
        if field_type == 'multiselect':
            selected = raw if isinstance(raw, list) else ([] if raw in (None, '') else [raw])
            allowed = {item['value'] for item in field.get('options', [])}
            selected_values = [str(item) for item in selected if str(item) in allowed]
            value = field.get('separator', '、').join(selected_values)
            stored = selected_values
        elif field_type == 'select':
            value = str(raw or '')
            if value and value not in {item['value'] for item in field.get('options', [])}:
                raise ValidationError({'inputValues': f'字段“{field["label"]}”的选项无效'})
            stored = value
        elif field_type == 'boolean':
            enabled = raw is True or raw == 'true' or raw == 1
            value = field['trueValue'] if enabled else field['falseValue']
            stored = enabled
        else:
            value = '' if raw is None else str(raw)
            stored = value
        if field['required'] and not value.strip():
            missing.append(field['label'])
        normalized[key] = value
        normalized[f'__stored__{key}'] = stored  # type: ignore[assignment]
    if missing:
        raise ValidationError({'inputValues': f'请填写：{ "、".join(missing)}'})
    return normalized


def render_template(template: str, schema: list[dict[str, Any]], values: Any) -> tuple[str, dict[str, Any]]:
    normalized = normalize_values(schema, values)
    rendered = TOKEN_RE.sub(lambda match: normalized.get(match.group(1).strip(), match.group(0)), template or '').strip()
    stored = {field['key']: normalized[f'__stored__{field["key"]}'] for field in schema}
    return rendered, stored
