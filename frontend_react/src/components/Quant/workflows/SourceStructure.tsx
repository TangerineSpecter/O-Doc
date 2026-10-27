import {useState} from 'react';
import type {QuantSourceStructure} from '../../../types/api/quantSourceStructure';
import {Select} from '../../common/Select';
import {CodeEditor} from '../CodeEditor';

const statusLabels: Record<QuantSourceStructure['status'], string> = {
    parsed: '语法树已读取', partial: '词法结构候选', unparsed: '未能解析结构',
    unsupported: '暂不支持此语言结构', limited: '达到解析限制', no_code: '没有源码',
};

export function SourceStructure({value, code}: {value: QuantSourceStructure; code: string}) {
    const providedFiles = value.parser === 'python-provided-file-bindings-v1';
    const scoped = providedFiles || value.parser === 'python-3.11-scoped-preview-v1';
    const [nodeId, setNodeId] = useState('');
    const [sliceId, setSliceId] = useState('');
    const node = value.nodes.find(row => row.id === nodeId) || value.nodes.find(row => row.kind !== 'module') || value.nodes[0];
    const part = value.slices.find(row => row.id === sliceId) || value.slices.find(row => node && row.startLine <= node.startLine && row.endLine >= node.startLine) || value.slices[0];
    const references = value.references.filter(row => row.fromId === node?.id);
    const language = value.language === 'python' || value.language === 'pine' || value.language === 'mql4' || value.language === 'tongdaxin' ? value.language : 'text';
    const snippet = part ? code.split(/\r\n|\n|\r/).slice(part.startLine - 1, part.endLine).join('\n') : '';
    return <section className="space-y-4" aria-label="源码结构与片段">
        <div><h4 className="font-semibold text-slate-800">源码结构 · {statusLabels[value.status]}</h4>
            <p className="mt-2 text-xs leading-6 text-slate-500">{value.localDemo ? '人工 local 样例，不代表实际解析结果。' : `${value.parser} · ${value.lineCount} 行 · ${value.nodes.length} 个结构节点。`}
                {providedFiles ? '逐文件词法绑定与显式导入仅建立静态候选，不表示模块实际加载或依赖已经运行验证。' : scoped ? '词法绑定与读取关系仅是静态候选，不代表实际运行时数据流。' : '同名引用仅是候选关联，不代表运行时调用或已验证的数据依赖。'}</p></div>
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
                    <p className="mt-1 text-xs leading-5 text-slate-500">{providedFiles ? '按各文件词法作用域和显式导入记录调用与读取；动态分派、模块初始化和外部安装包仍待核对。' : scoped ? '已区分普通形参、局部名和模块名；动态对象、分支顺序与外部库仍待核对。' : '调用与读取按源码语法记录；变量遮蔽、动态分派和外部库未求解。'}</p>
                    <ul className="mt-2 max-h-48 space-y-2 overflow-auto text-xs scrollbar-hide">{references.slice(0, 80).map((row, index) => <li key={index} className="break-all">
                        <span className="text-slate-500">第 {row.line} 行 · {row.kind === 'call' ? '调用写法' : '符号读取'} · </span><code>{row.name}</code>
                        {row.candidateIds.map(id => {const target = value.nodes.find(item => item.id === id); return target && <button key={id} className="ml-2 text-orange-700 hover:underline" onClick={() => {setNodeId(id); setSliceId('');}}>{scoped ? '静态候选' : '同名候选'} {target.name} · 第 {target.startLine} 行</button>;})}
                    </li>)}</ul>{references.length > 80 && <p className="mt-2 text-xs text-slate-500">此处显示前 80 项，剩余记录可在阶段输出中查看。</p>}
                    {!references.length && <p className="mt-2 text-xs text-slate-500">未记录到引用；不据此认定没有外部依赖。</p>}
                </div>}
            </div>
        </div>
        {value.imports.length > 0 && <details><summary className="cursor-pointer text-xs text-slate-600">{providedFiles ? '导入声明' : '外部导入'} · {value.imports.length} 项 · {providedFiles ? '仅匹配提供的文件，未实际加载' : '未加载依赖文件'}</summary>
            <ul className="mt-2 max-h-48 space-y-2 overflow-auto text-xs scrollbar-hide">{value.imports.map((row, index) => <li className="break-all" key={index}>第 {row.line} 行 · <code>{row.name}</code>{row.alias && ` → ${row.alias}`}</li>)}</ul></details>}
    </section>;
}
