import request from '../utils/request';

/**
 * 上报阅读时长
 * @param articleId 文章ID
 * @param duration 阅读时长（秒）
 */
export const reportReadDuration = async (articleId: string, duration: number) => {
    // 只有时长大于0才上报
    if (duration <= 0) return;

    return request.post('/stats/report/duration', {
        article_id: articleId,
        duration: duration
    });
};