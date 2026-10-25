export interface LocalReadingUnit {
    input_hash: string;
    locations: {start_line: number; end_line: number}[];
    reused_from: {outcome_id?: string; input_hash?: string};
    observations: {quote: string; start_line: number; end_line: number; reading: string}[];
    unknowns: string[];
}
export interface LocalReading {
    scope: 'local_text_only_not_runtime_semantics'; notice: string; omitted: number;
    baseline: {run_id?: string; source_id?: string; source_hash?: string; outcome_id?: string};
    units: LocalReadingUnit[];
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, limit: number): v is string => typeof v === 'string' && v.length <= limit;
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && typeof v === 'number' && v >= 0;
const range = (v: unknown) => record(v) && integer(v.start_line) && integer(v.end_line) && v.start_line > 0 && v.end_line >= v.start_line;

export function readLocalReading(json: string): LocalReading {
    const fail = (): never => {throw new Error('片段解读记录不完整，请重新读取阶段依据。');};
    if (json.length > 1000000) return fail();
    const value: unknown = JSON.parse(json);
    if (!record(value) || value.scope !== 'local_text_only_not_runtime_semantics' || !text(value.notice, 2000) || !integer(value.omitted)
        || !record(value.baseline) || Object.values(value.baseline).some(v => !text(v, 200)) || !Array.isArray(value.units) || value.units.length > 48) return fail();
    const seen = new Set<string>();
    for (const unit of value.units) {
        if (!record(unit) || !text(unit.input_hash, 200) || !unit.input_hash || seen.has(unit.input_hash)
            || !Array.isArray(unit.locations) || !unit.locations.length || !unit.locations.every(range)
            || !record(unit.reused_from) || Object.values(unit.reused_from).some(v => !text(v, 200))
            || !Array.isArray(unit.observations) || !unit.observations.length || unit.observations.length > 4
            || !unit.observations.every(v => range(v) && record(v) && text(v.quote, 2000) && !!v.quote.trim() && text(v.reading, 800) && !!v.reading.trim())
            || !Array.isArray(unit.unknowns) || unit.unknowns.length > 4 || !unit.unknowns.every(v => text(v, 800) && !!v.trim())) return fail();
        seen.add(unit.input_hash);
        const reused = unit.reused_from;
        if (Object.keys(reused).length && (!text(reused.outcome_id, 200) || !reused.outcome_id || reused.input_hash !== unit.input_hash)) return fail();
        for (const location of unit.locations) {
            if (!record(location) || typeof location.end_line !== 'number' || typeof location.start_line !== 'number') return fail();
            const lineCount = location.end_line - location.start_line + 1;
            if (unit.observations.some(v => record(v) && typeof v.end_line === 'number' && v.end_line > lineCount)) return fail();
        }
    }
    return value as unknown as LocalReading;
}
