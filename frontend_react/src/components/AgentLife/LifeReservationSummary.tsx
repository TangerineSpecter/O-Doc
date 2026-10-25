import type {LifeItem} from '../../types/api/agentLife';

const time = (value: string) => new Date(value).toLocaleTimeString('zh-CN', {timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit'});
export function LifeReservationSummary({item}: {item: LifeItem}) {
    const reservation = item.reservation;
    if (!reservation) return null;
    return <div className="mt-2 space-y-1 rounded-xl border border-emerald-100 bg-emerald-50/50 p-2 text-[11px] leading-5 text-slate-600">
        <p className="font-semibold text-emerald-800">组队探索预约 · {reservation.durationSeconds / 60}分钟</p>
        <p>{reservation.dungeonName || reservation.dungeonId}</p>
        <p>{time(reservation.prepareAt)}准备 · {time(reservation.startsAt)}出发—{time(reservation.endsAt)}返回</p>
        <p>队友：{reservation.members.map(member => member.name).join('、')}</p>
        <p>期望时长：{reservation.members.map(member => `${member.name} ${member.durationSeconds / 60}分钟`).join('、')}</p>
        <p>已预留时间、体力及探索额度，不占主日程次数。</p>
        {reservation.reason && <p className="text-amber-700">{reservation.reason}</p>}
    </div>;
}
