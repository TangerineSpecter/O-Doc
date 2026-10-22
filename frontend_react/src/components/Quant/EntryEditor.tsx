import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Save, Eye, PenLine } from 'lucide-react';
import { quantApi } from '../../api/quant';
import { Select } from '../common/Select';
import { QuantButton, QuantField, cardClass } from './ui';
import { quantKindOptions as kindOptions, quantTags } from '../../utils/quant';
import { useQuantDraftRegistration, type QuantRegisterDraft } from '../../hooks/useQuantNavigation';
import type { QuantController } from '../../hooks/useQuant';
import type { QuantEntryDetail, QuantEntryInput } from '../../types/api/quant';

export function EntryEditor({
    entry,
    collection,
    controller,
    register,
    extra,
    consumeExtra,
}: {
    entry: QuantEntryDetail;
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
    const [baseline, setBaseline] = useState(JSON.stringify(initial));
    const [preview, setPreview] = useState(false);
    const dirty = JSON.stringify({ ...draft, tags: quantTags(tagsText) }) !== baseline;
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
    return (
        <fieldset disabled={controller.busy} className="min-w-0 space-y-5">
            <section className={cardClass}>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-bold text-slate-900">研究说明</h2>
                        <p className="mt-1 text-xs text-slate-400">先收集思路，再逐步补齐证据。Markdown 格式可用。</p>
                    </div>
                    <QuantButton primary disabled={controller.busy || !dirty} onClick={() => void save()}>
                        <Save size={15} />
                        {controller.busy ? '保存中…' : '保存说明'}
                    </QuantButton>
                </div>
                <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
                    <QuantField
                        label="研究标题"
                        value={draft.title}
                        onChange={(value) => patch('title', value)}
                        required
                    />
                    <label className="space-y-2 text-sm font-semibold text-slate-700">
                        <span className="block">条目类型</span>
                        <Select value={draft.kind} options={kindOptions} onChange={(value) => patch('kind', value)} />
                    </label>
                </div>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <QuantField
                        label="来源链接"
                        value={draft.sourceUrl}
                        onChange={(value) => patch('sourceUrl', value)}
                        placeholder="https://…"
                    />
                    <QuantField label="标签" value={tagsText} onChange={setTagsText} placeholder="趋势，动量，待研究" />
                </div>
            </section>
            <section className={cardClass}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-800">逻辑、公式与研究笔记</h3>
                    <div className="flex rounded-full bg-slate-100 p-1">
                        {[
                            { value: false, icon: PenLine, label: '编辑' },
                            { value: true, icon: Eye, label: '预览' },
                        ].map((item) => (
                            <button
                                type="button"
                                key={item.label}
                                onClick={() => setPreview(item.value)}
                                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${preview === item.value ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'}`}
                            >
                                <item.icon size={13} />
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
                {preview ? (
                    <div className="prose prose-slate min-h-72 max-w-none overflow-x-auto text-sm prose-a:text-orange-600 scrollbar-hide">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {draft.content || '尚未填写研究说明。'}
                        </ReactMarkdown>
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
                        className="min-h-80 w-full resize-none bg-white text-sm leading-7 text-slate-700 outline-none scrollbar-hide"
                    />
                )}
            </section>
        </fieldset>
    );
}
