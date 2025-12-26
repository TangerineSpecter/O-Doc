// --- 统计相关类型定义 ---

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