import React, {useEffect, useState} from 'react';
import {Focus, LayoutDashboard, Minus, Plus, Redo2, Undo2} from 'lucide-react';

interface WhiteboardToolbarProps {
    scale: number;
    subscribeScale?: (listener: (scale: number) => void) => () => void;
    setScale: (scale: number | ((s: number) => number)) => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onFitToContent: () => void;
    onAutoLayout: () => void;
}

export const WhiteboardToolbar: React.FC<WhiteboardToolbarProps> = ({
    scale,
    subscribeScale,
    setScale,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onFitToContent,
    onAutoLayout
}) => {
    const [liveScale, setLiveScale] = useState(scale);

    useEffect(() => {
        setLiveScale(scale);
    }, [scale]);

    useEffect(() => {
        if (!subscribeScale) return;
        return subscribeScale(setLiveScale);
    }, [subscribeScale]);

    return (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-[100]">
            <div className="flex items-center bg-white/90 backdrop-blur-sm rounded-full shadow-xl border border-slate-200 px-3 py-1.5">
                <div className="flex items-center space-x-1 mr-3">
                    <button
                        onClick={onUndo}
                        disabled={!canUndo}
                        className={`p-2 rounded-full transition-colors ${canUndo ? 'hover:bg-slate-100 text-slate-700' : 'text-slate-300 cursor-not-allowed'}`}
                        title="撤回 (Ctrl+Z)"
                    >
                        <Undo2 className="w-4 h-4"/>
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={!canRedo}
                        className={`p-2 rounded-full transition-colors ${canRedo ? 'hover:bg-slate-100 text-slate-700' : 'text-slate-300 cursor-not-allowed'}`}
                        title="重做 (Ctrl+Y)"
                    >
                        <Redo2 className="w-4 h-4"/>
                    </button>
                </div>

                <div className="w-px h-5 bg-slate-200"/>

                <div className="flex items-center space-x-1 mx-3">
                    <button
                        onClick={() => setScale(s => Math.max(0.1, s - 0.1))}
                        className="p-2 rounded-full hover:bg-slate-100 text-slate-700 transition-colors"
                        title="缩小"
                    >
                        <Minus className="w-4 h-4"/>
                    </button>
                    <span
                        className="min-w-[3.2rem] text-center text-xs font-semibold text-slate-600 select-none cursor-pointer hover:text-slate-800"
                        onClick={() => setScale(1)}
                        title="重置缩放"
                    >
                        {Math.round(liveScale * 100)}%
                    </span>
                    <button
                        onClick={() => setScale(s => Math.min(3, s + 0.1))}
                        className="p-2 rounded-full hover:bg-slate-100 text-slate-700 transition-colors"
                        title="放大"
                    >
                        <Plus className="w-4 h-4"/>
                    </button>
                </div>

                <div className="w-px h-5 bg-slate-200"/>

                <div className="flex items-center ml-2 gap-1">
                    <button
                        onClick={onFitToContent}
                        title="适应内容"
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full hover:bg-slate-100 text-slate-700 transition-colors"
                    >
                        <Focus className="w-4 h-4"/>
                        <span className="text-xs font-medium">适应内容</span>
                    </button>
                    <button
                        onClick={onAutoLayout}
                        title="整理画布"
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full hover:bg-slate-100 text-slate-700 transition-colors"
                    >
                        <LayoutDashboard className="w-4 h-4"/>
                        <span className="text-xs font-medium">整理</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
