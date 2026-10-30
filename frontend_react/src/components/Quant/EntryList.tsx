import { useMemo, useState } from 'react';
import {
    Activity,
    Award,
    ArrowUpDown,
    ArrowUpRight,
    FlaskConical,
    Layers,
    Plus,
    RotateCcw,
    Search,
    Sparkles,
    X,
} from 'lucide-react';
import { Select } from '../common/Select';
import { QuantButton, inputClass } from './ui';
import { quantKindOptions as kindOptions, quantLanguageOptions as languageOptions } from '../../utils/quant';
import type { QuantEntry, QuantKind } from '../../types/api/quant';

const kindMeta: Record<
    QuantKind,
    { label: string; badgeClass: string; activeBadgeClass: string; barClass: string; icon: typeof FlaskConical }
> = {
    factor: {
        label: '因子',
        badgeClass: 'bg-orange-50 text-orange-700 border-orange-200/70',
        activeBadgeClass: 'border-orange-500/40 bg-orange-500/20 text-orange-300',
        barClass: 'bg-orange-400',
        icon: Sparkles,
    },
    indicator: {
        label: '指标',
        badgeClass: 'bg-sky-50 text-sky-700 border-sky-200/70',
        activeBadgeClass: 'border-sky-500/40 bg-sky-500/20 text-sky-300',
        barClass: 'bg-sky-400',
        icon: Activity,
    },
    strategy: {
        label: '策略',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
        activeBadgeClass: 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300',
        barClass: 'bg-emerald-400',
        icon: Layers,
    },
};

