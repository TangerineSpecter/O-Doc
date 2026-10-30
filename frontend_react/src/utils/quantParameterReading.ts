import type { QuantAnalysis } from '../types/api/quant';

type Parameter = QuantAnalysis['parameters'][number];

// Only interpret the literal title of a Pine input declaration, never its default expression.
function pineInputTitle(quote: string): string | null {
    const match = /\binput\.[a-zA-Z_]+\s*\(/.exec(quote);
    if (!match) return null;
    const args: string[] = [];
    let start = match.index + match[0].length;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < quote.length; i++) {
        const char = quote[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
        } else if (char === '"') inString = true;
        else if (char === '(' || char === '[' || char === '{') depth++;
        else if (char === ')' || char === ']' || char === '}') {
            if (!depth) { args.push(quote.slice(start, i).trim()); break; }
            depth--;
        } else if (char === ',' && !depth) {
            args.push(quote.slice(start, i).trim());
            start = i + 1;
        }
    }
    const candidate = args.find(arg => /^title\s*=/.test(arg))?.replace(/^title\s*=\s*/, '') || args[1];
    if (!candidate?.startsWith('"')) return null;
    try {
        const value: unknown = JSON.parse(candidate);
        return typeof value === 'string' && value.trim() ? value.trim() : null;
    } catch { return null; }
}

export function readingParameterName(parameter: Parameter): { title: string; symbol: string } {
    const origin = parameter.sourceBinding;
    const symbol = origin?.sourceName || parameter.name;
    const title = origin?.status === 'resolved' && origin.kind === 'exposed_input'
        ? pineInputTitle(origin.quote) : null;
    return {title: title || symbol, symbol};
}

export function readingParameterDefault(parameter: Parameter): string {
    const origin = parameter.sourceBinding;
    if (parameter.defaultValue !== '') {
        if (['bool', 'boolean'].includes(parameter.type.trim().toLowerCase())) {
            if (parameter.defaultValue === 'true') return '开启';
            if (parameter.defaultValue === 'false') return '关闭';
        }
        return parameter.defaultValue;
    }
    if (origin?.status === 'resolved' && origin.defaultRaw.trim()) {
        const raw = origin.defaultRaw.trim();
        if (/\binput\.source\s*\(/.test(origin.quote) && raw === 'close') return '收盘价（close）';
        return `表达式：${raw}`;
    }
    return '未提供';
}

export function readingParameterGroup(parameter: Parameter): 'input' | 'display' | 'internal' {
    if (parameter.category === 'constant' || parameter.category === 'state') return 'internal';
    if (parameter.category === 'display') return 'display';
    return 'input';
}
