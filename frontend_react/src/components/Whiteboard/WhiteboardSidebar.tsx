import React from 'react';
import { MousePointer2, FileText, StickyNote, Shapes, Square, Circle, Diamond } from 'lucide-react';

interface WhiteboardSidebarProps {
    activeTool: 'select' | 'hand';
    setActiveTool: (tool: 'select' | 'hand') => void;
    isArticlePickerOpen: boolean;
    toggleArticlePicker: () => void;
    onAddNote: () => void;
    onAddShape: (type: 'rectangle' | 'circle' | 'diamond') => void;
}

export const WhiteboardSidebar: React.FC<WhiteboardSidebarProps> = ({
    activeTool,
    setActiveTool,
    isArticlePickerOpen,
    toggleArticlePicker,
    onAddNote,
    onAddShape
}) => {
    return (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-[100] flex flex-col gap-2 p-1.5 bg-white rounded-2xl shadow-xl border border-slate-200">
            <ToolbarBtn
                icon={<MousePointer2 className="w-5 h-5" />}
                label="选择 / 移动"
                active={activeTool === 'select'}
                onClick={() => setActiveTool('select')}
            />
            <div className="h-px bg-slate-100 w-full my-1" />

            <ToolbarBtn
                icon={<FileText className="w-5 h-5" />}
                label="插入文章"
                active={isArticlePickerOpen}
                onClick={toggleArticlePicker}
            />

            <ToolbarBtn
                icon={<StickyNote className="w-5 h-5" />}
                label="便签"
                onClick={onAddNote}
            />

            {/* 图形组 */}
            <div className="relative group">
                <ToolbarBtn icon={<Shapes className="w-5 h-5" />} label="图形" active={false} onClick={() => { }} />
                <div className="absolute left-full top-0 pl-3 hidden group-hover:flex">
                    <div className="flex flex-col gap-2 p-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 transition-all animate-in fade-in slide-in-from-left-2">
                        <ToolbarBtn icon={<Square className="w-5 h-5" />} label="矩形" onClick={() => onAddShape('rectangle')} />
                        <ToolbarBtn icon={<Circle className="w-5 h-5" />} label="圆形" onClick={() => onAddShape('circle')} />
                        <ToolbarBtn icon={<Diamond className="w-5 h-5" />} label="菱形" onClick={() => onAddShape('diamond')} />
                    </div>
                </div>
            </div>
        </div>
    );
};

function ToolbarBtn({ icon, label, onClick, active }: any) {
    return (
        <button onClick={onClick}
            className={`p-3 rounded-xl transition-all flex items-center justify-center relative group ${active ? 'bg-orange-100 text-orange-600' : 'text-slate-500 hover:bg-slate-50'}`}
            title={label}>
            {icon}
        </button>
    );
}