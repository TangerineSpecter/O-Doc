import {useState} from 'react';
import {Link} from 'react-router-dom';
import {BookOpen, ExternalLink, ChevronDown, ChevronUp} from 'lucide-react';

interface TravelJournalCardProps {
    draft?: {
        title: string;
        content: string;
        reflection: string;
    };
    articleId?: string;
    collectionId?: string;
}

export default function TravelJournalCard({draft, articleId, collectionId}: TravelJournalCardProps) {
    const [expanded, setExpanded] = useState(false);

    if (!draft) return null;

    const content = draft.content || '';
    const paragraphs = content
        ? content.split(/\n+/).map(p => p.trim()).filter(Boolean)
        : [];

    const isLongContent = content.length > 500 || paragraphs.length > 5;

    return (
        <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-b from-amber-50/20 via-white to-white p-5 shadow-xs sm:p-6">
            {/* 卡片头部 */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100/60 pb-4">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100/60 text-amber-700">
                        <BookOpen className="h-4 w-4" />
                    </span>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold tracking-tight text-slate-800 sm:text-lg">
                                {draft.title || '旅行日记'}
                            </h3>
                            <span className="rounded-full bg-amber-50 border border-amber-200/60 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                手帐正文
                            </span>
                        </div>
                    </div>
                </div>

                {articleId && collectionId && (
                    <Link
                        to={`/article/${encodeURIComponent(collectionId)}/${encodeURIComponent(articleId)}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100 hover:text-orange-800 whitespace-nowrap shrink-0 shadow-2xs"
                    >
                        <span>打开旅行日记</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </Link>
                )}
            </div>

            {/* 日记正文排版 */}
            <div className="relative mt-4">
                <div
                    className={`space-y-3.5 text-sm leading-relaxed text-slate-700 transition-all duration-300 ${
                        !expanded && isLongContent ? 'max-h-80 overflow-hidden' : ''
                    }`}
                >
                    {paragraphs.map((para, i) => (
                        <p key={i} className="text-justify leading-7">
                            {para}
                        </p>
                    ))}
                </div>

                {/* 长文本折叠渐变遮罩与按钮 */}
                {isLongContent && (
                    <div
                        className={`text-center ${
                            !expanded
                                ? 'relative -mt-20 flex flex-col items-center justify-end bg-gradient-to-t from-white via-white/95 to-transparent pb-1 pt-20 rounded-b-xl'
                                : 'mt-4 border-t border-slate-100 pt-3'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => setExpanded(!expanded)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3.5 py-1 text-xs font-medium text-amber-800 shadow-2xs hover:bg-amber-50 hover:border-amber-300 transition-all whitespace-nowrap shrink-0"
                        >
                            <span>{expanded ? '收起日记正文' : `展开完整日记（共 ${content.length} 字）`}</span>
                            {expanded ? (
                                <ChevronUp className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
