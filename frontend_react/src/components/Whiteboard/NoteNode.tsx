import React from 'react';
import { Trash2 } from 'lucide-react';
import { WhiteboardNode } from '../../types/whiteboard';

interface NoteNodeProps {
    node: WhiteboardNode;
    selected: boolean;
    onDelete: (id: string) => void;
    onDragStart: (e: React.MouseEvent, id: string) => void;
}

export const NoteNode: React.FC<NoteNodeProps> = ({ node, selected, onDelete, onDragStart }) => {
    return (
        <div
            className={`
                group relative h-full w-full flex flex-col
                transition-all duration-200 rounded-sm
                ${selected ? 'ring-2 ring-orange-400 z-50 shadow-2xl' : 'shadow-lg hover:shadow-xl hover:z-40 cursor-move'}
            `}
            style={{
                backgroundColor: node.color || '#fef3c7',
            }}
            // 只有未选中时，点击外层 div 才会触发拖拽。
            // 选中后，点击事件通常由 textarea 捕获（除非点在边框上），这里主要兜底
            onMouseDown={(e) => {
                if (!selected) {
                    onDragStart(e, node.id);
                }
            }}
        >
            {/* 内容区域 */}
            <div className="flex-1 w-full h-full relative overflow-hidden">
                <textarea
                    className={`
                        w-full h-full bg-transparent resize-none outline-none 
                        text-slate-800 font-handwriting text-lg leading-relaxed p-4 
                        placeholder:text-slate-500/30
                        ${selected ? 'cursor-text pointer-events-auto' : 'cursor-move pointer-events-none'}
                    `}
                    defaultValue={node.content}
                    placeholder="写点什么..."
                    // 只有选中状态下，textarea 才拦截事件用于输入
                    // 未选中状态下 pointer-events-none 会让事件穿透到父 div 触发拖拽
                    onMouseDown={(e) => e.stopPropagation()}
                />
            </div>

            {/* 底部日期装饰 */}
            <div className="absolute bottom-1 right-2 text-[10px] text-slate-400/60 font-serif italic select-none pointer-events-none">
               {new Date().toLocaleDateString()}
            </div>

            {/* 删除按钮 - 仅在选中时显示 */}
            {selected && (
                <button
                    className="absolute -top-3 -right-3 p-1.5 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition-transform hover:scale-110 z-50"
                    onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            )}
        </div>
    );
};