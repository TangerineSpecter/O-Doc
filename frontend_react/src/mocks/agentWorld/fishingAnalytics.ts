import {analytics} from './social';
import {day} from './residents';
import type {ResidentAnalyticsSourceError} from '../../types/api/residentAnalytics';

export const fishingAnalyticsSourceError: ResidentAnalyticsSourceError = {
    code: 400,
    msg: '钓鱼记录存在异常，无法计算完整统计，请查看系统日志。',
    data: {reason: 'invalid_fishing_statistics_source'},
};

export function fishingAnalyticsMock(url: URL, empty: boolean) {
    if (empty) return [];
    const actor = url.searchParams.get('actor_id') || url.searchParams.get('actorId') || '';
    const start = url.searchParams.get('start_date') || analytics.startDate;
    const end = url.searchParams.get('end_date') || day;
    return analytics.fishingComparison.filter(row => !actor || row.id === actor).map(row =>
        start <= day && day <= end ? {...row} : {...row, trips: 0, casts: 0, catches: 0, kings: 0,
            escaped: 0, empty: 0, junk: 0, experience: 0, ordinaryCatches: 0, ordinaryCatchRate: null})
        .sort((a, b) => b.catches - a.catches || b.kings - a.kings || b.experience - a.experience || a.id.localeCompare(b.id));
}
