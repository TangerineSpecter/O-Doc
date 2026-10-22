import {Medal, Trophy} from 'lucide-react';
import type {TournamentDetail} from '../../types/api/tournament';
import {placeLabel, slotLabel} from './tournamentLabels';

export function TournamentRewards({event}: {event: TournamentDetail}) {
    const names = Object.fromEntries(event.roster.map(r => [r.id, r.name]));
    return <div className="grid gap-3 md:grid-cols-3">
        {[1, 2, 3].map(place => {
            const reward = event.rewards.find(r => r.place === place);
            const actor = event.result.podium?.[String(place)];
            const Icon = place === 1 ? Trophy : Medal;
            const unavailableText = !actor
                ? event.status === 'active' ? '名次决出后公布奖品' : event.status === 'skipped' ? '未开赛，不发奖' : '该名次无奖励'
                : reward?.status === 'forfeited' ? '未发放奖品' : null;
            return <div key={place} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Icon className={`h-4 w-4 ${place === 1 ? 'text-amber-500' : place === 2 ? 'text-blue-500' : 'text-orange-600'}`}/>{placeLabel[place]}</div>
                <div className="mt-3 truncate text-lg font-bold text-slate-900">{actor ? names[actor] || actor : event.status === 'active' ? '等待揭晓' : '名次空缺'}</div>
                <div className="mt-2 text-sm text-slate-600">{unavailableText ?? (reward?.result.item ? <>
                    <span className={place === 1 ? 'font-semibold text-amber-700' : 'font-semibold text-blue-600'}>{reward.result.item.name}</span>
                    <p className="mt-1 text-xs">Lv.{reward.result.item.level} · {slotLabel[reward.result.slot || '']} · {place === 1 ? '金装' : '蓝装'}</p>
                    <p className="mt-1 text-xs text-slate-400">{reward.result.source === 'decision_model' ? '决策模型选择部位' : reward.result.source === 'single_candidate' ? '唯一合法部位' : '代码随机选择部位'}</p>
                </> : reward?.result.potions ? <div className="space-y-1">{reward.result.potions.map((p, i) => <p key={i}>{p.name} <span className="text-xs text-slate-400">1 星 × 1</span></p>)}</div>
                    : reward ? place === 3 ? '一星炼金药水 × 3' : `随机${place === 1 ? '金' : '蓝'}装 × 1` : '暂无奖品')}</div>
                {reward && <p className="mt-3 text-xs text-slate-400">{{pending: '等待生成奖品', rolled: '已生成 · 等待入库', granted: '已发入背包', forfeited: '居民已退出 · 不发奖'}[reward.status]}</p>}
            </div>;
        })}
    </div>;
}
