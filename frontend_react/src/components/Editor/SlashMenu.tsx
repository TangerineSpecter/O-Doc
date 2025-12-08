import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Slash 命令菜单组件

export interface CommandItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    value: string;
    desc: string;
    cursorOffset?: number;
}

interface SlashMenuProps {
    isOpen: boolean;
    position: { top: number; left: number };
    commands: CommandItem[];
    selectedIndex: number;
    onSelect: (command: CommandItem) => void;
    setSelectedIndex: (index: number) => void;
}

export const SlashMenu = ({
    isOpen,
    position,
    commands,
    selectedIndex,
    onSelect,
    setSelectedIndex
}: SlashMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null);

    // 自动滚动到选中项
    useEffect(() => {
        if (isOpen && menuRef.current) {
            const selectedElement = menuRef.current.children[selectedIndex];
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex, isOpen]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed z-50 w-64 bg-white rounded-xl shadow-2xl ring-1 ring-slate-900/5 overflow-hidden flex flex-col max-h-72 animate-in fade-in zoom-in-95 duration-75"
            style={{
                top: position.top,
                left: Math.min(position.left, window.innerWidth - 280),
            }}
        >
            <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                <span>插入内容</span>
                <span className="text-[9px] bg-slate-200 px-1 rounded">↑↓ 选择</span>
            </div>
            <div ref={menuRef} className="overflow-y-auto flex-1 py-1 scroll-smooth">
                {commands.length > 0 ? (
                    commands.map((cmd, idx) => (
                        <button
                            key={cmd.id}
                            onClick={() => onSelect(cmd)}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${idx === selectedIndex ? 'bg-orange-50' : 'bg-white hover:bg-slate-50'}`}
                        >
                            <div className={`w-9 h-9 rounded border flex items-center justify-center flex-shrink-0 shadow-sm ${idx === selectedIndex ? 'bg-white border-orange-200 text-orange-500' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                {cmd.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className={`text-sm font-medium ${idx === selectedIndex ? 'text-slate-900' : 'text-slate-700'}`}>{cmd.label}</div>
                                <div className="text-xs text-slate-400 truncate">{cmd.desc}</div>
                            </div>
                            {idx === selectedIndex && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mr-1" />}
                        </button>
                    ))
                ) : (
                    <div className="px-4 py-8 flex flex-col items-center justify-center text-slate-400">
                        <X size={20} className="mb-2 opacity-50" />
                        <span className="text-xs">未找到命令</span>
                    </div>
                )}
            </div>
        </div>
    );
};