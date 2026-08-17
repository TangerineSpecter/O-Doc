import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AIConfigError, generateWhiteboardDigest, streamWhiteboardAnswer} from '../api/ai';
import type {InsightMessage, WhiteboardDocument, WhiteboardEdge, WhiteboardInsights, WhiteboardNode} from '../types/whiteboard';
import {
    buildBoardBrief,
    insightIsStale,
    normalizeInsightResponse,
} from '../utils/whiteboardInsight';

interface UseWhiteboardInsightsOptions {
    boardId?: string;
    title: string;
    nodes: WhiteboardNode[];
    edges: WhiteboardEdge[];
    selectedNodeIds: string[];
    getDocument: (id?: string) => WhiteboardDocument | null;
    updateDocument: (id: string, patch: {insights?: WhiteboardInsights | null}) => WhiteboardDocument | null;
}

const toErrorMessage = (error: unknown) => {
    if (error instanceof AIConfigError) return error.message;
    if (error instanceof DOMException && error.name === 'AbortError') return '';
    if (error instanceof Error && error.message) return error.message;
    return '启发请求失败，请重试';
};

export function useWhiteboardInsights({
    boardId,
    title,
    nodes,
    edges,
    selectedNodeIds,
    getDocument,
    updateDocument,
}: UseWhiteboardInsightsOptions) {
    const [scope, setScope] = useState<'board' | 'selection'>('board');
    const [insights, setInsights] = useState<WhiteboardInsights | null>(null);
    const [isDigesting, setIsDigesting] = useState(false);
    const [isAnswering, setIsAnswering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const answerAbortRef = useRef<AbortController | null>(null);
    const insightsRef = useRef<WhiteboardInsights | null>(null);
    const digestingRef = useRef(false);
    const digestGenRef = useRef(0);
    const boardIdRef = useRef(boardId);
    boardIdRef.current = boardId;

    insightsRef.current = insights;

    const dropEmptyAssistant = (state: WhiteboardInsights | null) => {
        if (!state) return state;
        const messages = [...state.messages];
        const last = messages[messages.length - 1];
        if (last?.role !== 'assistant' || last.content.trim()) return state;
        messages.pop();
        return {...state, messages};
    };

    useEffect(() => {
        const document = boardId ? getDocument(boardId) : null;
        setInsights(document?.insights || null);
        setScope(document?.insights?.scope || (selectedNodeIds.length > 0 ? 'selection' : 'board'));
        setError(null);
        digestGenRef.current += 1;
        digestingRef.current = false;
        setIsDigesting(false);
        setIsAnswering(false);
        answerAbortRef.current?.abort();
        answerAbortRef.current = null;
        // 只在切换白板时回填，避免保存启发时把进行中的对话冲掉
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boardId]);

    const persist = useCallback((next: WhiteboardInsights | null) => {
        setInsights(next);
        insightsRef.current = next;
        if (boardId) updateDocument(boardId, {insights: next});
    }, [boardId, updateDocument]);

    const brief = useMemo(
        () => buildBoardBrief({title, nodes, edges, selectedNodeIds, scope}),
        [title, nodes, edges, selectedNodeIds, scope]
    );

    const isStale = insightIsStale(insights, brief);
    const briefRef = useRef(brief);
    briefRef.current = brief;

    const runDigest = useCallback(async (nextScope?: 'board' | 'selection') => {
        if (digestingRef.current) return;
        const requestBoardId = boardIdRef.current;
        const activeBrief = nextScope && nextScope !== briefRef.current.scope
            ? buildBoardBrief({title, nodes, edges, selectedNodeIds, scope: nextScope})
            : briefRef.current;
        if (nextScope) setScope(nextScope);
        if (!activeBrief.canAnalyze) {
            setError(null);
            return;
        }

        answerAbortRef.current?.abort();
        digestingRef.current = true;
        const gen = ++digestGenRef.current;
        setIsDigesting(true);
        setError(null);
        try {
            const raw = await generateWhiteboardDigest(activeBrief.brief);
            if (gen !== digestGenRef.current || requestBoardId !== boardIdRef.current) return;
            const validNodeIds = new Set(activeBrief.scopedNodes.map(node => node.id));
            const normalized = normalizeInsightResponse(raw, activeBrief.citeMap, validNodeIds);
            persist({
                generatedAt: Date.now(),
                scope: activeBrief.scope,
                scopeNodeIds: activeBrief.scopedNodes.map(node => node.id),
                snapshotHash: activeBrief.snapshotHash,
                citeMap: activeBrief.citeMap,
                findings: normalized.findings,
                questions: normalized.questions,
                messages: [],
            });
        } catch (err) {
            if (gen !== digestGenRef.current || requestBoardId !== boardIdRef.current) return;
            setError(toErrorMessage(err) || '启发分析失败，请重试');
        } finally {
            if (gen === digestGenRef.current) {
                digestingRef.current = false;
                setIsDigesting(false);
            }
        }
    }, [edges, nodes, persist, selectedNodeIds, title]);

    const askQuestion = useCallback(async (question: string) => {
        const trimmed = question.trim();
        if (!trimmed || isAnswering || isDigesting) return;
        if (!brief.canAnalyze) {
            setError('先往白板上放一些便签或文章，再来提问。');
            return;
        }

        answerAbortRef.current?.abort();
        const controller = new AbortController();
        answerAbortRef.current = controller;

        const previous = dropEmptyAssistant(insightsRef.current);
        const history = previous?.messages || [];
        const userMessage: InsightMessage = {role: 'user', content: trimmed};
        const draft: WhiteboardInsights = previous
            ? {...previous, messages: [...history, userMessage, {role: 'assistant', content: ''}]}
            : {
                generatedAt: Date.now(),
                scope: brief.scope,
                scopeNodeIds: brief.scopedNodes.map(node => node.id),
                snapshotHash: brief.snapshotHash,
                citeMap: brief.citeMap,
                findings: [],
                questions: [],
                messages: [userMessage, {role: 'assistant', content: ''}],
            };

        setInsights(draft);
        insightsRef.current = draft;
        setIsAnswering(true);
        setError(null);

        try {
            const answer = await streamWhiteboardAnswer(
                brief.brief,
                trimmed,
                history,
                chunk => {
                    const current = insightsRef.current;
                    if (!current) return;
                    const messages = [...current.messages];
                    const last = messages[messages.length - 1];
                    if (!last || last.role !== 'assistant') return;
                    messages[messages.length - 1] = {role: 'assistant', content: last.content + chunk};
                    const next = {...current, messages};
                    insightsRef.current = next;
                    setInsights(next);
                },
                controller.signal,
            );
            const current = insightsRef.current;
            if (!current) return;
            const messages = [...current.messages];
            const last = messages[messages.length - 1];
            if (last?.role === 'assistant') {
                messages[messages.length - 1] = {role: 'assistant', content: answer || last.content};
            }
            persist({...current, messages});
        } catch (err) {
            if (answerAbortRef.current !== controller) return;
            if (controller.signal.aborted) {
                persist(dropEmptyAssistant(insightsRef.current));
                return;
            }
            const message = toErrorMessage(err);
            if (message) setError(message);
            persist(dropEmptyAssistant(insightsRef.current));
        } finally {
            if (answerAbortRef.current === controller) {
                answerAbortRef.current = null;
                setIsAnswering(false);
            }
        }
    }, [brief, isAnswering, isDigesting, persist]);

    const openWithPreferredScope = useCallback((selectedCount: number) => {
        const nextScope = selectedCount >= 2 ? 'selection' : 'board';
        setScope(nextScope);
        if (!insightsRef.current && !digestingRef.current) {
            void runDigest(nextScope);
        }
    }, [runDigest]);

    return {
        scope,
        setScope,
        insights,
        brief,
        isStale,
        isDigesting,
        isAnswering,
        error,
        runDigest,
        askQuestion,
        openWithPreferredScope,
    };
}
