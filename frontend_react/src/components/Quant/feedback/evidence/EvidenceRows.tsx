import {useState, type ReactNode} from 'react';
import {QuantButton} from '../../ui';

/** All frozen rows remain accessible without rendering a 2,000-row document at once. */
export function EvidenceRows<T>({items, render, empty = '未提供记录'}: {items: T[]; render: (item: T, index: number) => ReactNode; empty?: string}) {
    const [requestedPage, setPage] = useState(0);
    const page = Math.min(requestedPage, Math.max(0, Math.ceil(items.length / 25) - 1));
    const offset = page * 25;
    if (!items.length) return <p className="text-xs leading-6 text-slate-500">{empty}</p>;
    return <div className="space-y-3"><div className="divide-y divide-slate-100">{items.slice(offset, offset + 25).map((item, index) => <div key={offset + index} className="py-3">{render(item, offset + index)}</div>)}</div>
        {items.length > 25 && <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>第 {offset + 1}–{Math.min(offset + 25, items.length)} 项 / 共 {items.length} 项</span><div className="flex gap-2"><QuantButton disabled={!page} onClick={() => setPage(page - 1)}>上一页</QuantButton><QuantButton disabled={offset + 25 >= items.length} onClick={() => setPage(page + 1)}>下一页</QuantButton></div></div>}
    </div>;
}
