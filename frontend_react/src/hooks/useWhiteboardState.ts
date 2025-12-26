import { useState, useCallback } from 'react';
import { WhiteboardNode, WhiteboardEdge } from '../types/whiteboard';

const MAX_HISTORY = 50;

export function useWhiteboardState() {
    const [nodes, setNodes] = useState<WhiteboardNode[]>([]);
    const [edges, setEdges] = useState<WhiteboardEdge[]>([]);

    // 历史记录
    const [history, setHistory] = useState<{ nodes: WhiteboardNode[], edges: WhiteboardEdge[] }[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [maxZIndex, setMaxZIndex] = useState(1);

    // --- 历史记录管理 ---
    const saveHistory = useCallback((currentNodes: WhiteboardNode[], currentEdges: WhiteboardEdge[]) => {
        setHistory(prev => {
            const newHistory = prev.slice(0, historyIndex + 1);
            newHistory.push({
                nodes: JSON.parse(JSON.stringify(currentNodes)),
                edges: JSON.parse(JSON.stringify(currentEdges))
            });
            if (newHistory.length > MAX_HISTORY) newHistory.shift();
            return newHistory;
        });
        setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
    }, [historyIndex]);

    const undo = useCallback(() => {
        if (historyIndex > 0) {
            const prevIndex = historyIndex - 1;
            const prevState = history[prevIndex];
            setNodes(prevState.nodes);
            setEdges(prevState.edges);
            setHistoryIndex(prevIndex);
            return true; // 表示撤销成功
        }
        return false;
    }, [history, historyIndex]);

    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const nextIndex = historyIndex + 1;
            const nextState = history[nextIndex];
            setNodes(nextState.nodes);
            setEdges(nextState.edges);
            setHistoryIndex(nextIndex);
            return true;
        }
        return false;
    }, [history, historyIndex]);

    // --- 数据操作 ---
    const updateNodes = useCallback((newNodes: WhiteboardNode[], save = false) => {
        setNodes(newNodes);
        if (save) saveHistory(newNodes, edges);
    }, [edges, saveHistory]);

    const updateEdges = useCallback((newEdges: WhiteboardEdge[], save = false) => {
        setEdges(newEdges);
        if (save) saveHistory(nodes, newEdges);
    }, [nodes, saveHistory]);

    // 增加 Z-Index 并返回新值
    const nextZIndex = useCallback(() => {
        setMaxZIndex(prev => prev + 1);
        return maxZIndex + 1;
    }, [maxZIndex]);

    return {
        nodes,
        edges,
        setNodes, // 暴露给一些特殊交互直接修改（如拖拽中）
        setEdges,
        updateNodes, // 推荐使用这个，带历史记录
        updateEdges,
        undo,
        redo,
        canUndo: historyIndex > 0,
        canRedo: historyIndex < history.length - 1,
        saveHistory,
        nextZIndex,
    };
}