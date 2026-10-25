import {useState} from 'react';
import type {QuantSourceStructure} from '../../../types/api/quantSourceStructure';
import {Select} from '../../common/Select';
import {CodeEditor} from '../CodeEditor';

const statusLabels: Record<QuantSourceStructure['status'], string> = {
    parsed: '语法树已读取', partial: '词法结构候选', unparsed: '未能解析结构',
    unsupported: '暂不支持此语言结构', limited: '达到解析限制', no_code: '没有源码',
};

export function SourceStructure({value, code}: {value: QuantSourceStructure; code: string}) {
    const [nodeId, setNodeId] = useState('');
    const [sliceId, setSliceId] = useState('');
    const node = value.nodes.find(row => row.id === nodeId) || value.nodes.find(row => row.kind !== 'module') || value.nodes[0];
    const part = value.slices.find(row => row.id === sliceId) || value.slices.find(row => node && row.startLine <= node.startLine && row.endLine >= node.startLine) || value.slices[0];
    const references = value.references.filter(row => row.fromId === node?.id);
    const language = value.language === 'python' || value.language === 'pine' || value.language === 'mql4' || value.language === 'tongdaxin' ? value.language : 'text';
    const snippet = part ? code.split(/\r\n|\n|\r/).slice(part.startLine - 1, part.endLine).join('\n') : '';
    return <section className="space-y-4" aria-label="源码结构与片段">
        <div><h4 className="font-semibold text-slate-800">源码结构 · {statusLabels[value.status]}</h4>
            <p className="mt-2 text-xs leading-6 text-slate-500">{value.localDemo ? '人工 local 样例，不代表实际解析结果。' : `${value.parser} · ${value.lineCount} 行 · ${value.nodes.length} 个结构节点`}
                同名引用仅是候选关联，不代表运行时调用或已验证的数据依赖。</p></div>
        {value.diagnostics.length > 0 && <ul className="space-y-1 text-xs leading-6 text-slate-600">{value.diagnostics.map((row, index) =>
            <li key={index}>{row.line ? `第 ${row.line} 行：` : ''}{row.message}</li>)}</ul>}
        <div className="grid gap-4 xl:grid-cols-[minmax(180px,1fr)_minmax(0,2fr)]">
            <div><h5 className="mb-2 text-xs font-medium text-slate-500">函数、变量与公式</h5>
                {value.nodes.length ? <div className="max-h-64 overflow-auto scrollbar-hide">{value.nodes.map(row => <button key={row.id}
                    onClick={() => {setNodeId(row.id); setSliceId('');}} aria-pressed={node?.id === row.id}
                    className={`mb-1 flex min-h-11 w-full items-start justify-between gap-3 rounded-lg p-2 text-left text-xs ${node?.id === row.id ? 'bg-orange-50 text-orange-800' : 'hover:bg-white'}`}>
                    <span className="min-w-0 break-all font-mono">{row.name}</span><span className="shrink-0 text-slate-500">{row.startLine}–{row.endLine} 行</span>
                </button>)}</div> : <p className="text-xs leading-6 text-slate-500">未识别结构节点，原文仍可逐段阅读。</p>}
            </div>
            <div className="min-w-0 space-y-3">
                {part && <><label className="block space-y-2 text-xs text-slate-600"><span>源码片段 · 选择节点会定位至其起始片段</span>
                    <Select value={part.id} onChange={setSliceId} options={value.slices.map(row => ({value: row.id, label: `原文第 ${row.startLine}–${row.endLine} 行`}))}/></label>
                    <CodeEditor value={snippet} language={language} readOnly compact firstLine={part.startLine}/></>}
                {node && <div><h5 className="text-xs font-medium text-slate-600">{node.name} 中的符号引用 · {references.length}</h5>
                    <p className="mt-1 text-xs leading-5 text-slate-500">调用与读取按源码语法记录；变量遮蔽、动态分派和外部库未求解。</p>
                    <ul className="mt-2 max-h-48 space-y-2 overflow-auto text-xs scrollbar-hide">{references.slice(0, 80).map((row, index) => <li key={index} className="break-all">
                        <span className="text-slate-500">第 {row.line} 行 · {row.kind === 'call' ? '调用写法' : '符号读取'} · </span><code>{row.name}</code>
                        {row.candidateIds.map(id => {const target = value.nodes.find(item => item.id === id); return target && <button key={id} className="ml-2 text-orange-700 hover:underline" onClick={() => {setNodeId(id); setSliceId('');}}>同名候选 {target.name} · 第 {target.startLine} 行</button>;})}
                    </li>)}</ul>{references.length > 80 && <p className="mt-2 text-xs text-slate-500">此处显示前 80 项，剩余记录可在阶段输出中查看。</p>}
                    {!references.length && <p className="mt-2 text-xs text-slate-500">未记录到引用；不据此认定没有外部依赖。</p>}
                </div>}
            </div>
        </div>
        {value.imports.length > 0 && <details><summary className="cursor-pointer text-xs text-slate-600">外部导入 · {value.imports.length} 项 · 未加载依赖文件</summary>
            <ul className="mt-2 max-h-48 space-y-2 overflow-auto text-xs scrollbar-hide">{value.imports.map((row, index) => <li className="break-all" key={index}>第 {row.line} 行 · <code>{row.name}</code>{row.alias && ` → ${row.alias}`}</li>)}</ul></details>}
    </section>;
}
