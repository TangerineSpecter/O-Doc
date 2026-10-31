/** Artificial local fixtures; never presented as backend parsing/model evidence. */
import type {QuantAIRun, QuantEntryDetail, QuantSource} from '../../types/api/quant';
import {readLocalReading, type LocalReading, type LocalReadingUnit} from '../../utils/quantLocalReading';
import {structureSample} from './sourceStructure';

function pieces(source: QuantSource | undefined, run: QuantAIRun) {
    const code = source?.payload.code || '', lines = code.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean) || [];
    const components=[27,28,30,32,34,36,38,40, 42].includes(run.workflow?.version||0);
    const context = [components?code:undefined,components,source?.payload.language, source?.payload.platform, source?.payload.languageVersion, source?.payload.dependencies, source?.payload.parameters, run.modelId, run.requirements];
    return structureSample(code, source?.payload.language || 'text').slices.map(location => {
        const text = lines.slice(location.startLine - 1, location.endLine).join('');
        return {text, key: JSON.stringify([context, text]), location: {start_line: location.startLine, end_line: location.endLine}};
    }).filter(row => row.text.trim());
}
function artificialKey(text: string) {
    let value = 2166136261;
    for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    return `local-${(value >>> 0).toString(16)}`;
}
export function localReadingSample(run: QuantAIRun, entry: QuantEntryDetail, old?: QuantAIRun, allowReuse = true, version=run.workflow?.version): string {
    const currentRun={...run,workflow:{...run.workflow,version}} as QuantAIRun;
    const source = entry.sources?.find(row => row.id === run.sourceId);
    const previous = old?.workflow?.localReadingEvidenceJson ? readLocalReading(old.workflow.localReadingEvidenceJson) : undefined;
    const oldPieces = old ? pieces(entry.sources?.find(row => row.id === old.sourceId), old) : [];
    const prior = new Map(oldPieces.map(row => [row.key, previous?.units.find(unit => unit.input_hash === artificialKey(row.key))]));
    const units: LocalReadingUnit[] = [], selected = new Map<string, LocalReadingUnit>();
    let used = 0, omitted = 0;
    for (const piece of pieces(source, currentRun)) {
        const existing = selected.get(piece.key);
        if (existing) {existing.locations.push(piece.location); continue;}
        if (units.length >= 48 || used + piece.text.length > 40000) {omitted++; continue;}
        const components=[27,28,30,32,34,36,38,40, 42].includes(version||0);
        const oldUnit = allowReuse ? prior.get(piece.key) : undefined;
        const relativeLines = piece.text.split(/\r\n|\n|\r/), firstLine = relativeLines.findIndex(line => line.trim());
        const unit: LocalReadingUnit = {input_hash: artificialKey(piece.key), locations: [piece.location],
            reused_from: oldUnit && old ? {outcome_id: `local-outcome-${old.id}-snippets`, input_hash: artificialKey(piece.key)} : {},
            observations: oldUnit ? structuredClone(oldUnit.observations) : [{quote: relativeLines[firstLine].slice(0, 2000), start_line: firstLine + (components?2:1), end_line: firstLine + (components?2:1), reading: '人工 local 局部解读样例：核对本段声明与计算。真实解读由模型生成。'}],
            unknowns: ['人工 local 样例，不证明全局依赖、实际参数、编译运行或平台等价。']};
        if(components) unit.component={name:`人工组件 ${units.length+1}`,mode:'whole_source_invalidation',
            parts:[{name:`人工源码片段 ${units.length+1}`,...piece.location,relative_start_line:2,relative_end_line:piece.location.end_line-piece.location.start_line+2,content_hash:'local-artificial-text'}],
            context_line_count:piece.location.end_line-piece.location.start_line+2,uncertainties:['人工 local 不解析真实依赖；任意源码改变均重算样例。']};
        units.push(unit); selected.set(piece.key, unit); used += piece.text.length;
    }
    const value: LocalReading = {scope: [27,28,30,32,34,36,38,40, 42].includes(version||0)?'declared_dependency_components_not_runtime_semantics':'local_text_only_not_runtime_semantics', notice: '人工 local 展示样例，未调用真实模型；局部解读须结合本次完整原文重新核对，评分和实验设计不继承。',
        omitted, baseline: old ? {run_id: old.id, source_id: old.sourceId || '', source_hash: 'local-artificial-source'} : {}, units};
    return JSON.stringify(value);
}
