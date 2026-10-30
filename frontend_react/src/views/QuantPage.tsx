import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    BarChart3,
    BookOpen,
    Clock3,
    Code2,
    ExternalLink,
    FlaskConical,
    FolderInput,
    Layers,
    List,
    LockKeyhole,
    Maximize2,
    MessageSquareQuote,
    Minimize2,
    Network,
    PanelLeftClose,
    PanelLeftOpen,
    Paperclip,
    Plus,
    RefreshCw,
    Sparkles,
    Trash2,
} from 'lucide-react';
import { useQuant } from '../hooks/useQuant';
import { useQuantViewport } from '../hooks/useQuantViewport';
import { useQuantNavigation } from '../hooks/useQuantNavigation';
import { quantApi } from '../api/quant';
import { quantDate } from '../utils/quant';
import { EntryList } from '../components/Quant/EntryList';
import { ReportPanel } from '../components/Quant/ReportPanel';
import { FactorGraph } from '../components/Quant/FactorGraph';
import { FactorLibrary } from '../components/Quant/FactorLibrary';
import { EntryEditor } from '../components/Quant/EntryEditor';
import { CodePanel, type QuantCodeSeed } from '../components/Quant/CodePanel';
import { BacktestsPanel } from '../components/Quant/BacktestsPanel';
import { FeedbackPanel } from '../components/Quant/feedback/FeedbackPanel';
import { AttachmentsPanel } from '../components/Quant/AttachmentsPanel';
import { AIHistory, AIStartModal, type QuantAIRequest } from '../components/Quant/AIPanel';
import { NewEntryModal } from '../components/Quant/NewEntryModal';
import { BatchPanel } from '../components/Quant/intake/BatchPanel';
import { UnsavedDialog } from '../components/Quant/UnsavedDialog';
import { QuantBadge, QuantButton, QuantEmpty } from '../components/Quant/ui';
import ConfirmationModal from '../components/common/ConfirmationModal';
import type { QuantCodeVersion, QuantKind } from '../types/api/quant';

const kindBadgeConfig: Record<QuantKind, { label: string; tone: 'orange' | 'blue' | 'emerald' }> = {
    factor: { label: '因子', tone: 'orange' },
    indicator: { label: '指标', tone: 'blue' },
    strategy: { label: '策略', tone: 'emerald' },
};

export default function QuantPage() {
    const { collId = '', entryId = '' } = useParams();
    return <QuantWorkbench key={collId} collection={collId} entryId={entryId} />;
}

