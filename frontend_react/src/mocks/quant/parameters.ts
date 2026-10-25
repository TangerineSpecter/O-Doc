import type {QuantSource} from '../../types/api/quant';
import type {QuantConfigurationPreview, QuantParameterConfiguration, QuantParameterValue} from '../../types/api/quantParameters';

const literal = (raw: string): QuantParameterValue => raw === 'true' || raw === 'false' ? {kind: 'bool', value: raw === 'true'} : /^[-+]?\d+(\.\d+)?$/.test(raw) && Number.isSafeInteger(Number(raw)) ? {kind: 'int', value: Number(raw)} : {kind: 'unknown', value: null};

// Intentionally a small, labeled UI fixture adapter. Real parsing/comparison is server-side.
export function mockConfiguration(document: string, target: QuantSource): QuantConfigurationPreview {
    if (!document.trim() || document.length > 60000 || document.includes('\0')) throw new Error('SET 内容为空或无效');
    const parameters: QuantParameterConfiguration['parameters'] = [];
    const metadata: Record<string, Record<string, string>> = {};
    const seen = new Set<string>();
    document.split(/\r?\n/).forEach((quote, index) => {
        if (!quote.trim() || /^\s*[;#]/.test(quote)) return;
        const match = quote.match(/^\s*([a-zA-Z_]\w*)(?:,([F123]))?=(.*)$/);
        if (!match) return;
        const [, name, suffix, raw] = match, key = `${name},${suffix || ''}`;
        if (seen.has(key)) throw new Error(`重复参数：${name}`);
        seen.add(key);
        if (suffix) {(metadata[name] ||= {})[suffix] = raw; return;}
        const parts = raw.split('||');
        const inline = parts.length === 5 && ['Y', 'N'].includes(parts[4]) && parts.slice(0, 4).every(value => /^(?:true|false|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)$/.test(value));
        const rawValue = inline ? parts[0] : raw;
        parameters.push({name, rawValue, quote, line: index + 1, ...literal(rawValue), optimization: inline ? {format: 'inline', enabled: parts[4] === 'Y', start: parts[1], step: parts[2], stop: parts[3]} : null});
    });
    if (!parameters.length || parameters.length > 300) throw new Error('SET 需要 1–300 个参数');
    parameters.forEach(row => {const meta = metadata[row.name]; if (meta) row.optimization = {format: 'legacy', enabled: meta.F === '1', start: meta['1'] ?? null, step: meta['2'] ?? null, stop: meta['3'] ?? null};});
    return {configuration: {parserVersion: 'local-mql-set-preview', status: 'imported_configuration_not_verified_execution', parameters, warnings: []},
        comparison: {version: 1, sourceId: target.id, sourceHash: 'local-demo-not-a-content-hash', missing: [], limitations: ['本地界面演示只做简单字面匹配；真实声明解析、缺失项与类型检查由后端执行。'],
            rows: parameters.map(row => {
                const declaration = (target.payload.code || '').match(new RegExp(`\\b(input|extern)\\s+(int|double|bool|string)\\s+${row.name}\\s*=\\s*([^;]+);`));
                return {name: row.name, configured: literal(row.rawValue), default: declaration ? literal(declaration[3]) : null,
                    declaration: declaration ? {name: row.name, declaration: declaration[1], type: declaration[2], defaultRaw: declaration[3], line: (target.payload.code || '').slice(0, declaration.index).split('\n').length, quote: declaration[0]} : null,
                    status: declaration ? declaration[3] === row.rawValue ? 'same' : 'different' : 'unmatched'};
            })}};
}
