import React from 'react';
import {FileText, ListTree, Shapes, StickyNote, Type} from 'lucide-react';
import type {WhiteboardNode} from '../../types/whiteboard';
import {getNodeDisplayLabel} from '../../utils/whiteboardOps';

interface WhiteboardOutlineProps {
    nodes: WhiteboardNode[];
    selectedNodeIds: string[];
    onJump: (nodeId: string) => void;
}

const iconFor = (node: WhiteboardNode) => {
    if (node.type === 'article') return <FileText className="w-3.5 h-3.5 text-slate-500"/>;
    if (node.type === 'note') return <StickyNote className="w-3.5 h-3.5 text-slate-500"/>;
    if (node.type === 'text') return <Type className="w-3.5 h-3.5 text-sky-500"/>;
    return <Shapes className="w-3.5 h-3.5 text-lime-600"/>;
};

export const WhiteboardOutline: React.FC<WhiteboardOutlineProps> = ({
    nodes,
    selectedNodeIds,
    onJump
}) => {
    const ordered = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);

    return (
        <div className="absolute top-20 right-4 z-[90] w-56 max-h-[calc(100%-11rem)] flex flex-col bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-slate-100 flex items-center gap-2">
                <ListTree className="w-4 h-4 text-slate-500"/>
                <h3 className="text-xs font-bold text-slate-700">大纲</h3>
                <span className="ml-auto text-[10px] text-slate-400">{nodes.length}</span>
            </div>
            <div className="overflow-y-auto p-1.5 space-y-0.5">
                {ordered.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[11px] text-slate-400">画布还是空的</p>
                ) : ordered.map(node => {
                    const active = selectedNodeIds.includes(node.id);
                    return (
                        <button
                            key={node.id}
                            type="button"
                            onClick={() => onJump(node.id)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                                active ? 'bg-slate-100 text-slate-800' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            {iconFor(node)}
                            <span className="truncate text-xs font-medium">{getNodeDisplayLabel(node)}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
