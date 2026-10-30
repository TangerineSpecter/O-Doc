import { useMemo, useState } from 'react';
import {
    Check,
    ChevronDown,
    Copy,
    Cpu,
    Eye,
    FileCode,
    Layers,
    LayoutGrid,
    Lightbulb,
    Maximize2,
    Minimize2,
    Quote,
    Scale,
    Search,
    SlidersHorizontal,
    Table2,
    TrendingUp,
    X,
} from 'lucide-react';
import type { QuantAnalysis } from '../../../types/api/quant';
import {
    readingParameterDefault,
    readingParameterGroup,
    readingParameterName,
} from '../../../utils/quantParameterReading';
import { ParameterSource } from '../ParameterSource';

type Parameter = QuantAnalysis['parameters'][number];
type Filter = 'input' | 'display' | 'internal' | 'all';

const filterMeta: Record<Filter, { label: string; Icon: typeof SlidersHorizontal }> = {
    input: { label: '计算参数', Icon: SlidersHorizontal },
    display: { label: '显示设置', Icon: Eye },
    internal: { label: '内部常量与状态', Icon: Cpu },
    all: { label: '全部', Icon: Layers },
};

const filters: Filter[] = ['input', 'display', 'internal', 'all'];

const groupBadges: Record<'input' | 'display' | 'internal', { label: string; border: string; bg: string; text: string }> = {
    input: { label: '计算参数', border: 'border-orange-200/80', bg: 'bg-orange-50/80', text: 'text-orange-700' },
    display: { label: '显示设置', border: 'border-sky-200/80', bg: 'bg-sky-50/80', text: 'text-sky-700' },
    internal: { label: '内部常量/状态', border: 'border-slate-200', bg: 'bg-slate-100', text: 'text-slate-600' },
};

