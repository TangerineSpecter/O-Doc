import {useEffect, useRef, useState} from 'react';
import {
    AlignJustify,
    ArrowLeft,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Pencil,
    Sparkles,
    Trash2,
    Wand2,
    X,
} from 'lucide-react';
import {type DiaryDraft, type DiaryEntry, type DiaryMood} from '../../types/api/diary';
import ConfirmationModal from '../common/ConfirmationModal';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {uploadDiaryImage} from '../../api/diary';
import DiaryDetailsFields from './DiaryDetailsFields';
import DiaryReaderView, {type PaperTheme} from './DiaryReaderView';
import {diaryImagePatch, MAX_DIARY_IMAGES} from './diaryImages';
import {countDiaryWords, localDay, parseDiaryDate} from './diaryDate';
import {formatDiaryProse} from './diaryProseFormat';
import {mergeDiaryTags} from './diaryTags';

const WRITING_PROMPTS = [
    '今天最让你感到平静的一个瞬间是什么？',
    '如果把今天定格成一张电影画面，镜头里会有什么？',
    '记录一件今天发生、值得存留的细微美好。',
    '此刻窗外的光线、风声与心绪是怎样的？',
    '今天读到的一句话，或脑海里闪过的一个念头。',
    '给未来的自己留下一句简短的备忘。',
] as const;

interface Props {
    entry?: DiaryEntry;
    initialMood?: DiaryMood;
    prevEntry?: DiaryEntry | null;
    nextEntry?: DiaryEntry | null;
    onSelectEntry?: (entry: DiaryEntry) => void;
    onClose: () => void;
    onSave: (draft: DiaryDraft, id?: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

export default function DiaryEditor({
    entry,
    initialMood = '',
    prevEntry,
    nextEntry,
    onSelectEntry,
    onClose,
    onSave,
    onDelete,
}: Props) {
    const initial: DiaryDraft = entry
        ? {
              title: entry.title,
              content: entry.content,
              entryDate: entry.entryDate,
              coverUrl: entry.coverUrl,
              coverAssetId: entry.coverAssetId,
              imageAssetIds: entry.imageAssetIds,
              mood: entry.mood,
              weather: entry.weather,
              tags: entry.tags,
          }
        : {
              title: '',
              content: '',
              entryDate: localDay(new Date()),
              coverUrl: '',
              coverAssetId: null,
              imageAssetIds: [],
              mood: initialMood,
              weather: '',
              tags: [],
          };

    const [draft, setDraft] = useState(initial);
    const [tagInput, setTagInput] = useState('');
    const [editing, setEditing] = useState(!entry);
    const [ruled, setRuled] = useState(false);
    const [paper, setPaper] = useState<PaperTheme>('light');
    const [promptIdx, setPromptIdx] = useState(0);
    const [formattedToast, setFormattedToast] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const uploadInProgress = useRef(false);
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [confirm, setConfirm] = useState<'delete' | 'discard' | null>(null);

    // 正文输入自适应高度流动画布：告别局促的固定滚动框
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.max(320, textareaRef.current.scrollHeight)}px`;
        }
    }, [draft.content, editing]);

    const handleFormatProse = () => {
        if (!draft.content.trim()) return;
        const formatted = formatDiaryProse(draft.content);
        setDraft(d => ({...d, content: formatted}));
        setFormattedToast(true);
        setTimeout(() => setFormattedToast(false), 2400);
    };

    const close = () => {
        if (!busy && !uploading) {
            if (JSON.stringify(draft) !== JSON.stringify(initial) || tagInput.trim()) setConfirm('discard');
            else onClose();
        }
    };

    useEscapeDismissal(true, close);

    useEffect(() => {
        if (editing || !onSelectEntry) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key === 'ArrowLeft' && prevEntry) {
                e.preventDefault();
                onSelectEntry(prevEntry);
            } else if (e.key === 'ArrowRight' && nextEntry) {
                e.preventDefault();
                onSelectEntry(nextEntry);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [editing, onSelectEntry, prevEntry, nextEntry]);

    const update = <K extends keyof DiaryDraft>(key: K, value: DiaryDraft[K]) =>
        setDraft(d => ({...d, [key]: value}));

    const submit = async (event?: React.FormEvent) => {
        event?.preventDefault();
        if (busy || uploading) return;
        const titleTrimmed = draft.title.trim();
        // 校验标题和正文是否有实际内容（排查全角空格等）
        if (!titleTrimmed || !draft.content.replace(/[\s\u3000]+/g, '').length) {
            setError('请填写标题和正文');
            return;
        }
        const resolvedTags = mergeDiaryTags(draft.tags, tagInput);
        if (resolvedTags.error) {
            setError(resolvedTags.error);
            return;
        }
        setBusy(true);
        setError('');
        setDraft(current => ({...current, tags: resolvedTags.tags}));
        setTagInput('');
        // 仅移除前导空行和末尾空白，绝对保留段首全角缩进（\u3000\u3000），避免保存后首段缩进丢失
        const cleanContent = draft.content.replace(/^[\r\n\t ]+/, '').trimEnd();
        try {
            await onSave({...draft, title: titleTrimmed, content: cleanContent, tags: resolvedTags.tags}, entry?.diaryId);
            onClose();
        } catch {
            setError('保存失败，内容已保留，请重试');
        } finally {
            setBusy(false);
        }
    };

    const upload = async (files: File[]) => {
        if (uploadInProgress.current || !files.length) return;
        if (draft.imageAssetIds.length + files.length > MAX_DIARY_IMAGES) {
            setError(`每篇日记最多添加 ${MAX_DIARY_IMAGES} 张图片，请减少后重试`);
            return;
        }
        uploadInProgress.current = true;
        setUploading(true);
        setError('');
        const failures: string[] = [];
        try {
            for (const file of files) {
                try {
                    const asset = await uploadDiaryImage(file);
                    setDraft(d =>
                        d.imageAssetIds.includes(asset.id)
                            ? d
                            : {...d, ...diaryImagePatch([...d.imageAssetIds, asset.id])}
                    );
                } catch (problem) {
                    failures.push(`${file.name}：${problem instanceof Error ? problem.message : '上传失败'}`);
                }
            }
            if (failures.length) setError(`部分图片上传失败，成功图片已保留。${failures.join('；')}`);
        } finally {
            uploadInProgress.current = false;
            setUploading(false);
        }
    };

    const dateInfo = parseDiaryDate(draft.entryDate);
    const wordCount = countDiaryWords(draft.content);
    const isDark = !editing && paper === 'dark';

    return (
        <div
            data-modal-scroll-lock
            className="diary-modal-root fixed inset-0 z-[115] flex flex-col bg-white"
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-label={editing ? '编辑日记' : '日记详情'}
                className={`relative flex h-dvh w-full flex-col overflow-hidden ${
                    isDark ? 'diary-reader-dark' : 'bg-white text-zinc-950'
                }`}
            >
                {/* 全屏沉浸式顶部玻璃导航栏 */}
                <header
                    className={`sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-8 ${
                        isDark
                            ? 'border-zinc-800 bg-zinc-950/85 text-zinc-100'
                            : 'border-zinc-100 bg-white/85 text-zinc-950'
                    } backdrop-blur-xl`}
                >
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            aria-label="关闭"
                            disabled={busy || uploading}
                            onClick={close}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                                isDark
                                    ? 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-600'
                                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950 hover:text-zinc-950'
                            }`}
                        >
                            <ArrowLeft size={14}/>
                            <span>返回</span>
                        </button>

                        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800"/>

