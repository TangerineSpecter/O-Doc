import {analytics} from './social';
import {day} from './residents';

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
