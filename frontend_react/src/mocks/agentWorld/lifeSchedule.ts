import type {LifeItem, LifeSchedule} from '../../types/api/agentLife';
import {lifeScheduleTime} from '../../components/AgentLife/lifeScheduleTime';

export function projectLifeStatusReason(item: LifeItem): LifeItem {
    const revisions = item.revisions || [];
    const last = [...revisions].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
    return {...item, statusReason: item.status === 'deferred' ? last?.reason || '' : item.result?.reason || ''};
}

/** Match production: source before pagination, aggregates before status filtering. */
export function lifeScheduleResponse(items: LifeItem[], url: URL): LifeSchedule {
    const rangeTime = (value: string | null) => value ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value) : null;
    const start = rangeTime(url.searchParams.get('start'));
    const end = rangeTime(url.searchParams.get('end'));
    items = items.filter(item => {
        const time = Date.parse(lifeScheduleTime(item));
        return (start === null || time >= start) && (end === null || time < end);
    });
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
    const rows = selected.filter(i => !status || i.status === status).sort((a, b) => Date.parse(lifeScheduleTime(a)) - Date.parse(lifeScheduleTime(b)) || a.id.localeCompare(b.id));
    const full = ['today', 'week'].includes(url.searchParams.get('view') || 'list');
    const current = full ? 1 : Math.max(1, Number(url.searchParams.get('page')) || 1);
    return {items: (full ? rows : rows.slice((current - 1) * 100, current * 100)).map(projectLifeStatusReason), total: rows.length,
        page: current, counts, summary, explorationPlanning: items.filter(i => i.reservation).map(i => ({day: lifeScheduleTime(i).slice(0,10), actorId:i.actorId,name:i.reservation!.members.find(m=>m.actorId===i.actorId)?.name||'居民',participate:true,dungeonId:i.reservation!.dungeonId,durationSeconds:i.reservation!.durationSeconds,status:'coordinated',reason:'已匹配同地点队友，按共同空档插入组队预约'}))};
}
