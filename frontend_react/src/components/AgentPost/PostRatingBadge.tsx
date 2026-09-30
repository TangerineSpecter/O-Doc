import {Star} from 'lucide-react';

export default function PostRatingBadge({rating}: {rating?: number | null}) {
    if (rating == null || !Number.isInteger(rating) || rating < 1 || rating > 10) return null;
    return <span aria-label={`对本帖评分 ${rating} 分，满分 10 分`}
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200/70 bg-amber-50 px-2 py-0.5 text-xs tabular-nums text-amber-700">
        <Star aria-hidden="true" className="h-3 w-3 fill-amber-400 text-amber-500"/>
        <span className="font-bold">{rating}</span>
        <span className="text-[10px] font-medium text-amber-600/70">/ 10</span>
    </span>;
}