                        <h2 className="text-sm font-bold tracking-tight sm:text-base">
                            {editing ? (entry ? '编辑日记' : '写日记') : '日记详情'}
                        </h2>

                        {editing && (
                            <span className="diary-num rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-500">
                                {wordCount} 字
                            </span>
                        )}

                        {!editing && onSelectEntry && (prevEntry || nextEntry) && (
                            <div className="ml-1 flex items-center gap-1">
                                <button
                                    type="button"
                                    disabled={!prevEntry}
                                    title="上一篇"
                                    aria-label="上一篇日记"
                                    onClick={() => prevEntry && onSelectEntry(prevEntry)}
                                    className="rounded-full p-1.5 opacity-70 transition-opacity hover:bg-zinc-100 hover:opacity-100 disabled:opacity-25"
                                >
                                    <ChevronLeft size={17}/>
                                </button>
                                <button
                                    type="button"
                                    disabled={!nextEntry}
                                    title="下一篇"
                                    aria-label="下一篇日记"
                                    onClick={() => nextEntry && onSelectEntry(nextEntry)}
                                    className="rounded-full p-1.5 opacity-70 transition-opacity hover:bg-zinc-100 hover:opacity-100 disabled:opacity-25"
                                >
                                    <ChevronRight size={17}/>
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {/* 阅读模式排版切换（默认统一文楷，仅保留底色与网格线） */}
                        {!editing && (
                            <div className="hidden items-center gap-2 sm:flex">
                                <div
                                    className={`inline-flex items-center rounded-full border p-0.5 text-xs ${
                                        isDark ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-200 bg-zinc-50'
                                    }`}
                                >
                                    {(
                                        [
                                            {id: 'light', label: '纯白', dot: '#FFFFFF'},
                                            {id: 'soft', label: '雾白', dot: '#F1F5F9'},
                                            {id: 'dark', label: '深空', dot: '#09090B'},
                                        ] as const
                                    ).map(p => (
                                        <button
                                            type="button"
                                            key={p.id}
                                            onClick={() => setPaper(p.id)}
                                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                                paper === p.id
                                                    ? isDark
                                                        ? 'bg-white text-zinc-950'
                                                        : 'bg-zinc-950 text-white'
                                                    : 'opacity-65 hover:opacity-100'
                                            }`}
                                        >
                                            <span
                                                className="h-2 w-2 rounded-full border border-zinc-400"
                                                style={{backgroundColor: p.dot}}
                                            />
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            aria-pressed={ruled}
                            onClick={() => setRuled(r => !r)}
                            title="切换网格横线"
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                ruled
                                    ? isDark
                                        ? 'border-white bg-white text-zinc-950'
                                        : 'border-zinc-950 bg-zinc-950 text-white'
                                    : isDark
                                      ? 'border-zinc-800 text-zinc-400'
                                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-950'
                            }`}
                        >
                            <AlignJustify size={13}/>
                            <span className="hidden md:inline">网格线</span>
                        </button>

                        {entry && !editing && (
                            <>
                                <button
                                    type="button"
                                    aria-label="编辑日记"
                                    onClick={() => setEditing(true)}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800"
                                >
                                    <Pencil size={13}/>
                                    <span>编辑</span>
                                </button>
                                <button
                                    type="button"
                                    aria-label="删除日记"
                                    onClick={() => setConfirm('delete')}
                                    className="rounded-full border border-zinc-200 bg-white p-2 text-red-500 transition-colors hover:border-red-200 hover:bg-red-50"
                                >
                                    <Trash2 size={15}/>
                                </button>
                            </>
                        )}

                        {editing && (
                            <>
                                <button
                                    type="button"
                                    disabled={busy || uploading}
                                    onClick={close}
                                    className="rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
                                >
                                    取消
                                </button>
                                <button
                                    type="button"
                                    disabled={busy || uploading}
                                    onClick={() => void submit()}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
                                >
                                    {busy && <Loader2 size={14} className="animate-spin"/>}
                                    保存日记
                                </button>
                            </>
                        )}

                        <button
                            type="button"
                            aria-hidden="true"
                            tabIndex={-1}
                            disabled={busy || uploading}
                            onClick={close}
                            className="hidden rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 sm:inline-flex"
                        >
                            <X size={18}/>
                        </button>
                    </div>
                </header>

                {/* 主体区域：高级现代悬浮创作画布 vs 沉浸式杂志阅读器 */}
                <div
                    className={`flex-1 overflow-y-auto scrollbar-hide ${
                        editing ? 'bg-white' : ''
                    }`}
                >
                    {editing ? (
                        <form
                            onSubmit={submit}
                            onKeyDown={e => {
                                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                                    e.preventDefault();
                                    void submit();
                                }
                            }}
                            className="diary-editor-canvas mx-auto w-full max-w-[680px] px-6 pb-8 pt-10 sm:px-8 sm:pt-16"
                        >
                            <fieldset disabled={busy || uploading} className="min-w-0">
                                {/* 日期眼眉：与阅读页题头一致，点击即可改日期 */}
                                <div className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium tracking-[0.08em] text-zinc-500">
                                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 -ml-1.5 transition-colors hover:bg-zinc-100 hover:text-zinc-900">
                                        <Calendar size={13} className="text-zinc-400"/>
                                        <span className="sr-only">日期</span>
                                        <input
                                            type="date"
                                            required
                                            value={draft.entryDate}
                                            onChange={e => update('entryDate', e.target.value)}
                                            className="diary-num cursor-pointer bg-transparent outline-none"
                                        />
                                    </label>
                                    <span aria-hidden="true">·</span>
                                    <span>{dateInfo.weekdayLong}</span>
                                </div>

                                {/* 标题：与阅读页同字号 */}
                                <label className="mt-4 block text-left">
                                    <span className="sr-only">标题</span>
                                    <input
                                        autoFocus
                                        required
                                        maxLength={150}
                                        value={draft.title}
                                        onChange={e => update('title', e.target.value)}
                                        placeholder="给今天起个名字"
                                        className="diary-wenkai diary-canvas-input diary-title-input w-full border-none bg-transparent text-left text-zinc-900 placeholder:font-normal placeholder:text-zinc-300 outline-none ring-0"
                                    />
                                </label>

                                {!draft.title && (
                                    <p className="mt-2 flex flex-wrap items-center gap-x-3 text-[13px] text-zinc-400">
                                        <span className="inline-flex items-center gap-1.5">
                                            <Sparkles size={12} className="shrink-0"/>
                                            {WRITING_PROMPTS[promptIdx]}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setPromptIdx(i => (i + 1) % WRITING_PROMPTS.length)}
                                            className="hover:text-zinc-700"
                                        >
                                            换一条
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                update('title', WRITING_PROMPTS[promptIdx].replace(/[？。]/g, ''))
                                            }
                                            className="font-medium text-orange-500 hover:text-orange-600"
                                        >
                                            用作标题
                                        </button>
                                    </p>
                                )}

                                <div className="diary-ornament" aria-hidden="true"/>

                                {/* 正文：无边框、自适应高度，字号行距与阅读页完全一致 */}
                                <label className="block text-left">
                                    <span className="sr-only">正文</span>
                                    <textarea
                                        ref={textareaRef}
                                        required
                                        maxLength={50000}
                                        value={draft.content}
                                        onChange={e => update('content', e.target.value)}
                                        placeholder="今天发生了什么？从一个小小的瞬间开始写起吧…"
                                        className={`${
                                            ruled ? 'diary-ruled-lines' : ''
                                        } diary-canvas-textarea min-h-[320px] w-full resize-none overflow-hidden border-none bg-transparent p-0 text-left text-[17px] sm:text-[18px] placeholder:text-zinc-300 outline-none ring-0 diary-prose diary-wenkai`}
                                    />
                                </label>

                                {/* 这一天的印记：写完再补，不打断书写 */}
                                <section className="mt-14 border-t border-zinc-100 pt-8">
                                    <h3 className="mb-4 text-[13px] font-semibold tracking-wide text-zinc-400">这一天的印记</h3>
                                    <DiaryDetailsFields
                                        draft={draft}
                                        onChange={patch => setDraft(d => ({...d, ...patch}))}
                                        onUpload={upload}
                                        uploading={uploading}
                                        tagInput={tagInput}
                                        onTagInputChange={setTagInput}
                                        onlyMetadata
                                    />
                                </section>

                                <section className="mt-8">
                                    <DiaryDetailsFields
                                        draft={draft}
                                        onChange={patch => setDraft(d => ({...d, ...patch}))}
                                        onUpload={upload}
                                        uploading={uploading}
                                        tagInput={tagInput}
                                        onTagInputChange={setTagInput}
                                        onlyGallery
                                    />
                                </section>
                            </fieldset>

                            {error && (
                                <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                                    {error}
                                </p>
                            )}

                            {/* 底部悬浮状态条：字数、一键排版、快捷键；保存/取消只保留顶栏一处 */}
                            <div className="pointer-events-none sticky bottom-4 z-10 mt-10 flex justify-center">
                                <div className="pointer-events-auto inline-flex items-center gap-3 rounded-full border border-zinc-200 bg-white/90 px-4 py-1.5 text-xs text-zinc-500 shadow-lg shadow-zinc-900/5 backdrop-blur-md">
                                    <span className="diary-num">{wordCount} 字</span>
                                    <span className="h-3 w-px bg-zinc-200" aria-hidden="true"/>
                                    {formattedToast ? (
                                        <span className="font-medium text-emerald-600">✓ 已整理排版</span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleFormatProse}
                                            disabled={!draft.content.trim()}
                                            title="自动每段开头空两个字，规整中西文空格与中文标点"
                                            className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 transition-colors hover:text-orange-600 disabled:opacity-30 disabled:hover:text-zinc-700"
                                        >
                                            <Wand2 size={12}/>
                                            一键排版
                                        </button>
                                    )}
                                    <span className="hidden h-3 w-px bg-zinc-200 sm:block" aria-hidden="true"/>
                                    <span className="hidden sm:inline">
                                        <kbd className="diary-num rounded border border-zinc-200 bg-zinc-50 px-1 text-[11px]">⌘/Ctrl S</kbd> 保存
                                    </span>
                                </div>
                            </div>
                        </form>
                    ) : (
                        entry && (
                            <DiaryReaderView
                                entry={entry}
                                paper={paper}
                                onPaperChange={setPaper}
                                ruled={ruled}
                                onRuledChange={setRuled}
                                prevEntry={prevEntry}
                                nextEntry={nextEntry}
                                onSelectEntry={onSelectEntry}
                                error={error}
                            />
                        )
                    )}
                </div>
            </section>

            <ConfirmationModal
                isOpen={confirm !== null}
                title={confirm === 'delete' ? '删除这篇日记？' : '放弃未保存的内容？'}
                description={
                    confirm === 'delete' ? '删除后将不再显示这篇日记。' : '关闭后本次修改不会保存。'
                }
                confirmText={confirm === 'delete' ? '删除' : '放弃修改'}
                isLoading={busy}
                onClose={() => setConfirm(null)}
                onConfirm={async () => {
                    if (confirm === 'discard') {
                        onClose();
                        return;
                    }
                    if (!entry) return;
                    setBusy(true);
                    try {
                        await onDelete(entry.diaryId);
                        onClose();
                    } catch {
                        setError('删除失败，请重试');
                        setConfirm(null);
                    } finally {
                        setBusy(false);
                    }
                }}
            />
        </div>
    );
}
