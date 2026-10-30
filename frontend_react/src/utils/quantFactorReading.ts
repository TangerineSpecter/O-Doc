export interface FactorReading { summary: string; code: string }
const begin = '<!-- quant-factor-calculations:v1 -->';
const end = '<!-- /quant-factor-calculations -->';

/** Optional curated reading notes live in the existing report revision, not factor definitions. */
export function factorReadingNotes(markdown: string): { body: string; notes: Record<string, FactorReading> } {
    const start = markdown.indexOf(begin);
    const finish = start < 0 ? -1 : markdown.indexOf(end, start + begin.length);
    if (start < 0 || finish < 0) return {body: markdown, notes: {}};
    const content = markdown.slice(start + begin.length, finish);
    const sections: string[] = [];
    let section: string[] | null = null;
    let fence = '';
    for (const line of content.split(/\r?\n/)) {
        const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
        if (marker) {
            if (!fence) fence = marker[0];
            else if (fence === marker[0]) fence = '';
        }
        if (!fence && /^###\s+/.test(line)) {
            section = [line.replace(/^###\s+/, '')];
            sections.push('');
        } else if (!section && line.trim() && line.trim() !== '## 因子计算说明') {
            return {body: markdown, notes: {}};
        } else if (section) section.push(line);
        if (section) sections[sections.length - 1] = section.join('\n');
    }
    if (fence) return {body: markdown, notes: {}};
    const notes: Record<string, FactorReading> = {};
    for (const item of sections) {
        const titleEnd = item.indexOf('\n');
        if (titleEnd < 0) return {body: markdown, notes: {}};
        const name = item.slice(0, titleEnd).trim();
        const body = item.slice(titleEnd + 1);
        const code = /(?:^|\n)```python\s*\n([\s\S]*?)\n```(?:\n|$)/i.exec(body);
        const summary = code ? body.slice(0, code.index).trim() : '';
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || !code || !summary || notes[name] || body.slice(code.index + code[0].length).trim()) return {body: markdown, notes: {}};
        notes[name] = {summary, code: code[1]};
    }
    if (!Object.keys(notes).length) return {body: markdown, notes: {}};
    return {body: (markdown.slice(0, start) + markdown.slice(finish + end.length)).trim(), notes};
}

/** Generated formulas must explicitly identify Python; older prose is kept as original material. */
export function pythonFormula(formula: string): string | null {
    return /(?:^|\n)```python\s*\n([\s\S]*?)\n```(?:\n|$)/i.exec(formula)?.[1] || null;
}

const keywords = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
const binary: Record<string, string> = {add: '+', sub: '-', mul: '*', div: '/', gt: '>', lt: '<', eq: '==', and: 'and', or: 'or'};

/** Render supported scalar expression trees as Python, leaving unsupported operations unconverted. */
export function pythonExpression(expression: unknown): string | null {
    let nodes = 0;
    const render = (value: unknown, depth: number): string | null => {
        if (++nodes > 128 || depth > 12 || !value || typeof value !== 'object' || Array.isArray(value)) return null;
        const node = value as Record<string, unknown>;
        if (node.op === 'input' || node.op === 'parameter') {
            return typeof node.name === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(node.name) && !keywords.has(node.name) ? node.name : null;
        }
        if (node.op === 'constant') {
            if (typeof node.value === 'number' && Number.isFinite(node.value)) return String(node.value);
            if (typeof node.value === 'string') return JSON.stringify(node.value);
            if (typeof node.value === 'boolean') return node.value ? 'True' : 'False';
            return null;
        }
        if (typeof node.op !== 'string' || !Array.isArray(node.args)) return null;
        const args = node.args.map(arg => render(arg, depth + 1));
        if (args.some(arg => arg === null)) return null;
        if (Object.prototype.hasOwnProperty.call(binary, node.op) && args.length === 2) return `(${args[0]} ${binary[node.op]} ${args[1]})`;
        if ((node.op === 'min' || node.op === 'max') && args.length === 2) return `${node.op}(${args[0]}, ${args[1]})`;
        if (node.op === 'abs' && args.length === 1) return `abs(${args[0]})`;
        if (node.op === 'neg' && args.length === 1) return `(-${args[0]})`;
        return null;
    };
    const result = render(expression, 0);
    return result === null ? null : `result = ${result}`;
}

export function conciseFactorSummary(summary: string): string {
    const sentences = summary.replace(/第\s*\d+(?:\s*[-–—~至]\s*\d+)?\s*行/g, '').split(/(?<=[。！？])\s*/);
    return sentences.filter(s => !/作者|论文|原模型|et al\./i.test(s)).join('').trim() || '暂无简明解读';
}
