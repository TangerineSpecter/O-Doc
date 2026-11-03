import {useSearchParams} from 'react-router-dom';
import {useMemo, useState} from 'react';
import {
    BookHeart,
    BookOpen,
    LayoutGrid,
    List,
    Maximize2,
    PenLine,
    Search,
    Sparkles,
    X,
} from 'lucide-react';
import {useDiary} from '../hooks/useDiary';
import {diaryMoods, type DiaryEntry, type DiaryMood} from '../types/api/diary';
import DiaryBrowseFilters from '../components/Diary/DiaryBrowseFilters';
import {matchesDiarySelection, type DiaryBrowseSelection} from '../components/Diary/diaryBrowse';
import DiaryCalendar from '../components/Diary/DiaryCalendar';
import DiaryCard from '../components/Diary/DiaryCard';
import DiaryEditor from '../components/Diary/DiaryEditor';
import DiaryMoodIcon from '../components/Diary/DiaryMoodIcon';
import DiaryReaderView from '../components/Diary/DiaryReaderView';
import {
    countDiaryWords,
    groupEntriesByMonth,
    localDay,
    parseDiaryDate,
} from '../components/Diary/diaryDate';
import '../components/Diary/diary.css';

export default function DiaryPage() {
    const {entries, loading, error, retry, save, remove} = useDiary();
    const [params, setParams] = useSearchParams();
    const [browse, setBrowse] = useState<DiaryBrowseSelection>({mode: 'all', value: ''});
    const [view, setView] = useState<'cards' | 'timeline' | 'reader'>('cards');
    const [keyword, setKeyword] = useState('');
    const [selected, setSelected] = useState('');
    const [month, setMonth] = useState(() => new Date());
    const [editor, setEditor] = useState<DiaryEntry | 'new' | null>(null);
    const [initialMood, setInitialMood] = useState<DiaryMood>('');
    const [readerSelectedId, setReaderSelectedId] = useState<string>('');

    const linkedEntry = entries.find(entry => entry.diaryId === params.get('entry'));
    const activeEditor = editor || linkedEntry;

    const closeEditor = () => {
        setEditor(null);
        setInitialMood('');
        if (params.has('entry')) {
            const next = new URLSearchParams(params);
            next.delete('entry');
            setParams(next, {replace: true});
        }
    };

    const filtered = useMemo(
        () =>
            entries
                .filter(
                    entry =>
                        matchesDiarySelection(entry, browse) &&
                        (!selected || entry.entryDate === selected) &&
                        `${entry.title}\n${entry.content}\n${entry.tags.join(' ')}`
                            .toLocaleLowerCase()
                            .includes(keyword.toLocaleLowerCase())
                )
                .sort(
                    (a, b) =>
                        b.entryDate.localeCompare(a.entryDate) || b.createdAt.localeCompare(a.createdAt)
                ),
        [entries, browse, selected, keyword]
    );

    const monthGroups = useMemo(() => groupEntriesByMonth(filtered), [filtered]);

    const stats = useMemo(() => {
        const totalWords = entries.reduce((sum, e) => sum + countDiaryWords(e.content), 0);
        const uniqueDays = new Set(entries.map(e => e.entryDate)).size;
        return {totalWords, uniqueDays};
    }, [entries]);

    const todayInfo = useMemo(() => parseDiaryDate(localDay(new Date())), []);

    const activeEntryIndex =
        activeEditor && activeEditor !== 'new'
            ? filtered.findIndex(e => e.diaryId === activeEditor.diaryId)
            : -1;
    const prevModalEntry = activeEntryIndex > 0 ? filtered[activeEntryIndex - 1] : null;
    const nextModalEntry =
        activeEntryIndex >= 0 && activeEntryIndex < filtered.length - 1
            ? filtered[activeEntryIndex + 1]
            : null;

    const activeInlineEntry =
        filtered.find(e => e.diaryId === readerSelectedId) || filtered[0] || null;
    const inlineIndex = activeInlineEntry
        ? filtered.findIndex(e => e.diaryId === activeInlineEntry.diaryId)
        : -1;
    const prevInlineEntry = inlineIndex > 0 ? filtered[inlineIndex - 1] : null;
    const nextInlineEntry =
        inlineIndex >= 0 && inlineIndex < filtered.length - 1 ? filtered[inlineIndex + 1] : null;

    return (
        <div className="diary-ambient-bg min-h-[calc(100dvh-64px)] text-zinc-900 selection:bg-zinc-950 selection:text-white pb-16">
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {/* 现代杂志生活刊头 (Editorial Masthead) */}
                <header className="relative pb-8 pt-2">
                    <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                        <div className="max-w-2xl">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                                <span className="diary-num font-bold text-zinc-700">{todayInfo.fullCn}</span>
                                <span>·</span>
                                <span>{todayInfo.weekdayLong}</span>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1 text-zinc-500">
                                    <Sparkles size={11} className="text-amber-500"/>
                                    每日纪事
                                </span>
                            </div>
                            <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl lg:text-[40px] leading-tight">
                                日记回顾
                            </h1>
                            <p className="mt-2 text-sm text-zinc-500 leading-relaxed sm:text-[15px]">
                                给时光一份温柔的留白。那些被悉心记录下的平淡日常，是岁月中不可复现的珍品。
                            </p>
                        </div>

                        {/* 现代微立体数据牌 & 快捷操作栏 */}
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-3 rounded-2xl border border-black/[0.06] bg-white/85 px-4 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] backdrop-blur-md">
                                <div className="text-left">
                                    <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                        典藏篇目
                                    </span>
                                    <span className="diary-display-num text-lg font-black text-zinc-900">
                                        {entries.length}{' '}
                                        <span className="text-xs font-normal text-zinc-400">篇</span>
                                    </span>
                                </div>
                                <div className="h-7 w-px bg-zinc-200/80"/>
                                <div className="text-left">
                                    <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                        累计书写
                                    </span>
                                    <span className="diary-display-num text-lg font-black text-zinc-900">
                                        {stats.totalWords.toLocaleString()}{' '}
                                        <span className="text-xs font-normal text-zinc-400">字</span>
                                    </span>
                                </div>
                                <div className="h-7 w-px bg-zinc-200/80"/>
                                <div className="text-left">
                                    <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                        记录天数
                                    </span>
                                    <span className="diary-display-num text-lg font-black text-zinc-900">
                                        {stats.uniqueDays}{' '}
                                        <span className="text-xs font-normal text-zinc-400">天</span>
                                    </span>
                                </div>
                            </div>

                            {/* 触感操作区 */}
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 rounded-full border border-black/[0.06] bg-white/90 px-3 py-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] backdrop-blur-md">
                                    <span className="text-xs text-zinc-400 pl-0.5">速记：</span>
                                    {diaryMoods.map(m => (
                                        <button
                                            type="button"
                                            key={m.value}
                                            title={`以「${m.label}」心情写日记`}
                                            disabled={loading}
                                            onClick={() => {
                                                setInitialMood(m.value);
                                                setEditor('new');
                                            }}
                                            className="rounded-full p-1 transition-transform hover:scale-120 hover:bg-zinc-100 disabled:opacity-40"
                                        >
                                            <DiaryMoodIcon mood={m.value} size={17}/>
                                        </button>
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => {
                                        setInitialMood('');
                                        setEditor('new');
                                    }}
                                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] transition-all hover:bg-black hover:shadow-[0_6px_20px_rgba(0,0,0,0.25)] hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-wait disabled:opacity-50"
                                >
                                    <PenLine size={15} strokeWidth={2.2}/>
                                    写日记
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                {/* 玻璃浮动控制坞 (Glassmorphic Control Dock) */}
                <div className="diary-glass-dock rounded-2xl p-3 my-6 flex flex-col items-start gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <DiaryBrowseFilters entries={entries} selection={browse} onChange={setBrowse}/>

                    <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-zinc-200/80 bg-white/95 px-3.5 py-1.5 shadow-2xs transition-colors focus-within:border-zinc-950 sm:w-56">
                            <Search size={14} className="shrink-0 text-zinc-400"/>
                            <input
                                aria-label="搜索日记"
                                value={keyword}
                                onChange={e => setKeyword(e.target.value)}
                                placeholder="搜索标题、正文或标签…"
                                className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                            />
                            {keyword && (
                                <button
                                    type="button"
                                    aria-label="清空搜索关键词"
                                    onClick={() => setKeyword('')}
                                    className="rounded-full p-0.5 text-zinc-400 hover:text-zinc-900"
                                >
                                    <X size={13}/>
                                </button>
                            )}
                        </label>

                        <div className="inline-flex rounded-full border border-zinc-200/80 bg-zinc-100/70 p-1 shadow-2xs">
                            {(
                                [
                                    {id: 'cards', label: '卡片画报', text: '画报', icon: LayoutGrid},
                                    {id: 'timeline', label: '岁月长卷', text: '长卷', icon: List},
                                    {id: 'reader', label: '沉浸书房', text: '书房', icon: BookOpen},
                                ] as const
                            ).map(v => {
                                const Icon = v.icon;
                                const active = view === v.id;
                                return (
                                    <button
                                        type="button"
                                        key={v.id}
                                        aria-label={v.label}
                                        aria-pressed={active}
                                        onClick={() => setView(v.id)}
                                        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-bold transition-all ${
                                            active
                                                ? 'bg-white text-zinc-950 shadow-xs'
                                                : 'text-zinc-500 hover:text-zinc-950'
                                        }`}
                                    >
                                        <Icon size={14}/>
                                        <span className="hidden sm:inline">{v.text}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {!loading && params.has('entry') && !linkedEntry && (
                    <p
                        role="alert"
                        className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                        这篇日记不存在、已删除或无权查看。
                    </p>
                )}

                {selected && (
                    <button
                        type="button"
                        onClick={() => setSelected('')}
                        className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-3.5 py-1 text-xs font-bold text-white shadow-xs"
                    >
                        <span>{selected}</span>
                        <span>· 清除日期筛选</span>
                        <X size={13}/>
                    </button>
                )}

                {/* 主体区域：左侧内容流 + 右侧月历卡 */}
                <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <section aria-label="日记列表" className="min-w-0">
                        {loading ? (
                            <div role="status" className="grid gap-6 sm:grid-cols-2">
                                <span className="sr-only">正在加载日记</span>
                                {[1, 2, 3, 4].map(n => (
                                    <div key={n} className="h-72 animate-pulse rounded-2xl bg-white/60 border border-zinc-200/50 shadow-xs"/>
                                ))}
                            </div>
                        ) : error ? (
                            <div
                                role="alert"
                                className="diary-art-card p-12 text-center"
                            >
                                <p className="text-sm font-medium text-zinc-600">{error}</p>
                                <button
                                    type="button"
                                    onClick={retry}
                                    className="mt-4 rounded-full bg-zinc-950 px-5 py-2 text-xs font-semibold text-white shadow-xs"
                                >
                                    重新加载
                                </button>
                            </div>
                        ) : !filtered.length ? (
                            <div className="diary-art-card px-6 py-20 text-center">
                                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100/80 text-zinc-700 shadow-2xs">
                                    <BookHeart size={26}/>
                                </div>
                                <h2 className="mt-5 text-base font-bold text-zinc-900">
                                    {entries.length ? '没有找到匹配的日记' : '从今天开始记录生活'}
                                </h2>
                                <p className="mt-1.5 text-sm text-zinc-500">
                                    {entries.length
                                        ? '试试其他关键词、心情、天气、标签或日期。'
                                        : '每一次随手写下的文字，都是日后的珍贵回忆。'}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (entries.length) {
                                            setBrowse({mode: 'all', value: ''});
                                            setKeyword('');
                                            setSelected('');
                                        } else {
                                            setInitialMood('');
                                            setEditor('new');
                                        }
                                    }}
                                    className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-black"
                                >
                                    {entries.length ? '清除筛选条件' : '写第一篇日记'}
                                </button>
                            </div>
                        ) : view === 'cards' ? (
                            /* 视图 1：现代错落流式画报排版 (Masonry Editorial Flow) */
                            <div className="columns-1 sm:columns-2 xl:columns-3 gap-6 [column-fill:_balance]">
                                {filtered.map(entry => (
                                    <DiaryCard
                                        key={entry.diaryId}
                                        entry={entry}
                                        onOpen={() => setEditor(entry)}
                                    />
                                ))}
                            </div>
                        ) : view === 'timeline' ? (
                            /* 视图 2：岁月长卷极简时间流 */
                            <div className="space-y-12">
                                {monthGroups.map(group => (
                                    <div key={group.yearMonth} className="space-y-6">
                                        <div className="flex items-center justify-between border-b border-zinc-200/80 pb-3">
                                            <div className="flex items-baseline gap-2">
                                                <h2 className="text-lg font-black tracking-tight text-zinc-950">
                                                    {group.year} 年 {group.month} 月
                                                </h2>
                                                <span className="text-xs font-medium text-zinc-400">
                                                    / {group.entries.length} 篇生活碎片
                                                </span>
                                            </div>
                                            <span className="diary-num text-xs font-semibold text-zinc-500">
                                                {group.totalWords.toLocaleString()} 字
                                            </span>
                                        </div>

                                        <div className="space-y-5">
                                            {group.entries.map(entry => (
                                                <DiaryCard
                                                    key={entry.diaryId}
                                                    entry={entry}
                                                    timeline
                                                    onOpen={() => setEditor(entry)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            /* 视图 3：沉浸书房（左侧目录列表 + 右侧纯净全文） */
                            <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
                                <div className="max-h-[82dvh] space-y-2 overflow-y-auto rounded-2xl border border-black/[0.06] bg-white/85 p-3 shadow-xs backdrop-blur-md scrollbar-hide">
                                    <div className="flex items-center justify-between px-3 py-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                        <span>文章目录 ({filtered.length})</span>
                                        <span>点击阅读</span>
                                    </div>
                                    {filtered.map(item => {
                                        const isCurrent = activeInlineEntry?.diaryId === item.diaryId;
                                        const d = parseDiaryDate(item.entryDate);
                                        return (
                                            <button
                                                type="button"
                                                key={item.diaryId}
                                                onClick={() => setReaderSelectedId(item.diaryId)}
                                                className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                                                    isCurrent
                                                        ? 'border-zinc-950 bg-zinc-950 text-white shadow-xs'
                                                        : 'border-transparent bg-zinc-50/60 text-zinc-900 hover:border-zinc-200 hover:bg-white hover:shadow-2xs'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span
                                                        className={`font-semibold ${
                                                            isCurrent ? 'text-zinc-300' : 'text-zinc-400'
                                                        }`}
                                                    >
                                                        {item.entryDate}（{d.weekdayShort}）
                                                    </span>
                                                    {item.mood && <DiaryMoodIcon mood={item.mood} size={15}/>}
                                                </div>
                                                <p className="mt-1.5 truncate text-sm font-bold">
                                                    {item.title}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>

                                {activeInlineEntry && (
                                    <div className="diary-art-card overflow-hidden">
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-white/60 px-6 py-3.5 backdrop-blur-xs">
                                            <span className="text-xs font-semibold text-zinc-400">
                                                第 {inlineIndex + 1} / {filtered.length} 篇
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setEditor(activeInlineEntry)}
                                                className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-4 py-1.5 text-xs font-bold text-white transition-all hover:bg-black shadow-xs"
                                            >
                                                <Maximize2 size={12}/>
                                                全屏沉浸阅读
                                            </button>
                                        </div>

                                        <DiaryReaderView
                                            entry={activeInlineEntry}
                                            showControlsBar
                                            prevEntry={prevInlineEntry}
                                            nextEntry={nextInlineEntry}
                                            onSelectEntry={next => setReaderSelectedId(next.diaryId)}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    <DiaryCalendar
                        month={month}
                        onMonth={setMonth}
                        entries={entries}
                        selected={selected}
                        onSelect={setSelected}
                        onOpenEntry={entry => setEditor(entry)}
                    />
                </div>

                {activeEditor && (
                    <DiaryEditor
                        key={activeEditor === 'new' ? `new-${initialMood}` : activeEditor.diaryId}
                        entry={activeEditor === 'new' ? undefined : activeEditor}
                        initialMood={initialMood}
                        prevEntry={prevModalEntry}
                        nextEntry={nextModalEntry}
                        onSelectEntry={next => setEditor(next)}
                        onClose={closeEditor}
                        onSave={save}
                        onDelete={remove}
                    />
                )}
            </main>
        </div>
    );
}
