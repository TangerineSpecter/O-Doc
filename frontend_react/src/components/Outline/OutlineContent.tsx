import React from 'react';
import {BookOpen, Home} from 'lucide-react';
import {ArticleNode} from '@/api/article.ts';

interface OutlineContentProps {
    title?: string;
    description?: string;
    icon?: React.ReactNode;
    docs: ArticleNode[];
    flatCount: number;
    onSelectDoc: (articleId: string) => void;
    onBackHome: () => void;
}

export default function OutlineContent(
    {
        title = '小橘文档 · 知识库',
        description = '记录产品部署、开发指南与最佳实践。',
        icon,
        docs,
        flatCount,
        onSelectDoc,
        onBackHome
    }: OutlineContentProps) {

    // 递归渲染内容行
    const renderRow = (item: ArticleNode, level = 0) => {
        const paddingLeft = level * 32;
        const isTopLevel = level === 0;

        return (
            <React.Fragment key={item.id}>
                <div
                    onClick={() => onSelectDoc(item.articleId)}
                    className="group flex items-baseline hover:bg-orange-50/50 cursor-pointer py-2 transition-colors"
                >
                    <div style={{paddingLeft}} className="flex-shrink-0 relative">
                        <span className={`
                 ${isTopLevel ? 'text-slate-700 font-medium' : 'text-slate-600'} 
                 group-hover:text-orange-600 transition-colors
               `}>
                            {item.title}
                        </span>
                    </div>
                    <div
                        className="flex-grow mx-4 border-b border-dotted border-slate-300 relative -top-1 opacity-40 group-hover:opacity-60 group-hover:border-orange-300 transition-all"></div>
                    <div
                        className="flex-shrink-0 text-slate-400 text-sm font-mono group-hover:text-orange-500 transition-colors">
                        {item.date}
                    </div>
                </div>
                {item.children && item.children.map(child => renderRow(child, level + 1))}
            </React.Fragment>
        );
    };

    return (
        <div className="max-w-4xl mx-auto px-6 py-8 min-h-[80vh] animate-in fade-in duration-300">
            {/* Hero Card */}
            <div
                className="mb-10 p-6 bg-gradient-to-br from-white to-orange-50/50 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
                <div
                    className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-orange-100/50 rounded-full blur-3xl pointer-events-none"></div>
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 relative z-10">
                    <div className="flex items-start gap-4">
                        <div
                            className="w-12 h-12 bg-white rounded-xl border border-orange-100 shadow-sm flex items-center justify-center flex-shrink-0">
                            {/* 使用传入的 icon，如果未传入则使用默认图标 */}
                            {icon ? icon : <BookOpen size={24} className="text-orange-500" strokeWidth={2.5}/>}
                        </div>
                        <div className="md:max-w-xl">
                            <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-1">{title}</h1>
                            <p className="text-slate-500 text-sm mb-3">{description}</p>
                            <div
                                className="inline-flex items-center gap-2 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 shadow-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                共 {flatCount} 篇文档
                            </div>
                        </div>
                    </div>
                    <div>
                        <button
                            onClick={onBackHome}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-600 hover:text-orange-600 border border-slate-200 hover:border-orange-200 rounded-lg text-sm font-medium transition-all shadow-sm active:scale-95"
                        >
                            <Home size={14}/>
                            <span>返回应用首页</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* List Content */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                <div className="flex flex-col">
                    {docs.map(item => renderRow(item))}
                </div>
                <div className="mt-12 text-center text-slate-300 text-xs">
                    — 文档目录结束 —
                </div>
            </div>
        </div>
    );
}