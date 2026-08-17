import React, {useEffect, useMemo, useRef, useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    AlertCircle,
    Lightbulb,
    Loader2,
    RefreshCw,
    Send,
    Sparkles,
} from 'lucide-react';
import type {
    InsightFinding,
    InsightFindingType,
    WhiteboardInsights,
    WhiteboardNode,
} from '../../types/whiteboard';
import type {BoardBrief} from '../../utils/whiteboardInsight';
import {prepareInsightMarkdown} from '../../utils/whiteboardInsight';
import {rehypeInlineStyleSyntax} from '../Article/MarkdownElements';
import {getNodeDisplayLabel} from '../../utils/whiteboardOps';

interface WhiteboardInsightPanelProps {
    brief: BoardBrief;
    insights: WhiteboardInsights | null;
    isStale: boolean;
    isDigesting: boolean;
    isAnswering: boolean;
    error: string | null;
    selectedCount: number;
    scope: 'board' | 'selection';
    onScopeChange: (scope: 'board' | 'selection') => void;
    onAnalyze: () => void;
    onAsk: (question: string) => void;
    onJump: (nodeId: string) => void;
    expanded?: boolean;
}

const FINDING_META: Record<InsightFindingType, {label: string; className: string}> = {
    theme: {label: '主题', className: 'bg-orange-50 text-orange-700'},
    tension: {label: '张力', className: 'bg-rose-50 text-rose-700'},
    gap: {label: '缺口', className: 'bg-sky-50 text-sky-700'},
    clue: {label: '线索', className: 'bg-lime-50 text-lime-700'},
};

const NodeChips = ({
    nodeIds,
    nodes,
    onJump,
}: {
    nodeIds: string[];
    nodes: WhiteboardNode[];
    onJump: (nodeId: string) => void;
}) => {
    if (nodeIds.length === 0) return null;
    const byId = new Map(nodes.map(node => [node.id, node]));
    return (
        <div className="flex flex-wrap gap-1 mt-1.5">
            {nodeIds.map(nodeId => {
                const node = byId.get(nodeId);
                if (!node) return null;
                return (
                    <button
                        key={nodeId}
                        type="button"
                        onClick={event => {
                            event.stopPropagation();
                            onJump(nodeId);
                        }}
                        className="max-w-[11rem] truncate px-1.5 py-0.5 text-[10px] rounded-md border border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                        title={getNodeDisplayLabel(node)}
                    >
                        {getNodeDisplayLabel(node)}
                    </button>
                );
            })}
        </div>
    );
};