function ParameterDetailsDrawer({
    parameter,
    isOpen,
    onToggle,
}: {
    parameter: Parameter;
    isOpen: boolean;
    onToggle: () => void;
}) {
    const hasAnyDetail = Boolean(
        parameter.constraints || parameter.suggestion || parameter.evidence || parameter.sourceBinding
    );

    if (!hasAnyDetail) return null;

    let itemsCount = 0;
    if (parameter.constraints) itemsCount++;
    if (parameter.suggestion) itemsCount++;
    if (parameter.sourceBinding) itemsCount++;
    if (parameter.evidence) itemsCount++;

    return (
        <div className="border-t border-slate-100 pt-3">
            <button
                type="button"
                onClick={onToggle}
                className="group flex w-full items-center justify-between text-xs font-medium text-slate-500 hover:text-orange-600 transition-colors"
                aria-expanded={isOpen}
            >
                <span className="flex items-center gap-1.5">
                    <FileCode size={13} className={isOpen ? 'text-orange-500' : 'text-slate-400 group-hover:text-orange-500'} />
                    <span>查看范围、建议与源码依据</span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] text-slate-500">
                        {itemsCount} 项
                    </span>
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-400 group-hover:text-orange-600">
                    <span>{isOpen ? '收起' : '展开'}</span>
                    <ChevronDown
                        size={13}
                        className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180 text-orange-500' : ''}`}
                    />
                </span>
            </button>

            {isOpen && (
                <div className="mt-3 space-y-2.5 break-words">
                    {parameter.constraints && (
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs leading-6">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-0.5">
                                <Scale size={12} className="text-slate-500 shrink-0" />
                                <span>范围与关联约束</span>
                            </div>
                            <p className="text-slate-600">{parameter.constraints}</p>
                        </div>
                    )}
                    {parameter.suggestion && (
                        <div className="rounded-xl border border-sky-200/80 bg-sky-50/60 p-3 text-xs leading-6">
                            <div className="flex items-center gap-1.5 font-semibold text-sky-900 mb-0.5">
                                <Lightbulb size={12} className="text-sky-600 shrink-0" />
                                <span>研究建议</span>
                            </div>
                            <p className="text-sky-800">{parameter.suggestion}</p>
                        </div>
                    )}
                    <ParameterSource parameter={parameter} />
                    {parameter.evidence && (
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs leading-6">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1">
                                <Quote size={12} className="text-slate-500 shrink-0" />
                                <span>原文依据</span>
                            </div>
                            <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-white p-2.5 font-mono text-[11px] text-slate-700 scrollbar-hide">
                                {parameter.evidence}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function ReportParameters({ parameters }: { parameters: QuantAnalysis['parameters'] | undefined }) {
    const [filter, setFilter] = useState<Filter>('input');
    const [layout, setLayout] = useState<'cards' | 'table'>('cards');
    const [searchQuery, setSearchQuery] = useState('');
    const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const count = (key: Filter) =>
        key === 'all'
            ? parameters?.length || 0
            : parameters?.filter(p => readingParameterGroup(p) === key).length || 0;

    const activeFilter =
        filter === 'input' && count('input') === 0
            ? count('display')
                ? 'display'
                : 'internal'
            : filter;

    const visibleByCategory = useMemo(() => {
        if (!parameters?.length) return [];
        return activeFilter === 'all'
            ? parameters
            : parameters.filter(p => readingParameterGroup(p) === activeFilter);
    }, [parameters, activeFilter]);

    const visible = useMemo(() => {
        if (!searchQuery.trim()) return visibleByCategory;
        const q = searchQuery.toLowerCase().trim();
        return visibleByCategory.filter(p => {
            const name = readingParameterName(p);
            return (
                name.title.toLowerCase().includes(q) ||
                name.symbol.toLowerCase().includes(q) ||
                (p.meaning && p.meaning.toLowerCase().includes(q)) ||
                (p.effect && p.effect.toLowerCase().includes(q)) ||
                (p.defaultValue && p.defaultValue.toLowerCase().includes(q))
            );
        });
    }, [visibleByCategory, searchQuery]);

    const allKeys = useMemo(
        () => visible.map((p, idx) => `${p.name}-${idx}`),
        [visible]
    );

    const isAllExpanded = allKeys.length > 0 && allKeys.every(k => openKeys[k]);

    const toggleAll = () => {
        if (isAllExpanded) {
            setOpenKeys({});
        } else {
            const next: Record<string, boolean> = {};
            allKeys.forEach(k => {
                next[k] = true;
            });
            setOpenKeys(next);
        }
    };

    const toggleSingle = (key: string) => {
        setOpenKeys(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleCopy = (text: string, key: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 1500);
        }).catch(() => {});
    };

    if (!parameters?.length) {
        return (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                <SlidersHorizontal size={22} className="mx-auto mb-2 text-slate-400" />
                <p className="text-sm leading-7 text-slate-500">这份报告没有单独保存参数记录，请查看报告正文。</p>
            </div>
        );
    }

    return (
        <section className="space-y-4" aria-label="AI 参数分析">
            {/* 顶栏说明与工具栏 */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-slate-50/60 px-4 py-2.5">
                <p className="text-xs text-slate-600">
                    参数说明来自 AI 原稿解读；源码默认值不代表实际运行配置。
                </p>

                <div className="flex items-center gap-2">
                    {/* 一键全部展开 / 收起 */}
                    {visible.length > 0 && (
                        <button
                            type="button"
                            onClick={toggleAll}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-2xs hover:border-orange-200 hover:bg-orange-50/30 hover:text-orange-700 transition-colors whitespace-nowrap"
                        >
                            {isAllExpanded ? (
                                <>
                                    <Minimize2 size={12} />
                                    <span>全部收起</span>
                                </>
                            ) : (
                                <>
                                    <Maximize2 size={12} />
                                    <span>全部展开</span>
                                </>
                            )}
                        </button>
                    )}

                    {/* 视图切换：卡片 vs 总表 */}
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                        {([
                            { value: 'cards', text: '卡片', Icon: LayoutGrid },
                            { value: 'table', text: '总表', Icon: Table2 },
                        ] as const).map(({ value, text, Icon }) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setLayout(value)}
                                aria-pressed={layout === value}
                                className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                                    layout === value
                                        ? 'bg-orange-50 text-orange-600 font-semibold'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <Icon size={12} />
                                {text}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* 筛选标签与搜索输入栏 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                {/* 分类胶囊标签 */}
                <div className="flex flex-wrap items-center gap-1.5" aria-label="参数分类">
                    {filters
                        .filter(item => item === 'all' || count(item) > 0)
                        .map(item => {
                            const meta = filterMeta[item];
                            const Icon = meta.Icon;
                            const isActive = activeFilter === item;
                            const itemCount = count(item);
                            return (
                                <button
                                    key={item}
                                    type="button"
                                    aria-pressed={isActive}
                                    onClick={() => setFilter(item)}
                                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                                        isActive
                                            ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/25 ring-2 ring-orange-500/20'
                                            : 'border border-slate-200/80 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50/30 hover:text-orange-700'
                                    }`}
                                >
                                    <Icon size={12} className={isActive ? 'text-white' : 'text-slate-400'} />
                                    <span>{meta.label}</span>
                                    <span
                                        className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
                                            isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                                        }`}
                                    >
                                        {itemCount}
                                    </span>
                                </button>
                            );
                        })}
                </div>

                {/* 快速搜索框 */}
                <div className="relative min-w-44 flex-1 sm:w-64 sm:flex-initial">
                    <Search
                        size={13}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="搜索参数名、标识或用途..."
                        className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            aria-label="清空搜索"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* 参数内容列表 */}
            {!visible.length ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-2">
                    <p className="text-sm font-medium text-slate-700">没有匹配的参数记录</p>
                    <p className="text-xs text-slate-400">
                        {searchQuery
                            ? `未找到与“${searchQuery}”相关的参数，请尝试其他关键词。`
                            : '当前分类下没有单独记录参数，可切换其他分类或全部参数。'}
                    </p>
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                        >
                            清除搜索过滤
                        </button>
                    )}
                </div>
            ) : layout === 'table' ? (
                /* 总表视图 */
                <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-2xs scrollbar-hide">
                    <table className="w-full min-w-[680px] text-left text-sm">
                        <thead className="bg-slate-50/90 text-xs font-semibold text-slate-600 border-b border-slate-200/80">
                            <tr>
                                <th className="px-4 py-3">参数与标识</th>
                                <th className="px-4 py-3">源码默认值</th>
                                <th className="px-4 py-3">分类 / 类型</th>
                                <th className="px-4 py-3">作用与变化影响</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {visible.map((parameter, index) => {
                                const key = `${parameter.name}-${index}`;
                                const name = readingParameterName(parameter);
                                const group = readingParameterGroup(parameter);
                                const badge = groupBadges[group];
                                const isOpen = Boolean(openKeys[key]);
                                return (
                                    <tr key={key} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3.5 align-top">
                                            <div className="space-y-1">
                                                <div className="font-bold text-slate-900">{name.title}</div>
                                                <div className="flex items-center gap-1">
                                                    <code className="rounded border border-slate-200/70 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                                                        {name.symbol}
                                                    </code>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopy(name.symbol, key)}
                                                        title="复制参数标识"
                                                        className="p-0.5 text-slate-400 hover:text-orange-600 transition-colors"
                                                    >
                                                        {copiedKey === key ? (
                                                            <Check size={11} className="text-lime-600" />
                                                        ) : (
                                                            <Copy size={11} />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5 align-top">
                                            <span className="inline-flex rounded-lg border border-orange-200/80 bg-orange-50/80 px-2 py-0.5 font-mono text-xs font-semibold text-orange-800">
                                                {readingParameterDefault(parameter)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5 align-top">
                                            <div className="space-y-1">
                                                <span
                                                    className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${badge.border} ${badge.bg} ${badge.text}`}
                                                >
                                                    {badge.label}
                                                </span>
                                                {parameter.type && parameter.type !== 'unknown' && (
                                                    <span className="block font-mono text-[10px] text-slate-400">
                                                        {parameter.type}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="space-y-2 px-4 py-3.5 align-top text-xs leading-6 text-slate-700">
                                            <p className="text-slate-800">{parameter.meaning || '暂无说明'}</p>
                                            {parameter.effect && (
                                                <div className="rounded-lg border border-amber-200/60 bg-amber-50/40 p-2.5 text-slate-700">
                                                    <span className="font-semibold text-amber-900">变化影响：</span>
                                                    {parameter.effect}
                                                </div>
                                            )}
                                            <ParameterDetailsDrawer
                                                parameter={parameter}
                                                isOpen={isOpen}
                                                onToggle={() => toggleSingle(key)}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                /* 卡片视图 */
                <div className="space-y-3.5">
                    {visible.map((parameter, index) => {
                        const key = `${parameter.name}-${index}`;
                        const name = readingParameterName(parameter);
                        const group = readingParameterGroup(parameter);
                        const badge = groupBadges[group];
                        const isOpen = Boolean(openKeys[key]);

                        return (
                            <article
                                key={key}
                                className="group relative space-y-3.5 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs hover:border-orange-200 hover:shadow-sm transition-all duration-200"
                            >
                                {/* 卡片头部 */}
                                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-100 pb-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {/* 分类徽章 */}
                                        <span
                                            className={`rounded-md border px-2 py-0.5 text-xs font-medium ${badge.border} ${badge.bg} ${badge.text}`}
                                        >
                                            {badge.label}
                                        </span>

                                        {/* 参数标题 */}
                                        <h3 className="break-words text-base font-bold text-slate-900 tracking-tight">
                                            {name.title}
                                        </h3>

                                        {/* 代码标识 */}
                                        <div className="inline-flex items-center gap-1 rounded-md border border-slate-200/70 bg-slate-100 px-2 py-0.5">
                                            <code className="font-mono text-xs text-slate-600 select-all">
                                                {name.symbol}
                                            </code>
                                            <button
                                                type="button"
                                                onClick={() => handleCopy(name.symbol, key)}
                                                title="复制标识"
                                                className="text-slate-400 hover:text-orange-600 transition-colors"
                                            >
                                                {copiedKey === key ? (
                                                    <Check size={11} className="text-lime-600" />
                                                ) : (
                                                    <Copy size={11} />
                                                )}
                                            </button>
                                        </div>

                                        {/* 类型标记 */}
                                        {parameter.type && parameter.type !== 'unknown' && (
                                            <span className="font-mono text-[11px] text-slate-400">
                                                ({parameter.type})
                                            </span>
                                        )}
                                    </div>

                                    {/* 源码默认值 */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-xs font-medium text-slate-400">源码默认</span>
                                        <span className="inline-flex items-center font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-orange-50/80 border border-orange-200/80 text-orange-800 shadow-2xs">
                                            {readingParameterDefault(parameter)}
                                        </span>
                                    </div>
                                </div>

                                {/* 用途说明 */}
                                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                                    {parameter.meaning || '暂无用途说明'}
                                </p>

                                {/* 变化影响与敏感度 */}
                                {parameter.effect && (
                                    <div className="rounded-xl border border-amber-200/70 bg-gradient-to-r from-amber-50/50 via-orange-50/30 to-amber-50/20 p-3.5 text-xs leading-6 text-slate-700">
                                        <div className="flex items-center gap-1.5 font-bold text-amber-900 mb-1">
                                            <TrendingUp size={13} className="text-amber-600 shrink-0" />
                                            <span>变化影响与参数敏感度</span>
                                        </div>
                                        <p className="whitespace-pre-wrap break-words font-sans text-slate-700">
                                            {parameter.effect}
                                        </p>
                                    </div>
                                )}

                                {/* 展开依据抽屉 */}
                                <ParameterDetailsDrawer
                                    parameter={parameter}
                                    isOpen={isOpen}
                                    onToggle={() => toggleSingle(key)}
                                />
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
