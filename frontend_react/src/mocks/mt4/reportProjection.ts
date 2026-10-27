import type {MT4Parameter, MT4Report} from '../../types/api/mt4Archive';

function isAnnotation({name, value}: MT4Parameter): boolean {
    const compact = name.trim().replace(/[\s_-]+/g, '').toLowerCase();
    if (/^(?:comm|comment|comments|note|notes|注释|备注)\d*$/.test(compact)) return true;
    if (/^(?:(?:inp|expert|ea)?magic(?:number|num|no|id)?|魔法号|魔术号)\d*$/.test(compact)) return true;
    const text = value.trim();
    const quoted = text.length >= 2 && (text[0] === '"' || text[0] === "'") && text[text.length - 1] === text[0];
    return /(?:settings|setting|heading|header|separator|section)$/.test(compact)
        && quoted && /[:：]$/.test(text.slice(1, -1).trim());
}

export function projectMT4Report(report: MT4Report): MT4Report {
    return {
        ...report,
        ...(report.parameters && {parameters: report.parameters.filter(item => !isAnnotation(item))}),
        ...(report.fields && {fields: Object.fromEntries(Object.entries(report.fields).filter(([key]) => key !== 'parameters'))}),
    };
}

export function preserveHiddenMT4Parameters(original: MT4Report, submitted: MT4Report): MT4Report {
    const result = {...submitted};
    if (original.parameters) {
        if (!submitted.parameters) result.parameters = original.parameters;
        else {
            const visible = submitted.parameters;
            let index = 0;
            result.parameters = original.parameters.flatMap(item => {
                if (isAnnotation(item)) return [item];
                return index < visible.length ? [visible[index++]] : [];
            }).concat(visible.slice(index));
        }
    }
    if (original.fields && 'parameters' in original.fields) {
        result.fields = {...submitted.fields, parameters: original.fields.parameters};
    }
    return result;
}
