import {readAlgorithmProgram, algorithmCode, readPythonAlgorithm, containsAlgorithmProgram} from '../../utils/quantAlgorithm';
import type {QuantFactorCandidate} from '../../types/api/quant';
import type {QuantExportBundle, QuantExportTarget} from '../../types/api/quantExport';
import {renameParameterCondition} from '../../utils/quantParameterConditions';
import {HttpResponse} from 'msw';
import {checkParameterDomains} from '../../utils/quantParameterDomain';

export function mockFactorExport(candidate: QuantFactorCandidate, target: string): QuantExportBundle | Response {
    const extensions: Record<QuantExportTarget, string> = {python: 'py', pine: 'pine', mql4: 'mq4', tongdaxin: 'txt'};
    if (!Object.prototype.hasOwnProperty.call(extensions, target) || !candidate.data.expression) return HttpResponse.json({code: 400, msg: '此目标或候选暂不能导出', data: null}, {status: 400});
    const program = readAlgorithmProgram(candidate.data.expression);
    const python = readPythonAlgorithm(candidate.data.expression);
    if (python) {
        if (target !== 'python') return HttpResponse.json({code:400,msg:'此算法提供Python实现',data:null},{status:400});
        return {filename:`algorithm-${candidate.id}.py`,code:python,manifestJson:JSON.stringify({local_demo:true},null,2)};
    }
    if (program) {
        if (target !== 'python') return HttpResponse.json({code: 400, msg: '逐根算法使用统一Python实现', data: null}, {status: 400});
        return {filename: `algorithm-${candidate.id}.py`, code: '# LOCAL · 计算步骤展示样例；完整独立实现由后端导出。\n' + algorithmCode(program), manifestJson: JSON.stringify({local_demo: true, inputs: candidate.data.inputs, parameters: candidate.data.parameters}, null, 2)};
    }
    if (containsAlgorithmProgram(candidate.data.expression) && target !== 'python') return HttpResponse.json({code: 400, msg: '包含逐根算法的组合请导出 Python 实现', data: null}, {status: 400});
    const domains = candidate.data.parameters.filter(row => row.domain);
    try {
        checkParameterDomains(candidate.data.parameters, Object.fromEntries(candidate.data.parameters.map(row => [row.name, JSON.parse(row.defaultValue)])));
    } catch {return HttpResponse.json({code: 400, msg: '默认参数不满足声明约束', data: null}, {status: 400});}
    const names = Object.fromEntries([...candidate.data.parameters].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).map((row, index) => [row.name, `p${index}`]));
    const textRows = candidate.data.parameters.filter(row => ['string', 'str'].includes(row.type.trim().toLowerCase()));
    const vocabulary = [...new Set(textRows.flatMap(row => row.domain?.choices.filter((value): value is string => typeof value === 'string') ?? []))].sort();
    const categoricalEncoding = {encoding: 'exact_case_sensitive_global_integer_codes',
        values: vocabulary.map((value, index) => ({code: index + 1, value})),
        parameters: Object.fromEntries(textRows.map(row => [names[row.name], {source_name: row.name,
            default_code: vocabulary.indexOf(JSON.parse(row.defaultValue) as string) + 1,
            allowed_codes: row.domain!.choices.map(value => vocabulary.indexOf(value as string) + 1)}]))};
    const declarations = textRows.map(row => {
        const name = names[row.name]; const value: string = JSON.parse(row.defaultValue);
        if (target === 'python') return `${name} = ${JSON.stringify(value)} # LOCAL choice preview`;
        if (target === 'pine') return `${name} = input.string(${JSON.stringify(value)}, "${name}", options=${JSON.stringify(row.domain!.choices)})`;
        if (target === 'mql4') return `input string ${name} = ${JSON.stringify(value)};`;
        return `${name.toUpperCase()}:=${vocabulary.indexOf(value) + 1}; { See categorical_encoding in manifest }`;
    }).join('\n');
    const samples: Record<QuantExportTarget, string> = {
        python: '# LOCAL synthetic export preview; not a translation of the selected factor.\ndef calculate(rows):\n    return [row["close"] for row in rows]\n',
        pine: '//@version=6\n// LOCAL synthetic preview only.\nindicator("Local export preview")\nplot(barstate.isconfirmed ? close : na)\n',
        mql4: '// LOCAL synthetic preview only, not a compiled indicator.\n#property strict\n#property indicator_separate_window\n// Real export uses chronological arrays and EMPTY_VALUE.\n',
        tongdaxin: '{ LOCAL synthetic preview only }\nFACTOR:IF(NOT(ISLASTBAR),CLOSE,DRAWNULL);\n',
    };
    return {filename: `factor-${candidate.id}.${extensions[target as QuantExportTarget]}`, code: samples[target as QuantExportTarget] + declarations + '\n',
        manifestJson: JSON.stringify({version: 1, exporter_version: 'quant-indicator-export-3', local_demo: true, target, candidate_id: candidate.id, source_id: candidate.sourceId,
            verification: 'platform_compile_and_equivalence_pending', parameters: candidate.data.parameters,
            ...(target === 'tongdaxin' && textRows.length ? {categorical_encoding: categoricalEncoding} : {}),
            ...(domains.length ? {parameter_domains: domains.map(row => {const {stepOrigin, ...domain} = row.domain!; return {name: names[row.name], domain: {...domain, step_origin: stepOrigin, ...(domain.conditions ? {conditions: domain.conditions.map(rule => ({when: renameParameterCondition(rule.when, names), require: renameParameterCondition(rule.require, names)}))} : {}), relations: domain.relations.map(relation => ({...relation, parameter: names[relation.parameter]}))}};})} : {}),
            limitations: ['纯本地人工样例，仅验证预览、平台切换和下载；没有运行后端导出器，也不代表所选因子的转换结果。']}, null, 2)};
}
