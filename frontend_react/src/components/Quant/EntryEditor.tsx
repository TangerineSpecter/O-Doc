import { useCallback, useEffect, useState } from 'react';
import { Save, Eye, PenLine, Columns2, ExternalLink, Heading2, Sigma, Code2, ListChecks, Table } from 'lucide-react';
import { quantApi } from '../../api/quant';
import { Select } from '../common/Select';
import { QuantBadge, QuantButton, QuantField, cardClass } from './ui';
import { ReportMarkdown } from './ReportMarkdown';
import { quantKindOptions as kindOptions, quantTags } from '../../utils/quant';
import { useQuantDraftRegistration, type QuantRegisterDraft } from '../../hooks/useQuantNavigation';
import type { QuantController } from '../../hooks/useQuant';
import type { QuantEntry, QuantEntryInput } from '../../types/api/quant';
import {useQuantVocabulary} from '../../hooks/useQuantVocabulary';
import {tagLabels, tagTextForDisplay, tagTextForStorage} from '../../utils/quantTagLabels';

const QUICK_SNIPPETS = [
    { label: '章节标题', icon: Heading2, snippet: '\n## 核心逻辑与假设\n' },
    { label: '数学公式', icon: Sigma, snippet: '\n$$\n\\text{Factor}_t = \\frac{P_t - P_{t-n}}{\\sigma_n}\n$$\n' },
    { label: '代码块', icon: Code2, snippet: '\n```python\n# 信号计算示例\n```\n' },
    { label: '核对清单', icon: ListChecks, snippet: '\n- [ ] 检查未来函数与数据时点\n- [ ] 核对交易成本与滑点敏感性\n' },
    { label: '参数表', icon: Table, snippet: '\n| 参数 | 默认值 | 含义 |\n| --- | --- | --- |\n| length | 20 | 回看窗口 |\n' },
];

