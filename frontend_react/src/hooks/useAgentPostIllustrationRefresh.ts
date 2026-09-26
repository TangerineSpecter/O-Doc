import {useEffect, type Dispatch, type SetStateAction} from 'react';
import {getArticleDetail, type Article} from '../api/article';

const refreshIntervalMs = 5000;

export function useAgentPostIllustrationRefresh(
    articleId: string | undefined,
    post: Article | null,
    setPost: Dispatch<SetStateAction<Article | null>>,
) {
    const pending = post?.articleId === articleId
        && /!\[配图生成中\]\(odoc-illustration:[^)]+\)/.test(post?.content || '');

    useEffect(() => {
        if (!articleId || !pending) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;

        const refresh = async () => {
            let stillPending = true;
            try {
                const detail = await getArticleDetail(articleId);
                if (cancelled) return;
                stillPending = /!\[配图生成中\]\(odoc-illustration:[^)]+\)/.test(detail.content || '');
                // Refresh only the fields changed by the background illustration job.
                setPost(current => current?.articleId === articleId
                    ? {...current, content: detail.content, updatedAt: detail.updatedAt}
                    : current);
            } catch {
                // A transient failure should not interrupt reading or discard the post.
            }
            if (!cancelled && stillPending) timer = setTimeout(refresh, refreshIntervalMs);
        };

        timer = setTimeout(refresh, refreshIntervalMs);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [articleId, pending, setPost]);
}
