import request from '../utils/request';
import type { StatsDashboardData } from '../types/api/stats';

// 重新导出类型以便其他组件使用
export type { StatsDashboardData };

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

/**
 * 获取统计看板数据
 */
export const getStatisticsData = async (): Promise<StatsDashboardData> => {
    return request.get('/stats/dashboard');
};