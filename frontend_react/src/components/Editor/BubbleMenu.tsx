import React from 'react';
import { 
    Bold, Italic, Underline, Highlighter, Waves, 
    Strikethrough, Code 
} from 'lucide-react';

export interface BubbleMenuItem {
    id: string;
    icon: React.ReactNode;
    label: string;
    action: () => void;
}

interface BubbleMenuProps {
    isOpen: boolean;
    position: { top: number; left: number };
    onFormat: (type: string) => void;
}

export const BubbleMenu = ({ isOpen, position, onFormat }: BubbleMenuProps) => {
    if (!isOpen) return null;

    const items = [
        { id: 'bold', label: '加粗', icon: <Bold size={14} />, action: () => onFormat('bold') },
        { id: 'italic', label: '斜体', icon: <Italic size={14} />, action: () => onFormat('italic') },
        { id: 'strike', label: '删除线', icon: <Strikethrough size={14} />, action: () => onFormat('strike') },
        { id: 'code', label: '行内代码', icon: <Code size={14} />, action: () => onFormat('code') },
        { type: 'divider' },
        { id: 'underline', label: '下划线', icon: <Underline size={14} className="text-red-500" />, action: () => onFormat('underline') },
        { id: 'wave', label: '波浪线', icon: <Waves size={14} className="text-blue-500" />, action: () => onFormat('wave') },
        { id: 'watercolor', label: '高亮', icon: <Highlighter size={14} className="text-orange-500" />, action: () => onFormat('watercolor') },
    ];

    return (
        <div
            className="fixed z-50 flex items-center gap-1 p-1 bg-slate-900 text-white rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200"
            style={{
                top: Math.max(10, position.top - 50), // 避免超出顶部
                left: Math.max(10, position.left),
                transform: 'translateX(-50%)' // 居中显示
            }}
            onMouseDown={(e) => e.preventDefault()} // 关键：防止点击菜单时导致编辑器失去焦点/选区丢失
        >
            {items.map((item, idx) => {
                if (item.type === 'divider') {
                    return <div key={`div-${idx}`} className="w-px h-4 bg-white/20 mx-1" />;
                }
                return (
                    <button
                        key={item.id}
                        onClick={(e) => {
                            e.stopPropagation();
                            item.action && item.action();
                        }}
                        className="p-1.5 hover:bg-white/20 rounded-md transition-colors relative group"
                        title={item.label}
                    >
                        {item.icon}
                    </button>
                );
            })}
            
            {/* 小三角箭头 */}
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 rotate-45"></div>
        </div>
    );
};