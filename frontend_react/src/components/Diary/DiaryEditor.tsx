import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {
    AlignJustify,
    ArrowLeft,
    Calendar,
    ChevronLeft,
    ChevronRight,
    CloudSun,
    Loader2,
    Pencil,
    Smile,
    Sparkles,
    Tag,
    Trash2,
    Wand2,
    X,
} from 'lucide-react';
import {type DiaryDraft, type DiaryEntry, type DiaryMood} from '../../types/api/diary';
import ConfirmationModal from '../common/ConfirmationModal';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {uploadDiaryImage} from '../../api/diary';
import DiaryDetailsFields from './DiaryDetailsFields';
import DiaryImageUpload from './DiaryImageUpload';
import DiaryMoodIcon from './DiaryMoodIcon';
import {WeatherIcon} from './DiaryMetadata';
import {getMoodLabel, getWeatherLabel} from './diaryBrowse';
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

function fitTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(320, textarea.scrollHeight)}px`;
}

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
    const [metaDrawerOpen, setMetaDrawerOpen] = useState(false);
    const [heroPhotoVisible, setHeroPhotoVisible] = useState(true);
    const lastScrollTopRef = useRef(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const uploadInProgress = useRef(false);
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [uploadError, setUploadError] = useState('');
    const [confirm, setConfirm] = useState<'delete' | 'discard' | null>(null);

    useLayoutEffect(() => {
        if (textareaRef.current) fitTextarea(textareaRef.current);
    }, [draft.content, editing]);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!editing || !textarea) return;
        let active = true;
        let width = textarea.getBoundingClientRect().width;
        const fit = () => fitTextarea(textarea);
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
            const nextWidth = entries[0]?.contentRect.width;
            if (nextWidth !== undefined && nextWidth !== width) {
                width = nextWidth;
                fit();
            }
        });
        if (observer) observer.observe(textarea);
        else window.addEventListener('resize', fit);
        void document.fonts?.ready.then(() => { if (active) fit(); });
        return () => {
            active = false;
            observer?.disconnect();
            window.removeEventListener('resize', fit);
        };
    }, [editing]);

    // 移动端/窄屏滚动时，智能折叠或展开标题上方配图区域
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || !editing) return;

        const handleScroll = () => {
            const st = container.scrollTop;
            const diff = st - lastScrollTopRef.current;
            // 向下滚动超过 15px 且离开顶部时平滑折叠收起配图区
            if (diff > 15 && st > 30) {
                setHeroPhotoVisible(false);
            } else if (diff < -10 || st <= 10) {
                // 向上轻划或回到最顶部时展开配图区
                setHeroPhotoVisible(true);
            }
            lastScrollTopRef.current = st;
        };

        container.addEventListener('scroll', handleScroll, {passive: true});
        return () => container.removeEventListener('scroll', handleScroll);
    }, [editing]);

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
            setUploadError(`每篇日记最多添加 ${MAX_DIARY_IMAGES} 张图片，请减少后重试`);
            return;
        }
        uploadInProgress.current = true;
        setUploading(true);
        setError('');
        setUploadError('');
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
            if (failures.length) setUploadError(`部分图片上传失败，成功图片已保留。${failures.join('；')}`);
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
                    className={`sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 border-b px-3 sm:px-4 md:gap-3 md:px-8 ${
                        isDark
                            ? 'border-zinc-800 bg-zinc-950/85 text-zinc-100'
                            : 'border-zinc-100 bg-white/85 text-zinc-950'
                    } backdrop-blur-xl`}
                >
                    <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
                        <button
                            type="button"
                            aria-label="关闭"
                            disabled={busy || uploading}
                            onClick={close}
                            className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold transition-colors sm:h-auto sm:px-3.5 sm:py-1.5 ${
                                isDark
                                    ? 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-600'
                                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950 hover:text-zinc-950'
                            }`}
                        >
                            <ArrowLeft size={14} className="shrink-0"/>
                            <span className="hidden sm:inline">返回</span>
                        </button>

                        <div className="hidden h-4 w-px bg-zinc-200 sm:block dark:bg-zinc-800"/>

                        <h2 className="shrink-0 whitespace-nowrap text-sm font-bold tracking-tight sm:text-base">
                            {editing ? (entry ? '编辑日记' : '写日记') : '日记详情'}
                        </h2>

                        {editing && (
                            <span className="diary-num hidden shrink-0 whitespace-nowrap rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-500 sm:inline-flex">
                                {wordCount} 字
                            </span>
                        )}

                        {!editing && onSelectEntry && (prevEntry || nextEntry) && (
                            <div className="flex shrink-0 items-center gap-0 sm:ml-1 sm:gap-1">
                                <button
                                    type="button"
                                    disabled={!prevEntry}
                                    title="上一篇"
                                    aria-label="上一篇日记"
                                    onClick={() => prevEntry && onSelectEntry(prevEntry)}
                                    className="shrink-0 whitespace-nowrap rounded-full p-1.5 opacity-70 transition-opacity hover:bg-zinc-100 hover:opacity-100 disabled:opacity-25"
                                >
                                    <ChevronLeft size={17}/>
                                </button>
                                <button
                                    type="button"
                                    disabled={!nextEntry}
                                    title="下一篇"
                                    aria-label="下一篇日记"
                                    onClick={() => nextEntry && onSelectEntry(nextEntry)}
                                    className="shrink-0 whitespace-nowrap rounded-full p-1.5 opacity-70 transition-opacity hover:bg-zinc-100 hover:opacity-100 disabled:opacity-25"
                                >
                                    <ChevronRight size={17}/>
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
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
                                            className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
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
                            aria-label="切换网格横线"
                            aria-pressed={ruled}
                            onClick={() => setRuled(r => !r)}
                            title="切换网格横线"
                            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border text-xs font-semibold transition-colors sm:h-auto sm:w-auto sm:px-3 sm:py-1.5 ${
                                ruled
                                    ? isDark
                                        ? 'border-white bg-white text-zinc-950'
                                        : 'border-zinc-950 bg-zinc-950 text-white'
                                    : isDark
                                      ? 'border-zinc-800 text-zinc-400'
                                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-950'
                            }`}
                        >
                            <AlignJustify size={13} className="shrink-0"/>
                            <span className="hidden md:inline">网格线</span>
                        </button>

                        {entry && !editing && (
                            <>
                                <button
                                    type="button"
                                    aria-label="编辑日记"
                                    onClick={() => setEditing(true)}
                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-zinc-950 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 sm:h-auto sm:w-auto sm:px-4 sm:py-1.5"
                                >
                                    <Pencil size={13} className="shrink-0"/>
                                    <span className="hidden sm:inline">编辑</span>
                                </button>
                                <button
                                    type="button"
                                    aria-label="删除日记"
                                    onClick={() => setConfirm('delete')}
                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-zinc-200 bg-white text-red-500 transition-colors hover:border-red-200 hover:bg-red-50 sm:h-auto sm:w-auto sm:p-2"
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
                                    className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950 sm:h-auto sm:px-4 sm:py-1.5"
                                >
                                    取消
                                </button>
                                <button
                                    type="button"
                                    disabled={busy || uploading}
                                    onClick={() => void submit()}
                                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-zinc-950 px-2.5 text-xs font-bold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 sm:h-auto sm:px-5 sm:py-1.5"
                                >
                                    {busy && <Loader2 size={14} className="shrink-0 animate-spin"/>}
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
                            className="hidden shrink-0 whitespace-nowrap rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 md:inline-flex"
                        >
                            <X size={18}/>
                        </button>
                    </div>
                </header>

                {/* 主体区域：高级现代悬浮创作画布 vs 沉浸式杂志阅读器 */}
                <div
                    ref={scrollContainerRef}
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
                            className="diary-editor-canvas mx-auto w-full max-w-[1440px] px-3 pb-24 pt-6 sm:px-6 sm:pt-10"
                        >
                            <fieldset disabled={busy || uploading} className="min-w-0">
                                <div className="diary-triptych-grid items-start">
                                    {/* 左侧翼栏（桌面端 ≥1280px）：这一天的印记（心情、天气、标签） */}
                                    <aside className="diary-wing-sidebar w-full shrink-0 space-y-3 scrollbar-hide">
                                        <div className="px-1">
                                            <h3 className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
                                                这一天的印记
                                            </h3>
                                        </div>
                                        <DiaryDetailsFields
                                            draft={draft}
                                            onChange={patch => setDraft(d => ({...d, ...patch}))}
                                            onUpload={upload}
                                            uploading={uploading}
                                            tagInput={tagInput}
                                            onTagInputChange={setTagInput}
                                            onlyMetadata
                                            layout="sidebar"
                                        />
                                    </aside>

                                    {/* 中间主书写画布：严格 680px，数学与视觉上 100% 绝对居中于视口 */}
                                    <div className="w-full max-w-[680px] mx-auto min-w-0">
                                        {/* 标题上方配图区域（中窄屏模式，随页面滚动自动收起/展开） */}
                                        <div className="block min-[1280px]:hidden">
                                            <div
                                                className={`transition-all duration-300 ease-out overflow-hidden ${
                                                    heroPhotoVisible
                                                        ? 'max-h-[520px] opacity-100 mb-4 transform-none'
                                                        : 'max-h-0 opacity-0 mb-0 -translate-y-2 pointer-events-none'
                                                }`}
                                            >
                                                <DiaryImageUpload
                                                    draft={draft}
                                                    onChange={patch => setDraft(d => ({...d, ...patch}))}
                                                    onUpload={upload}
                                                    uploading={uploading}
                                                    error={uploadError}
                                                    layout="default"
                                                />
                                            </div>
                                        </div>

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

                                        {/* 中窄屏（<1280px）将心情、天气、标签三个小按钮居中展示（白底圆钮，无多余文字） */}
                                        <div className="my-3.5 flex items-center justify-center gap-3 min-[1280px]:hidden">
                                            {/* 1. 心情图标按钮 */}
                                            <button
                                                type="button"
                                                aria-label={draft.mood ? `心情：${getMoodLabel(draft.mood)}` : '选择心情'}
                                                onClick={() => setMetaDrawerOpen(true)}
                                                className={`flex h-9 w-9 items-center justify-center rounded-full border bg-white shadow-2xs transition-all active:scale-95 ${
                                                    draft.mood
                                                        ? 'border-zinc-300 text-zinc-900 shadow-xs'
                                                        : 'border-zinc-200/90 text-zinc-400 hover:border-zinc-300'
                                                }`}
                                                title={draft.mood ? `心情：${getMoodLabel(draft.mood)}` : '选择心情'}
                                            >
                                                {draft.mood ? (
                                                    <DiaryMoodIcon mood={draft.mood} size={19}/>
                                                ) : (
                                                    <Smile size={16} strokeWidth={1.8}/>
                                                )}
                                            </button>

                                            {/* 2. 天气图标按钮 */}
                                            <button
                                                type="button"
                                                aria-label={draft.weather ? `天气：${getWeatherLabel(draft.weather)}` : '选择天气'}
                                                onClick={() => setMetaDrawerOpen(true)}
                                                className={`flex h-9 w-9 items-center justify-center rounded-full border bg-white shadow-2xs transition-all active:scale-95 ${
                                                    draft.weather
                                                        ? 'border-zinc-300 text-zinc-800 shadow-xs'
                                                        : 'border-zinc-200/90 text-zinc-400 hover:border-zinc-300'
                                                }`}
                                                title={draft.weather ? `天气：${getWeatherLabel(draft.weather)}` : '选择天气'}
                                            >
                                                {draft.weather ? (
                                                    <WeatherIcon weather={draft.weather} size={16}/>
                                                ) : (
                                                    <CloudSun size={16} strokeWidth={1.8}/>
                                                )}
                                            </button>

                                            {/* 3. 标签图标按钮（不用展示具体标签，仅展示是否有标签的样式） */}
                                            <button
                                                type="button"
                                                aria-label={draft.tags.length > 0 ? `已设置 ${draft.tags.length} 个标签` : '添加标签'}
                                                onClick={() => setMetaDrawerOpen(true)}
                                                className={`relative flex h-9 w-9 items-center justify-center rounded-full border bg-white shadow-2xs transition-all active:scale-95 ${
                                                    draft.tags.length > 0
                                                        ? 'border-zinc-300 text-zinc-900 shadow-xs'
                                                        : 'border-zinc-200/90 text-zinc-400 hover:border-zinc-300'
                                                }`}
                                                title={draft.tags.length > 0 ? `已添加 ${draft.tags.length} 个标签` : '添加标签'}
                                            >
                                                <Tag size={15} strokeWidth={1.8}/>
                                                {draft.tags.length > 0 && (
                                                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white"/>
                                                )}
                                            </button>
                                        </div>

                                        <div className="diary-ornament" aria-hidden="true"/>

                                        {/* 正文：纯白居中无边框、自适应高度，字号行距与阅读页完全一致 */}
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
                                                } diary-canvas-textarea min-h-[360px] w-full resize-none overflow-hidden border-none bg-transparent p-0 text-left text-[17px] sm:text-[18px] placeholder:text-zinc-300 outline-none ring-0 diary-prose diary-wenkai`}
                                            />
                                        </label>
                                    </div>

                                    {/* 右侧翼栏（桌面端 ≥1280px）：日记配图 · 相册画廊 */}
                                    <aside className="diary-wing-sidebar w-full shrink-0 space-y-3 scrollbar-hide">
                                        <DiaryDetailsFields
                                            draft={draft}
                                            onChange={patch => setDraft(d => ({...d, ...patch}))}
                                            onUpload={upload}
                                            uploading={uploading}
                                            uploadError={uploadError}
                                            tagInput={tagInput}
                                            onTagInputChange={setTagInput}
                                            onlyGallery
                                            layout="sidebar"
                                        />
                                    </aside>
                                </div>
                            </fieldset>

                            {error && (
                                <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                                    {error}
                                </p>
                            )}
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

                {/* 底部悬浮状态条：字数、印记快捷入口（移动端）、一键排版、快捷键；固定吸附于视口底部 */}
                {editing && (
                    <div className="pointer-events-none absolute bottom-5 inset-x-0 z-20 flex justify-center pb-[env(safe-area-inset-bottom)]">
                        <div className="pointer-events-auto inline-flex items-center gap-3 rounded-full border border-zinc-200 bg-white/90 px-4 py-1.5 text-xs text-zinc-500 shadow-lg shadow-zinc-900/5 backdrop-blur-md">
                            <span className="diary-num">{wordCount} 字</span>
                            <button
                                type="button"
                                onClick={() => setMetaDrawerOpen(true)}
                                title="设置心情、天气与标签"
                                className="inline-flex min-[1280px]:hidden items-center gap-1 font-medium text-zinc-700 transition-colors hover:text-orange-600"
                            >
                                <span className="h-3 w-px bg-zinc-200 -ml-1 mr-1" aria-hidden="true"/>
                                {draft.mood ? (
                                    <DiaryMoodIcon mood={draft.mood} size={14}/>
                                ) : draft.weather ? (
                                    <WeatherIcon weather={draft.weather} size={13}/>
                                ) : (
                                    <Sparkles size={12}/>
                                )}
                                <span>今日印记</span>
                            </button>
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
                )}
            </section>

            {/* 移动端/窄屏印记设置抽屉（从底部滑出，一次性设置心情、天气、标签） */}
            {metaDrawerOpen && (
                <div
                    data-modal-scroll-lock
                    className="fixed inset-0 z-[110] flex flex-col justify-end bg-black/50 backdrop-blur-xs transition-opacity"
                    onClick={() => setMetaDrawerOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="设置今日印记"
                        className="w-full max-w-lg mx-auto rounded-t-3xl bg-white p-5 shadow-2xl transition-transform animate-in slide-in-from-bottom duration-200 max-h-[85dvh] overflow-y-auto scrollbar-hide"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-zinc-200"/>

                        <div className="flex items-center justify-between pb-3 border-b border-zinc-150 mb-3.5">
                            <div className="flex items-center gap-2">
                                <Sparkles size={16} className="text-orange-500"/>
                                <h3 className="text-sm font-bold text-zinc-900">这一天的印记</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMetaDrawerOpen(false)}
                                className="rounded-full bg-zinc-950 px-4 py-1.5 text-xs font-bold text-white shadow-xs active:scale-95 hover:bg-black"
                            >
                                完成
                            </button>
                        </div>

                        {/* 心情、天气、标签设置 */}
                        <DiaryDetailsFields
                            draft={draft}
                            onChange={patch => setDraft(d => ({...d, ...patch}))}
                            onUpload={upload}
                            uploading={uploading}
                            tagInput={tagInput}
                            onTagInputChange={setTagInput}
                            onlyMetadata
                        />
                    </div>
                </div>
            )}

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
