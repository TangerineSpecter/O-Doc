import React from 'react';
import {ChevronRight, ListTree, Maximize2, Minimize2, Sparkles} from 'lucide-react';
import {WhiteboardOutline} from './WhiteboardOutline';
import {WhiteboardInsightPanel} from './WhiteboardInsightPanel';
import type {WhiteboardInsights, WhiteboardNode} from '../../types/whiteboard';
import type {BoardBrief} from '../../utils/whiteboardInsight';

export type WhiteboardRightTab = 'outline' | 'insight';

interface WhiteboardRightDockProps {
    tab: WhiteboardRightTab;
    onTabChange: (tab: WhiteboardRightTab) => void;
    nodes: WhiteboardNode[];
    selectedNodeIds: string[];
    onJump: (nodeId: string) => void;
    brief: BoardBrief;
    insights: WhiteboardInsights | null;
    isStale: boolean;
    isDigesting: boolean;
    isAnswering: boolean;
    error: string | null;
    scope: 'board' | 'selection';
    onScopeChange: (scope: 'board' | 'selection') => void;
    onAnalyze: () => void;
    onAsk: (question: string) => void;
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
    collapsed?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
}

export const WhiteboardRightDock: React.FC<WhiteboardRightDockProps> = ({
    tab,
    onTabChange,
    nodes,
    selectedNodeIds,
    onJump,
    brief,
    insights,
    isStale,
    isDigesting,
    isAnswering,
    error,
    scope,
    onScopeChange,
    onAnalyze,
    onAsk,
    expanded = false,
    onExpandedChange,
    collapsed = false,
    onCollapsedChange,
}) => {
    const wide = tab === 'insight';
    const reading = wide && expanded;

    const collapsedRail = (
        <div className="absolute top-20 right-4 z-[90] flex flex-col gap-1 p-1.5 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xl">
            <button
                type="button"
                title="大纲"
                onClick={() => {
                    onCollapsedChange?.(false);
                    onExpandedChange?.(false);
                    onTabChange('outline');
                }}
                className={`p-2 rounded-xl ${tab === 'outline' && !reading ? 'bg-orange-100 text-orange-600' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                <ListTree className="w-4 h-4"/>
            </button>
            <button
                type="button"
                title="启发"
                onClick={() => {
                    onCollapsedChange?.(false);
                    onTabChange('insight');
                }}
                className={`p-2 rounded-xl ${tab === 'insight' ? 'bg-orange-100 text-orange-600' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                <Sparkles className="w-4 h-4"/>
            </button>
        </div>
    );

    const insightBody = (
        <WhiteboardInsightPanel
            brief={brief}
            insights={insights}
            isStale={isStale}
            isDigesting={isDigesting}
            isAnswering={isAnswering}
            error={error}
            selectedCount={selectedNodeIds.length}
            scope={scope}
            onScopeChange={onScopeChange}
            onAnalyze={onAnalyze}
            onAsk={onAsk}
            onJump={onJump}
            expanded={expanded}
        />
    );

    if (reading) {
        return (
            <>
                {collapsedRail}
                <div className="absolute inset-x-0 top-20 bottom-28 z-[95] flex justify-center px-6 pointer-events-none">
                    <div className="pointer-events-auto w-[min(56rem,calc(100vw-8rem))] h-full flex flex-col bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
                        <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-orange-500"/>
                            <span className="text-xs font-semibold text-slate-800">启发</span>
                            <button
                                type="button"
                                title="收窄到侧栏"
                                onClick={() => onExpandedChange?.(false)}
                                className="ml-auto p-1 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-orange-600"
                            >
                                <Minimize2 className="w-3.5 h-3.5"/>
                            </button>
                        </div>
                        {insightBody}
                    </div>
                </div>
            </>
        );
    }

    if (collapsed) return collapsedRail;

    return (
        <div
            className={`absolute top-20 right-4 z-[90] flex flex-col bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xl overflow-hidden ${
                wide ? 'w-96' : 'w-56'
            } max-h-[calc(100%-11rem)]`}
        >
            <div className="px-2 py-2 border-b border-slate-100 flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => onTabChange('outline')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
                        tab === 'outline' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <ListTree className="w-3.5 h-3.5"/>
                    大纲
                </button>
                <button
                    type="button"
                    onClick={() => onTabChange('insight')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
                        tab === 'insight' ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <Sparkles className="w-3.5 h-3.5"/>
                    启发
                </button>
                {wide && (
                    <button
                        type="button"
                        title="展开阅读"
                        onClick={() => onExpandedChange?.(true)}
                        className="ml-auto p-1 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-orange-600"
                    >
                        <Maximize2 className="w-3.5 h-3.5"/>
                    </button>
                )}
                <button
                    type="button"
                    title="收起"
                    onClick={() => {
                        onCollapsedChange?.(true);
                        onExpandedChange?.(false);
                    }}
                    className={`${wide ? '' : 'ml-auto'} p-1 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600`}
                >
                    <ChevronRight className="w-3.5 h-3.5"/>
                </button>
            </div>

            {tab === 'outline' ? (
                <WhiteboardOutline
                    nodes={nodes}
                    selectedNodeIds={selectedNodeIds}
                    onJump={onJump}
                    embedded
                />
            ) : insightBody}
        </div>
    );
};
