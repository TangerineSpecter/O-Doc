import {useMemo} from 'react';
import {CodeEditor} from './CodeEditor';
import type {QuantFactorCandidate} from '../../types/api/quant';
import {algorithmCode, algorithmProfile, readAlgorithmProgram, readPythonAlgorithm} from '../../utils/quantAlgorithm';
import {factorFamilies, factorOutputs} from './factorPresentation';

export function AlgorithmDefinition({candidate}: {candidate: QuantFactorCandidate}) {
    const data = candidate.data;
    const python = readPythonAlgorithm(data.expression);
    const info = useMemo(() => {
        try {const program = readAlgorithmProgram(data.expression); return {program, profile: candidate.algorithmProfile || algorithmProfile(data), error: ''};}
        catch (error) {return {program: null, profile: null, error: error instanceof Error ? error.message : '算法定义读取失败'};}
    }, [candidate.algorithmProfile, data]);
    if (info.error) return <p role="alert" className="text-sm text-red-600">{info.error}</p>;
    return <section aria-label="因子算法" className="space-y-5">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
            <span>机制 · {factorFamilies[candidate.curation.family]}</span><span>计算 · {python ? 'Python 实现' : info.program ? '逐根递推' : '序列公式'}</span>
            {info.profile && <span title={info.profile.scoreMeaning}>定义完整度 · {info.profile.definitionScore}/100</span>}
        </div>
        <div><h4 className="mb-2 text-sm font-semibold text-slate-900">数据输入</h4><div className="divide-y divide-slate-100">{data.inputs.map(input => <div key={input.name} className="py-2 text-sm"><span className="font-medium text-slate-800">{input.name}</span><span className="ml-3 text-slate-600">{input.meaning}</span><p className="mt-1 text-xs leading-6 text-slate-500">{input.availability} · {input.missingPolicy}</p></div>)}</div></div>
        <div><h4 className="mb-2 text-sm font-semibold text-slate-900">计算参数</h4>{data.parameters.length ? <div className="overflow-x-auto scrollbar-hide"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="py-2 pr-4 font-medium">参数</th><th className="py-2 pr-4 font-medium">源码默认值</th><th className="py-2 font-medium">含义</th></tr></thead><tbody>{data.parameters.map(row => <tr key={row.name} className="border-t border-slate-100"><td className="py-2 pr-4 font-medium text-slate-800">{row.name}</td><td className="py-2 pr-4 tabular-nums text-slate-700">{row.defaultValue || '调用时传入'}</td><td className="min-w-32 py-2 text-slate-600">{row.meaning}</td></tr>)}</tbody></table></div> : <p className="text-xs text-slate-500">使用源码中的固定常量，无外部可调参数。</p>}</div>
        <div><h4 className="mb-2 text-sm font-semibold text-slate-900">{python ? 'Python 计算代码' : info.program ? '逐根计算逻辑' : '计算公式'}</h4>
            {info.program && <p className="mb-3 text-xs leading-6 text-slate-500">按源码顺序计算。初始化状态跨 K 线保留，history 读取前面的 K 线；完整 Python 实现可从上方导出。</p>}
            {python || info.program ? <CodeEditor value={python || algorithmCode(info.program!)} language="python" readOnly compact/> : <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-800 scrollbar-hide">{data.formula}</pre>}
        </div>
        <dl className="grid gap-4 text-xs sm:grid-cols-2"><div><dt className="mb-1 font-medium text-slate-800">计算输出</dt><dd className="leading-6 text-slate-600">{info.profile?.output || data.name} · {factorOutputs[data.outputType]} · {data.units}</dd></div><div><dt className="mb-1 font-medium text-slate-800">市场与周期</dt><dd className="leading-6 text-slate-600">{info.profile?.marketScope}<br/>{data.timeframe}</dd></div></dl>
        {!!info.profile?.states.length && <details className="text-xs leading-6 text-slate-600"><summary className="cursor-pointer">算法内部状态 · {info.profile.states.length} 项</summary><p className="mt-2 break-words">{info.profile.states.join('、')}。这些变量在算法内部更新，不需要额外传入。</p></details>}
    </section>;
}
