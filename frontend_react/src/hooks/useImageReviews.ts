import {useEffect, useState} from 'react';
import {getImageReviews, type ImageReviewSummary} from '../api/image';

export function useImageReviews(imageId?: string) {
    const [summary, setSummary] = useState<ImageReviewSummary | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!imageId) {
            setSummary(null);
            setError('');
            return undefined;
        }
        const controller = new AbortController();
        setSummary(null);
        setError('');
        getImageReviews(imageId, controller.signal)
            .then(data => {
                if (!controller.signal.aborted) setSummary(data);
            })
            .catch((reason: unknown) => {
                if (controller.signal.aborted) return;
                setError(reason instanceof Error ? reason.message : '评价加载失败');
            });
        return () => controller.abort();
    }, [imageId]);

    return {summary, error};
}
