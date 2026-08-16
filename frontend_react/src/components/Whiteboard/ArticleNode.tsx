import React from 'react';
import {FileText, Trash2} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import type {WhiteboardNode} from '../../types/whiteboard';

interface ArticleNodeProps {
    node: WhiteboardNode;
    selected: boolean;
    markdownComponents: Record<string, unknown>;
    onDelete: (id: string) => void;
    onDragStart: (e: React.MouseEvent, id: string) => void;
}

export const ArticleNode: React.FC<ArticleNodeProps> = ({
    node,
    selected,
    markdownComponents,
    onDelete,
    onDragStart
}) => {
    return (
        <div
            className={`
                relative flex flex-col h-full bg-white rounded-xl overflow-hidden
                border border-slate-200
                ${selected
                    ? 'ring-2 ring-orange-400 shadow-2xl'
                    : 'shadow-lg'}
            `}
        >
            <div
                className="h-10 bg-slate-50 border-b border-slate-100 flex items-center justify-between px-3 cursor-grab active:cursor-grabbing"
                onMouseDown={(e) => onDragStart(e, node.id)}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0"/>
                    <span className="font-bold text-sm text-slate-700 truncate">{node.title || '未命名文章'}</span>
                </div>
                {selected && (
                    <button onClick={() => onDelete(node.id)}>
                        <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500"/>
                    </button>
                )}
            </div>
            <div
                className="article-content flex-1 overflow-y-auto p-4 prose prose-slate max-w-none prose-sm bg-white"
                onWheel={(e) => e.stopPropagation()}
            >
                <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeRaw, rehypeKatex]}
                    components={markdownComponents as never}
                >
                    {node.content || ''}
                </ReactMarkdown>
            </div>
        </div>
    );
};
