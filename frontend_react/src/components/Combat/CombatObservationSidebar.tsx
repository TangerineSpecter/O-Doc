import {useEffect, useMemo, useRef, useState} from 'react';
import {ScrollText, Package, Trophy, ChevronDown} from 'lucide-react';
import type {CombatEvent, CombatSnapshot} from '../../types/api/combat';
import {observationLoot} from './observationRecords';
import {ObservationEvents, ObservationKills} from './CombatObservationFeed';
import {ObservationLootGrid, ObservationLootDetails} from './CombatObservationLoot';

const tabs = [
    {id: 'events', name: '战斗动态', icon: ScrollText},
    {id: 'drops', name: '掉落', icon: Package},
    {id: 'kills', name: '击败记录', icon: Trophy},
] as const;

export default function CombatObservationSidebar({
    snapshot,
    events,
}: {
    snapshot: CombatSnapshot;
    events: CombatEvent[];
}) {
    const [tab, setTab] = useState<'events' | 'drops' | 'kills'>('events');
    const [selected, setSelected] = useState<string | null>(null);
    const list = useRef<HTMLDivElement>(null);
    const following = useRef(true);

    const slots = useMemo(
        () => observationLoot(snapshot.result.rewards || []),
        [snapshot.result.rewards]
    );
    const details = slots.find(slot => slot.key === selected);

    // 检查事件流中是否已有结算卡片
    const hasReportInFeed = useMemo(
        () => events.some(e => Boolean(e.payload.report)),
        [events]
    );

    useEffect(() => {
        if (tab === 'events' && following.current && list.current) {
            list.current.scrollTop = list.current.scrollHeight;
        }
    }, [events, tab]);

    return (
        <aside
            aria-label="探索记录"
            className="flex h-[390px] min-h-0 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs lg:h-full"
        >
            {/* 顶栏 Tab 切换 */}
            <div className="flex shrink-0 gap-1 border-b border-slate-100 p-2 bg-slate-50/50">
                {tabs.map(({id, name, icon: Icon}) => {
                    const active = tab === id;
                    return (
                        <button
                            key={id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => {
                                setTab(id);
                                following.current = true;
                                if (list.current) list.current.scrollTop = 0;
                            }}
                            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[10px] transition-all ${
                                active
                                    ? 'bg-white font-bold text-orange-600 shadow-2xs ring-1 ring-orange-200/70'
                                    : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
                            }`}
                        >
                            <Icon className={`h-3.5 w-3.5 ${active ? 'text-orange-500' : 'text-slate-400'}`} />
                            {name}
                        </button>
                    );
                })}
            </div>

            {/* 列表主视口 */}
            <div
                ref={list}
                role={tab === 'events' ? 'log' : undefined}
                aria-label={tab === 'events' ? '战斗动态 战报记录' : tabs.find(item => item.id === tab)?.name}
                aria-live="off"
                onScroll={() => {
                    if (tab === 'events' && list.current) {
                        following.current =
                            list.current.scrollHeight - list.current.scrollTop - list.current.clientHeight < 40;
                    }
                }}
                className="scrollbar-hide min-h-0 flex-1 overflow-y-auto p-3"
            >
                {tab === 'events' && (
                    <ObservationEvents events={events} playerName={snapshot.player?.name} />
                )}
                {tab === 'drops' && <ObservationLootGrid slots={slots} onSelect={setSelected} />}
                {tab === 'kills' && (
                    <ObservationKills events={events} total={snapshot.result.kills ?? 0} />
                )}
            </div>

            {/* 探索结算摘要抽屉：在流内未展示结算报告或处于其他标签页时提供全局摘要查看 */}
            {snapshot.result.report && (!hasReportInFeed || tab !== 'events') && (
                <details className="group shrink-0 border-t border-amber-150/60 bg-amber-50/40 px-3 py-2 text-[11px] text-amber-900 transition-colors">
                    <summary className="flex cursor-pointer items-center justify-between font-semibold text-amber-800 list-none select-none">
                        <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            探索结算摘要
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 text-amber-600 transition-transform duration-200 group-open:rotate-180" />
                    </summary>
                    <div className="scrollbar-hide mt-2 max-h-24 overflow-y-auto rounded-lg border border-amber-200/50 bg-white/80 p-2 leading-relaxed text-slate-700 shadow-2xs">
                        {snapshot.result.report}
                    </div>
                </details>
            )}

            {/* 战利品弹窗详情 */}
            {details && <ObservationLootDetails slot={details} onClose={() => setSelected(null)} />}
        </aside>
    );
}
