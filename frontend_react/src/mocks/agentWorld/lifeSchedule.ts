import type {LifeItem, LifeSchedule} from '../../types/api/agentLife';

/** Match production: source before pagination, aggregates before status filtering. */
export function lifeScheduleResponse(items: LifeItem[], url: URL): LifeSchedule {
    const source = url.searchParams.get('source') || 'all';
    const counts = {
        main: items.filter(i => i.source !== 'interleaved' && i.source !== 'reservation' && !['market', 'market_prepare'].includes(i.activity)).length,
        reservation: items.filter(i => i.source === 'reservation').length,
        interleaved: items.filter(i => i.source === 'interleaved').length,
    };
    const selected = items.filter(i => source === 'reservation' ? i.source === 'reservation' : source === 'interleaved' ? i.source === 'interleaved'
        : source === 'main' ? i.source !== 'interleaved' && i.source !== 'reservation' && !['market', 'market_prepare'].includes(i.activity) : true);
    const summary: Record<string, number> = {total: selected.length};
    for (const item of selected) summary[item.status] = (summary[item.status] || 0) + 1;
    const status = url.searchParams.get('status');
    const rows = selected.filter(i => !status || i.status === status).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id));
    const full = ['today', 'week'].includes(url.searchParams.get('view') || 'list');
    const current = full ? 1 : Math.max(1, Number(url.searchParams.get('page')) || 1);
    return {items: full ? rows : rows.slice((current - 1) * 100, current * 100), total: rows.length,
        page: current, counts, summary, explorationPlanning: items.filter(i => i.reservation).map(i => ({day: i.scheduledAt.slice(0,10), actorId:i.actorId,name:i.reservation!.members.find(m=>m.actorId===i.actorId)?.name||'居民',participate:true,dungeonId:i.reservation!.dungeonId,durationSeconds:i.reservation!.durationSeconds,status:'coordinated',reason:'已匹配同地点队友，按共同空档插入组队预约'}))};
}
