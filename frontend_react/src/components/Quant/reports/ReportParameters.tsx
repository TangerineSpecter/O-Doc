import { useState } from 'react';
import { LayoutGrid, SlidersHorizontal, Table2 } from 'lucide-react';
import type { QuantAnalysis } from '../../../types/api/quant';
import { readingParameterDefault, readingParameterGroup, readingParameterName } from '../../../utils/quantParameterReading';
import { ParameterSource } from '../ParameterSource';

type Parameter = QuantAnalysis['parameters'][number];
type Filter = 'input' | 'display' | 'internal' | 'all';
const filters: { key: Filter; label: string }[] = [
    {key: 'input', label: '计算参数'}, {key: 'display', label: '显示设置'},
    {key: 'internal', label: '内部常量与状态'}, {key: 'all', label: '全部'},
];

function ParameterDetails({ parameter }: { parameter: Parameter }) {
    return <details className="border-t border-slate-100 pt-3 text-xs leading-6 text-slate-600">
        <summary className="cursor-pointer font-medium hover:text-orange-600">查看范围、建议与源码依据</summary>
        <div className="mt-3 space-y-2 break-words">
            {parameter.constraints && <p><span className="font-medium text-slate-700">范围与关联：</span>{parameter.constraints}</p>}
            {parameter.suggestion && <p><span className="font-medium text-slate-700">研究建议：</span>{parameter.suggestion}</p>}
            <ParameterSource parameter={parameter} />
            {parameter.evidence && <p className="whitespace-pre-wrap"><span className="font-medium text-slate-700">原文依据：</span>{parameter.evidence}</p>}
        </div>
    </details>;
}

export function ReportParameters({ parameters }: { parameters: QuantAnalysis['parameters'] | undefined }) {
    const [filter, setFilter] = useState<Filter>('input');
    const [layout, setLayout] = useState<'cards' | 'table'>('cards');
    if (!parameters?.length) return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
        <SlidersHorizontal size={22} className="mx-auto mb-2 text-slate-400" />
        <p className="text-sm leading-7 text-slate-500">这份报告没有单独保存参数记录，请查看报告正文。</p>
    </div>;

    const count = (key: Filter) => key === 'all' ? parameters.length : parameters.filter(p => readingParameterGroup(p) === key).length;
    const activeFilter = filter === 'input' && count('input') === 0 ? (count('display') ? 'display' : 'internal') : filter;
    const visible = activeFilter === 'all' ? parameters : parameters.filter(p => readingParameterGroup(p) === activeFilter);
    return <section className="space-y-4" aria-label="AI 参数分析">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm leading-6 text-slate-600">参数说明来自 AI 原稿；源码默认值不代表实际运行配置。</p>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                {([{value: 'cards', text: '卡片', Icon: LayoutGrid}, {value: 'table', text: '总表', Icon: Table2}] as const).map(({value, text, Icon}) =>
                    <button key={value} type="button" onClick={() => setLayout(value)} aria-pressed={layout === value}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${layout === value ? 'bg-orange-50 text-orange-600' : 'text-slate-500 hover:text-slate-800'}`}>
                        <Icon size={13} />{text}</button>)}
            </div>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="参数分类">
            {filters.filter(item => item.key === 'all' || count(item.key) > 0).map(item => <button key={item.key} type="button"
                aria-pressed={activeFilter === item.key} onClick={() => setFilter(item.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${activeFilter === item.key ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {item.label}（{count(item.key)}）</button>)}
        </div>
        {!visible.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">没有单独记录计算参数，可查看其他分类或全部参数。</p> : layout === 'table' ?
            <div className="overflow-x-auto rounded-xl border border-slate-200 scrollbar-hide"><table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">参数</th><th className="px-4 py-3">源码默认值</th><th className="px-4 py-3">作用与变化影响</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{visible.map((parameter, index) => {
                    const name = readingParameterName(parameter);
                    return <tr key={`${parameter.name}-${index}`}><td className="px-4 py-3 align-top font-medium text-slate-900">{name.title}</td>
                        <td className="px-4 py-3 align-top text-slate-700">{readingParameterDefault(parameter)}</td>
                        <td className="space-y-1 px-4 py-3 align-top text-slate-700"><p>{parameter.meaning || '暂无说明'}</p>{parameter.effect && <p>{parameter.effect}</p>}<ParameterDetails parameter={parameter}/></td></tr>;
                })}</tbody></table></div> :
            <div className="space-y-3">{visible.map((parameter, index) => {
                const name = readingParameterName(parameter);
                return <article key={`${parameter.name}-${index}`} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h3 className="break-words text-base font-semibold text-slate-900">{name.title}{name.title !== name.symbol && <span className="ml-2 text-xs font-normal text-slate-400">{name.symbol}</span>}</h3>
                        <p className="text-sm text-slate-500">源码默认：<span className="font-medium text-slate-800">{readingParameterDefault(parameter)}</span></p>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{parameter.meaning || '暂无用途说明'}</p>
                    {parameter.effect && <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700"><span className="font-medium text-slate-500">变化影响：</span>{parameter.effect}</p>}
                    <ParameterDetails parameter={parameter}/>
                </article>;
            })}</div>}
    </section>;
}
