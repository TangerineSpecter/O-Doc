import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    BarChart3,
    BookOpen,
    Code2,
    FlaskConical,
    List,
    LockKeyhole,
    Paperclip,
    RefreshCw,
    Trash2,
} from 'lucide-react';
import { useQuant } from '../hooks/useQuant';
import { useQuantViewport } from '../hooks/useQuantViewport';
import { useQuantNavigation } from '../hooks/useQuantNavigation';
import { quantApi } from '../api/quant';
import { EntryList } from '../components/Quant/EntryList';
import { EntryEditor } from '../components/Quant/EntryEditor';
import { CodePanel, type QuantCodeSeed } from '../components/Quant/CodePanel';
import { BacktestsPanel } from '../components/Quant/BacktestsPanel';
import { AttachmentsPanel } from '../components/Quant/AttachmentsPanel';
import { AIHistory, AIStartModal, type QuantAIRequest } from '../components/Quant/AIPanel';
import { NewEntryModal } from '../components/Quant/NewEntryModal';
import { UnsavedDialog } from '../components/Quant/UnsavedDialog';
import { QuantButton, QuantEmpty } from '../components/Quant/ui';
import ConfirmationModal from '../components/common/ConfirmationModal';
import type { QuantCodeVersion } from '../types/api/quant';

const tabs = [
    { id: 'notes', label: '研究说明', icon: BookOpen },
    { id: 'code', label: '代码实现', icon: Code2 },
    { id: 'backtests', label: '回测记录', icon: BarChart3 },
    { id: 'attachments', label: '附件', icon: Paperclip },
];

export default function QuantPage() {
    const { collId = '', entryId = '' } = useParams();
    return <QuantWorkbench key={collId} collection={collId} entryId={entryId} />;
}

function QuantWorkbench({ collection, entryId }: { collection: string; entryId: string }) {
    const navigate = useNavigate();
    const { attach: attachViewport, height: viewportHeight } = useQuantViewport();
    const controller = useQuant(collection, entryId);
    const guard = useQuantNavigation();
    const [tab, setTab] = useState('notes');
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [seed, setSeed] = useState<QuantCodeSeed | null>(null);
    const [aiRequest, setAIRequest] = useState<QuantAIRequest | null>(null);
    const [selectedRun, setSelectedRun] = useState('');
    const [extra, setExtra] = useState('');
    const clearExtra = useCallback(() => setExtra(''), []);
    const clearSeed = useCallback(() => setSeed(null), []);
    const selectEntry = (id: string) =>
        guard.request(() => {
            setTab('notes');
            setExtra('');
            setSeed(null);
            setSelectedRun('');
            navigate(`/quant/${collection}/entries/${id}`);
        });
    const startAI = (version: QuantCodeVersion, kind: 'explain' | 'convert') => setAIRequest({ version, kind });
    const entry = controller.detail;
    return (
        <div
            ref={attachViewport}
            style={{ height: viewportHeight }}
            className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden bg-slate-50 font-sans text-slate-800 selection:bg-orange-100 selection:text-orange-900"
        >
            <header className="z-30 flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
                <button
                    type="button"
                    aria-label="返回文集首页"
                    onClick={() => guard.request(() => navigate('/'))}
                    className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100"
                >
                    <ArrowLeft size={18} />
                </button>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-orange-100 bg-orange-50 text-orange-500">
                    <FlaskConical size={22} />
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-base font-bold text-slate-900">{controller.title || '量化研究库'}</h1>
                    <p className="mt-0.5 text-[11px] text-slate-400">逻辑 · 代码 · 实验证据</p>
                </div>
                <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 sm:inline-flex">
                    <LockKeyhole size={12} />
                    仅自己可见
                </span>
                {guard.dirty && <span className="text-xs text-orange-600">未保存</span>}
                <QuantButton
                    aria-label="刷新量化研究"
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
                    <RefreshCw size={15} />
                </QuantButton>
            </header>
            {controller.error && (
                <div
                    role="alert"
                    className="flex shrink-0 flex-wrap items-center gap-3 border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-600"
                >
                    <span className="min-w-0 flex-1 break-words">{controller.error}</span>
                    <button
                        type="button"
                        className="shrink-0 whitespace-nowrap rounded-md px-3 py-1 font-medium hover:bg-red-100"
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
                <aside
                    className={`${entryId ? 'hidden' : 'flex'} w-full min-w-0 shrink-0 flex-col border-r border-slate-200 bg-white md:flex md:w-80`}
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
                <main className={`${entryId ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col md:flex`}>
                    {entryId && (
                        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-white px-4 py-3 md:hidden">
                            <QuantButton onClick={() => guard.request(() => navigate(`/quant/${collection}`))}>
                                <List size={15} />
                                研究列表
                            </QuantButton>
                            <span className="min-w-0 truncate text-xs text-slate-500">
                                {entry?.title || '研究详情'}
                            </span>
                        </div>
                    )}
                    {controller.detailLoading ? (
                        <div className="m-6 space-y-5" aria-label="研究加载中">
                            <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70" />
                            <div className="h-80 animate-pulse rounded-2xl bg-white" />
                        </div>
                    ) : entry ? (
                        <>
                            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
                                <div className="min-w-0 flex-1">
                                    <h2 className="truncate text-sm font-bold text-slate-800">{entry.title}</h2>
                                    <p className="mt-1 text-[10px] text-slate-400">
                                        {entry.implementations.length} 个实现 · {entry.backtests.length} 次回测 ·{' '}
                                        {entry.attachments.length} 个附件
                                    </p>
                                </div>
                                <QuantButton
                                    danger
                                    aria-label="删除研究"
                                    disabled={controller.busy}
                                    onClick={() => guard.request(() => setDeleting(true))}
                                >
                                    <Trash2 size={15} />
                                </QuantButton>
                            </div>
                            <nav
                                aria-label="研究详情页签"
                                className="shrink-0 overflow-auto border-b border-slate-100 bg-white px-4 py-3 scrollbar-hide sm:px-6"
                            >
                                <div className="flex w-max gap-1 rounded-full bg-slate-100 p-1">
                                    {tabs.map((item) => (
                                        <button
                                            type="button"
                                            key={item.id}
                                            onClick={() => guard.request(() => setTab(item.id))}
                                            aria-current={tab === item.id ? 'page' : undefined}
                                            className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium transition ${tab === item.id ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <item.icon size={14} />
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </nav>
                            <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-hide sm:p-6">
                                <div key={`${entry.id}:${guard.resetEpoch}`} className="mx-auto max-w-5xl space-y-5">
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
                                        <>
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
                                        </>
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
                        </>
                    ) : (
                        <div className="flex flex-1 items-center justify-center p-6">
                            <div className="w-full max-w-xl">
                                <QuantEmpty
                                    title={entryId ? '无法打开这条研究' : '每个因子，都有自己的研究档案'}
                                    description={
                                        entryId
                                            ? '条目可能已删除，或当前账户没有访问权限。你可以从研究列表重新打开。'
                                            : '从左侧选择一条研究，或记录一个新的想法。逻辑、多语言实现与回测结果会放在同一个地方。'
                                    }
                                >
                                    {!entryId && (
                                        <QuantButton primary onClick={() => setCreating(true)}>
                                            <FlaskConical size={16} />
                                            新建研究
                                        </QuantButton>
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
                        setTab('notes');
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
            <UnsavedDialog guard={guard} error={controller.error} />
        </div>
    );
}
