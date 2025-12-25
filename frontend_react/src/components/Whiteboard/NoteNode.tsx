import React from 'react';
import { Trash2, GripVertical } from 'lucide-react';
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
                bg-white shadow-xl transition-all duration-200
                ${selected ? 'ring-2 ring-orange-400 z-50' : 'hover:shadow-2xl hover:z-40'}
            `}
            style={{
                // 1. 移除了旋转 transform
                // 2. 保留底部留白，模拟拍立得/截图卡片的感觉
                padding: '12px 12px 40px 12px', 
            }}
        >
            {/* 拖拽把手 */}
            <div 
                className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-8 cursor-grab active:cursor-grabbing z-20 flex items-center justify-center bg-white border border-slate-100 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                onMouseDown={(e) => onDragStart(e, node.id)} 
            >
                <GripVertical className="w-4 h-4 text-slate-400" />
            </div>

            {/* 内容区域 */}
            <div 
                className="flex-1 w-full h-full relative overflow-hidden transition-colors" 
                style={{ 
                    // 确保使用传入的颜色，如果是黄色便签则显示黄色
                    backgroundColor: node.color || '#fef3c7' 
                }}
            >
                <textarea 
                    className="w-full h-full bg-transparent resize-none outline-none text-slate-800 font-handwriting text-lg leading-relaxed p-4 placeholder:text-slate-500/30"
                    defaultValue={node.content}
                    placeholder="写点什么..."
                    onMouseDown={(e) => e.stopPropagation()} 
                />
            </div>

            {/* 底部装饰：日期 */}
            <div className="absolute bottom-2 right-4 text-xs text-slate-300 font-serif italic select-none">
               {new Date().toLocaleDateString()}
            </div>

            {/* 删除按钮 */}
            {selected && (
                <button 
                    className="absolute -top-2 -right-2 p-1.5 bg-red-50 text-red-500 border border-red-100 rounded-full shadow hover:bg-red-500 hover:text-white transition-colors z-30" 
                    onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            )}
        </div>
    );
};