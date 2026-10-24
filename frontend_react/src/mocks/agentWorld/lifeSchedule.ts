import type {LifeItem, LifeSchedule} from '../../types/api/agentLife';

/** Match production: source before pagination, aggregates before status filtering. */
export function lifeScheduleResponse(items: LifeItem[], url: URL): LifeSchedule {
    const source = url.searchParams.get('source') || 'all';
    const counts = {
        main: items.filter(i => i.source !== 'interleaved' && !['market', 'market_prepare'].includes(i.activity)).length,
        interleaved: items.filter(i => i.source === 'interleaved').length,
    };
    const selected = items.filter(i => source === 'interleaved' ? i.source === 'interleaved'
        : source === 'main' ? i.source !== 'interleaved' && !['market', 'market_prepare'].includes(i.activity) : true);
    const summary: Record<string, number> = {total: selected.length};
    for (const item of selected) summary[item.status] = (summary[item.status] || 0) + 1;
    const status = url.searchParams.get('status');
    const rows = selected.filter(i => !status || i.status === status).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id));
    const full = ['today', 'week'].includes(url.searchParams.get('view') || 'list');
    const current = full ? 1 : Math.max(1, Number(url.searchParams.get('page')) || 1);
    return {items: full ? rows : rows.slice((current - 1) * 100, current * 100), total: rows.length,
        page: current, counts, summary};
}
