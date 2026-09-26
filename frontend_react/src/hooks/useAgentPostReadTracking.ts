import {useEffect, type Dispatch, type SetStateAction} from 'react';
import {markAgentPostRead, type Article} from '../api/article';
import {useAuth} from '../contexts/AuthContext';
import {useToast} from '../components/common/ToastProvider';

/** 用户成功打开帖子详情后标记阅读；普通查询和配图轮询不承担这项职责。 */
export function useAgentPostReadTracking(
    articleId: string | undefined,
    post: Article | null,
    setPost: Dispatch<SetStateAction<Article | null>>,
) {
    const {isAuthenticated} = useAuth();
    const toast = useToast();
    const loadedId = post?.articleId;
    const hasBeenRead = post?.agentPostHasBeenRead;

    useEffect(() => {
        if (!isAuthenticated || !articleId || loadedId !== articleId || hasBeenRead) return;
        let cancelled = false;
        void markAgentPostRead(articleId).then(() => {
            if (cancelled) return;
            setPost(current => current?.articleId === articleId
                ? {...current, agentPostHasBeenRead: true} : current);
        }).catch(() => {
            if (!cancelled) toast.error('帖子阅读标记保存失败，请重新打开帖子');
        });
        return () => { cancelled = true; };
    }, [articleId, loadedId, hasBeenRead, isAuthenticated, setPost, toast]);
}
