import { useState } from 'react';
import { Search, Plus, FlaskConical, ArrowUpRight } from 'lucide-react';
import { Select } from '../common/Select';
import { QuantButton, inputClass } from './ui';
import { quantKindOptions as kindOptions, quantLanguageOptions as languageOptions } from '../../utils/quant';
import { quantDate } from '../../utils/quant';
import type { QuantEntry } from '../../types/api/quant';

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
    const filtered = entries.filter(
        (entry) =>
            (!kind || entry.kind === kind) &&
            (!search.trim() ||
                [entry.title, ...entry.tags].join(' ').toLowerCase().includes(search.trim().toLowerCase())),
    );
    return (
        <>
            <div className="shrink-0 space-y-3 border-b border-slate-100 p-4">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        研究条目 <span className="ml-1 font-mono">{entries.length}</span>
                    </span>
                    <QuantButton primary disabled={busy} onClick={create}>
                        <Plus size={15} />
                        收集并分析
                    </QuantButton>
                </div>
                <label className="relative block">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                        aria-label="搜索研究标题或标签"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="搜索标题、标签…"
                        className={`${inputClass} !pl-9`}
                    />
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <Select
                        value={kind}
                        options={[{ value: '', label: '全部类型' }, ...kindOptions]}
                        onChange={setKind}
                    />
                    <Select
                        value={language}
                        options={[{ value: '', label: '全部语言' }, ...languageOptions, { value: 'tongdaxin', label: '通达信公式' }, { value: 'text', label: '其他 / 纯文本' }]}
                        onChange={setLanguage}
                    />
                </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3 scrollbar-hide">
                {loading ? (
                    Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className="h-28 animate-pulse rounded-xl bg-slate-100" />
                    ))
                ) : filtered.length ? (
                    filtered.map((entry) => (
                        <button
                            type="button"
                            key={entry.id}
                            onClick={() => select(entry.id)}
                            className={`group w-full rounded-xl border p-4 text-left transition ${current === entry.id ? 'border-orange-200 bg-orange-50/70' : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50'}`}
                        >
                            <div className="mb-2 flex items-center gap-2">
                                <span
                                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${current === entry.id ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}
                                >
                                    {kindOptions.find((option) => option.value === entry.kind)?.label}
                                </span>
                                <ArrowUpRight
                                    size={13}
                                    className="ml-auto text-slate-300 group-hover:text-orange-500"
                                />
                            </div>
                            <h3 className="truncate text-sm font-semibold text-slate-800">{entry.title}</h3>
                            <div className="mt-2 flex flex-wrap gap-1">
                                {entry.tags.slice(0, 3).map((tag) => (
                                    <span key={tag} className="max-w-24 truncate text-[10px] text-slate-400">
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                            <p className="mt-3 text-[10px] text-slate-400">{quantDate(entry.updatedAt)}</p>
                        </button>
                    ))
                ) : (
                    <div className="px-4 py-14 text-center">
                        <FlaskConical className="mx-auto mb-3 text-orange-200" size={30} />
                        <p className="text-sm text-slate-500">
                            {entries.length ? '没有匹配的研究' : '先收集一份研究资料'}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-400">
                            {entries.length ? '试试其他关键词或筛选条件' : '贴入代码、说明或网址，让 AI 分析并积累候选'}
                        </p>
                    </div>
                )}
            </div>
        </>
    );
}
