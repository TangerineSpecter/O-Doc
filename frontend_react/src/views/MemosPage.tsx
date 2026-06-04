import React, {useEffect, useMemo, useRef, useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as echarts from 'echarts/core';
import {GraphChart} from 'echarts/charts';
import {LegendComponent, TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import type {EChartsOption} from 'echarts';
import {
    Bot,
    CalendarClock,
    Edit3,
    Hash,
    Info,
    Inbox,
    List,
    Network,
    PanelRightOpen,
    MoreHorizontal,
    Pin,
    PinOff,
    Plus,
    RefreshCw,
    Search,
    Shuffle,
    Sparkles,
    Trash2,
    User,
    X
} from 'lucide-react';
import {createMemo, deleteMemo, getMemoKnowledgeGraph, getMemoList, syncMemoVectors, updateMemo} from '../api/memo';
import type {CreateMemoParams, MemoItem, MemoKnowledgeGraph, MemoGraphNode} from '../types/api/memo';
import {CodeBlock} from '../components/Article/MarkdownElements';
import ConfirmationModal from '../components/common/ConfirmationModal';
import {useToast} from '../components/common/ToastProvider';

echarts.use([GraphChart, TooltipComponent, LegendComponent, CanvasRenderer]);

const GRAPH_LABEL_VISIBLE_MIN_ZOOM = 0.62;
const GRAPH_LABEL_MAX_LENGTH = 10;
const GRAPH_TOOLTIP_MAX_LENGTH = 50;

const formatGraphLabel = (value?: string) => {
    const firstLine = (value || '').split(/\r?\n/).map(line => line.trim()).find(Boolean) || '';
    return firstLine.length > GRAPH_LABEL_MAX_LENGTH
        ? `${firstLine.slice(0, GRAPH_LABEL_MAX_LENGTH)}...`
        : firstLine;
};

const escapeHtml = (value: string) => (
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
);

const formatGraphTooltipText = (value?: string) => {
    const normalized = (value || '').replace(/\s+/g, ' ').trim();
    const preview = normalized.length > GRAPH_TOOLTIP_MAX_LENGTH
        ? `${normalized.slice(0, GRAPH_TOOLTIP_MAX_LENGTH)}...`
        : normalized;

    return escapeHtml(preview || '暂无内容');
};

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
    const [loading, setLoading] = useState(false);
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
    const graphRef = useRef<HTMLDivElement | null>(null);
    const graphChartRef = useRef<echarts.ECharts | null>(null);
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
        } catch (error) {
            console.error('Failed to fetch memos', error);
            showToast('闪念加载失败', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
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

    useEffect(() => {
        if (viewMode !== 'graph' || !graphRef.current || !graphData) return;

        const chart = graphChartRef.current || echarts.init(graphRef.current);
        graphChartRef.current = chart;
        let graphLabelsVisible = true;

        const getNormalLinkStyle = (link: any) => (
            link.relation === '相似'
                ? {color: '#f97316', opacity: 0.18, width: 0.7 + Math.min(0.9, (link.similarity || 0.72) - 0.6)}
                : {color: '#a78bfa', opacity: 0.16, width: 0.8}
        );
        const getActiveLinkStyle = (link: any) => (
            link.relation === '相似'
                ? {color: '#f97316', opacity: 0.56, width: 2}
                : {color: '#a78bfa', opacity: 0.42, width: 1.4}
        );
        const buildGraphLinks = (activeNodeId?: string) => (
            graphData.links.map(link => {
                const isActive = activeNodeId && (link.source === activeNodeId || link.target === activeNodeId);
                return {
                    ...link,
                    lineStyle: isActive ? getActiveLinkStyle(link) : getNormalLinkStyle(link),
                    emphasis: {
                        lineStyle: getActiveLinkStyle(link),
                    },
                };
            })
        );

        const option: EChartsOption = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'item',
                confine: true,
                extraCssText: 'max-width: 360px; white-space: normal; word-break: break-word; line-height: 1.6;',
                formatter: (params: any) => {
                    const data = params.data || {};
                    if (params.dataType === 'edge') {
                        return data.relation === '相似'
                            ? `相似度 ${Math.round((data.similarity || 0) * 100)}%`
                            : data.relation || '关联';
                    }
                    if (data.category === 'tag') {
                        return `标签: ${formatGraphTooltipText(data.name)}<br/>${data.value || 0} 条闪念`;
                    }
                    return formatGraphTooltipText(data.memo?.content || data.name);
                },
            },
            legend: {
                bottom: 10,
                itemWidth: 10,
                itemHeight: 10,
                textStyle: {color: '#64748b', fontSize: 12},
            },
            series: [
                {
                    type: 'graph',
                    layout: 'force',
                    roam: true,
                    draggable: false,
                    focusNodeAdjacency: true,
                    categories: [
                        {name: 'memo', itemStyle: {color: '#f97316'}},
                        {name: 'tag', itemStyle: {color: '#8b5cf6'}},
                    ],
                    label: {
                        show: true,
                        position: 'bottom',
                        distance: 8,
                        color: '#334155',
                        align: 'center',
                        fontSize: 11,
                        formatter: (params: any) => formatGraphLabel(params.data?.name),
                    },
                    lineStyle: {
                        color: 'source',
                        opacity: 0.16,
                        width: 0.8,
                        curveness: 0.16,
                    },
                    emphasis: {
                        focus: 'adjacency',
                        label: {
                            show: true,
                        },
                        lineStyle: {
                            opacity: 0.56,
                            width: 2,
                        },
                    },
                    force: {
                        repulsion: 170,
                        gravity: 0.08,
                        edgeLength: [72, 138],
                        friction: 0.36,
                    },
                    data: graphData.nodes.map(node => ({
                        ...node,
                        category: node.category,
                        symbolSize: node.symbolSize,
                        itemStyle: node.category === 'memo'
                            ? {
                                color: node.memo?.isPinned ? '#f97316' : '#fb923c',
                                borderColor: '#fff7ed',
                                borderWidth: 2,
                            }
                            : {
                                color: '#8b5cf6',
                                borderColor: '#f5f3ff',
                                borderWidth: 2,
                            },
                        label: node.category === 'tag'
                            ? {
                                position: 'bottom',
                                distance: 8,
                                align: 'center',
                                fontSize: 12,
                                fontWeight: 700,
                                formatter: (params: any) => formatGraphLabel(params.data?.name),
                            }
                            : {
                                position: 'bottom',
                                distance: 8,
                                align: 'center',
                                formatter: (params: any) => formatGraphLabel(params.data?.name),
                            },
                    })),
                    links: buildGraphLinks(),
                },
            ],
        };

        chart.setOption(option, true);

        const getCurrentGraphZoom = () => {
            const currentOption = chart.getOption() as any;
            const series = Array.isArray(currentOption.series) ? currentOption.series[0] : undefined;
            const zoom = Number(series?.zoom);
            return Number.isFinite(zoom) ? zoom : 1;
        };

        const updateGraphLabelVisibility = () => {
            const shouldShowLabels = getCurrentGraphZoom() >= GRAPH_LABEL_VISIBLE_MIN_ZOOM;
            if (shouldShowLabels === graphLabelsVisible) return;

            graphLabelsVisible = shouldShowLabels;
            chart.setOption({
                series: [
                    {
                        label: {
                            show: shouldShowLabels,
                        },
                        emphasis: {
                            label: {
                                show: true,
                            },
                        },
                    },
                ],
            });
        };

        const handleClick = (params: any) => {
            if (params.dataType !== 'node') return;
            setSelectedGraphNode(params.data as MemoGraphNode);
            setGraphDetailCollapsed(false);
        };
        const handleMouseOver = (params: any) => {
            if (params.dataType !== 'node') return;
            chart.setOption({
                series: [{links: buildGraphLinks(params.data.id)}],
            });
        };
        const handleMouseOut = (params: any) => {
            if (params.dataType !== 'node') return;
            chart.setOption({
                series: [{links: buildGraphLinks()}],
            });
        };

        chart.off('click');
        chart.off('mouseover');
        chart.off('mouseout');
        chart.off('graphRoam' as any);
        chart.off('graphroam' as any);
        chart.on('click', handleClick);
        chart.on('mouseover', handleMouseOver);
        chart.on('mouseout', handleMouseOut);
        chart.on('graphRoam' as any, updateGraphLabelVisibility);
        chart.on('graphroam' as any, updateGraphLabelVisibility);

        const resizeObserver = new ResizeObserver(() => chart.resize());
        resizeObserver.observe(graphRef.current);

        return () => {
            resizeObserver.disconnect();
            chart.off('click', handleClick);
            chart.off('mouseover', handleMouseOver);
            chart.off('mouseout', handleMouseOut);
            chart.off('graphRoam' as any, updateGraphLabelVisibility);
            chart.off('graphroam' as any, updateGraphLabelVisibility);
        };
    }, [graphData, viewMode]);

    useEffect(() => {
        window.setTimeout(() => graphChartRef.current?.resize(), 180);
    }, [graphDetailCollapsed]);

    useEffect(() => {
        return () => {
            graphChartRef.current?.dispose();
            graphChartRef.current = null;
        };
    }, []);

    const renderMemoCard = (memo: MemoItem, isPinnedSection = false) => {
        const author = getMemoAuthorMeta(memo);
        const AuthorIcon = author.isAgent ? Bot : User;

        return (
            <article
                key={memo.memoId}
                onDoubleClick={() => openEditModal(memo)}
                className={`group relative rounded-xl border bg-white p-4 shadow-sm shadow-slate-900/5 transition-all duration-200 hover:border-orange-200 hover:shadow-md ${
                    isPinnedSection ? 'border-orange-200 ring-1 ring-orange-100/80' : 'border-slate-200'
                }`}
            >
                <div className="absolute right-3 top-3 z-20">
                    <div className="group/menu relative">
                        <button
                            type="button"
                            title="更多"
                            onDoubleClick={(event) => event.stopPropagation()}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                            <MoreHorizontal className="h-4 w-4"/>
                        </button>
                        <div
                            className="pointer-events-none absolute right-0 top-full hidden w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm opacity-0 shadow-xl shadow-slate-900/10 transition group-hover/menu:pointer-events-auto group-hover/menu:block group-hover/menu:opacity-100"
                            onDoubleClick={(event) => event.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={() => openEditModal(memo)}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-slate-700 transition hover:bg-slate-50 hover:text-orange-600"
                            >
                                <Edit3 className="h-4 w-4"/>
                                编辑
                            </button>
                            <button
                                type="button"
                                onClick={() => patchMemo(memo.memoId, {isPinned: !memo.isPinned})}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-slate-700 transition hover:bg-slate-50 hover:text-orange-600"
                            >
                                {memo.isPinned ? <PinOff className="h-4 w-4"/> : <Pin className="h-4 w-4"/>}
                                {memo.isPinned ? '取消置顶' : '置顶'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setDeleteId(memo.memoId)}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-red-600 transition hover:bg-red-50"
                            >
                                <Trash2 className="h-4 w-4"/>
                                删除
                            </button>
                            <div className="mt-1 border-t border-slate-100 px-4 py-2 text-slate-400">
                                字数: {memo.content.length}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2 pr-10 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                        <CalendarClock className="h-3.5 w-3.5"/>
                        {formatDate(memo.createdAt)}
                    </span>
                    {memo.isPinned && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 font-medium text-orange-600 ring-1 ring-orange-100">
                            <Pin className="h-3 w-3"/>
                            置顶
                        </span>
                    )}
                </div>

                <div className="memo-markdown max-h-80 overflow-y-auto pr-2 text-sm text-slate-800 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent">
                    <ReactMarkdown
                        remarkPlugins={[remarkSoftLineBreaks, remarkGfm]}
                        components={markdownComponents as any}
                    >
                        {memo.content}
                    </ReactMarkdown>
                </div>
                <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
                    {memo.tag ? (
                        <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 font-medium text-violet-600 ring-1 ring-violet-100">
                            <Hash className="h-3 w-3 shrink-0"/>
                            <span className="truncate">{renderTagLabel(memo.tag)}</span>
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 font-medium text-slate-400 ring-1 ring-slate-100">
                            <Inbox className="h-3 w-3"/>
                            未归类
                        </span>
                    )}
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ring-1 ${
                        author.isAgent
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                            : 'bg-blue-50 text-blue-700 ring-blue-100'
                    }`}>
                        <AuthorIcon className="h-3.5 w-3.5"/>
                        {author.name}
                    </span>
                </footer>
            </article>
        );
    };

    const renderNodeAttributes = (node: MemoGraphNode, relatedCount: number) => {
        const memo = node.memo;
        const author = memo ? getMemoAuthorMeta(memo) : null;
        const attributes = memo ? [
            {label: '节点类型', value: '闪念'},
            {label: '节点 ID', value: node.id},
            {label: '字数', value: `${memo.content.length}`},
            {label: '标签', value: memo.tag || '未归类'},
            {label: '置顶', value: memo.isPinned ? '是' : '否'},
            {label: '来源', value: author?.isAgent ? 'Agent' : '用户'},
            {label: '创建者', value: author?.name || '未知账号'},
            {label: '关联数', value: `${relatedCount}`},
            {label: '创建时间', value: formatDate(memo.createdAt)},
            {label: '更新时间', value: formatDate(memo.updatedAt)},
        ] : [
            {label: '节点类型', value: '标签'},
            {label: '节点 ID', value: node.id},
            {label: '标签路径', value: node.name},
            {label: '闪念数量', value: `${node.value}`},
            {label: '关联数', value: `${relatedCount}`},
        ];

        return (
            <div className="mt-5">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-500">
                    <Info className="h-3.5 w-3.5"/>
                    属性
                </h3>
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {attributes.map(item => (
                        <div key={item.label} className="grid grid-cols-[72px_minmax(0,1fr)] border-b border-slate-100 text-xs last:border-b-0">
                            <div className="bg-slate-50 px-3 py-2 font-medium text-slate-500">{item.label}</div>
                            <div className="min-w-0 break-words px-3 py-2 text-slate-700">{item.value}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderKnowledgeGraph = () => {
        const stats = graphData?.stats;
        const relatedLinks = selectedGraphNode && graphData
            ? graphData.links.filter(link => link.source === selectedGraphNode.id || link.target === selectedGraphNode.id)
            : [];
        const isDetailCollapsed = graphDetailCollapsed || !selectedGraphNode;

        return (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                            <Network className="h-4 w-4 text-orange-600"/>
                            知识图谱
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                            用标签和 embedding 相似度把相关闪念连起来。
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {stats && (
                            <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-500 ring-1 ring-slate-100">
                                <span>{stats.memoCount} 条闪念</span>
                                <span className="h-1 w-1 rounded-full bg-slate-300"/>
                                <span>{stats.semanticLinkCount} 条相似关系</span>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={fetchKnowledgeGraph}
                            disabled={graphLoading || vectorSyncing}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${graphLoading ? 'animate-spin' : ''}`}/>
                            刷新
                        </button>
                        <button
                            type="button"
                            onClick={handleSyncHistoryMemos}
                            disabled={graphLoading || vectorSyncing}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-orange-500 px-3 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${vectorSyncing ? 'animate-spin' : ''}`}/>
                            {vectorSyncing ? '同步中' : '同步历史'}
                        </button>
                    </div>
                </div>

                <div className={`grid min-h-[620px] transition-[grid-template-columns] duration-200 ${
                    isDetailCollapsed
                        ? 'lg:grid-cols-[minmax(0,1fr)_48px]'
                        : 'lg:grid-cols-[minmax(0,1fr)_300px]'
                }`}>
                    <div className="relative min-h-[520px] bg-[radial-gradient(circle_at_20%_20%,rgba(249,115,22,0.08),transparent_32%),linear-gradient(180deg,#fff,#f8fafc)]">
                        {graphLoading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-slate-500 backdrop-blur-sm">
                                正在梳理关系...
                            </div>
                        )}
                        {graphData && graphData.nodes.length > 0 ? (
                            <div ref={graphRef} className="h-[620px] w-full cursor-grab touch-none active:cursor-grabbing"/>
                        ) : (
                            <div className="flex h-[520px] flex-col items-center justify-center text-center">
                                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
                                    <Network className="h-7 w-7"/>
                                </div>
                                <p className="font-semibold text-slate-800">还没有可展示的图谱</p>
                                <p className="mt-1 text-sm text-slate-400">先记录几条闪念，或者换个筛选条件。</p>
                            </div>
                        )}
                    </div>

                    <aside className={`border-t border-slate-100 bg-slate-50/70 transition-all duration-200 lg:border-l lg:border-t-0 ${
                        isDetailCollapsed ? 'p-2' : 'p-4'
                    }`}>
                        {isDetailCollapsed ? (
                            <button
                                type="button"
                                onClick={() => selectedGraphNode && setGraphDetailCollapsed(false)}
                                className="flex h-full min-h-[520px] w-full flex-col items-center justify-start gap-2 rounded-lg border border-dashed border-slate-200 bg-white/80 px-2 py-4 text-slate-400 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
                                title={selectedGraphNode ? '展开详情' : '点击节点后查看详情'}
                            >
                                <PanelRightOpen className="h-4 w-4"/>
                                <span className="[writing-mode:vertical-rl] text-xs font-medium tracking-widest">
                                    {selectedGraphNode ? '详情' : '点节点'}
                                </span>
                            </button>
                        ) : selectedGraphNode ? (
                            <div>
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                                        selectedGraphNode.category === 'memo'
                                            ? 'bg-orange-50 text-orange-700 ring-orange-100'
                                            : 'bg-violet-50 text-violet-700 ring-violet-100'
                                    }`}>
                                        {selectedGraphNode.category === 'memo' ? '闪念' : '标签'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setGraphDetailCollapsed(true)}
                                        className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
                                        title="收起详情"
                                    >
                                        <X className="h-4 w-4"/>
                                    </button>
                                </div>

                                {selectedGraphNode.memo ? (
                                    <div>
                                        <p className="text-xs text-slate-400">{formatDate(selectedGraphNode.memo.createdAt)}</p>
                                        <div className="memo-markdown mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkSoftLineBreaks, remarkGfm]}
                                                components={markdownComponents as any}
                                            >
                                                {selectedGraphNode.memo.content}
                                            </ReactMarkdown>
                                        </div>
                                        {selectedGraphNode.memo.tag && (
                                            <div className="mt-3 inline-flex max-w-full items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-600 ring-1 ring-violet-100">
                                                <Hash className="h-3 w-3 shrink-0"/>
                                                <span className="truncate">{renderTagLabel(selectedGraphNode.memo.tag)}</span>
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => selectedGraphNode.memo && openEditModal(selectedGraphNode.memo)}
                                            className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600"
                                        >
                                            <Edit3 className="h-4 w-4"/>
                                            编辑这条闪念
                                        </button>
                                    </div>
                                ) : (
                                    <div>
                                        <h3 className="break-words text-base font-bold text-slate-900">{selectedGraphNode.name}</h3>
                                        <p className="mt-2 text-sm text-slate-500">{selectedGraphNode.value} 条闪念使用这个标签。</p>
                                    </div>
                                )}

                                {renderNodeAttributes(selectedGraphNode, relatedLinks.length)}

                                <div className="mt-5">
                                    <h3 className="mb-2 text-xs font-bold text-slate-500">关联</h3>
                                    {relatedLinks.length === 0 ? (
                                        <p className="text-xs text-slate-400">暂无关联边。</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {relatedLinks.slice(0, 8).map((link, index) => {
                                                const otherId = link.source === selectedGraphNode.id ? link.target : link.source;
                                                const otherNode = graphData?.nodes.find(node => node.id === otherId);
                                                return (
                                                    <button
                                                        key={`${link.source}-${link.target}-${index}`}
                                                        type="button"
                                                        onClick={() => otherNode && setSelectedGraphNode(otherNode)}
                                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs transition hover:border-orange-200 hover:bg-orange-50"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="min-w-0 truncate font-medium text-slate-700">{otherNode?.name || otherId}</span>
                                                            <span className="shrink-0 text-slate-400">{link.relation}</span>
                                                        </div>
                                                        {link.similarity && (
                                                            <p className="mt-1 text-slate-400">相似度 {Math.round(link.similarity * 100)}%</p>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 p-4 text-sm leading-6 text-slate-500">
                                点击图上的闪念或标签，可以在这里查看内容和关联。
                            </div>
                        )}
                    </aside>
                </div>
            </div>
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

            <style>{`
                @keyframes memo-random-ripple {
                    0% {
                        box-shadow:
                            0 0 0 0 rgba(255, 255, 255, 0.14),
                            0 0 0 20px rgba(255, 255, 255, 0.12),
                            0 0 0 40px rgba(255, 255, 255, 0.09),
                            0 0 0 60px rgba(255, 255, 255, 0.06);
                    }
                    100% {
                        box-shadow:
                            0 0 0 20px rgba(255, 255, 255, 0.12),
                            0 0 0 40px rgba(255, 255, 255, 0.09),
                            0 0 0 60px rgba(255, 255, 255, 0.06),
                            0 0 0 80px rgba(255, 255, 255, 0);
                    }
                }
            `}</style>

            {editingMemo && (
                <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div
                        className="absolute inset-0 bg-slate-950/45 backdrop-blur-md"
                        onClick={requestCloseEditModal}
                    />
                    <form
                        onSubmit={handleEditSubmit}
                        className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/20 animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">编辑闪念</h2>
                                <p className="mt-0.5 text-xs text-slate-500">沉浸处理当前碎片，保存后回到焦点流。</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditPinned(prev => !prev)}
                                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition ${
                                        editPinned
                                            ? 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                    }`}
                                    title={editPinned ? '取消置顶' : '置顶'}
                                >
                                    {editPinned ? <PinOff className="h-3.5 w-3.5"/> : <Pin className="h-3.5 w-3.5"/>}
                                    {editPinned ? '已置顶' : '置顶'}
                                </button>
                                <button
                                    type="button"
                                    onClick={requestCloseEditModal}
                                    disabled={editSaving}
                                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                                    title="关闭"
                                >
                                    <X className="h-4 w-4"/>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4 p-5">
                            <div className="relative">
                                <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
                                <input
                                    value={editTag}
                                    onChange={(event) => setEditTag(event.target.value)}
                                    placeholder="添加标签"
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/15"
                                />
                            </div>
                            <textarea
                                value={editContent}
                                onChange={(event) => setEditContent(event.target.value)}
                                placeholder="编辑这条闪念..."
                                className="min-h-[360px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/15"
                                autoFocus
                            />
                        </div>

                        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-slate-400">字数: {editContent.length}</p>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={requestCloseEditModal}
                                    disabled={editSaving}
                                    className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200/70 disabled:opacity-50"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    disabled={!editContent.trim() || editSaving}
                                    className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                                >
                                    {editSaving ? '保存中...' : '保存'}
                                </button>
                            </div>
                        </div>
                    </form>

                    {showDiscardConfirm && (
                        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 animate-in fade-in duration-150">
                            <div
                                className="absolute inset-0 bg-slate-950/25"
                                onClick={() => setShowDiscardConfirm(false)}
                            />
                            <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/20 animate-in zoom-in-95 slide-in-from-bottom-2 duration-200">
                                <button
                                    type="button"
                                    onClick={() => setShowDiscardConfirm(false)}
                                    className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                    title="关闭"
                                >
                                    <X className="h-4 w-4"/>
                                </button>
                                <div className="p-6">
                                    <h3 className="text-lg font-bold text-slate-900">编辑确认</h3>
                                    <p className="mt-6 text-base text-slate-700">有未保存的内容，要先保存吗？</p>
                                    <div className="mt-8 flex justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={() => closeEditModal(true)}
                                            className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                        >
                                            不保存
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleEditSubmit()}
                                            disabled={!editContent.trim() || editSaving}
                                            className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                                        >
                                            保存
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {randomWalkMemo && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pb-24 animate-in fade-in duration-200">
                    <div
                        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
                        onClick={closeRandomWalk}
                    />
                    <section
                        className={`relative flex max-h-[min(680px,calc(100vh-8rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-2xl shadow-slate-950/20 transition-all duration-300 ease-out ${
                            randomWalkCardPhase === 'leaving'
                                ? 'translate-y-5 scale-95 rotate-1 opacity-0'
                                : randomWalkCardPhase === 'entering'
                                    ? 'translate-y-8 scale-95 -rotate-1 opacity-0'
                                    : 'translate-y-0 scale-100 rotate-0 opacity-100'
                        }`}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-full bg-orange-50"/>
                        <div className="relative border-b border-slate-100 px-5 py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 ring-1 ring-orange-100">
                                        <Shuffle className="h-3.5 w-3.5"/>
                                        随机漫步
                                    </div>
                                    <p className="text-xs text-slate-400">{formatDate(randomWalkMemo.createdAt)}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeRandomWalk}
                                    className="relative z-10 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700"
                                    title="关闭"
                                >
                                    <X className="h-4 w-4"/>
                                </button>
                            </div>
                        </div>

                        <div className="relative flex min-h-0 flex-col">
                            <div className="memo-markdown min-h-0 overflow-y-auto px-5 py-5 pr-6 text-base leading-8 text-slate-800 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent">
                                <ReactMarkdown
                                    remarkPlugins={[remarkSoftLineBreaks, remarkGfm]}
                                    components={markdownComponents as any}
                                >
                                    {randomWalkMemo.content}
                                </ReactMarkdown>
                            </div>

                            <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-5 py-4 text-xs">
                                {randomWalkMemo.tag ? (
                                    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 font-medium text-violet-600 ring-1 ring-violet-100">
                                        <Hash className="h-3 w-3 shrink-0"/>
                                        <span className="truncate">{renderTagLabel(randomWalkMemo.tag)}</span>
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 font-medium text-slate-400 ring-1 ring-slate-100">
                                        <Inbox className="h-3 w-3"/>
                                        未归类
                                    </span>
                                )}
                                {randomWalkMemo.isPinned && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 font-medium text-orange-600 ring-1 ring-orange-100">
                                        <Pin className="h-3 w-3"/>
                                        置顶
                                    </span>
                                )}
                            </footer>
                        </div>
                    </section>

                    <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
                        <button
                            type="button"
                            onClick={pickRandomMemo}
                            disabled={randomWalkCardPhase === 'leaving'}
                            className="group relative inline-flex min-w-[200px] items-center justify-between overflow-hidden rounded border-0 bg-orange-500 px-5 py-4 text-xs font-semibold uppercase tracking-[1.2px] text-white shadow-[0_4px_12px_rgba(249,115,22,0.28)] outline-none transition hover:bg-orange-600 hover:opacity-95 active:translate-y-0.5 disabled:cursor-not-allowed disabled:bg-orange-500 disabled:opacity-80 disabled:shadow-[0_4px_12px_rgba(249,115,22,0.2)]"
                        >
                            <Shuffle className="h-4 w-4 transition-transform duration-300 group-active:rotate-180"/>
                            <span className="mx-4">继续漫步</span>
                            <span className="h-2.5 w-2.5 rounded-full bg-white/80 [animation:memo-random-ripple_0.6s_linear_infinite]"/>
                        </button>
                    </div>
                </div>
            )}

            <main className="mx-auto max-w-7xl">
                <section className="mb-5 rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 text-orange-600 shadow-sm shadow-orange-500/10">
                                    <Sparkles className="h-5 w-5"/>
                                </span>
                                <div>
                                    <h1 className="text-2xl font-bold tracking-tight text-slate-950">Memos</h1>
                                    <p className="mt-1 text-sm text-slate-500">把临时闪念收进一个清爽、可回看的焦点流。</p>
                                </div>
                            </div>
                        </div>

                        <div className="relative w-full lg:w-80">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
                            <input
                                value={keyword}
                                onChange={(event) => setKeyword(event.target.value)}
                                placeholder="搜索内容或标签"
                                className="h-10 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition hover:bg-white focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/15"
                            />
                        </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                </section>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
                    <aside className="lg:sticky lg:top-24">
                        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                            <div className="grid grid-cols-2 gap-1">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('feed')}
                                    className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition ${
                                        viewMode === 'feed'
                                            ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                    }`}
                                >
                                    <List className="h-4 w-4"/>
                                    信息流
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('graph')}
                                    className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition ${
                                        viewMode === 'graph'
                                            ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                    }`}
                                >
                                    <Network className="h-4 w-4"/>
                                    知识图谱
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleCreate} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-center justify-between">
                                <div>
                                    <h2 className="text-base font-bold text-slate-900">快速收集</h2>
                                    <p className="mt-0.5 text-xs text-slate-500">先记下来，之后再整理成文章或任务。</p>
                                </div>
                                <span className="rounded-md bg-orange-50 p-2 text-orange-600">
                                    <Plus className="h-4 w-4"/>
                                </span>
                            </div>

                            <textarea
                                value={content}
                                onChange={(event) => setContent(event.target.value)}
                                placeholder="记下一句闪过脑子的东西..."
                                className="min-h-36 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/15"
                                autoFocus
                            />

                            <div className="mt-3 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                                <div className="relative min-w-0 flex-1">
                                    <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
                                    <input
                                        value={tag}
                                        onChange={(event) => setTag(event.target.value)}
                                        placeholder="添加标签"
                                        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-500/15"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!content.trim() || saving}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                                >
                                    <Plus className="h-4 w-4"/>
                                    记录
                                </button>
                            </div>
                        </form>

                        <div className="mt-4 overflow-hidden rounded-xl border border-orange-100 bg-white shadow-sm">
                            <button
                                type="button"
                                onClick={pickRandomMemo}
                                disabled={visibleMemos.length === 0}
                                className="group flex w-full items-center gap-3 p-4 text-left transition hover:bg-orange-50/60 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm shadow-orange-500/25 transition group-hover:rotate-3 group-hover:scale-105">
                                    <Shuffle className="h-5 w-5 transition-transform duration-300 group-active:rotate-180"/>
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-bold text-slate-900">随机漫步</span>
                                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                                        从当前范围抽一条闪念，单独摊开看看。
                                    </span>
                                </span>
                                <span className="rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-400 ring-1 ring-slate-100">
                                    {visibleMemos.length}
                                </span>
                            </button>
                        </div>

                        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <h2 className="text-sm font-bold text-slate-900">信息密度</h2>
                            <div className="mt-3 space-y-3">
                                <div>
                                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                                        <span>碎片字数</span>
                                        <span>{totalCharacters}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-slate-100">
                                        <div
                                            className="h-2 rounded-full bg-orange-500 transition-all"
                                            style={{width: `${Math.min(100, Math.max(8, totalCharacters / 20))}%`}}
                                        />
                                    </div>
                                </div>
                                <p className="text-xs leading-5 text-slate-500">
                                    {selectedTag
                                        ? `正在查看「${selectedTag}」下的记录。`
                                        : normalizedKeyword ? `正在聚焦「${normalizedKeyword}」相关记录。` : '置顶内容会优先固定在上方，其他闪念按时间收进下方流。'}
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-sm font-bold text-slate-900">标签筛选</h2>
                                {selectedTag && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedTag('')}
                                        className="text-xs font-medium text-slate-400 transition hover:text-violet-600"
                                    >
                                        清除
                                    </button>
                                )}
                            </div>
                            {tagFilters.length === 0 ? (
                                <p className="text-xs text-slate-400">还没有可筛选的标签。</p>
                            ) : (
                                <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
                                    {tagFilters.map(item => (
                                        <button
                                            key={item.name}
                                            type="button"
                                            onClick={() => setSelectedTag(prev => prev === item.name ? '' : item.name)}
                                            className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition ${
                                                selectedTag === item.name
                                                    ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-100'
                                                    : 'text-slate-600 hover:bg-violet-50/70 hover:text-violet-700'
                                            }`}
                                            style={{paddingLeft: `${10 + item.depth * 12}px`}}
                                        >
                                            <span className="min-w-0 truncate">{renderTagLabel(item.name)}</span>
                                            <span className="shrink-0 text-slate-400">{item.count}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </aside>

                    <section className="min-w-0">
                        {viewMode === 'graph' ? renderKnowledgeGraph() : loading ? (
                            <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400 shadow-sm">正在整理闪念...</div>
                        ) : visibleMemos.length === 0 ? (
                            <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white text-center shadow-sm">
                                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
                                    <Sparkles className="h-7 w-7"/>
                                </div>
                                <p className="font-semibold text-slate-800">{normalizedKeyword || selectedTag ? '没有找到相关碎片' : '这里还没有碎片'}</p>
                                <p className="mt-1 text-sm text-slate-400">{normalizedKeyword || selectedTag ? '换个关键词或标签，或者记录一条新的。' : '写下第一条，它会自然落到焦点流里。'}</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
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
            </main>
        </div>
    );
}
