import {Clock, Coins, Crown, MapPin, Scale, Sparkles, Trophy} from 'lucide-react';
import type {FishingDiscovery, FishingFish, FishingRules} from '../../types/api/fishing';
import LevelPlate from '../AgentWorld/LevelPlate';
import {BaitPortrait} from './BaitPortrait';
import {FishPortrait} from './FishPortrait';
import {fishingHours} from './presentation';

export function FishingSpeciesDetails({id, fish, rules, record, number}: {
    id: string; fish: FishingFish; rules: FishingRules; record?: FishingDiscovery; number: number;
}) {
    const spot = rules.spots[fish.spot];
    return <section aria-label="鱼类详情" data-king={fish.king} className="fishing-atlas-detail flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm lg:max-h-full lg:self-start">
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
            <div className="fishing-atlas-hero flex items-center gap-3 px-3 py-2">
                <div className="fishing-atlas-plate flex h-24 w-24 shrink-0 items-center justify-center rounded-xl">
                    <FishPortrait fishId={id} name={fish.name} className="h-24 w-24"/>
                    <span className="absolute bottom-1 right-1.5 font-mono text-[8px] tracking-wider text-slate-400" aria-hidden="true">{String(number).padStart(2, '0')}</span>
                </div>
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[9px] font-semibold tracking-widest text-[var(--atlas-ink)]"><span className="font-mono">NO.{String(number).padStart(3, '0')}</span><span className="h-px w-5 bg-current opacity-30"/>鱼类档案</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-bold tracking-tight text-slate-800">{fish.name}</h3>
                        <LevelPlate level={fish.level} variant={fish.king ? 'amber' : 'emerald'} size="sm" title={`鱼种等级：Lv.${fish.level}`}/>
                        {fish.king && <span className="inline-flex items-center gap-1 rounded-md border border-amber-300/70 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700"><Crown className="h-3 w-3"/>钓点鱼王</span>}
                    </div>
                    <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-slate-600"><Clock className="mt-0.5 h-3 w-3 shrink-0 text-[var(--atlas-ink)]"/><span>{fishingHours(fish.hours)}<span className="ml-1 whitespace-nowrap text-[9px] text-slate-400">上海时间</span></span></p>
                </div>
            </div>
            <dl className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/40 py-1.5 text-[11px]">
                <div className="px-3"><dt className="mb-0.5 flex items-center gap-1 text-[9px] text-slate-400"><MapPin className="h-2.5 w-2.5"/>出没钓点</dt><dd className="font-semibold text-slate-700">{spot?.name}<span className="ml-1 text-[9px] font-normal text-slate-400">Lv.{spot?.requiredLevel}</span></dd></div>
                <div className="px-3"><dt className="mb-0.5 flex items-center gap-1 text-[9px] text-slate-400"><Scale className="h-2.5 w-2.5"/>重量区间</dt><dd className="font-semibold tabular-nums text-slate-700">{fish.weightRange.join('–')} <span className="text-[9px] font-normal text-slate-400">kg</span></dd></div>
                <div className="px-3"><dt className="mb-0.5 flex items-center gap-1 text-[9px] text-slate-400"><Coins className="h-2.5 w-2.5"/>回收单价</dt><dd className="font-semibold tabular-nums text-amber-600">{fish.value} <span className="text-[9px] font-normal text-slate-400">币 / 条</span></dd></div>
            </dl>
            <div className="grid gap-3 px-3 py-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))]">
                <div>
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-700"><span className="h-3 w-0.5 rounded-full bg-teal-600"/>适用鱼饵<span className="ml-auto text-[9px] font-normal text-slate-400" title="偏好鱼饵提高遭遇权重；市场整点随机供应一种。">偏好饵更易相遇</span></h4>
                    <div className="flex flex-wrap gap-2">{[...fish.preferred, ...fish.accepted].map(baitId => {
                        const bait = rules.baits[baitId];
                        if (!bait) return null;
                        const preferred = fish.preferred.includes(baitId);
                        return <div key={baitId} data-preferred={preferred} className="fishing-atlas-bait inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/40 px-2 py-1.5">
                            <BaitPortrait baitId={baitId} className="h-8 w-8 shrink-0"/>
                            <div><p className="text-xs font-semibold leading-4 text-slate-700">{bait.name}</p><p className="text-[9px] leading-4 text-slate-400">{bait.price} 币 / 份</p></div>
                            <span className={`ml-1 inline-flex items-center gap-0.5 text-[9px] font-semibold ${preferred ? 'text-teal-700' : 'text-slate-400'}`}>{preferred && <Sparkles className="h-2.5 w-2.5"/>}{preferred ? '偏好' : '接受'}</span>
                        </div>;
                    })}</div>
                </div>
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2"><h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><Trophy className={`h-3.5 w-3.5 ${record ? 'text-amber-500' : 'text-slate-400'}`}/>捕获纪录</h4><span className={`text-[9px] ${record ? 'font-semibold text-teal-600' : 'text-slate-400'}`}>{record ? '已点亮图鉴' : '等待初次相遇'}</span></div>
                    {record ? <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500"><p>累计捕获 <strong className="font-semibold text-teal-700">{record.count} 条</strong></p><p>最大重量 <strong className="font-semibold text-slate-700">{record.maxWeight} kg</strong></p><p>重量纪录：{record.recordActor}</p></div>
                        : <p className="mt-1.5 text-[11px] leading-5 text-slate-400">尚未捕获，带上它偏好的鱼饵去水边试试。</p>}
                </div>
            </div>
            <p className={`border-t px-3 py-2 text-[10px] leading-4 ${fish.king ? 'border-amber-100 bg-amber-50/40 text-amber-700' : 'border-slate-100 bg-slate-50/50 text-slate-400'}`}>
                {fish.king ? '猜拳累计三胜捕获、三败逃脱，平局继续；鱼王默认保留。' : '等级差影响捕获率，同级普通竿约 65%；重量只影响纪录，不改变回收单价。'}
            </p>
        </div>
    </section>;
}
