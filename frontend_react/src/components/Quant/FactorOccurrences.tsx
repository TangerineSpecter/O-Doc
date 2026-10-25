import {useState} from 'react';
import {useQuantOccurrences} from '../../hooks/useQuantOccurrences';
import type {QuantFactorCandidate, QuantFactorGrouping} from '../../types/api/quant';
import {quantDate} from '../../utils/quant';
import {QuantButton, QuantModal} from './ui';
export function FactorOccurrences({collection, candidate, mode, close, inspect, openSource}: {
    collection: string; candidate: QuantFactorCandidate; mode: QuantFactorGrouping; close: () => void;
    inspect: (candidate: QuantFactorCandidate) => void; openSource: (candidate: QuantFactorCandidate) => void;
}) {
    const [offset, setOffset] = useState(0);
    const state = useQuantOccurrences(collection, candidate.id, mode, offset);
    return <QuantModal title="同组来源记录" close={close}>
        <p className="text-sm leading-6 text-slate-500">{mode === 'merged' ? '按用户主动合并边形成的逻辑分组展示全部成员。每条直接样本证据需单独查看，同组不代表任意两成员已证等价；撤销可拆组。' : `只按${mode === 'raw' ? '原始源码及契约' : '表达式及契约'}分组。每次提取、人工整理与报告独立保留，尚未验证平台等价或实际表现。`}</p>
        {state.loading ? <p role="status" className="text-sm text-slate-500">正在加载来源…</p> : state.error ? <div role="alert" className="space-y-3 text-sm text-red-600"><p>{state.error}</p><QuantButton onClick={state.retry}>重试</QuantButton></div> : <>
            <p className="text-xs text-slate-500">共 {state.total} 条有效来源</p>
            {state.items.map(item => <section key={item.id} className="space-y-3 rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold">{item.curation.name}</h3><p className="text-xs leading-6 text-slate-500">{item.entryTitle}<br />{quantDate(item.createdAt)} · {item.modelName}</p><div className="flex flex-wrap gap-2"><QuantButton onClick={() => inspect(item)}>查看这次提取</QuantButton><QuantButton onClick={() => openSource(item)}>打开来源报告</QuantButton></div></section>)}
            {state.total > 20 && <div className="flex justify-end gap-2"><QuantButton disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 20))}>上一页</QuantButton><QuantButton disabled={offset + 20 >= state.total} onClick={() => setOffset(value => value + 20)}>下一页</QuantButton></div>}
        </>}
    </QuantModal>;
}
