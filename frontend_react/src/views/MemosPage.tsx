import React, {useEffect, useMemo, useRef, useState} from 'react';
import remarkGfm from 'remark-gfm';
import {
    Inbox,
    List,
    Network,
    Pin,
    Search,
    Shuffle,
    Sparkles,
} from 'lucide-react';
import {createMemo, deleteMemo, getMemoKnowledgeGraph, getMemoList, syncMemoVectors, updateMemo} from '../api/memo';
import type {CreateMemoParams, MemoItem, MemoKnowledgeGraph, MemoGraphNode} from '../types/api/memo';
import {CodeBlock} from '../components/Article/MarkdownElements';
import ConfirmationModal from '../components/common/ConfirmationModal';
import {useToast} from '../components/common/ToastProvider';
import KnowledgeGraphPanel from '../components/Memos/KnowledgeGraphPanel';
import MemoEditModal from '../components/Memos/MemoEditModal';
import MemoCard from '../components/Memos/MemoCard';
import MemosSidebar from '../components/Memos/MemosSidebar';
import RandomWalkModal from '../components/Memos/RandomWalkModal';

const remarkSoftLineBreaks = () => {
    const visit = (node: any) => {
        if (Array.isArray(node.children)) {
            const nextChildren: any[] = [];

            node.children.forEach((child: any) => {
                if (child.type === 'text' && child.value.includes('\n')) {
                    const lines = child.value.split('\n');
                    lines.forEach((line: string, index: number) => {
                        if (line) {
                            nextChildren.push({...child, value: line});
                        }
                        if (index < lines.length - 1) {
                            nextChildren.push({type: 'break'});
                        }
                    });
                    return;
                }

                visit(child);
                nextChildren.push(child);
            });

            node.children = nextChildren;
        }
    };

    return (tree: any) => visit(tree);
};

