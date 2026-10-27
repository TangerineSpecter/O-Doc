export interface ComponentPart {name:string;start_line:number;end_line:number;relative_start_line:number;relative_end_line:number;content_hash:string}
export interface ReadingComponent {name:string;mode:'static_declared_dependencies'|'whole_source_invalidation';parts:ComponentPart[];context_line_count:number;uncertainties:string[]}
export interface LocalReadingUnit {
    input_hash: string;
    component?: ReadingComponent;
    locations: {start_line: number; end_line: number}[];
    reused_from: {outcome_id?: string; input_hash?: string};
    observations: {quote: string; start_line: number; end_line: number; reading: string}[];
    unknowns: string[];
}
export interface LocalReading {
    scope: 'local_text_only_not_runtime_semantics'|'declared_dependency_components_not_runtime_semantics'; notice: string; omitted: number;
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
    if (!record(value) || !['local_text_only_not_runtime_semantics','declared_dependency_components_not_runtime_semantics'].includes(String(value.scope)) || !text(value.notice, 2000) || !integer(value.omitted)
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
        const component = unit.component;
        if (value.scope === 'declared_dependency_components_not_runtime_semantics') {
            if (!record(component) || !text(component.name,30000) || !component.name || !['static_declared_dependencies','whole_source_invalidation'].includes(String(component.mode))
                || !integer(component.context_line_count) || !Array.isArray(component.parts) || !component.parts.length || component.parts.length>256
                || !Array.isArray(component.uncertainties) || component.uncertainties.length>300 || !component.uncertainties.every(v=>text(v,2000)&&!!v)
                || (component.mode==='whole_source_invalidation' && !component.uncertainties.length)) return fail();
            const parts=component.parts;
            let last=0;
            for (const part of parts) {
                if (!record(part) || !range(part) || !text(part.name,30000) || !part.name || !text(part.content_hash,200) || !part.content_hash
                    || !integer(part.relative_start_line) || !integer(part.relative_end_line) || typeof part.start_line!=='number' || typeof part.end_line!=='number'
                    || part.relative_start_line!==last+2 || part.relative_end_line-part.relative_start_line!==part.end_line-part.start_line
                    || part.relative_end_line>component.context_line_count) return fail();
                last=part.relative_end_line;
            }
            if(last!==component.context_line_count || unit.observations.some(observation=>!parts.some(part=>record(part)&&record(observation)
                && typeof part.relative_start_line==='number' && typeof part.relative_end_line==='number' && typeof observation.start_line==='number' && typeof observation.end_line==='number'
                && part.relative_start_line<=observation.start_line && observation.end_line<=part.relative_end_line)))return fail();
        } else if (component!==undefined) return fail();
        for (const location of unit.locations) {
            if (!record(location) || typeof location.end_line !== 'number' || typeof location.start_line !== 'number') return fail();
            const lineCount = location.end_line - location.start_line + 1;
            if (!component && unit.observations.some(v => record(v) && typeof v.end_line === 'number' && v.end_line > lineCount)) return fail();
        }
    }
    return value as unknown as LocalReading;
}

export function readingLocations(unit:LocalReadingUnit, observation:LocalReadingUnit['observations'][number]):string[] {
    if(unit.component) {
        const part=unit.component.parts.find(row=>row.relative_start_line<=observation.start_line&&observation.end_line<=row.relative_end_line);
        return part?[`${part.name} · L${part.start_line+observation.start_line-part.relative_start_line}–${part.start_line+observation.end_line-part.relative_start_line}`]:[];
    }
    return unit.locations.map(row=>`L${row.start_line+observation.start_line-1}–${row.start_line+observation.end_line-1}`);
}
