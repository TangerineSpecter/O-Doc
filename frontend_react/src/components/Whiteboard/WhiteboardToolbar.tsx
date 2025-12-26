import React from 'react';
import { Undo2, Redo2, Minus, Plus, LayoutDashboard } from 'lucide-react';

interface WhiteboardToolbarProps {
    scale: number;
    setScale: (scale: number | ((s: number) => number)) => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onAutoLayout: () => void;
}

export const WhiteboardToolbar: React.FC<WhiteboardToolbarProps> = ({
    scale,
    setScale,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onAutoLayout
}) => {
    return (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[100]">
            <div className="flex items-center bg-white/90 backdrop-blur-sm rounded-full shadow-xl border border-slate-200 px-3 py-1.5">

                {/* 撤销/重做 */}
                <div className="flex items-center space-x-1 mr-3">
                    <button onClick={onUndo} disabled={!canUndo} className={`p-2 rounded-full transition-colors ${canUndo ? 'hover:bg-slate-100 text-slate-700' : 'text-slate-300 cursor-not-allowed'}`} title="撤回 (Ctrl+Z)">
                        <Undo2 className="w-5 h-5" />
                    </button>
                    <button onClick={onRedo} disabled={!canRedo} className={`p-2 rounded-full transition-colors ${canRedo ? 'hover:bg-slate-100 text-slate-700' : 'text-slate-300 cursor-not-allowed'}`} title="重做 (Ctrl+Y)">
                        <Redo2 className="w-5 h-5" />
                    </button>
                </div>

                <div className="w-px h-6 bg-slate-200"></div>

                {/* 缩放 */}
                <div className="flex items-center space-x-1 mx-3">
                    <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="p-2 rounded-full hover:bg-slate-100 text-slate-700 transition-colors">
                        <Minus className="w-5 h-5" />
                    </button>
                    <span className="min-w-[3.5rem] text-center text-sm font-semibold text-slate-600 select-none cursor-pointer hover:text-blue-600" onClick={() => setScale(1)}>
                        {Math.round(scale * 100)}%
                    </span>
                    <button onClick={() => setScale(s => Math.min(3, s + 0.1))} className="p-2 rounded-full hover:bg-slate-100 text-slate-700 transition-colors">
                        <Plus className="w-5 h-5" />
                    </button>
                </div>

                <div className="w-px h-6 bg-slate-200"></div>

                {/* 整理 */}
                <div className="flex items-center ml-3">
                    <button onClick={onAutoLayout} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full hover:bg-blue-50 text-slate-700 hover:text-blue-600 transition-colors group">
                        <LayoutDashboard className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium">整理画布</span>
                    </button>
                </div>
            </div>
        </div>
    );
};