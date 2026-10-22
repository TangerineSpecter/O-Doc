import {Check, Clock, Coins, Crown} from 'lucide-react';
import type {FishingDiscovery, FishingFish} from '../../types/api/fishing';
import {FishPortrait} from './FishPortrait';
import {fishingHours} from './presentation';

export function FishingSpeciesCard({id, fish, record, selected, onSelect, number}: {
    id: string; fish: FishingFish; record?: FishingDiscovery; selected: boolean; onSelect: () => void; number: number;
}) {
    return <button type="button" aria-pressed={selected} onClick={onSelect}
        className="fishing-atlas-species group relative flex w-[260px] shrink-0 items-center gap-2.5 overflow-hidden rounded-xl border border-slate-200/90 bg-white p-1.5 text-left transition-colors outline-none hover:border-teal-300 focus-visible:ring-2 focus-visible:ring-teal-500 lg:w-full">
        <span className={`fishing-atlas-species-portrait flex h-12 w-12 shrink-0 transition-transform items-center justify-center overflow-hidden rounded-xl border ${fish.king
            ? 'border-amber-200/70 bg-amber-50/70' : 'border-slate-200/70 bg-[#f4f7f0]'}`}>
            <FishPortrait fishId={id} name={fish.name} decorative className="h-full w-full"/>
        </span>
        <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-1">
                <span className="fishing-atlas-species-name truncate text-sm font-bold text-slate-800">{fish.name}</span>
                <span className="ml-auto font-mono text-[9px] tracking-wider text-slate-300">{String(number).padStart(2, '0')}</span>{fish.king && <Crown className="h-3 w-3 shrink-0 text-amber-500" aria-label="鱼王"/>}
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-[10px] font-medium leading-none">
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600">Lv.{fish.level}</span>
                <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 ${record ? 'bg-teal-50 text-teal-700' : 'bg-slate-50 text-slate-400'}`}>
                    {record && <Check className="h-2.5 w-2.5"/>}{record ? `已捕获 ${record.count}` : '未收集'}
                </span>
                <span className="ml-auto inline-flex items-center gap-0.5 text-amber-600"><Coins className="h-2.5 w-2.5"/>{fish.value}</span>
            </span>
            <span className="mt-1 flex items-center gap-1 truncate text-[10px] leading-3 text-slate-400"><Clock className="h-2.5 w-2.5 shrink-0"/>{fishingHours(fish.hours)}</span>
        </span>
    </button>;
}
