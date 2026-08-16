import React from 'react';
import {Trash2, Type} from 'lucide-react';
import type {WhiteboardNode} from '../../types/whiteboard';
import {getNodeLabelValue} from '../../utils/whiteboardOps';

interface TextNodeProps {
    node: WhiteboardNode;
    selected: boolean;
    onDelete: (id: string) => void;
    onDragStart: (e: React.MouseEvent, id: string) => void;
    onLabelChange: (id: string, label: string) => void;
    onLabelCommit: () => void;
}

export const TextNode: React.FC<TextNodeProps> = ({
    node,
    selected,
    onDelete,
    onDragStart,
    onLabelChange,
    onLabelCommit
}) => {
    return (
        <div
            className={`
                relative h-full w-full flex flex-col overflow-hidden
                bg-white border border-slate-200 rounded-xl
                ${selected
                    ? 'ring-2 ring-orange-400 shadow-xl'
                    : 'shadow-sm hover:border-slate-300'}
            `}
            onMouseDown={(e) => {
                if (!selected) onDragStart(e, node.id);
            }}
        >
            <div
                className="flex items-center gap-2 px-3 h-8 border-b border-slate-100 bg-slate-50 cursor-grab active:cursor-grabbing"
                onMouseDown={(e) => onDragStart(e, node.id)}
            >
                <Type className="w-3.5 h-3.5 text-slate-400"/>
                <span className="text-[10px] font-semibold tracking-wide text-slate-500">文本</span>
                {selected && (
                    <button
                        className="ml-auto p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(node.id);
                        }}
                    >
                        <Trash2 className="w-3.5 h-3.5"/>
                    </button>
                )}
            </div>
            <textarea
                className={`
                    flex-1 w-full bg-transparent resize-none outline-none
                    px-3 py-2 text-slate-800 text-base font-semibold leading-snug
                    placeholder:text-slate-400/50 placeholder:font-medium
                    ${selected ? 'cursor-text' : 'pointer-events-none cursor-move'}
                `}
                value={getNodeLabelValue(node)}
                placeholder="写下标题或短句..."
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => onLabelChange(node.id, e.target.value)}
                onBlur={onLabelCommit}
            />
        </div>
    );
};
