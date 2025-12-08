import React, { useState } from 'react';
import {
    Folder, ChevronDown, FileText, Minus, Tag, Plus, X, Paperclip, Loader2, File
} from 'lucide-react';

// 编辑器元数据栏组件

export interface Category {
    id: string;
    name: string;
    color: string;
}

export interface AttachmentItem {
    id: string;
    name: string;
    size: string;
    url: string;
    type: string;
}

export interface ParentArticleItem {
    id: string;
    title: string;
}

interface EditorMetaBarProps {
    category: Category;
    setCategory: (cat: Category) => void;
    categories: Category[];

    parentArticle: ParentArticleItem;
    setParentArticle: (parent: ParentArticleItem) => void;
    parentArticles: ParentArticleItem[];

    tags: string[];
    onAddTag: (tag: string) => void;
    onRemoveTag: (tag: string) => void;

    attachments: AttachmentItem[];
    onUploadClick: () => void;
    onRemoveAttachment: (id: string) => void;
    isUploadingAttachment: boolean;
}

export const EditorMetaBar = ({
    category,
    setCategory,
    categories,
    parentArticle,
    setParentArticle,
    parentArticles,
    tags,
    onAddTag,
    onRemoveTag,
    attachments,
    onUploadClick,
    onRemoveAttachment,
    isUploadingAttachment
}: EditorMetaBarProps) => {
    const [isCategoryOpen, setIsCategoryOpen] = useState(false);
    const [isParentOpen, setIsParentOpen] = useState(false);
    const [tagInput, setTagInput] = useState('');

    const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            onAddTag(tagInput.trim());
            setTagInput('');
        }
    };

    return (
        <div className="px-6 sm:px-12 pt-6 pb-4 border-b border-dashed border-slate-200 flex flex-col gap-4 shrink-0">
            {/* Row 1: Meta Selectors */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Category Selector */}
                <div className="relative z-20">
                    <button
                        onClick={() => setIsCategoryOpen(!isCategoryOpen)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-medium transition-colors border border-slate-200"
                    >
                        <Folder className="w-3.5 h-3.5" />
                        <span>{category.name}</span>
                        <ChevronDown className="w-3 h-3 opacity-50" />
                    </button>
                    {isCategoryOpen && (
                        <>
                            <div className="fixed inset-0" onClick={() => setIsCategoryOpen(false)}></div>
                            <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-100 py-1 animate-in fade-in zoom-in-95 duration-100">
                                {categories.map(cat => (
                                    <button key={cat.id} onClick={() => { setCategory(cat); setIsCategoryOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700 flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${cat.color}`}></span>{cat.name}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Parent Article Selector */}
                <div className="relative z-10">
                    <button onClick={() => setIsParentOpen(!isParentOpen)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-medium transition-colors border border-slate-200 max-w-[200px]">
                        <FileText className="w-3.5 h-3.5" /><span className="truncate">父级: {parentArticle.title}</span><ChevronDown className="w-3 h-3 opacity-50" />
                    </button>
                    {isParentOpen && (
                        <>
                            <div className="fixed inset-0" onClick={() => setIsParentOpen(false)}></div>
                            <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-100 py-1 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                                <div className="max-h-60 overflow-y-auto">
                                    {parentArticles.map(p => (
                                        <button key={p.id} onClick={() => { setParentArticle(p); setIsParentOpen(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 ${p.id === parentArticle.id ? 'text-orange-600 bg-orange-50 font-medium' : 'text-slate-700'}`}>
                                            {p.id === 'root' ? <Minus className="w-3 h-3 opacity-50" /> : <FileText className="w-3 h-3 opacity-50" />}<span className="truncate">{p.title}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>

                {/* Tags */}
                <div className="flex flex-wrap items-center gap-2 flex-1">
                    {tags.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
                            <Tag className="w-3 h-3 opacity-50" />{tag}
                            <button onClick={() => onRemoveTag(tag)} className="ml-1 text-indigo-400 hover:text-indigo-800 focus:outline-none"><X className="w-3 h-3" /></button>
                        </span>
                    ))}
                    <div className="relative flex items-center">
                        <Plus className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                        <input
                            type="text"
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value)}
                            onKeyDown={handleTagKeyDown}
                            placeholder="添加标签..."
                            className="pl-6 pr-3 py-1 text-xs bg-transparent border-none outline-none focus:ring-0 placeholder:text-slate-400 min-w-[80px]"
                        />
                    </div>
                </div>
            </div>

            {/* Row 2: Attachment List */}
            <div className="flex flex-col gap-3 pt-1">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Paperclip className="w-3 h-3" /> 附件列表 ({attachments.length})
                    </h4>
                    <button
                        onClick={onUploadClick}
                        disabled={isUploadingAttachment}
                        className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 border border-slate-200 rounded-full text-xs text-slate-600 transition-colors shadow-sm"
                    >
                        {isUploadingAttachment ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        添加附件
                    </button>
                </div>

                {attachments.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {attachments.map(att => (
                            <div key={att.id} className="relative group flex items-start gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-white hover:border-orange-200 hover:shadow-md transition-all duration-200">
                                <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center shrink-0 shadow-sm text-slate-500">
                                    <File className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-medium text-slate-700 truncate leading-tight mb-0.5" title={att.name}>{att.name}</div>
                                    <div className="text-[9px] text-slate-400 font-mono">{att.size}</div>
                                </div>
                                <button
                                    onClick={() => onRemoveAttachment(att.id)}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-all scale-90 hover:scale-100"
                                >
                                    <X className="w-3 h-3" strokeWidth={2.5} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};