export function EntryEditor({
    entry,
    collection,
    controller,
    register,
    extra,
    consumeExtra,
}: {
    entry: QuantEntry;
    collection: string;
    controller: QuantController;
    register: QuantRegisterDraft;
    extra: string;
    consumeExtra: () => void;
}) {
    const initial: QuantEntryInput = {
        title: entry.title,
        kind: entry.kind,
        content: entry.content,
        sourceUrl: entry.sourceUrl,
        tags: entry.tags,
    };
    const [draft, setDraft] = useState(() => ({
        ...initial,
        content: extra
            ? `${initial.content}${initial.content.trim() ? '\n\n' : ''}## AI 代码解释\n\n${extra}`
            : initial.content,
    }));
    const [tagsText, setTagsText] = useState(entry.tags.join('，'));
    const vocabulary = useQuantVocabulary(collection);
    const terms = vocabulary.data?.catalog.terms || [];
    const names = tagLabels(terms);
    const [baseline, setBaseline] = useState(JSON.stringify(initial));
    const [viewMode, setViewMode] = useState<'edit' | 'split' | 'preview'>('edit');
    const parsedTags = quantTags(tagsText);
    const dirty = JSON.stringify({ ...draft, tags: parsedTags }) !== baseline;
    const patch = (key: keyof QuantEntryInput, value: string | string[]) =>
        setDraft((current) => ({ ...current, [key]: value }));
    useEffect(() => {
        if (!extra) return;
        consumeExtra();
    }, [extra, consumeExtra]);
    const save = useCallback(async () => {
        if (!draft.title.trim()) {
            controller.setError('请填写研究标题');
            return false;
        }
        const data = { ...draft, title: draft.title.trim(), tags: quantTags(tagsText) };
        const saved = await controller.safe(() => quantApi.update(collection, entry.id, data));
        if (saved) {
            setDraft(data);
            setBaseline(JSON.stringify(data));
        }
        return saved;
    }, [draft, tagsText, controller, collection, entry.id]);
    useQuantDraftRegistration('entry-notes', dirty, save, register, () => {
        const saved = JSON.parse(baseline) as QuantEntryInput;
        setDraft(saved);
        setTagsText(saved.tags.join('，'));
    });

    const insertSnippet = (snippet: string) => {
        patch('content', `${draft.content}${snippet}`);
        if (viewMode === 'preview') setViewMode('edit');
    };

    return (
        <fieldset disabled={controller.busy} className="min-w-0 space-y-5">
            <section className={cardClass}>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-slate-900">研究说明与元数据</h2>
                            {dirty && <QuantBadge tone="amber">有未保存修改</QuantBadge>}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">先收集思路，再逐步补齐证据。支持 GFM 表格与 LaTeX 数学公式。</p>
                    </div>
                    <QuantButton primary disabled={controller.busy || !dirty} onClick={() => void save()}>
                        <Save size={15} />
                        {controller.busy ? '保存中…' : '保存说明'}
                    </QuantButton>
                </div>
                <div className="grid gap-5 sm:grid-cols-[1fr_160px]">
                    <QuantField
                        label="研究标题"
                        value={draft.title}
                        onChange={(value) => patch('title', value)}
                        required
                    />
                    <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                        <span className="block">条目类型</span>
                        <Select value={draft.kind} options={kindOptions} onChange={(value) => patch('kind', value)} />
                    </label>
                </div>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <QuantField
                            label="来源链接"
                            value={draft.sourceUrl}
                            onChange={(value) => patch('sourceUrl', value)}
                            placeholder="https://…"
                        />
                        {draft.sourceUrl.trim() && (
                            <a
                                href={draft.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:underline"
                            >
                                <ExternalLink size={12} />
                                在新标签页打开来源链接
                            </a>
                        )}
                    </div>
                    <div className="space-y-2">
                        <QuantField
                            label="标签"
                            value={vocabulary.loading ? '' : tagTextForDisplay(tagsText, terms)}
                            onChange={value => setTagsText(tagTextForStorage(value, terms, parsedTags))}
                            disabled={vocabulary.loading}
                            placeholder={vocabulary.loading ? '正在加载标签名称…' : '趋势，波动率，卡尔曼滤波（逗号分隔）'}
                        />
                        {vocabulary.error && <p role="alert" className="text-xs text-red-600">{vocabulary.error} <button type="button" onClick={vocabulary.reload} className="underline">重试</button></p>}
                        {!vocabulary.loading && parsedTags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {parsedTags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="rounded-md border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                                    >
                                        #{names.get(tag) || tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </section>
            <section className={cardClass}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900">逻辑、公式与研究笔记</h3>
                        <p className="mt-0.5 text-xs text-slate-400">支持 Markdown 语法、代码块与 KaTeX 公式推导</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex rounded-xl bg-slate-100 p-1">
                            {[
                                { value: 'edit' as const, icon: PenLine, label: '编辑' },
                                { value: 'split' as const, icon: Columns2, label: '分屏' },
                                { value: 'preview' as const, icon: Eye, label: '预览' },
                            ].map((item) => (
                                <button
                                    type="button"
                                    key={item.label}
                                    onClick={() => setViewMode(item.value)}
                                    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                                        viewMode === item.value
                                            ? 'bg-white text-orange-600 shadow-xs'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    <item.icon size={13} />
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {viewMode !== 'preview' && (
                    <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-1.5">
                        <span className="mr-1 text-[11px] font-semibold text-slate-400">快捷插入：</span>
                        {QUICK_SNIPPETS.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.label}
                                    type="button"
                                    onClick={() => insertSnippet(item.snippet)}
                                    className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-orange-200 hover:bg-orange-50/40 hover:text-orange-600"
                                >
                                    <Icon size={12} className="text-orange-500" />
                                    {item.label}
                                </button>
                            );
                        })}
                    </div>
                )}

                {viewMode === 'preview' ? (
                    <div className="min-h-80 rounded-xl border border-slate-100 bg-slate-50/30 p-5">
                        <ReportMarkdown text={draft.content || '尚未填写研究说明。'} />
                    </div>
                ) : viewMode === 'split' ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                        <textarea
                            aria-label="研究说明 Markdown"
                            value={draft.content}
                            onChange={(e) => patch('content', e.target.value)}
                            rows={17}
                            placeholder={
                                '可以从这些问题开始：\n\n这个因子想捕捉什么现象？\n公式和计算步骤是什么？\n适用什么市场或周期？\n还有哪些疑问和验证结论？'
                            }
                            className="min-h-80 w-full resize-none rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 font-mono text-sm leading-7 text-slate-700 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-3 focus:ring-orange-500/10 scrollbar-hide"
                        />
                        <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-200/80 bg-white p-5 scrollbar-hide">
                            <p className="mb-3 border-b border-slate-100 pb-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                                实时排版预览
                            </p>
                            <ReportMarkdown text={draft.content || '尚未填写研究说明。'} />
                        </div>
                    </div>
                ) : (
                    <textarea
                        aria-label="研究说明 Markdown"
                        value={draft.content}
                        onChange={(e) => patch('content', e.target.value)}
                        rows={17}
                        placeholder={
                            '可以从这些问题开始：\n\n这个因子想捕捉什么现象？\n公式和计算步骤是什么？\n适用什么市场或周期？\n还有哪些疑问和验证结论？'
                        }
                        className="min-h-80 w-full resize-none rounded-xl border border-slate-200/80 bg-slate-50/30 p-4 text-sm leading-7 text-slate-700 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-3 focus:ring-orange-500/10 scrollbar-hide"
                    />
                )}
            </section>
        </fieldset>
    );
}
