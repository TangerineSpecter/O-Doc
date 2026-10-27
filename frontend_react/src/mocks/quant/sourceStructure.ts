import type {QuantSourceStructure} from '../../types/api/quantSourceStructure';
import type {QuantSourceFile} from '../../types/api/quantSourceSupplement';

/** Presentation fixture only. Local mode does not claim to run the backend parser. */
export function structureSample(code: string, language: string): QuantSourceStructure {
    const count = code ? code.split(/\r\n|\n|\r/).length - Number(/(?:\r\n|\n|\r)$/.test(code)) : 0;
    const root = {id: 'local-module', name: '<module>', kind: 'module', parentId: '', startLine: 1, endLine: count, contentHash: 'local-sample-hash', basis: 'local_demo'};
    const slices: QuantSourceStructure['slices'] = [];
    // Deliberately cut after the first line to exercise non-one gutter offsets.
    for (let start = 1; start <= count;) {
        const end = start === 1 ? 1 : Math.min(start + 199, count);
        slices.push({id: `local-slice-${start}`, startLine: start, endLine: end, contentHash: 'local-sample-hash'});
        start = end + 1;
    }
    return {version: 1, language, parser: 'local-presentation-only', status: code.trim() ? 'partial' : 'no_code',
        localDemo: true, codeHash: 'local-sample-hash', lineCount: count,
        nodes: code.trim() ? [root, { ...root, id: 'local-fragment', name: '样例计算片段', kind: 'sample', parentId: root.id, startLine: Math.min(2, count)}] : [],
        references: code.trim() ? [{fromId: 'local-fragment', name: '示例输入', line: count, kind: 'read', candidateIds: []}] : [],
        imports: [], slices,
        diagnostics: [{message: '人工结构样例，仅用于检查源码定位和阅读流程；实际函数与依赖由后端解析。', line: null}],
        referenceSemantics: 'syntactic_name_candidates_not_runtime_dependencies'};
}

/** Explicit file ranges only; do not fabricate parsed functions/import edges. */
export function fileStructureSample(code: string, language: string, files: QuantSourceFile[]): QuantSourceStructure {
    const base = structureSample(code, language);
    return {...base, nodes: files.map((file, index) => ({id: `local-file-${index}`, name: `${file.name}::<module>`, kind: 'module', parentId: '',
        startLine: file.startLine, endLine: file.endLine, contentHash: file.contentHash, basis: 'local_demo'})), references: [], imports: [],
        diagnostics: [{message: '人工逐文件范围样例，不运行Python解析器、导入解析或模型；未画连线不表示没有依赖。', line: null}],
        referenceSemantics: 'local_file_ranges_only_not_dependency_analysis'};
}
