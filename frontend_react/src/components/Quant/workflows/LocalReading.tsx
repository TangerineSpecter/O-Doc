import {readLocalReading,readingLocations} from '../../../utils/quantLocalReading';

export function LocalReading({json}: {json: string}) {
    let value;
    try {value = readLocalReading(json);} catch (cause) {return <p role="alert" className="text-sm text-red-700">{cause instanceof Error ? cause.message : '片段解读无法读取'}</p>;}
    const components=value.scope==='declared_dependency_components_not_runtime_semantics';
    const reused = value.units.filter(unit => unit.reused_from.outcome_id).length;
    return <section className="space-y-4 text-sm" aria-label="局部片段解读与复用依据">
        <p className="leading-7 text-slate-600">共 {value.units.length} 个{components?'组件':'不同片段'}，沿用 {reused} 个，重新解读 {value.units.length - reused} 个。{value.omitted > 0 ? `另有 ${value.omitted} 个片段超出局部解读预算；全局阶段仍核对完整原文。` : ''}</p>
        <p className="text-xs leading-6 text-slate-500">{value.notice}{components?'引文位置按本次各依赖正文分别映射；组合标记不是源码。':'下列行号已映射到本次源码；原解读只使用片段内的相对行号。'}</p>
        {!value.units.length && <p className="text-slate-500">没有可解读的源码片段，本阶段未调用模型。</p>}
        <div className="divide-y divide-slate-200">{value.units.map((unit, index) => <details key={unit.input_hash} className="py-3" open={index === 0}>
            <summary className="cursor-pointer leading-6"><strong className="font-medium">{components?'组件':'片段'} {index + 1}</strong><span className="ml-3 text-xs text-slate-500">{unit.reused_from.outcome_id ? '沿用局部 AI 解读' : '本次 AI 解读'} · {unit.locations.map(row => `L${row.start_line}–${row.end_line}`).join('、')}</span></summary>
            <div className="mt-3 space-y-3">{unit.component && <div className="space-y-2 text-xs leading-6 text-slate-500"><p className="break-words font-medium">{unit.component.name}</p><p>{unit.component.mode==='static_declared_dependencies'?'按已提供的静态声明链分析；依赖改变会重新解读。':'依赖影响尚不完整；任何源码改变均重新解读此组件。'}</p><ul className="space-y-1">{unit.component.parts.map((part,i)=><li key={i} className="break-words">{part.name} · L{part.start_line}–{part.end_line}</li>)}</ul>{unit.component.uncertainties.map((text,i)=><p key={i}>{text}</p>)}</div>}{unit.observations.map((observation, itemIndex) => <div key={itemIndex} className="rounded-lg bg-white p-3">
                <p className="mb-2 text-xs text-slate-500">AI 局部解读 · {readingLocations(unit,observation).join('、')}</p>
                <p className="leading-7">{observation.reading}</p><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-600 scrollbar-hide">{observation.quote}</pre>
            </div>)}
            {!!unit.unknowns.length && <div className="text-xs leading-6 text-slate-500"><p className="font-medium">此片段不能确定</p>{unit.unknowns.map((text, i) => <p key={i}>{text}</p>)}</div>}
            {unit.reused_from.outcome_id && <p className="break-all text-xs leading-6 text-slate-500">原解读快照：{unit.reused_from.outcome_id}<br/>相同输入标识：{unit.input_hash}</p>}
            </div>
        </details>)}</div>
    </section>;
}
