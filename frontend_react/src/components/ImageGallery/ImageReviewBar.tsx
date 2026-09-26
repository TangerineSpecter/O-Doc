import {useEffect, useState} from 'react';
import type {ImageReviewScores} from '../../api/image';
import {useImageReviews} from '../../hooks/useImageReviews';

const SCORE_LABELS: {key: keyof ImageReviewScores; label: string}[] = [
    {key: 'theme', label: '主题'},
    {key: 'composition', label: '构图'},
    {key: 'idea', label: '思想'},
    {key: 'light', label: '光影'},
    {key: 'color', label: '色彩'},
    {key: 'focus', label: '对焦'},
];

function formatScore(value: number) {
    return Number(value).toFixed(1);
}

export default function ImageReviewBar({imageId, className = ''}: {imageId?: string; className?: string}) {
    const {summary, error} = useImageReviews(imageId);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        setOpen(false);
    }, [imageId]);

    if (!imageId) return null;
    if (error) return <p className={`text-[11px] text-slate-400 ${className}`.trim()}>{error}</p>;
    if (!summary || summary.count === 0 || summary.overall == null) return null;

    return (
        <div className={className}>
            <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-800">综合 {formatScore(summary.overall)}</p>
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen(value => !value)}
                    className="rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700"
                >
                    {open ? '收起评价' : `${summary.count} 条评价`}
                </button>
            </div>
            {open ? (
                <div className="mt-2 space-y-2">
                    {summary.reviews.map(review => (
                        <article key={review.reviewId} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                            <div className="flex items-baseline justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-800">{review.agentName}</p>
                                <p className="text-[11px] font-semibold text-orange-600">{formatScore(review.overall)}</p>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{review.commentary}</p>
                            <dl className="mt-2 flex flex-wrap gap-1.5">
                                {SCORE_LABELS.map(item => (
                                    <div key={item.key} className="rounded-md bg-white px-1.5 py-0.5 text-[11px] text-slate-500">
                                        {item.label} <span className="font-semibold text-slate-700">{formatScore(review.scores[item.key])}</span>
                                    </div>
                                ))}
                            </dl>
                        </article>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