const FindingCard = ({
    finding,
    nodes,
    citeMap,
    onJump,
    compact,
}: {
    finding: InsightFinding;
    nodes: WhiteboardNode[];
    citeMap: Record<string, string>;
    onJump: (nodeId: string) => void;
    compact?: boolean;
}) => {
    const meta = FINDING_META[finding.type];
    return (
        <div className="rounded-xl border border-slate-100 bg-white px-2.5 py-2">
            <div className="flex items-start gap-2">
                <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-md ${meta.className}`}>
                    {meta.label}
                </span>
                <div className="min-w-0">
                    <div className={`font-semibold text-slate-800 ${compact ? 'text-xs' : 'text-sm'}`}>
                        <InsightMarkdown content={finding.title} citeMap={citeMap} nodes={nodes} onJump={onJump}/>
                    </div>
                    {finding.detail && (
                        <div className={`mt-0.5 text-slate-600 ${compact ? 'text-xs leading-5' : 'text-sm leading-6'}`}>
                            <InsightMarkdown content={finding.detail} citeMap={citeMap} nodes={nodes} onJump={onJump}/>
                        </div>
                    )}
                    <NodeChips nodeIds={finding.nodeIds} nodes={nodes} onJump={onJump}/>
                </div>
            </div>
        </div>
    );
};

const InsightMarkdown = ({
    content,
    citeMap,
    nodes,
    onJump,
    inline = false,
}: {
    content: string;
    citeMap: Record<string, string>;
    nodes: WhiteboardNode[];
    onJump: (nodeId: string) => void;
    inline?: boolean;
}) => {
    const prepared = useMemo(
        () => prepareInsightMarkdown(content, citeMap, nodes),
        [content, citeMap, nodes]
    );

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeInlineStyleSyntax]}
            components={{
                a({href, children}) {
                    const citeId = href?.startsWith('#cite-') ? href.slice(6) : '';
                    const nodeId = citeId ? citeMap[citeId] : '';
                    if (nodeId) {
                        if (inline) {
                            return (
                                <span className="inline max-w-[12rem] truncate align-baseline px-1 py-0 text-[11px] font-medium text-orange-700 bg-orange-50 rounded">
                                    {children}
                                </span>
                            );
                        }
                        return (
                            <button
                                type="button"
                                onClick={event => {
                                    event.stopPropagation();
                                    onJump(nodeId);
                                }}
                                className="inline max-w-[12rem] truncate align-baseline px-1 py-0 text-[11px] font-medium text-orange-700 bg-orange-50 rounded hover:bg-orange-100"
                                title={typeof children === 'string' ? children : undefined}
                            >
                                {children}
                            </button>
                        );
                    }
                    if (href && /^https?:\/\//.test(href)) {
                        return <a href={href} target="_blank" rel="noreferrer" className="text-orange-600 underline">{children}</a>;
                    }
                    return <span>{children}</span>;
                },
                span({className, children}) {
                    return <span className={className}>{children}</span>;
                },
                p({children}) {
                    if (inline) return <span>{children}</span>;
                    return <p className="mb-2 last:mb-0 leading-6">{children}</p>;
                },
                ul({children}) {
                    return <ul className="mb-2 last:mb-0 pl-4 list-disc space-y-1">{children}</ul>;
                },
                ol({children}) {
                    return <ol className="mb-2 last:mb-0 pl-4 list-decimal space-y-1">{children}</ol>;
                },
                table({children}) {
                    return (
                        <div className="my-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                            <table className="min-w-full text-left text-[11px]">{children}</table>
                        </div>
                    );
                },
                thead({children}) {
                    return <thead className="bg-slate-50 text-slate-700">{children}</thead>;
                },
                th({children}) {
                    return <th className="whitespace-nowrap px-2.5 py-1.5 font-semibold border-b border-slate-200">{children}</th>;
                },
                td({children}) {
                    return <td className="px-2.5 py-1.5 border-b border-slate-100 text-slate-600 align-top">{children}</td>;
                },
                code({className, children}) {
                    const isBlock = Boolean(className);
                    if (isBlock) {
                        return (
                            <pre className="my-2 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 text-[11px] text-slate-100">
                                <code>{children}</code>
                            </pre>
                        );
                    }
                    return <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-700">{children}</code>;
                },
            }}
        >
            {prepared}
        </ReactMarkdown>
    );
};

export const WhiteboardInsightPanel: React.FC<WhiteboardInsightPanelProps> = ({
    brief,
    insights,
    isStale,
    isDigesting,
    isAnswering,
    error,
    selectedCount,
    scope,
    onScopeChange,
    onAnalyze,
    onAsk,
    onJump,
    expanded = false,
}) => {
    const [draft, setDraft] = useState('');
    const threadRef = useRef<HTMLDivElement>(null);
    const nodes = brief.scopedNodes;
    const hasResult = Boolean(insights && (insights.findings.length > 0 || insights.questions.length > 0 || insights.messages.length > 0));

    useEffect(() => {
        const el = threadRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [insights?.messages, isAnswering]);

    const submitDraft = () => {
        const text = draft.trim();
        if (!text || isAnswering || isDigesting) return;
        setDraft('');
        onAsk(text);
    };

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-3 py-2 border-b border-slate-100 space-y-2">
                <div className="flex items-center gap-1.5">
                    <div className="flex p-0.5 rounded-lg bg-slate-100">
                        <button
                            type="button"
                            onClick={() => onScopeChange('board')}
                            className={`px-2 py-1 text-[11px] font-medium rounded-md ${
                                scope === 'board' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                            }`}
                        >
                            整板
                        </button>
                        <button
                            type="button"
                            disabled={selectedCount === 0}
                            onClick={() => onScopeChange('selection')}
                            className={`px-2 py-1 text-[11px] font-medium rounded-md disabled:opacity-40 disabled:cursor-not-allowed ${
                                scope === 'selection' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                            }`}
                        >
                            选中
                        </button>
                    </div>
                    <span className="ml-auto text-[10px] text-slate-400">
                        {brief.scopedNodes.length} 节点 · {brief.scopedEdges.length} 连线
                    </span>
                    <button
                        type="button"
                        onClick={onAnalyze}
                        disabled={isDigesting || isAnswering || !brief.canAnalyze}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="重新分析"
                    >
                        {isDigesting ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <RefreshCw className="w-3.5 h-3.5"/>}
                    </button>
                </div>

                {isStale && hasResult && (
                    <div className="flex items-start gap-2 rounded-xl bg-orange-50 px-2.5 py-2 text-[11px] text-orange-800">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0"/>
                        <div className="min-w-0">
                            <p>画布有更新，当前启发基于旧内容。</p>
                            <button
                                type="button"
                                onClick={onAnalyze}
                                className="mt-1 font-semibold text-orange-700 hover:text-orange-800"
                            >
                                按最新内容重跑
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div ref={threadRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
                {isDigesting && !hasResult && (
                    <div className="space-y-2">
                        {[0, 1, 2].map(item => (
                            <div key={item} className="h-16 rounded-xl bg-slate-50 animate-pulse"/>
                        ))}
                    </div>
                )}

                {!isDigesting && !hasResult && (
                    <div className="px-2 py-8 text-center">
                        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                            <Sparkles className="w-5 h-5"/>
                        </div>
                        <p className="text-sm font-semibold text-slate-800">从这堆材料里挖线索</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                            {brief.canAnalyze
                                ? 'AI 会先告诉你看见了什么，再给出也许你想问的问题。'
                                : '先往白板上放一些便签或文章，再来启发。'}
                        </p>
                        <button
                            type="button"
                            onClick={onAnalyze}
                            disabled={!brief.canAnalyze || isDigesting}
                            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 text-white text-xs font-medium"
                        >
                            <Sparkles className="w-3.5 h-3.5"/>
                            开始启发
                        </button>
                    </div>
                )}

                {insights && insights.findings.length > 0 && (
                    <section>
                        <h4 className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-slate-700">
                            <Lightbulb className="w-3.5 h-3.5 text-orange-500"/>
                            看见了什么
                        </h4>
                        <div className="space-y-1.5">
                            {insights.findings.map((finding, index) => (
                                <FindingCard
                                    key={`${finding.type}-${index}`}
                                    finding={finding}
                                    nodes={nodes}
                                    citeMap={insights.citeMap}
                                    onJump={onJump}
                                    compact={!expanded}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {insights && insights.questions.length > 0 && (
                    <section>
                        <div className="mb-1.5">
                            <h4 className="text-[11px] font-bold text-slate-700">也许你想问</h4>
                            <p className="mt-0.5 text-[10px] text-slate-400">点问题发给 AI，灰字只是为什么值得问</p>
                        </div>
                        <div className="space-y-1.5">
                            {insights.questions.map((question, index) => (
                                <div
                                    key={`${question.text}-${index}`}
                                    className="rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-2"
                                >
                                    <button
                                        type="button"
                                        disabled={isAnswering || isDigesting}
                                        onClick={() => onAsk(question.text)}
                                        className={`w-full text-left font-medium text-slate-800 hover:text-orange-700 disabled:opacity-60 ${expanded ? 'text-sm' : 'text-xs'}`}
                                    >
                                        <span className="text-orange-500">{index + 1}.</span>{' '}
                                        <InsightMarkdown
                                            content={question.text}
                                            citeMap={insights.citeMap}
                                            nodes={nodes}
                                            onJump={onJump}
                                            inline
                                        />
                                    </button>
                                    {question.why && (
                                        <div className="mt-1 text-[11px] leading-5 text-slate-400">
                                            <span className="mr-1 text-[10px] font-medium text-slate-400">为什么值得问</span>
                                            <InsightMarkdown
                                                content={question.why}
                                                citeMap={insights.citeMap}
                                                nodes={nodes}
                                                onJump={onJump}
                                            />
                                        </div>
                                    )}
                                    <NodeChips nodeIds={question.nodeIds} nodes={nodes} onJump={onJump}/>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {insights && insights.messages.length > 0 && (
                    <section className="space-y-2">
                        <h4 className="text-[11px] font-bold text-slate-700">继续想</h4>
                        {insights.messages.map((message, index) => (
                            <div
                                key={`${message.role}-${index}`}
                                className={`rounded-xl px-2.5 py-2 ${
                                    expanded ? 'text-sm' : 'text-xs'
                                } ${
                                    message.role === 'user'
                                        ? 'bg-orange-50 text-slate-800'
                                        : 'bg-white border border-slate-100 text-slate-700'
                                }`}
                            >
                                {message.role === 'user' ? (
                                    <p className="leading-6">{message.content}</p>
                                ) : message.content ? (
                                    <InsightMarkdown
                                        content={message.content}
                                        citeMap={insights.citeMap}
                                        nodes={nodes}
                                        onJump={onJump}
                                    />
                                ) : isAnswering && index === insights.messages.length - 1 ? (
                                    <span className="inline-flex items-center gap-1 text-slate-400">
                                        <Loader2 className="w-3 h-3 animate-spin"/>
                                        正在想…
                                    </span>
                                ) : (
                                    <span className="text-slate-400">没有生成回答</span>
                                )}
                            </div>
                        ))}
                    </section>
                )}

                {error && (
                    <div className="rounded-xl bg-red-50 px-2.5 py-2 text-[11px] text-red-700">
                        {error}
                    </div>
                )}
            </div>

            <div className="border-t border-slate-100 p-2">
                <div className="flex items-end gap-1.5 rounded-xl border border-slate-200 bg-slate-50 focus-within:bg-white focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/10 px-2 py-1.5">
                    <textarea
                        value={draft}
                        onChange={event => setDraft(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                submitDraft();
                            }
                        }}
                        placeholder={brief.canAnalyze ? '继续追问这块白板…' : '先放一些内容再提问'}
                        rows={2}
                        className="flex-1 resize-none bg-transparent text-xs leading-5 outline-none placeholder:text-slate-400"
                    />
                    <button
                        type="button"
                        onClick={submitDraft}
                        disabled={!draft.trim() || isAnswering || isDigesting || !brief.canAnalyze}
                        className="shrink-0 p-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Send className="w-3.5 h-3.5"/>
                    </button>
                </div>
            </div>
        </div>
    );
};
