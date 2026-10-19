import type {SocialTheatreRelationChange} from '../../types/api/social';

const signed = (value: number) => value > 0 ? `+${value}` : String(value);

export default function SocialTheatreRelationChanges({changes}: {changes: SocialTheatreRelationChange[]}) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-3">
        <h4 className="text-xs font-semibold text-slate-700">这次互动后的关系变化</h4>
        {!changes.length ? <p className="mt-2 text-[11px] text-slate-400">这次交流没有产生明确的关系变化。</p> :
            <div className="mt-2 space-y-3">{changes.map(change =>
                <div key={`${change.actorId}-${change.counterpartId}`}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                        <span className="font-medium text-slate-700">{change.actorName} → {change.counterpartName}</span>
                        <span className={change.affinityDelta < 0 ? 'text-red-600' : change.affinityDelta > 0 ? 'text-emerald-600' : 'text-slate-500'}>
                            好感 {signed(change.affinityDelta)}
                        </span>
                        <span className="text-slate-400">熟悉 {signed(change.familiarityDelta)}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">{change.reason}</p>
                </div>)}
            </div>}
    </section>;
}
