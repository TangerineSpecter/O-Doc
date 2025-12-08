import { ArrowLeft, Edit3, Eye, Type, Save } from 'lucide-react';

// 顶部导航栏组件

interface EditorHeaderProps {
    title: string;
    setTitle: (title: string) => void;
    isSaving: boolean;
    onSave: () => void;
    isPreviewMode: boolean;
    onTogglePreview: () => void;
    onBack: () => void;
}

export const EditorHeader = ({
    title,
    setTitle,
    isSaving,
    onSave,
    isPreviewMode,
    onTogglePreview,
    onBack
}: EditorHeaderProps) => {
    return (
        <header className="h-14 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 z-40 flex-shrink-0 relative">
            <div className="flex items-center gap-4 flex-1">
                <button onClick={onBack} className="p-2 -ml-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 max-w-lg relative group">
                    <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                        <Edit3 className="w-4 h-4 text-slate-300 group-hover:text-orange-400 transition-colors" />
                    </div>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full pl-9 pr-4 py-1.5 bg-transparent border border-transparent hover:border-slate-200 focus:border-orange-500/50 rounded-md text-slate-800 font-bold text-lg outline-none transition-all placeholder:text-slate-300"
                        placeholder="请输入文档标题..."
                    />
                </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-md border border-slate-200/60">
                    <span className={`w-2 h-2 rounded-full ${isSaving ? 'bg-orange-400 animate-pulse' : 'bg-green-400'}`}></span>
                    <span className="text-xs text-slate-500 font-medium">{isSaving ? '保存中...' : '已保存'}</span>
                </div>

                <button
                    onClick={onTogglePreview}
                    className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all select-none
                        ${isPreviewMode
                            ? 'bg-orange-50 text-orange-600 border border-orange-200 shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100 border border-transparent'}
                    `}
                    title="快捷键 Cmd+E"
                >
                    {isPreviewMode ? <Eye className="w-4 h-4" /> : <Type className="w-4 h-4" />}
                    <span className="hidden sm:inline">{isPreviewMode ? '预览模式' : '编辑模式'}</span>
                </button>

                <button
                    onClick={onSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-black text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isSaving ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Save className="w-4 h-4" />
                    )}
                    <span>保存</span>
                </button>
            </div>
        </header>
    );
};