function summarizeMarkdown(content?: string): string {
    if (!content) return '';
    return content
        .replace(/\$\$[\s\S]*?\$\$/g, ' [公式] ')
        .replace(/[#>*`~_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function EntryList({
    entries,
    current,
    loading,
    busy,
    select,
    create,
    language,
    setLanguage,
}: {
    language: string;
    setLanguage: (value: string) => void;
    entries: QuantEntry[];
    current: string;
    loading: boolean;
    busy: boolean;
    select: (id: string) => void;
    create: () => void;
}) {
    const [search, setSearch] = useState('');
    const [kind, setKind] = useState('');
    const [sortBy, setSortBy] = useState<'updated' | 'title'>('updated');

    const kindCounts = useMemo(() => {
        const counts: Record<string, number> = { '': entries.length, factor: 0, indicator: 0, strategy: 0 };
        for (const item of entries) {
            counts[item.kind] = (counts[item.kind] || 0) + 1;
        }
        return counts;
    }, [entries]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        const list = entries.filter(
            (entry) =>
                (!kind || entry.kind === kind) &&
                (!query ||
                    [entry.title, entry.content, ...entry.tags]
                        .join(' ')
                        .toLowerCase()
                        .includes(query)),
        );
        if (sortBy === 'title') {
            return [...list].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
        }
        return list;
    }, [entries, kind, search, sortBy]);

    const hasFilters = Boolean(search.trim() || kind || language);

    return (
        <>
            <div className="shrink-0 space-y-2.5 border-b border-slate-200/80 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold tracking-wide text-slate-700">
                            研究目录
                        </span>
                        <span className="inline-flex items-center rounded-full border border-orange-200/70 bg-orange-50 px-2 py-0.5 font-mono text-[10px] font-bold text-orange-600">
                            {filtered.length === entries.length
                                ? entries.length
                                : `${filtered.length}/${entries.length}`}
                        </span>
                    </div>
                    <QuantButton primary size="sm" disabled={busy} onClick={create} className="!px-2.5 !py-1 !text-xs">
                        <Plus size={13} />
                        收集并分析
                    </QuantButton>
                </div>

                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                    <input
                        aria-label="搜索研究标题或标签"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="检索标题、公式或 #标签…"
                        className={`${inputClass} !py-1.5 !pl-8 !pr-7 !text-xs`}
                    />
                    {search && (
                        <button
                            type="button"
                            aria-label="清空搜索词"
                            onClick={() => setSearch('')}
                            className="absolute right-2 top-1.5 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>

                {/* 类型胶囊单行紧凑切换 */}
                <div
                    role="group"
                    aria-label="研究类型筛选"
                    className="grid grid-cols-4 gap-1 rounded-lg bg-slate-200/60 p-0.5"
                >
                    {[{ value: '', label: '全部' }, ...kindOptions].map((option) => {
                        const active = kind === option.value;
                        const count = kindCounts[option.value] ?? 0;
                        return (
                            <button
                                key={option.value || 'all'}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setKind(option.value)}
                                className={`flex items-center justify-center gap-1 rounded-md px-1 py-1 text-[11px] font-semibold whitespace-nowrap transition-all ${
                                    active
                                        ? 'bg-white text-slate-900 shadow-2xs'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <span>{option.label}</span>
                                <span
                                    className={`font-mono text-[10px] ${
                                        active ? 'text-orange-500' : 'text-slate-400'
                                    }`}
                                >
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* 语言筛选 + 排序切换 */}
                <div className="flex items-center gap-1.5">
                    <div className="min-w-0 flex-1">
                        <Select
                            value={language}
                            options={[
                                { value: '', label: '全部代码语言' },
                                ...languageOptions,
                                { value: 'tongdaxin', label: '通达信公式' },
                                { value: 'text', label: '其他 / 纯文本' },
                            ]}
                            onChange={setLanguage}
                            buttonClassName="!h-7 !min-h-7 !py-0.5 !text-[11px]"
                        />
                    </div>
                    <button
                        type="button"
                        aria-label={sortBy === 'updated' ? '当前按更新时间排序，点击按标题排序' : '当前按标题排序，点击按更新时间排序'}
                        title={sortBy === 'updated' ? '按更新时间排序' : '按标题排序'}
                        onClick={() => setSortBy((prev) => (prev === 'updated' ? 'title' : 'updated'))}
                        className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 transition hover:border-orange-200 hover:text-orange-600"
                    >
                        <ArrowUpDown size={11} />
                        {sortBy === 'updated' ? '最新' : '名称'}
                    </button>
                </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2.5 scrollbar-hide">
                {loading ? (
                    Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className="h-24 animate-pulse rounded-xl border border-slate-100 bg-slate-100/70" />
                    ))
                ) : filtered.length ? (
                    filtered.map((entry, idx) => {
                        const isSelected = current === entry.id;
                        const meta = kindMeta[entry.kind] || kindMeta.factor;
                        const KindIcon = meta.icon;
                        const snippet = summarizeMarkdown(entry.content);
                        return (
                            <button
                                type="button"
                                key={entry.id}
                                onClick={() => select(entry.id)}
                                className={`group relative w-full overflow-hidden rounded-xl border p-3 pl-7 text-left transition-all duration-150 ${
                                    isSelected
                                        ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                                        : 'border-slate-200/80 bg-white hover:border-orange-200 hover:bg-slate-50/70'
                                }`}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`absolute bottom-3 left-3 top-3 w-1 rounded-full ${meta.barClass}`}
                                />
                                <div className="mb-1.5 flex items-center gap-1.5">
                                    <span
                                        className={`font-mono text-[10px] font-bold ${
                                            isSelected ? 'text-orange-400' : 'text-slate-300'
                                        }`}
                                    >
                                        {String(idx + 1).padStart(2, '0')}
                                    </span>
                                    <span
                                        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.2 text-[10px] font-semibold transition-colors ${
                                            isSelected ? meta.activeBadgeClass : meta.badgeClass
                                        }`}
                                    >
                                        <KindIcon size={10} />
                                        {meta.label}
                                    </span>
                                    <span title="默认研究报告的质量评分" className={`ml-auto inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums ${
                                        entry.researchScore == null ? 'text-slate-400' : isSelected ? 'text-orange-300' : 'text-orange-600'
                                    }`}>
                                        <Award size={12} aria-hidden="true" />
                                        {entry.researchScore == null ? '待评分' : `${entry.researchScore} / 100`}
                                    </span>
                                    <ArrowUpRight
                                        size={12}
                                        className={`shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${
                                            isSelected ? 'text-orange-400' : 'text-slate-300 group-hover:text-orange-500'
                                        }`}
                                    />
                                </div>
                                <h3
                                    className={`line-clamp-2 h-10 break-words text-sm font-bold leading-5 transition-colors ${
                                        isSelected ? 'text-white' : 'text-slate-800 group-hover:text-orange-600'
                                    }`}
                                >
                                    {entry.title}
                                </h3>
                                {snippet && (
                                    <p
                                        className={`mt-1 line-clamp-1 text-xs leading-5 ${
                                            isSelected ? 'text-slate-300' : 'text-slate-500'
                                        }`}
                                    >
                                        {snippet}
                                    </p>
                                )}
                            </button>
                        );
                    })
                ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 px-4 py-12 text-center">
                        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-400">
                            <FlaskConical size={20} />
                        </div>
                        <p className="text-sm font-semibold text-slate-700">
                            {entries.length ? '没有匹配的研究条目' : '先收集一份研究资料'}
                        </p>
                        <p className="mt-1.5 text-xs leading-5 text-slate-400">
                            {entries.length
                                ? '可以尝试切换类型、语言或清空关键词'
                                : '粘贴源码、说明或网址，让 AI 自动整理原理与参数'}
                        </p>
                        {hasFilters && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearch('');
                                    setKind('');
                                    setLanguage('');
                                }}
                                className="mt-3 inline-flex items-center gap-1 rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-600 transition hover:bg-orange-100"
                            >
                                <RotateCcw size={12} />
                                清除筛选条件
                            </button>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