function QuantWorkbench({ collection, entryId }: { collection: string; entryId: string }) {
    const navigate = useNavigate();
    const { attach: attachViewport, height: viewportHeight } = useQuantViewport();
    const controller = useQuant(collection, entryId);
    const guard = useQuantNavigation();
    const [tab, setTab] = useState('report');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [wideMode, setWideMode] = useState(false);
    const [library, setLibrary] = useState(false);
    const [initialExperiment, setInitialExperiment] = useState<string>();
    const [initialComparison, setInitialComparison] = useState<string>();
    const [graph, setGraph] = useState<string | null>(null);
    const [lastGraphFocus, setLastGraphFocus] = useState('');
    const [sourceReport, setSourceReport] = useState('');
    const [creating, setCreating] = useState(false);
    const [batches, setBatches] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [seed, setSeed] = useState<QuantCodeSeed | null>(null);
    const [aiRequest, setAIRequest] = useState<QuantAIRequest | null>(null);
    const [selectedRun, setSelectedRun] = useState('');
    const [analysisModels, setAnalysisModels] = useState<Record<string, string>>({});
    const [extra, setExtra] = useState('');
    const clearExtra = useCallback(() => setExtra(''), []);
    const clearSeed = useCallback(() => setSeed(null), []);
    const selectEntry = (id: string, report = '') =>
        guard.request(() => {
            setGraph(null);
            setLibrary(false);
            setSourceReport(report);
            setTab('report');
            setExtra('');
            setSeed(null);
            setSelectedRun('');
            navigate(`/quant/${collection}/entries/${id}`);
        });
    const startAI = (version: QuantCodeVersion, kind: 'explain' | 'convert') => setAIRequest({ version, kind });
    const entry = controller.detail;

    const feedbackCount = (entry?.sources || []).filter(
        (row) => row.payload.provenance === 'external_feedback',
    ).length;
    const reportCount = entry?.reports?.length || 0;
    const hasRunningTask = entry?.runs.some((run) => ['pending', 'running'].includes(run.status)) || false;

    const tabs = [
        { id: 'report', label: 'AI 研究报告', icon: FlaskConical, count: reportCount, pulse: hasRunningTask },
        { id: 'notes', label: '补充笔记', icon: BookOpen, count: entry?.content?.trim() ? 1 : 0 },
        { id: 'code', label: '代码实现', icon: Code2, count: entry?.implementations.length || 0 },
        { id: 'backtests', label: '回测记录', icon: BarChart3, count: entry?.backtests.length || 0 },
        { id: 'feedback', label: '使用反馈', icon: MessageSquareQuote, count: feedbackCount },
        { id: 'attachments', label: '附件', icon: Paperclip, count: entry?.attachments.length || 0 },
    ];

    const kindInfo = entry ? kindBadgeConfig[entry.kind] || kindBadgeConfig.factor : null;

    return (
        <div
            ref={attachViewport}
            style={{ height: viewportHeight }}
            className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden bg-[#F4F5F8] font-sans text-slate-800 selection:bg-orange-100 selection:text-orange-900"
        >
            {/* 极简一体化单行工作台顶栏 (48px) — 释放全部纵向阅读空间 */}
            <header className="z-30 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200/90 bg-white/95 px-3 py-1.5 backdrop-blur-md sm:px-4">
                {/* 左侧：导航 + 侧栏开关 + 文集与当前研究面包屑 */}
                <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                    <button
                        type="button"
                        aria-label="返回文集首页"
                        onClick={() => guard.request(() => navigate('/'))}
                        className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    {!library && graph === null && (
                        <button
                            type="button"
                            aria-label={sidebarCollapsed ? '展开研究列表侧边栏' : '收起研究列表侧边栏'}
                            title={sidebarCollapsed ? '展开研究目录' : '收起研究目录（专注阅读）'}
                            onClick={() => setSidebarCollapsed((prev) => !prev)}
                            className="hidden shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-orange-600 md:inline-flex"
                        >
                            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                        </button>
                    )}

                    <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-orange-200/80 bg-gradient-to-br from-orange-50 to-amber-50 text-orange-500 shadow-2xs">
                            <FlaskConical size={14} />
                        </div>
                        <h1 className="truncate text-xs font-bold text-slate-800 sm:text-sm">
                            {controller.title || '量化研究库'}
                        </h1>
                        <span className="hidden items-center gap-1 rounded-md border border-slate-200/70 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 2xl:inline-flex">
                            <LockKeyhole size={10} />
                            私有
                        </span>
                    </div>

                    {entry && !library && graph === null && (
                        <div className="hidden min-w-0 items-center gap-2 lg:flex">
                            <span className="text-slate-300">/</span>
                            {kindInfo && (
                                <QuantBadge tone={kindInfo.tone} className="!px-2 !py-0 text-[10px]">
                                    {kindInfo.label}
                                </QuantBadge>
                            )}
                            <h2 className="max-w-[200px] truncate text-sm font-extrabold text-slate-900 xl:max-w-[280px]">
                                {entry.title}
                            </h2>
                            {entry.sourceUrl && (
                                <a
                                    href={entry.sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="打开来源网址"
                                    className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-600 hover:bg-orange-100"
                                >
                                    <ExternalLink size={10} />
                                    来源
                                </a>
                            )}
                        </div>
                    )}

                    {guard.dirty && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                            未保存
                        </span>
                    )}
                </div>

                {/* 中部：当打开具体条目时，页签直接嵌入单行顶栏中央（桌面端零额外高度占用） */}
                {entry && !library && graph === null && (
                    <nav
                        aria-label="研究详情页签"
                        className="order-3 flex w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-100/80 p-0.5 scrollbar-hide xl:order-2 xl:w-auto"
                    >
                        {tabs.map((item) => {
                            const active = tab === item.id;
                            return (
                                <button
                                    type="button"
                                    key={item.id}
                                    onClick={() => guard.request(() => setTab(item.id))}
                                    aria-current={active ? 'page' : undefined}
                                    className={`group relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                                        active
                                            ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/70'
                                            : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
                                    }`}
                                >
                                    <item.icon
                                        size={13}
                                        className={
                                            active ? 'text-orange-500' : 'text-slate-400 group-hover:text-slate-600'
                                        }
                                    />
                                    <span>{item.label}</span>
                                    {item.count > 0 && (
                                        <span
                                            className={`inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1 py-0.2 font-mono text-[10px] leading-tight ${
                                                active
                                                    ? 'bg-orange-500 text-white'
                                                    : 'bg-slate-200/70 text-slate-600'
                                            }`}
                                        >
                                            {item.count}
                                        </span>
                                    )}
                                    {item.pulse && (
                                        <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-ping" />
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                )}

                {/* 右侧：全局工具组 + 条目操作 */}
                <div className="order-2 flex shrink-0 items-center gap-1.5 xl:order-3">
                    <QuantButton size="sm" onClick={() => guard.request(() => setBatches(true))}>
                        <FolderInput size={13} />
                        <span className="hidden sm:inline">收集批次</span>
                    </QuantButton>
                    <QuantButton
                        size="sm"
                        primary={library}
                        onClick={() =>
                            guard.request(() => {
                                setGraph(null);
                                setInitialExperiment(undefined);
                                setInitialComparison(undefined);
                                setLibrary((value) => !value);
                            })
                        }
                    >
                        <FlaskConical size={13} />
                        <span>因子候选库</span>
                    </QuantButton>
                    <QuantButton
                        size="sm"
                        primary={graph !== null}
                        onClick={() =>
                            guard.request(() => {
                                setLibrary(false);
                                setGraph(lastGraphFocus);
                            })
                        }
                    >
                        <Network size={13} />
                        <span className="hidden sm:inline">关系图谱</span>
                    </QuantButton>
                    <QuantButton
                        size="sm"
                        aria-label="刷新量化研究"
                        title="刷新数据"
                        disabled={controller.busy || controller.loading}
                        onClick={() =>
                            guard.request(() => {
                                void controller.safe(async () => {
                                    await controller.reload();
                                    guard.resetEditors();
                                }, false);
                            })
                        }
                    >
                        <RefreshCw size={13} className={controller.loading ? 'animate-spin' : ''} />
                    </QuantButton>
                    {entry && !library && graph === null && (
                        <>
                            <button
                                type="button"
                                aria-label={wideMode ? '切换标准阅读宽度' : '切换宽屏工作台模式'}
                                title={wideMode ? '切换标准阅读宽度' : '切换超宽空间视图'}
                                onClick={() => setWideMode((prev) => !prev)}
                                className="hidden rounded-lg border border-slate-200/90 bg-white p-1.5 text-slate-500 transition hover:border-orange-200 hover:text-orange-600 lg:inline-flex"
                            >
                                {wideMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </button>
                            <QuantButton
                                size="sm"
                                danger
                                aria-label="删除研究"
                                title="删除这条研究"
                                disabled={controller.busy}
                                onClick={() => guard.request(() => setDeleting(true))}
                            >
                                <Trash2 size={13} />
                            </QuantButton>
                        </>
                    )}
                </div>
            </header>

            {controller.error && !library && graph === null && (
                <div
                    role="alert"
                    className="flex shrink-0 flex-wrap items-center gap-3 border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-600"
                >
                    <span className="min-w-0 flex-1 break-words">{controller.error}</span>
                    <button
                        type="button"
                        className="shrink-0 whitespace-nowrap rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-red-600 shadow-2xs ring-1 ring-red-200 hover:bg-red-50"
                        onClick={() =>
                            guard.request(() => {
                                void controller.safe(async () => {
                                    await controller.reload();
                                    guard.resetEditors();
                                }, false);
                            })
                        }
                    >
                        重试
                    </button>
                </div>
            )}

            <div className="flex min-h-0 flex-1">
                {/* 左侧研究条目目录栏 — 紧凑型空间索引 */}
                <aside
                    className={`${
                        library || graph !== null
                            ? 'hidden'
                            : entryId
                              ? sidebarCollapsed
                                  ? 'hidden'
                                  : 'hidden md:flex'
                              : 'flex'
                    } w-full min-w-0 shrink-0 flex-col border-r border-slate-200/90 bg-white md:w-72`}
                >
                    <EntryList
                        entries={controller.entries}
                        current={entryId}
                        loading={controller.loading}
                        busy={controller.busy}
                        select={selectEntry}
                        create={() => guard.request(() => setCreating(true))}
                        language={controller.languageFilter}
                        setLanguage={(value) => controller.setLanguageFilter(value)}
                    />
                </aside>

                {/* 右侧主研究工作区 */}
                <main
                    className={`${
                        entryId || library || graph !== null ? 'flex' : 'hidden'
                    } min-h-0 min-w-0 flex-1 flex-col md:flex`}
                >
                    {!library && graph === null && entryId && (
                        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-white px-3 py-2 lg:hidden">
                            <div className="flex min-w-0 items-center gap-2">
                                <QuantButton
                                    size="sm"
                                    onClick={() => guard.request(() => navigate(`/quant/${collection}`))}
                                    className="md:hidden"
                                >
                                    <List size={13} />
                                    研究列表
                                </QuantButton>
                                {kindInfo && (
                                    <QuantBadge tone={kindInfo.tone} className="!px-2 !py-0 text-[10px]">
                                        {kindInfo.label}
                                    </QuantBadge>
                                )}
                                <span className="min-w-0 truncate text-xs font-bold text-slate-900">
                                    {entry?.title || '研究详情'}
                                </span>
                            </div>
                            <span className="shrink-0 font-mono text-[10px] text-slate-400">
                                <Clock3 size={10} className="mr-0.5 inline" />
                                {quantDate(entry?.updatedAt)}
                            </span>
                        </div>
                    )}

                    {graph !== null ? (
                        <FactorGraph
                            key={graph}
                            collection={collection}
                            initialFocus={graph}
                            onFocusChange={setLastGraphFocus}
                            openExperiment={(id) => {
                                setGraph(null);
                                setInitialComparison(undefined);
                                setInitialExperiment(id);
                                setLibrary(true);
                            }}
                            openComparison={(id) => {
                                setGraph(null);
                                setInitialExperiment(undefined);
                                setInitialComparison(id);
                                setLibrary(true);
                            }}
                            close={() => {
                                setGraph(null);
                                setInitialExperiment(undefined);
                                setInitialComparison(undefined);
                                setLibrary(true);
                            }}
                            openSource={(node) => {
                                setGraph(null);
                                setLibrary(false);
                                setSourceReport(node.reportId);
                                setTab('report');
                                navigate(`/quant/${collection}/entries/${node.entryId}`);
                            }}
                        />
                    ) : library ? (
                        <FactorLibrary
                            initialComparison={initialComparison}
                            initialExperiment={initialExperiment}
                            collection={collection}
                            openGraph={(candidate) => {
                                setLibrary(false);
                                setLastGraphFocus(candidate.id);
                                setGraph(candidate.id);
                            }}
                            register={guard.register}
                            request={guard.request}
                            close={() => {
                                setLibrary(false);
                                setInitialExperiment(undefined);
                                setInitialComparison(undefined);
                            }}
                            openSource={(candidate) => {
                                setLibrary(false);
                                setSourceReport(candidate.reportId);
                                setTab('report');
                                if (candidate.entryId === entryId) void controller.safe(controller.refresh, false);
                                navigate(`/quant/${collection}/entries/${candidate.entryId}`);
                            }}
                        />
                    ) : controller.detailLoading ? (
                        <div className="m-4 space-y-4" aria-label="研究加载中">
                            <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70" />
                            <div className="h-96 animate-pulse rounded-2xl bg-white" />
                        </div>
                    ) : entry ? (
                        <div className="min-h-0 flex-1 overflow-auto p-3 scrollbar-hide sm:p-5">
                            <div
                                key={`${entry.id}:${guard.resetEpoch}`}
                                className={`mx-auto transition-all duration-200 ${
                                    wideMode ? 'max-w-[1680px]' : tab === 'report' ? 'max-w-[1480px]' : 'max-w-5xl'
                                }`}
                            >
                                {tab === 'report' && (
                                    <ReportPanel
                                        key={`${entry.id}:${sourceReport}`}
                                        initialReportId={sourceReport}
                                        entry={entry}
                                        selectedModelId={analysisModels[entry.id] || ''}
                                        onModelChange={(id) => setAnalysisModels((current) => ({ ...current, [entry.id]: id }))}
                                        collection={collection}
                                        controller={controller}
                                        register={guard.register}
                                        request={guard.request}
                                        code={() => setTab('code')}
                                        openFactors={() => {
                                            setInitialExperiment(undefined);
                                            setInitialComparison(undefined);
                                            setLibrary(true);
                                        }}
                                        openExperiments={(id) => {
                                            setInitialComparison(undefined);
                                            setInitialExperiment(id || '');
                                            setLibrary(true);
                                        }}
                                    />
                                )}
                                {tab === 'feedback' && (
                                    <FeedbackPanel
                                        entry={entry}
                                        collection={collection}
                                        controller={controller}
                                        register={guard.register}
                                        request={guard.request}
                                        openReport={(id) => {
                                            setSourceReport(id);
                                            setTab('report');
                                        }}
                                    />
                                )}
                                {tab === 'notes' && (
                                    <EntryEditor
                                        key={entry.id}
                                        entry={entry}
                                        collection={collection}
                                        controller={controller}
                                        register={guard.register}
                                        extra={extra}
                                        consumeExtra={clearExtra}
                                    />
                                )}{' '}
                                {tab === 'code' && (
                                    <div className="space-y-5">
                                        <CodePanel
                                            key={entry.id}
                                            entry={entry}
                                            collection={collection}
                                            controller={controller}
                                            register={guard.register}
                                            request={guard.request}
                                            seed={seed}
                                            consumeSeed={clearSeed}
                                            startAI={startAI}
                                        />
                                        <AIHistory
                                            collection={collection}
                                            entry={entry}
                                            controller={controller}
                                            selectedId={selectedRun}
                                            select={setSelectedRun}
                                            request={guard.request}
                                            appendExplanation={(text) => {
                                                setSelectedRun('');
                                                setExtra(text);
                                                setTab('notes');
                                            }}
                                        />
                                    </div>
                                )}
                                {tab === 'backtests' && (
                                    <BacktestsPanel
                                        key={entry.id}
                                        entry={entry}
                                        collection={collection}
                                        controller={controller}
                                        register={guard.register}
                                        request={guard.request}
                                    />
                                )}{' '}
                                {tab === 'attachments' && (
                                    <AttachmentsPanel
                                        key={entry.id}
                                        entry={entry}
                                        collection={collection}
                                        controller={controller}
                                        register={guard.register}
                                        request={guard.request}
                                        importCode={(data) => {
                                            setSeed(data);
                                            setTab('code');
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-1 items-center justify-center p-6">
                            <div className="w-full max-w-2xl">
                                <QuantEmpty
                                    title={entryId ? '无法打开这条研究' : '把你发现的量化代码，交给 AI 深度研究'}
                                    description={
                                        entryId
                                            ? '条目可能已删除，或当前账户没有访问权限。你可以从左侧研究列表重新打开。'
                                            : '粘贴源码（Python / Pine / MQL4 / 通达信）、说明或来源网址，AI 将自动梳理想法原理、参数约束、五维质量评分与首轮验证方案。'
                                    }
                                >
                                    {!entryId && (
                                        <div className="flex flex-wrap items-center justify-center gap-3">
                                            <QuantButton primary onClick={() => setCreating(true)}>
                                                <Plus size={16} />
                                                收集并分析
                                            </QuantButton>
                                            <QuantButton onClick={() => setBatches(true)}>
                                                <Layers size={15} />
                                                批量收集多份资料
                                            </QuantButton>
                                            <QuantButton
                                                onClick={() => {
                                                    setGraph(null);
                                                    setLibrary(true);
                                                }}
                                            >
                                                <Sparkles size={15} />
                                                浏览因子候选库
                                            </QuantButton>
                                        </div>
                                    )}
                                </QuantEmpty>
                            </div>
                        </div>
                    )}
                </main>
            </div>
            {creating && (
                <NewEntryModal
                    collection={collection}
                    controller={controller}
                    register={guard.register}
                    close={() => guard.request(() => setCreating(false))}
                    created={(id) => {
                        setCreating(false);
                        setTab('report');
                        navigate(`/quant/${collection}/entries/${id}`);
                    }}
                />
            )}
            {entry && aiRequest && (
                <AIStartModal
                    request={aiRequest}
                    collection={collection}
                    entry={entry}
                    controller={controller}
                    close={() => setAIRequest(null)}
                    started={(run) => {
                        setAIRequest(null);
                        setSelectedRun(run.id);
                    }}
                />
            )}
            <ConfirmationModal
                isOpen={deleting}
                onClose={() => setDeleting(false)}
                title="删除这条研究？"
                description="研究条目将被软删除。代码历史、回测和附件引用保留，附件文件不会被误清理。"
                isLoading={controller.busy}
                onConfirm={async () => {
                    if (entry && (await controller.safe(() => quantApi.remove(collection, entry.id), false))) {
                        setDeleting(false);
                        controller.removeLocal(entry.id);
                        navigate(`/quant/${collection}`);
                    }
                }}
            />
            {batches && (
                <BatchPanel
                    collection={collection}
                    models={controller.models}
                    register={guard.register}
                    request={guard.request}
                    close={() => setBatches(false)}
                    openSource={selectEntry}
                    changed={() => void controller.safe(controller.reload, false)}
                />
            )}
            <UnsavedDialog guard={guard} error={controller.error} />
        </div>
    );
}
