import { Edit3, Trash2 } from 'lucide-react';
import { HeaderItem } from '../../hooks/useArticle';

interface TableOfContentsProps {
    headers: HeaderItem[];
    activeId: string;
    isEmbedded: boolean;
    onEdit?: () => void;
    onDelete?: () => void;
}

export const TableOfContents = ({
    headers,
    activeId,
    isEmbedded,
    onEdit,
    onDelete
}: TableOfContentsProps) => {
    if (!headers?.length) return null;

    const visibilityClass = isEmbedded ? 'hidden 2xl:block' : 'hidden xl:block';

    return (
        <div className={`${visibilityClass} absolute left-full top-0 ml-4 h-full w-64`}>
            <div className="sticky top-6">

                {(onEdit || onDelete) && (
                    <div className="flex items-center gap-2 mb-4">
                        {onEdit && (
                            <button
                                onClick={onEdit}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-600 shadow-sm hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50 hover:shadow transition-all duration-200"
                            >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>编辑文档</span>
                            </button>
                        )}
                        {onDelete && (
                            <button
                                onClick={onDelete}
                                className="flex items-center justify-center p-1.5 bg-white border border-slate-200 rounded-md text-slate-400 shadow-sm hover:text-red-600 hover:border-red-200 hover:bg-red-50 hover:shadow transition-all duration-200"
                                title="删除文档"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                )}

                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> 目录
                </h5>
                <ul className="space-y-1 relative border-l border-slate-200">
                    {headers.map((h, i) => (
                        <li key={i}>
                            <a href={`#${h.slug}`} className={`block text-sm py-1.5 border-l-2 transition-all truncate ${h.level > 2 ? 'pl-6 text-xs' : 'pl-4'} ${activeId === h.slug ? 'border-[#0ea5e9] text-[#0ea5e9] font-medium bg-sky-50/30' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
                                {h.text}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};