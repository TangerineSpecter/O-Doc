import {useState} from 'react';
import {ArrowDown, ArrowUp, Trophy} from 'lucide-react';
import type {AnalyticsComparison} from '../../../types/api/residentAnalytics';
import {analyticsMoney, sortAnalyticsResidents} from '../../../utils/residentAnalytics';
import type {ComparisonColumn} from '../../../utils/residentAnalytics';
import AgentAvatar from '../AgentAvatar';

const columns: {key: ComparisonColumn; label: string}[] = [
    {key: 'activeDays', label: '活跃天数'},
    {key: 'publications', label: '作品'},
    {key: 'interactions', label: '主动互动'},
    {key: 'income', label: '收入'},
    {key: 'expense', label: '支出'},
    {key: 'net', label: '净收支'},
];

export default function ResidentsComparison({rows}: {rows: AnalyticsComparison[]}) {
    const [column, setColumn] = useState<ComparisonColumn>('activeDays');
    const [descending, setDescending] = useState(true);

    const sortedRows = sortAnalyticsResidents(rows, column, descending);

    return (
        <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full min-w-[700px] text-xs">
                <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-slate-500">
                        <th className="py-2.5 pl-3 pr-2 text-left font-medium w-12 text-center">排名</th>
                        <th className="py-2.5 px-3 text-left font-medium">居民</th>
                        {columns.map(item => {
                            const isCurrent = column === item.key;
                            return (
                                <th
                                    key={item.key}
                                    aria-sort={isCurrent ? (descending ? 'descending' : 'ascending') : 'none'}
                                    className="px-3 py-2.5 text-right font-medium"
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isCurrent) {
                                                setDescending(!descending);
                                            } else {
                                                setColumn(item.key);
                                                setDescending(true);
                                            }
                                        }}
                                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-slate-200/60 focus-visible:ring-2 focus-visible:ring-orange-300 ${
                                            isCurrent ? 'bg-orange-100/60 font-bold text-orange-700' : 'text-slate-600'
                                        }`}
                                    >
                                        <span>{item.label}</span>
                                        {isCurrent && (
                                            descending ? <ArrowDown className="h-3 w-3 shrink-0"/> : <ArrowUp className="h-3 w-3 shrink-0"/>
                                        )}
                                    </button>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {sortedRows.map((row, index) => {
                        const rank = index + 1;
                        const rankBadge = rank === 1
                            ? 'bg-amber-100 text-amber-700 font-bold'
                            : rank === 2
                              ? 'bg-slate-200 text-slate-700 font-semibold'
                              : rank === 3
                                ? 'bg-orange-100 text-orange-800 font-semibold'
                                : 'text-slate-400 font-normal';

                        const netStr = String(row.net);
                        const isNetNegative = netStr.startsWith('-');
                        const isNetZero = netStr === '0' || netStr === '0.00';

                        return (
                            <tr key={row.id} className="transition-colors hover:bg-orange-50/20">
                                <td className="py-3 pl-3 pr-2 text-center">
                                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${rankBadge}`}>
                                        {rank}
                                    </span>
                                </td>
                                <td className="px-3 py-3">
                                    <div className="flex items-center gap-2.5">
                                        <AgentAvatar name={row.name} avatar={row.avatar} size="xs"/>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="truncate font-semibold text-slate-800" title={row.name}>
                                                    {row.name}
                                                </span>
                                                {row.departed && (
                                                    <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-400">
                                                        已离开
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                {columns.map(item => {
                                    const val = row[item.key];
                                    if (item.key === 'net') {
                                        return (
                                            <td key={item.key} className="whitespace-nowrap px-3 py-3 text-right tabular-nums font-medium">
                                                <span className={isNetZero ? 'text-slate-400' : isNetNegative ? 'text-rose-600' : 'text-emerald-600'}>
                                                    {analyticsMoney(netStr)}
                                                </span>
                                            </td>
                                        );
                                    }
                                    if (item.key === 'income') {
                                        return (
                                            <td key={item.key} className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-emerald-700 font-medium">
                                                {analyticsMoney(String(val))}
                                            </td>
                                        );
                                    }
                                    if (item.key === 'expense') {
                                        return (
                                            <td key={item.key} className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-rose-600 font-medium">
                                                {analyticsMoney(String(val))}
                                            </td>
                                        );
                                    }
                                    return (
                                        <td key={item.key} className="whitespace-nowrap px-3 py-3 text-right tabular-nums font-semibold text-slate-700">
                                            {typeof val === 'string' ? analyticsMoney(val) : val}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {!rows.length && (
                <div className="py-10 text-center text-xs text-slate-400">
                    <Trophy className="mx-auto mb-2 h-6 w-6 text-slate-300"/>
                    <p>统计区间内暂无居民对比数据</p>
                </div>
            )}
        </div>
    );
}
