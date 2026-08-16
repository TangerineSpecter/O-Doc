import React from 'react';
import {Trash2} from 'lucide-react';
import type {WhiteboardNode} from '../../types/whiteboard';

interface NoteNodeProps {
    node: WhiteboardNode;
    selected: boolean;
    onDelete: (id: string) => void;
    onDragStart: (e: React.MouseEvent, id: string) => void;
    onContentChange: (id: string, content: string) => void;
    onContentCommit: () => void;
}

export const NoteNode: React.FC<NoteNodeProps> = ({
    node,
    selected,
    onDelete,
    onDragStart,
    onContentChange,
    onContentCommit
}) => {
    const paper = node.color || '#fde68a';

    return (
        <div
            className={`
                group relative h-full w-full flex flex-col overflow-hidden
                rounded-[4px]
                ${selected
                    ? 'ring-2 ring-orange-400 z-50 shadow-2xl'
                    : 'shadow-lg hover:shadow-xl'}
            `}
            style={{backgroundColor: paper}}
            onMouseDown={(e) => {
                if (!selected) onDragStart(e, node.id);
            }}
        >
            <div className="absolute inset-x-3 top-3 h-px bg-black/5 pointer-events-none" />
            <div
                className="absolute -right-3 -bottom-4 w-10 h-10 pointer-events-none opacity-30"
                style={{background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.08) 50%)'}}
            />

            <div
                className="h-7 shrink-0 cursor-grab active:cursor-grabbing"
                onMouseDown={(e) => onDragStart(e, node.id)}
            />

            <div className="flex-1 w-full relative overflow-hidden px-1 pb-5">
                <textarea
                    className={`
                        w-full h-full bg-transparent resize-none outline-none
                        text-slate-800 text-[15px] leading-relaxed px-3
                        placeholder:text-slate-500/35
                        ${selected ? 'cursor-text pointer-events-auto' : 'cursor-move pointer-events-none'}
                    `}
                    value={node.content || ''}
                    placeholder="写下一闪而过的想法..."
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => onContentChange(node.id, e.target.value)}
                    onBlur={onContentCommit}
                />
            </div>

            {selected && (
                <button
                    className="absolute -top-2.5 -right-2.5 p-1.5 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition-transform hover:scale-110 z-50"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(node.id);
                    }}
                >
                    <Trash2 className="w-3 h-3"/>
                </button>
            )}
        </div>
    );
};