export default function MemosPage() {
    const [memos, setMemos] = useState<MemoItem[]>([]);
    const [content, setContent] = useState('');
    const [tag, setTag] = useState('');
    const [keyword, setKeyword] = useState('');
    const [selectedTag, setSelectedTag] = useState('');
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [editingMemo, setEditingMemo] = useState<MemoItem | null>(null);
    const [editContent, setEditContent] = useState('');
    const [editTag, setEditTag] = useState('');
    const [editPinned, setEditPinned] = useState(false);
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
    const [loading, setLoading] = useState(true);
    const isFirstMountRef = useRef(true);
    const [viewMode, setViewMode] = useState<'feed' | 'graph'>('feed');
    const [graphData, setGraphData] = useState<MemoKnowledgeGraph | null>(null);
    const [graphLoading, setGraphLoading] = useState(false);
    const [vectorSyncing, setVectorSyncing] = useState(false);
    const [selectedGraphNode, setSelectedGraphNode] = useState<MemoGraphNode | null>(null);
    const [graphDetailCollapsed, setGraphDetailCollapsed] = useState(true);
    const [randomWalkMemo, setRandomWalkMemo] = useState<MemoItem | null>(null);
    const [randomWalkCardPhase, setRandomWalkCardPhase] = useState<'entering' | 'visible' | 'leaving'>('visible');
    const [saving, setSaving] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const randomWalkTimerRef = useRef<number | null>(null);
    const randomWalkRevealTimerRef = useRef<number | null>(null);
    const {showToast} = useToast();

    const formatDate = (date: string) => {
        return new Date(date).toLocaleString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const visibleMemos = useMemo(() => (
        selectedTag
            ? memos.filter(memo => memo.tag === selectedTag || memo.tag.startsWith(`${selectedTag}/`))
            : memos
    ), [memos, selectedTag]);
    const pinnedMemos = useMemo(() => visibleMemos.filter(memo => memo.isPinned), [visibleMemos]);
    const unpinnedMemos = useMemo(() => visibleMemos.filter(memo => !memo.isPinned), [visibleMemos]);
    const tagCount = useMemo(() => new Set(memos.map(memo => memo.tag.trim()).filter(Boolean)).size, [memos]);
    const tagFilters = useMemo(() => {
        const counts = new Map<string, number>();

        memos.forEach(memo => {
            const normalizedTag = memo.tag.trim();
            if (!normalizedTag) return;

            const parts = normalizedTag.split('/').map(part => part.trim()).filter(Boolean);
            parts.forEach((_, index) => {
                const tagPath = parts.slice(0, index + 1).join('/');
                counts.set(tagPath, (counts.get(tagPath) || 0) + 1);
            });
        });

        return Array.from(counts.entries())
            .map(([name, count]) => ({name, count, depth: name.split('/').length - 1}))
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    }, [memos]);
    const totalCharacters = useMemo(() => visibleMemos.reduce((total, memo) => total + memo.content.length, 0), [visibleMemos]);
    const latestMemoTime = visibleMemos[0]?.createdAt ? formatDate(visibleMemos[0].createdAt) : '暂无记录';
    const normalizedKeyword = keyword.trim();
    const editHasChanges = !!editingMemo && (
        editContent !== editingMemo.content
        || editTag !== editingMemo.tag
        || editPinned !== editingMemo.isPinned
    );

    const memoMatchesSearch = (memo: MemoItem) => {
        const normalizedKeyword = keyword.trim().toLowerCase();
        return !normalizedKeyword
            || memo.content.toLowerCase().includes(normalizedKeyword)
            || memo.tag.toLowerCase().includes(normalizedKeyword);
    };

    const fetchKnowledgeGraph = async () => {
        setGraphLoading(true);
        try {
            const data = await getMemoKnowledgeGraph({
                keyword: normalizedKeyword || undefined,
                tag: selectedTag || undefined,
                limit: 100,
                threshold: 0.72,
            });
            setGraphData(data);
            setSelectedGraphNode(current => {
                if (!current) return null;
                return data.nodes.find(node => node.id === current.id) || null;
            });
        } catch (error) {
            console.error('Failed to fetch memo knowledge graph', error);
            showToast('知识图谱加载失败', 'error');
        } finally {
            setGraphLoading(false);
        }
    };

    const handleSyncHistoryMemos = async () => {
        if (vectorSyncing) return;

        setVectorSyncing(true);
        try {
            const result = await syncMemoVectors();
            showToast(`历史闪念已同步：${result.syncedCount}/${result.totalCount}`, 'success');
            await fetchKnowledgeGraph();
        } catch (error) {
            console.error('Failed to sync memo vectors', error);
            showToast('历史闪念同步失败', 'error');
        } finally {
            setVectorSyncing(false);
        }
    };

    const fetchMemos = async () => {
        setLoading(true);
        try {
            const data = await getMemoList({keyword});
            setMemos(data);
            const targetMemoId = new URLSearchParams(window.location.search).get('memoId');
            const targetMemo = data.find(item => item.memoId === targetMemoId);
            if (targetMemo) {
                setEditingMemo(targetMemo);
                setEditContent(targetMemo.content);
                setEditTag(targetMemo.tag);
                setEditPinned(targetMemo.isPinned);
                setShowDiscardConfirm(false);
            }
        } catch (error) {
            console.error('Failed to fetch memos', error);
            showToast('闪念加载失败', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isFirstMountRef.current) {
            isFirstMountRef.current = false;
            fetchMemos();
            return;
        }

        const timer = window.setTimeout(() => {
            fetchMemos();
        }, 180);
        return () => window.clearTimeout(timer);
    }, [keyword]);

    useEffect(() => {
        if (viewMode !== 'graph') return;

        const timer = window.setTimeout(() => {
            fetchKnowledgeGraph();
        }, 220);
        return () => window.clearTimeout(timer);
    }, [viewMode, keyword, selectedTag]);

    const handleCreate = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const nextContent = content.trim();
        if (!nextContent || saving) return;

        const payload: CreateMemoParams = {
            content: nextContent,
            tag: tag.trim(),
        };

        setSaving(true);
        try {
            const memo = await createMemo(payload);
            if (memoMatchesSearch(memo)) {
                setMemos(prev => [memo, ...prev]);
            }
            setContent('');
            setTag('');
            if (viewMode === 'graph') {
                fetchKnowledgeGraph();
            }
            showToast('闪念已收好', 'success');
        } catch (error) {
            console.error('Failed to create memo', error);
            showToast('闪念保存失败', 'error');
        } finally {
            setSaving(false);
        }
    };

    const patchMemo = async (memoId: string, payload: Partial<CreateMemoParams>) => {
        const previous = memos;
        setMemos(prev => prev.map(item => item.memoId === memoId ? {...item, ...payload} : item));
        try {
            const updated = await updateMemo(memoId, payload);
            setMemos(prev => (
                memoMatchesSearch(updated)
                    ? prev.map(item => item.memoId === memoId ? updated : item)
                    : prev.filter(item => item.memoId !== memoId)
            ));
            if (viewMode === 'graph') {
                fetchKnowledgeGraph();
            }
        } catch (error) {
            console.error('Failed to update memo', error);
            setMemos(previous);
            showToast('更新失败', 'error');
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            await deleteMemo(deleteId);
            setMemos(prev => prev.filter(item => item.memoId !== deleteId));
            setDeleteId(null);
            if (viewMode === 'graph') {
                fetchKnowledgeGraph();
            }
            showToast('闪念已删除', 'success');
        } catch (error) {
            console.error('Failed to delete memo', error);
            showToast('删除失败', 'error');
        }
    };

    const getMemoAuthorMeta = (memo: MemoItem) => {
        const source = memo as MemoItem & {
            agentName?: string;
            agent_name?: string;
            agent?: { name?: string };
            authorType?: 'agent' | 'user';
            creatorType?: 'agent' | 'user';
            creator_type?: 'agent' | 'user';
            creatorId?: string;
            creator_id?: string;
            creatorName?: string;
            creator_name?: string;
            createdByType?: 'agent' | 'user';
            userId?: string;
            user_id?: string;
            userName?: string;
            user_name?: string;
            authorName?: string;
            createdByName?: string;
        };

        const creatorType = source.creatorType || source.creator_type;
        const agentName = source.creatorName
            || source.creator_name
            || source.agentName
            || source.agent_name
            || source.agent?.name;
        const isAgent = creatorType === 'agent'
            || Boolean(agentName)
            || source.authorType === 'agent'
            || source.createdByType === 'agent';

        return {
            name: isAgent
                ? (agentName || source.creatorId || source.creator_id || 'Agent')
                : (source.userName
                    || source.user_name
                    || source.authorName
                    || source.createdByName
                    || source.creatorId
                    || source.creator_id
                    || source.userId
                    || source.user_id
                    || '未知账号'),
            isAgent,
        };
    };

    const renderTagLabel = (tagPath: string) => {
        const parts = tagPath.split('/').filter(Boolean);
        if (parts.length <= 1) return tagPath;

        return parts.map((part, index) => (
            <React.Fragment key={`${tagPath}-${index}`}>
                {index > 0 && <span className="mx-1 text-slate-300">/</span>}
                <span>{part}</span>
            </React.Fragment>
        ));
    };

    const openEditModal = (memo: MemoItem) => {
        setEditingMemo(memo);
        setEditContent(memo.content);
        setEditTag(memo.tag);
        setEditPinned(memo.isPinned);
        setShowDiscardConfirm(false);
    };

    const closeEditModal = (force = false) => {
        if (editSaving && !force) return;
        setEditingMemo(null);
        setEditContent('');
        setEditTag('');
        setEditPinned(false);
        setShowDiscardConfirm(false);
    };

    const requestCloseEditModal = () => {
        if (!editingMemo || editSaving) return;
        if (editHasChanges) {
            setShowDiscardConfirm(true);
            return;
        }
        closeEditModal();
    };

    const closeRandomWalk = () => {
        if (randomWalkTimerRef.current !== null) {
            window.clearTimeout(randomWalkTimerRef.current);
            randomWalkTimerRef.current = null;
        }
        if (randomWalkRevealTimerRef.current !== null) {
            window.clearTimeout(randomWalkRevealTimerRef.current);
            randomWalkRevealTimerRef.current = null;
        }
        setRandomWalkMemo(null);
        setRandomWalkCardPhase('visible');
    };

    const revealRandomWalkMemo = (memo: MemoItem) => {
        setRandomWalkMemo(memo);
        setRandomWalkCardPhase('entering');
        randomWalkRevealTimerRef.current = window.setTimeout(() => {
            setRandomWalkCardPhase('visible');
            randomWalkRevealTimerRef.current = null;
        }, 20);
    };

    const pickRandomMemo = () => {
        if (visibleMemos.length === 0) {
            showToast('当前范围还没有可漫步的闪念', 'info');
            return;
        }

        const candidates = visibleMemos.length > 1 && randomWalkMemo
            ? visibleMemos.filter(memo => memo.memoId !== randomWalkMemo.memoId)
            : visibleMemos;
        const nextMemo = candidates[Math.floor(Math.random() * candidates.length)];

        if (!randomWalkMemo) {
            revealRandomWalkMemo(nextMemo);
            return;
        }

        if (randomWalkTimerRef.current !== null) {
            window.clearTimeout(randomWalkTimerRef.current);
        }

        setRandomWalkCardPhase('leaving');
        randomWalkTimerRef.current = window.setTimeout(() => {
            revealRandomWalkMemo(nextMemo);
            randomWalkTimerRef.current = null;
        }, 180);
    };

    const handleEditSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!editingMemo || editSaving) return;

        const nextContent = editContent.trim();
        if (!nextContent) return;

        const payload: Partial<CreateMemoParams> = {
            content: nextContent,
            tag: editTag.trim(),
            isPinned: editPinned,
        };

        const previous = memos;
        setEditSaving(true);
        setMemos(prev => prev.map(item => item.memoId === editingMemo.memoId ? {...item, ...payload} : item));

        try {
            const updated = await updateMemo(editingMemo.memoId, payload);
            setMemos(prev => (
                memoMatchesSearch(updated)
                    ? prev.map(item => item.memoId === editingMemo.memoId ? updated : item)
                    : prev.filter(item => item.memoId !== editingMemo.memoId)
            ));
            if (viewMode === 'graph') {
                fetchKnowledgeGraph();
            }
            closeEditModal(true);
            showToast('闪念已更新', 'success');
        } catch (error) {
            console.error('Failed to update memo', error);
            setMemos(previous);
            showToast('更新失败', 'error');
        } finally {
            setEditSaving(false);
        }
    };

    useEffect(() => {
        if (!editingMemo) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();

            if (showDiscardConfirm) {
                setShowDiscardConfirm(false);
                return;
            }

            requestCloseEditModal();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editingMemo, editHasChanges, editSaving, showDiscardConfirm]);

    useEffect(() => {
        if (!randomWalkMemo) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            closeRandomWalk();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [randomWalkMemo]);

    useEffect(() => {
        return () => {
            if (randomWalkTimerRef.current !== null) {
                window.clearTimeout(randomWalkTimerRef.current);
            }
            if (randomWalkRevealTimerRef.current !== null) {
                window.clearTimeout(randomWalkRevealTimerRef.current);
            }
        };
    }, []);

    const markdownComponents = useMemo(() => ({
        p: ({children}: any) => <p className="my-2 leading-7">{children}</p>,
        a: ({children, href}: any) => (
            <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-orange-600 underline decoration-orange-200 underline-offset-2 transition hover:text-orange-700 hover:decoration-orange-400"
            >
                {children}
            </a>
        ),
        ul: ({children}: any) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({children}: any) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
        li: ({children}: any) => <li className="pl-1 leading-7">{children}</li>,
        blockquote: ({children}: any) => (
            <blockquote className="my-2 rounded-r-md border-l-4 border-orange-300 bg-orange-50/55 py-2 pl-4 pr-3 text-slate-700 [&_p]:my-0 [&_p]:leading-5">
                {children}
            </blockquote>
        ),
        hr: () => <hr className="my-4 border-slate-200"/>,
        h1: ({children}: any) => <h1 className="mb-2 mt-4 text-lg font-bold text-slate-950">{children}</h1>,
        h2: ({children}: any) => <h2 className="mb-2 mt-4 text-base font-bold text-slate-900">{children}</h2>,
        h3: ({children}: any) => <h3 className="mb-2 mt-3 text-sm font-bold text-slate-900">{children}</h3>,
        table: ({children}: any) => (
            <div className="my-3 max-w-full overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    {children}
                </table>
            </div>
        ),
        thead: ({children}: any) => <thead className="bg-slate-50 text-slate-600">{children}</thead>,
        tbody: ({children}: any) => <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>,
        th: ({children}: any) => <th className="whitespace-nowrap px-3 py-2 font-semibold">{children}</th>,
        td: ({children}: any) => <td className="whitespace-nowrap px-3 py-2 text-slate-700">{children}</td>,
        input: (props: any) => {
            if (props.type === 'checkbox') {
                return <input type="checkbox" checked={props.checked} readOnly className="mr-2 h-3.5 w-3.5 rounded border-slate-300 text-orange-500"/>;
            }
            return <input {...props}/>;
        },
        pre: ({children}: any) => <>{children}</>,
        code({inline, className, children, ...rest}: any) {
            const match = /language-(\w+)/.exec(className || '');
            const rawCode = String(children);
            const code = rawCode.replace(/\n$/, '');
            const isCodeBlock = Boolean(match) || rawCode.includes('\n');

            if (isCodeBlock) {
                return <CodeBlock language={match?.[1] || 'text'} code={code} {...rest}/>;
            }

            return (
                <code
                    className="rounded-md border border-orange-100 bg-orange-50 px-1.5 py-0.5 font-mono text-[0.9em] text-orange-700"
                    {...rest}
                >
                    {children}
                </code>
            );
        },
    }), []);

    const renderMemoCard = (memo: MemoItem, isPinnedSection = false) => {
        return (
            <MemoCard
                key={memo.memoId}
                memo={memo}
                isPinnedSection={isPinnedSection}
                markdownComponents={markdownComponents}
                remarkPlugins={[remarkSoftLineBreaks, remarkGfm]}
                onEdit={openEditModal}
                onPatch={patchMemo}
                onDelete={setDeleteId}
                formatDate={formatDate}
                renderTagLabel={renderTagLabel}
                getMemoAuthorMeta={getMemoAuthorMeta}
            />
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
            <ConfirmationModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={confirmDelete}
                title="删除闪念"
                description="确定要删除这条记录吗？删除后无法恢复。"
                confirmText="确认删除"
                type="danger"
            />

            {editingMemo && (
                <MemoEditModal
                    memo={editingMemo}
                    editContent={editContent}
                    editTag={editTag}
                    editPinned={editPinned}
                    editSaving={editSaving}
                    showDiscardConfirm={showDiscardConfirm}
                    onContentChange={setEditContent}
                    onTagChange={setEditTag}
                    onPinnedChange={setEditPinned}
                    onRequestClose={requestCloseEditModal}
                    onSubmit={handleEditSubmit}
                    onDiscardWithoutSaving={() => closeEditModal(true)}
                    onCancelDiscardConfirm={() => setShowDiscardConfirm(false)}
                />
            )}

            {randomWalkMemo && (
                <RandomWalkModal
                    memo={randomWalkMemo}
                    phase={randomWalkCardPhase}
                    markdownComponents={markdownComponents}
                    remarkPlugins={[remarkSoftLineBreaks, remarkGfm]}
                    onClose={closeRandomWalk}
                    onPickNext={pickRandomMemo}
                    formatDate={formatDate}
                    renderTagLabel={renderTagLabel}
                />
            )}

            <main className="mx-auto max-w-7xl">
                <section className="mb-4 sm:mb-5 rounded-xl border border-slate-100 bg-white p-3.5 sm:p-5 shadow-sm">
                    <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div className="flex items-center gap-2.5 sm:gap-3">
                                <span className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 text-orange-600 shadow-sm shadow-orange-500/10 shrink-0">
                                    <Sparkles className="h-4 w-4 sm:h-5 sm:w-5"/>
                                </span>
                                <div>
                                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-950">Memos</h1>
                                    <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-slate-500">把临时闪念收进一个清爽、可回看的焦点流。</p>
                                </div>
                            </div>
                        </div>

                        <div className="relative w-full lg:w-80">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 -translate-y-1/2 text-slate-400"/>
                            <input
                                value={keyword}
                                onChange={(event) => setKeyword(event.target.value)}
                                placeholder="搜索内容或标签"
                                className="h-9 sm:h-10 w-full rounded-full border border-slate-200 bg-slate-50 pl-8 sm:pl-9 pr-3 text-xs sm:text-sm outline-none transition hover:bg-white focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/15"
                            />
                        </div>
                    </div>

                    {/* 核心指标统计：移动端收拢为单行一体化数据条，桌面端保持标准 4 宫格 */}
                    <div className="mt-3 sm:mt-5">
                        {/* 移动端极简收拢条 (单行仅约 40px 高度，彻底解决大块留白问题) */}
                        <div className="grid grid-cols-4 items-center rounded-xl border border-slate-100 bg-slate-50/90 py-2 divide-x divide-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:hidden">
                            <div className="flex flex-col items-center justify-center px-1">
                                <span className="text-[10px] text-slate-400">全部</span>
                                <span className="mt-0.5 text-sm font-bold text-slate-900 leading-none">{visibleMemos.length}</span>
                            </div>
                            <div className="flex flex-col items-center justify-center px-1">
                                <span className="text-[10px] text-orange-500 font-medium">置顶</span>
                                <span className="mt-0.5 text-sm font-bold text-orange-600 leading-none">{pinnedMemos.length}</span>
                            </div>
                            <div className="flex flex-col items-center justify-center px-1">
                                <span className="text-[10px] text-slate-400">标签</span>
                                <span className="mt-0.5 text-sm font-bold text-slate-900 leading-none">{tagCount}</span>
                            </div>
                            <div className="flex flex-col items-center justify-center px-1 min-w-0">
                                <span className="text-[10px] text-slate-400">最近</span>
                                <span className="mt-0.5 text-[11px] font-semibold text-slate-700 truncate w-full text-center leading-none" title={latestMemoTime}>
                                    {latestMemoTime.replace(/(\d+)月(\d+)日/, '$1-$2')}
                                </span>
                            </div>
                        </div>

                        {/* 桌面端独立卡片 (>= sm) */}
                        <div className="hidden sm:grid sm:grid-cols-4 gap-3">
                            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                <p className="text-xs text-slate-500">当前视图</p>
                                <p className="mt-1 text-lg font-bold text-slate-900">{visibleMemos.length}</p>
                            </div>
                            <div className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2">
                                <p className="text-xs text-orange-600">置顶焦点</p>
                                <p className="mt-1 text-lg font-bold text-orange-700">{pinnedMemos.length}</p>
                            </div>
                            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                <p className="text-xs text-slate-500">标签</p>
                                <p className="mt-1 text-lg font-bold text-slate-900">{tagCount}</p>
                            </div>
                            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                <p className="text-xs text-slate-500">最近收集</p>
                                <p className="mt-1 truncate text-sm font-semibold text-slate-800">{latestMemoTime}</p>
                            </div>
                        </div>
                    </div>

                    {/* 视图模式切换与快捷操作栏 */}
                    <div className="mt-4 flex flex-col gap-2.5 border-t border-slate-100 pt-3.5 sm:flex-row sm:items-center sm:justify-between">
                        {/* 模式切换：移动端等宽两栏 50%/50%，桌面端自适应 */}
                        <div className="grid grid-cols-2 w-full sm:w-auto sm:inline-flex rounded-xl bg-slate-100 p-1">
                            <button
                                type="button"
                                onClick={() => setViewMode('feed')}
                                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-4 text-xs sm:text-sm font-semibold transition ${
                                    viewMode === 'feed'
                                        ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <List className="h-4 w-4" />
                                <span>信息流</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('graph')}
                                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-4 text-xs sm:text-sm font-semibold transition ${
                                    viewMode === 'graph'
                                        ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <Network className="h-4 w-4" />
                                <span>知识图谱</span>
                            </button>
                        </div>

                        {/* 桌面端快捷漫步按钮 */}
                        <div className="hidden sm:flex items-center gap-2">
                            <button
                                type="button"
                                onClick={pickRandomMemo}
                                disabled={visibleMemos.length === 0}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50/80 px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                                title="从当前范围抽一条闪念，单独漫步"
                            >
                                <Shuffle className="h-3.5 w-3.5" />
                                <span>随机漫步</span>
                                <span className="rounded-full bg-orange-200/70 px-1.5 py-0.2 text-[10px] text-orange-800">
                                    {visibleMemos.length}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* 移动端横向滑动标签栏 (在 feed 模式下可见) */}
                    {viewMode === 'feed' && (
                        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:hidden">
                            {/* 移动端快捷漫步胶囊 */}
                            <button
                                type="button"
                                onClick={pickRandomMemo}
                                disabled={visibleMemos.length === 0}
                                className="shrink-0 flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 active:scale-95 disabled:opacity-50"
                            >
                                <Shuffle className="h-3 w-3" />
                                <span>漫步</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedTag('')}
                                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                                    !selectedTag
                                        ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                全部 ({memos.length})
                            </button>
                            {tagFilters.map(item => (
                                <button
                                    key={item.name}
                                    type="button"
                                    onClick={() => setSelectedTag(selectedTag === item.name ? '' : item.name)}
                                    className={`shrink-0 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
                                        selectedTag === item.name
                                            ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    <span>{renderTagLabel(item.name)}</span>
                                    <span className={selectedTag === item.name ? 'text-orange-100' : 'text-slate-400'}>
                                        {item.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                {viewMode === 'graph' ? (
                    /* 知识图谱模式：全屏展示，彻底隐藏图2（快速收集、漫步、密度、标签），让图谱占据全屏 */
                    <section className="w-full">
                        <KnowledgeGraphPanel
                            graphData={graphData}
                            graphLoading={graphLoading}
                            vectorSyncing={vectorSyncing}
                            selectedGraphNode={selectedGraphNode}
                            graphDetailCollapsed={graphDetailCollapsed}
                            markdownComponents={markdownComponents}
                            remarkPlugins={[remarkSoftLineBreaks, remarkGfm]}
                            onRefresh={fetchKnowledgeGraph}
                            onSyncHistory={handleSyncHistoryMemos}
                            onSelectNode={setSelectedGraphNode}
                            onDetailCollapsedChange={setGraphDetailCollapsed}
                            onEditMemo={openEditModal}
                            formatDate={formatDate}
                            renderTagLabel={renderTagLabel}
                            getMemoAuthorMeta={getMemoAuthorMeta}
                        />
                    </section>
                ) : (
                    /* 信息流模式：桌面端左右分栏，移动端紧凑排布 */
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
                        <MemosSidebar
                            viewMode={viewMode}
                            content={content}
                            tag={tag}
                            saving={saving}
                            visibleMemoCount={visibleMemos.length}
                            totalCharacters={totalCharacters}
                            selectedTag={selectedTag}
                            normalizedKeyword={normalizedKeyword}
                            tagFilters={tagFilters}
                            onViewModeChange={setViewMode}
                            onContentChange={setContent}
                            onTagChange={setTag}
                            onCreate={handleCreate}
                            onPickRandomMemo={pickRandomMemo}
                            onSelectedTagChange={setSelectedTag}
                            renderTagLabel={renderTagLabel}
                        />

                        <section className="min-w-0">
                            {loading ? (
                                <div className="space-y-3.5">
                                    <div className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-sm animate-pulse space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="h-4 w-16 bg-orange-100 rounded-full"></div>
                                                <div className="h-3 w-20 bg-slate-100 rounded"></div>
                                            </div>
                                            <div className="h-4 w-8 bg-slate-100 rounded-full"></div>
                                        </div>
                                        <div className="space-y-2 py-1">
                                            <div className="h-4 w-full bg-slate-100 rounded"></div>
                                            <div className="h-4 w-4/5 bg-slate-100 rounded"></div>
                                        </div>
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                                            <div className="h-3 w-24 bg-slate-100 rounded"></div>
                                            <div className="h-3 w-12 bg-slate-100 rounded"></div>
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-sm animate-pulse space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="h-4 w-20 bg-orange-100 rounded-full"></div>
                                                <div className="h-3 w-16 bg-slate-100 rounded"></div>
                                            </div>
                                            <div className="h-4 w-8 bg-slate-100 rounded-full"></div>
                                        </div>
                                        <div className="space-y-2 py-1">
                                            <div className="h-4 w-11/12 bg-slate-100 rounded"></div>
                                            <div className="h-4 w-2/3 bg-slate-100 rounded"></div>
                                        </div>
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                                            <div className="h-3 w-20 bg-slate-100 rounded"></div>
                                            <div className="h-3 w-14 bg-slate-100 rounded"></div>
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-sm animate-pulse space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="h-4 w-14 bg-slate-200 rounded-full"></div>
                                            </div>
                                        </div>
                                        <div className="space-y-2 py-1">
                                            <div className="h-4 w-full bg-slate-100 rounded"></div>
                                            <div className="h-4 w-1/2 bg-slate-100 rounded"></div>
                                        </div>
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                                            <div className="h-3 w-16 bg-slate-100 rounded"></div>
                                        </div>
                                    </div>
                                </div>
                            ) : visibleMemos.length === 0 ? (
                                <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white text-center shadow-sm animate-in fade-in duration-200">
                                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
                                        <Sparkles className="h-7 w-7"/>
                                    </div>
                                    <p className="font-semibold text-slate-800">{normalizedKeyword || selectedTag ? '没有找到相关碎片' : '这里还没有碎片'}</p>
                                    <p className="mt-1 text-sm text-slate-400">{normalizedKeyword || selectedTag ? '换个关键词或标签，或者记录一条新的。' : '写下第一条，它会自然落到焦点流里。'}</p>
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in fade-in duration-200">
                                    {pinnedMemos.length > 0 && (
                                        <div>
                                            <div className="mb-3 flex items-center justify-between">
                                                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                                                    <Pin className="h-4 w-4 text-orange-600"/>
                                                    置顶焦点
                                                </h2>
                                                <span className="text-xs text-slate-400">{pinnedMemos.length} 条</span>
                                            </div>
                                            <div className="space-y-3">
                                                {pinnedMemos.map(memo => renderMemoCard(memo, true))}
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <div className="mb-3 flex items-center justify-between">
                                            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                                                <Inbox className="h-4 w-4 text-slate-500"/>
                                                收集流
                                            </h2>
                                            <span className="text-xs text-slate-400">{unpinnedMemos.length} 条</span>
                                        </div>
                                        {unpinnedMemos.length === 0 ? (
                                            <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-10 text-center text-sm text-slate-400">
                                                暂无普通闪念，置顶内容都在上方。
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {unpinnedMemos.map(memo => renderMemoCard(memo))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </main>
        </div>
    );
}
