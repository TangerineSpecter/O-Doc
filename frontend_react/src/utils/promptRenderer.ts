import type {PromptField} from '../types/api/prompt';

const tokenPattern = /\{\{field:([^}]+)\}\}/g;
export type PromptValues = Record<string, string | string[] | boolean | number | undefined>;

export function defaultPromptValues(fields: PromptField[]): PromptValues {
  return Object.fromEntries(fields.map(field => [field.key, field.defaultValue]));
}

export function renderPromptTemplate(template: string, fields: PromptField[], values: PromptValues): {text: string; missing: string[]} {
  const byKey = new Map(fields.map(field => [field.key, field]));
  const missing: string[] = [];
  const text = template.replace(tokenPattern, (token, rawKey: string) => {
    const field = byKey.get(rawKey.trim());
    if (!field) return token;
    const raw = values[field.key] ?? field.defaultValue;
    let value = '';
    if (field.type === 'multiselect') value = (Array.isArray(raw) ? raw : raw ? [raw] : []).join(field.separator || '、');
    else if (field.type === 'boolean') value = raw === true || raw === 'true' ? (field.trueValue || '是') : (field.falseValue || '');
    else value = raw == null ? '' : String(raw);
    if (field.required && !value.trim()) missing.push(field.label);
    return value;
  });
  return {text: text.trim(), missing};
}

export function promptToken(key: string) { return `{{field:${key}}}`; }
