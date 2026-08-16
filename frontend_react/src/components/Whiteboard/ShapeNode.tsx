import React from 'react';
import {Trash2} from 'lucide-react';
import type {WhiteboardNode} from '../../types/whiteboard';
import {getNodeLabelValue} from '../../utils/whiteboardOps';

interface ShapeNodeProps {
    node: WhiteboardNode;
    selected: boolean;
    onDelete: (id: string) => void;
    onDragStart: (e: React.MouseEvent, id: string) => void;
    onLabelChange: (id: string, label: string) => void;
    onLabelCommit: () => void;
}

export const ShapeNode: React.FC<ShapeNodeProps> = ({
    node,
    selected,
    onDelete,
    onDragStart,
    onLabelChange,
    onLabelCommit
}) => {
    const isCircle = node.shapeType === 'circle';
    const isDiamond = node.shapeType === 'diamond';

    return (
        <div className="relative w-full h-full" onMouseDown={(e) => onDragStart(e, node.id)}>
            <div
                className={`
                    w-full h-full flex items-center justify-center
                    border-4 bg-white/40
                    ${isCircle ? 'rounded-full' : isDiamond ? 'rotate-45 scale-[0.74] rounded-xl' : 'rounded-2xl'}
                    ${selected ? 'border-orange-400' : 'border-slate-400'}
                `}
            >
                <div className={`w-[78%] ${isDiamond ? '-rotate-45' : ''}`}>
                    <input
                        className={`
                            w-full bg-transparent text-center outline-none
                            text-sm font-semibold text-slate-700
                            placeholder:text-slate-400/60
                            ${selected ? 'cursor-text' : 'pointer-events-none cursor-move'}
                        `}
                        value={getNodeLabelValue(node)}
                        placeholder="标签"
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => onLabelChange(node.id, e.target.value)}
                        onBlur={onLabelCommit}
                    />
                </div>
            </div>
            {selected && (
                <button
                    className="absolute -top-3 -right-2 p-1.5 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 z-50"
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
