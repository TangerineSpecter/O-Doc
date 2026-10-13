import type {CombatAnalyticsResident} from '../../../types/api/residentAnalytics';
import {combatDuration} from '../../../utils/combatAnalytics';
import AgentAvatar from '../AgentAvatar';
import WorldDialog from '../WorldDialog';

export default function ResidentCombatCard({resident: row, startDate, endDate, onClose}: {
    resident: CombatAnalyticsResident; startDate: string; endDate: string; onClose: () => void;
}) {
    const metrics = [
        ['探索次数', `${row.explorations} 次`], ['按计划完成', `${row.completed} 次`],
        ['探索成功率', row.successRate === null ? '暂无已结算探索' : `${row.successRate}%（${row.completed}/${row.settled}）`],
        ['进行中 / 暂停', `${row.ongoing} 次`], ['累计击败', `${row.kills} 只`], ['首领击败', `${row.bossKills} 只`],
        ['累计探索时长', combatDuration(row.elapsedSeconds)], ['平均单次时长', combatDuration(row.averageSeconds)],
        ['最长单次探索', combatDuration(row.longestSeconds)], ['每小时击败', row.killsPerHour === null ? '暂无有效时长' : `${row.killsPerHour} 只`],
        ['获得经验', `+${row.experience} EXP`], ['探索地点', `${row.destinations} 处`],
        ['消耗体力', `${row.energy} 点`], ['消耗药剂', `${row.potions} 瓶`],
    ];
    return <WorldDialog title={`${row.name} · 战斗经历`} description={`${startDate} 至 ${endDate} 出发的探索 · 截至本次读取的实际成果`} onClose={onClose} size="wide">
        <div className="scrollbar-hide min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain py-3">
            <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
                <AgentAvatar name={row.name} avatar={row.avatar} size="sm"/>
                <div><h3 className="font-bold text-slate-900">{row.name}</h3><p className="text-xs text-slate-500">{row.departed ? row.archived ? '已归档居民' : '历史居民' : '居民探索档案'}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{metrics.map(([label,value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] text-slate-500">{label}</p><p className="mt-2 text-sm font-bold tabular-nums text-slate-900">{value}</p></div>)}</div>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-sm font-bold text-slate-800">探索结局</h3><div className="mt-3 flex flex-wrap gap-2 text-xs">{[['倒地',row.fallen],['提前召回',row.recalled],['额度 / 体力耗尽',row.exhausted],['其他结束',row.otherEnded]].map(([label,value])=><span key={label} className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">{label} {value} 次</span>)}</div></section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-sm font-bold text-slate-800">魔物击败统计</h3>
                {row.monsters.length ? <div className="mt-3 space-y-3">{row.monsters.map(monster=><div key={monster.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 text-xs last:border-0 last:pb-0"><div><p className="font-semibold text-slate-800">{monster.name}</p><p className="mt-1 text-slate-400">最高击败等级 Lv.{monster.highestLevel}</p></div><span className="rounded-full bg-orange-50 px-3 py-1 font-bold text-orange-700">{monster.kills} 只</span></div>)}</div> : <p className="py-6 text-center text-xs text-slate-400">暂无魔物击败明细</p>}
                {row.unclassifiedKills>0&&<p className="mt-3 text-xs text-amber-700">另有 {row.unclassifiedKills} 次历史击败缺少魔物明细，已计入累计击败。</p>}
            </section>
            <p className="text-[11px] leading-5 text-slate-500">成功率 = 按计划完成 / 已结算探索；召回、倒地、耗尽及其他结束均进入分母，未结算不进入。时长使用实际推进秒数，不含暂停等待。准备失败不计探索，进行中数据可能继续增长。</p>
        </div>
    </WorldDialog>;
}
