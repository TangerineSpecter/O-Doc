import {useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Copy, MoreHorizontal, PenLine, Plus, Search, Trash2} from 'lucide-react';
import ConfirmationModal from '../components/common/ConfirmationModal';
import {useToast} from '../components/common/ToastProvider';
import {useWhiteboardDocuments} from '../hooks/useWhiteboardDocuments';
import {BoardPreview} from '../components/Whiteboard/BoardPreview';
import type {WhiteboardDocument} from '../types/whiteboard';

const formatTime = (time: number) => {
    return new Date(time).toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const getBoardStats = (document: WhiteboardDocument) => ({
    nodeCount: document.nodes.length,
    edgeCount: document.edges.length,
});

export default function WhiteboardManagePage() {
    const navigate = useNavigate();
    const toast = useToast();
    const {documents, createDocument, deleteDocument, duplicateDocument} = useWhiteboardDocuments();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

    const filteredDocuments = useMemo(() => {
        const keyword = searchQuery.trim().toLowerCase();
        if (!keyword) return documents;
        return documents.filter(document =>
            document.title.toLowerCase().includes(keyword) ||
            (document.description || '').toLowerCase().includes(keyword)
        );
    }, [documents, searchQuery]);

    const handleCreate = () => {
        const document = createDocument({title: `新白板 ${documents.length + 1}`});
        toast.success('白板已创建');
        navigate(`/whiteboard/${document.id}`);
    };

    const handleDelete = () => {
        if (!deleteTargetId) return;
        deleteDocument(deleteTargetId);
        setDeleteTargetId(null);
        toast.success('白板已删除');
    };

    const handleDuplicate = (id: string) => {
        const duplicate = duplicateDocument(id);
        if (!duplicate) return;
        setActiveMenuId(null);
        toast.success('白板副本已创建');
    };

    return (
        <div
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24"
            onClick={() => setActiveMenuId(null)}
        >
            <ConfirmationModal
                isOpen={!!deleteTargetId}
                onClose={() => setDeleteTargetId(null)}
                onConfirm={handleDelete}
                title="删除白板?"
                description="确定要删除这个白板吗？此操作无法恢复。"
                confirmText="确认删除"
                type="danger"
            />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-xl border border-orange-100 shadow-sm shadow-orange-500/10">
                            <PenLine className="w-6 h-6"/>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">灵感白板</h1>
                            <p className="mt-1 text-sm text-slate-500">创建、整理和继续编辑你的思路画布。</p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative">
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="搜索白板..."
                                className="w-full sm:w-56 pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                            />
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/>
                        </div>
                        <button
                            onClick={handleCreate}
                            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95"
                        >
                            <Plus className="w-4 h-4" strokeWidth={3}/>
                            新建白板
                        </button>
                    </div>
            </div>

            {documents.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm py-20 flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-orange-50 rounded-full border border-orange-100 flex items-center justify-center mb-4">
                        <PenLine className="w-9 h-9 text-orange-300"/>
                    </div>
                    <h2 className="text-base font-semibold text-slate-800">还没有白板</h2>
                    <p className="mt-1 text-sm text-slate-500">创建一个白板，把文章、便签和图形串起来。</p>
                    <button
                        onClick={handleCreate}
                        className="mt-5 flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm shadow-orange-500/20"
                    >
                        <Plus className="w-4 h-4" strokeWidth={3}/>
                        创建第一个白板
                    </button>
                </div>
            ) : filteredDocuments.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-slate-400">
                    <div className="bg-slate-50 p-4 rounded-full mb-3">
                        <Search className="w-6 h-6"/>
                    </div>
                    <p className="text-sm">没有找到匹配的白板</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredDocuments.map(document => {
                        const stats = getBoardStats(document);
                        return (
                            <div
                                key={document.id}
                                onClick={() => navigate(`/whiteboard/${document.id}`)}
                                className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:border-orange-200 hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer"
                            >
                                <div className="h-36 border-b border-slate-100">
                                    <BoardPreview document={document}/>
                                </div>
                                <div className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-slate-800 text-base leading-tight group-hover:text-orange-600 transition-colors truncate">
                                                {document.title}
                                            </h3>
                                            <p className="mt-1 text-xs text-slate-400">
                                                {stats.nodeCount} 个节点 · {stats.edgeCount} 条连线 · {formatTime(document.updatedAt)}
                                            </p>
                                        </div>

                                        <div className="relative">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveMenuId(activeMenuId === document.id ? null : document.id);
                                                }}
                                                className={`p-1.5 rounded-md transition-colors ${activeMenuId === document.id ? 'bg-orange-50 text-orange-600' : 'text-slate-300 hover:bg-slate-50 hover:text-slate-600 opacity-0 group-hover:opacity-100'}`}
                                            >
                                                <MoreHorizontal className="w-4 h-4"/>
                                            </button>

                                            {activeMenuId === document.id && (
                                                <div className="absolute right-0 top-full mt-1 w-28 bg-white rounded-lg shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDuplicate(document.id);
                                                        }}
                                                        className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-orange-600 flex items-center gap-2"
                                                    >
                                                        <Copy className="w-3.5 h-3.5"/> 复制
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDeleteTargetId(document.id);
                                                            setActiveMenuId(null);
                                                        }}
                                                        className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5"/> 删除
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
