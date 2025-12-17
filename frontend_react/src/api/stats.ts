import request from '../utils/request';

export interface StatsDashboardData {
    kpi: {
        totalArticles: number;
        totalWords: number;
        totalAssets: number;
        totalDurationHours: number;
    };
    hourlyData: {
        hour: string;
        visits: number;
        duration: number;
    }[];
    weeklyPublish: {
        day: string;
        count: number;
    }[];
    categoryStats: {
        name: string;
        value: number;
    }[];
    tagStats: {
        name: string;
        count: number;
    }[];
    topVisits: {
        id: number;
        title: string;
        value: number | string;
    }[];
    topDuration: {
        id: number;
        title: string;
        value: string;
    }[];
}

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