import {HttpResponse} from 'msw';
import type {StatsDashboardData} from '../types/api/stats';

export function localStatistics(url: URL, empty: boolean): StatsDashboardData {
    const requested = Number(url.searchParams.get('year'));
    const selectedYear = Number.isInteger(requested) && requested >= 1 && requested <= 9999
        ? requested : new Date().getFullYear();
    const title = '本地阅读笔记';
    return {
        selectedYear,
        kpi: {totalArticles: empty ? 0 : 1, totalWords: empty ? 0 : 820,
            totalAssets: 0, totalDurationHours: empty ? 0 : 0.5},
        hourlyData: Array.from({length: 24}, (_, hour) => ({
            hour: String(hour).padStart(2, '0') + ':00',
            visits: !empty && hour === 10 ? 1 : 0, duration: !empty && hour === 10 ? 30 : 0,
        })),
        weeklyPublish: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day, i) =>
            ({day, count: !empty && i === 0 ? 1 : 0})),
        categoryStats: empty ? [] : [{name: '笔记', value: 1}],
        tagStats: empty ? [] : [{name: '阅读', count: 1}],
        topVisits: empty ? [] : [{id: 1, title, value: 1}],
        topDuration: empty ? [] : [{id: 1, title, value: '30.0 分钟'}],
        dailyCreation: empty ? [] : [{date: selectedYear + '-01-05', articles: 1, images: 0, memos: 0, prompts: 0, whiteboards: 1, total: 2}],
    };
}

export async function localReadDuration(request: Request) {
    const data = await request.json();
    const duration = data?.duration;
    if (typeof data?.article_id !== 'string' || !data.article_id ||
        !(Number.isInteger(duration) || (typeof duration === 'string' && /^[+-]?\d+$/.test(duration.trim())))) {
        return HttpResponse.json({code: 400, msg: '参数错误', data: null}, {status: 400});
    }
    return HttpResponse.json({code: 200, msg: Number(duration) > 0 && Number(duration) <= 86400
        ? '成功' : '时长无效，已忽略', data: null});
}
