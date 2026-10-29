import type {QuantStudy, StudyCandidate, StudyDefinition, StudyFormulaCheck, StudyGeneration, StudyGenerationData, ValidStudyCandidate} from '../types/api/quantStudy';

export function describeFormulaCheck(check:StudyFormulaCheck):string {
    const status={equivalent:'共同有效范围内代数等价',different:'发现不等价反例',unknown:'暂无法判断'}[check.status];
    const claim={equivalent:'声称等价',different:'认为不同',uncertain:'未确认'}[check.claim];
    const sample=check.counterexample ? `；反例：输入${JSON.stringify(check.counterexample.inputs)}，参数${JSON.stringify(check.counterexample.parameters)}${check.counterexample.index !== undefined ? `，时点索引${check.counterexample.index}` : ''}，父代=${check.counterexample.parent}，候选=${check.counterexample.candidate}` : '';
    return `父代 ${check.parent_id}：${status}；AI ${claim}。${check.reason}；${check.parameter_scope}${check.default_parameters_differ?'；双方默认参数不同':''}${sample}`;
}

const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Invalid AI definitions are retained verbatim, but never sent as valid factors. */
export function hasStudyDefinition(row: StudyCandidate): row is ValidStudyCandidate {
    const definition = row.definition;
    if (!record(definition) || !['name', 'role', 'family', 'summary', 'formula', 'output_type', 'units', 'timeframe', 'limitations'].every(key => typeof definition[key] === 'string')
        || !Array.isArray(definition.parameters) || !Array.isArray(definition.inputs)
        || !Array.isArray(definition.dependencies) || !Array.isArray(definition.tags)
        || (definition.expression !== null && !record(definition.expression))) return false;
    return definition.parameters.every((item: unknown) => record(item) &&
        ['name', 'default_value', 'meaning', 'effect', 'constraints', 'suggestion'].every(key => typeof item[key] === 'string'));
}

export function readStudyGeneration(generation: StudyGeneration): StudyGenerationData {
    const value = JSON.parse(generation.dataJson) as StudyGenerationData;
    if (!value || value.version !== 1 || !['completed', 'failed'].includes(value.status)
        || !Array.isArray(value.input?.parents) || (value.result && !Array.isArray(value.result.candidates))) {
        throw new Error('代次记录无法读取，原稿仍保留');
    }
    for (const row of value.result?.candidates || []) {
        if (!row || !Array.isArray(row.scores) || row.scores.length !== 5 || row.empirical_status !== 'unassessed'
            || !Array.isArray(row.parents) || !Array.isArray(row.risks)
            || row.scores.some(score => !score || typeof score.dimension !== 'string'
                || typeof score.reason !== 'string' || typeof score.evidence !== 'string'
                || (score.score !== null && typeof score.score !== 'number'))) {
            throw new Error('研究候选字段不完整');
        }
        const expected = row.scores.every(score => score.score !== null)
            ? row.scores.reduce((total, score) => total + (score.score || 0), 0) * 4 : null;
        if (row.total_score !== expected) throw new Error('研究总分与分项不一致，请核对原稿');
    }
    return value;
}

function candidateMarkdown(row: StudyCandidate, review?:string): string {
    const definition: StudyDefinition | null = hasStudyDefinition(row) ? row.definition : null;
    const title = definition?.name || `未通过校验的候选 ${row.index + 1}`;
    const details = definition
        ? `${definition.summary}\n\n公式：${definition.formula}\n\n参数：\n\n${definition.parameters.map(p => `- ${p.name}=${p.default_value}；${p.meaning}；建议：${p.suggestion}`).join('\n')}`
        : `候选定义不完整，保留原始内容：\n\n\`\`\`json\n${JSON.stringify(row.definition ?? null, null, 2)}\n\`\`\``;
    const checks = row.formula_checks?.length ? `程序公式核对（以结构化表达式为准，文字公式与源码尚未独立核实）：\n\n${row.formula_checks.map(check => `- ${describeFormulaCheck(check)}`).join('\n')}\n\n` : '';
    const conflict = row.formula_checks?.some(check => check.claim === 'equivalent' && check.status === 'different');
    const scoreLabel = conflict ? 'AI原评分（公式核对未通过）' : review ? 'AI初评（未随复核更改）' : '研究分';
    return `### ${title}\n\n${details}\n\n${checks}${scoreLabel}：${row.total_score ?? '未评估'}/100；${row.selected ? '保留' : '未保留'}。\n\n父代：${row.parents.join('、')}\n\n${review ? `AI复核：${review}\n\n` : ''}AI原文取舍：${row.rationale}\n\n${row.validation_error}\n\n评分依据：\n\n${row.scores.map(s => `- ${s.dimension} ${s.score ?? '未知'}/5：${s.reason}；${s.evidence}`).join('\n')}\n\n风险：${row.risks.join('；')}\n\n`;
}

export function studyMarkdown(study: QuantStudy): string {
    return `# ${study.name}\n\n研究价值评价；没有回测不影响迭代，实证表现未评估。AI摘要和评分可能有误，公式关系以各候选的程序核对为准。\n\n` + study.generations.map(generation => {
        try {
            const data = readStudyGeneration(generation);
            return `## 第${generation.number}代\n\n${data.review?.summary || data.result?.summary || data.error}\n\n${data.format_repair || ''}\n\n${data.review_error || ''}\n\n` +
                (data.result?.candidates || []).map(row=>candidateMarkdown(row,data.review?.candidates.find(item=>item.index===row.index)?.explanation)).join('');
        } catch {
            return `## 第${generation.number}代\n\n代次记录无法读取，原稿仍保留。\n\n\`\`\`json\n${generation.dataJson}\n\`\`\`\n`;
        }
    }).join('\n');
}
