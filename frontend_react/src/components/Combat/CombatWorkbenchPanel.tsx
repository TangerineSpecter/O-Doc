import type {CombatEquipment, CombatProfile} from '../../types/api/combat';
import type {useCombatActions} from '../../hooks/useCombatActions';
import EquipmentCard from './EquipmentCard';
import CombatMarketPanel from './CombatMarketPanel';
import CombatSkillsPanel from './CombatSkillsPanel';
import {Backpack, BookOpen, ShoppingBag} from 'lucide-react';

export interface CombatWorkbenchPanelProps {
    profile: CombatProfile;
    actions: ReturnType<typeof useCombatActions>;
    tab: 'equipment' | 'market' | 'skills';
    onTabChange: (tab: 'equipment' | 'market' | 'skills') => void;
    qualityFilter: 'all' | 'gold' | 'blue' | 'white';
    onQualityFilterChange: (quality: 'all' | 'gold' | 'blue' | 'white') => void;
    onInspectEquipment: (item: CombatEquipment, remove?: boolean, slot?: string) => void;
    busy?: boolean;
    className?: string;
}

export default function CombatWorkbenchPanel({
    profile,
    actions,
    tab,
    onTabChange,
    qualityFilter,
    onQualityFilterChange,
    onInspectEquipment,
    busy = false,
    className = '',
}: CombatWorkbenchPanelProps) {
    const isWorn = (itemId: string) => Object.values(profile.loadout).includes(itemId);

    // 装备品质过滤
    const filteredEquipment = profile.equipment.filter(item => {
        if (qualityFilter === 'all') return true;
        return item.snapshot.quality === qualityFilter;
    });

    return (
        <div
            className={`flex-1 min-h-0 flex flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs ${className}`}
        >
            {/* Tab 导航头 */}
            <div className="flex shrink-0 items-center justify-between pb-3 border-b border-slate-100 gap-2 flex-wrap">
                <div className="flex max-w-full gap-1 overflow-x-auto scrollbar-hide rounded-full bg-slate-100 p-1">
                    <button
                        type="button"
                        aria-pressed={tab === 'equipment'}
                        onClick={() => onTabChange('equipment')}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                            tab === 'equipment'
                                ? 'bg-white text-orange-600 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Backpack className="h-3.5 w-3.5" />
                        <span>装备行囊</span>
                        <span className="rounded-full bg-slate-200/70 px-1.5 py-0.2 text-[10px] text-slate-600 font-medium">
                            {profile.equipment.length}
                        </span>
                    </button>

                    <button
                        type="button"
                        aria-pressed={tab === 'market'}
                        onClick={() => onTabChange('market')}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                            tab === 'market'
                                ? 'bg-white text-orange-600 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <ShoppingBag className="h-3.5 w-3.5" />
                        <span>补给与市场</span>
                    </button>

                    <button
                        type="button"
                        aria-pressed={tab === 'skills'}
                        onClick={() => onTabChange('skills')}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                            tab === 'skills'
                                ? 'bg-white text-orange-600 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>战斗技能</span>
                        {profile.skills.length > 0 && (
                            <span className="rounded-full bg-slate-200/70 px-1.5 py-0.2 text-[10px] text-slate-600 font-medium">
                                {profile.skills.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* 装备 Tab 下的快速品质筛选 */}
                {tab === 'equipment' && profile.equipment.length > 0 && (
                    <div className="flex items-center gap-1 text-[11px]">
                        {[
                            ['all', '全部'],
                            ['gold', '金装'],
                            ['blue', '蓝装'],
                            ['white', '白装'],
                        ].map(([k, label]) => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => onQualityFilterChange(k as typeof qualityFilter)}
                                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                                    qualityFilter === k
                                        ? 'bg-orange-50 text-orange-700 font-semibold border border-orange-200/80'
                                        : 'text-slate-400 hover:text-slate-700'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Tab 内容区 (带独立平滑滚动) */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain scrollbar-hide pt-3">
                {tab === 'equipment' && (
                    <>
                        {filteredEquipment.length > 0 ? (
                            <div className="grid gap-2.5 sm:grid-cols-2">
                                {filteredEquipment.map(item => (
                                    <EquipmentCard
                                        key={item.id}
                                        item={item}
                                        disabled={busy}
                                        worn={isWorn(item.id)}
                                        onEquip={() => onInspectEquipment(item)}
                                        onUnequip={() => onInspectEquipment(item, true)}
                                        onFavorite={() =>
                                            void actions.act({
                                                operation: 'favorite',
                                                equipmentId: item.id,
                                                locked: !item.locked,
                                            })
                                        }
                                        onSell={() =>
                                            void actions.trade({
                                                kind: 'sell_combat_equipment',
                                                equipmentId: item.id,
                                            })
                                        }
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="py-12 text-center text-xs text-slate-400">
                                <Backpack className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                                <p className="font-semibold text-slate-600">行囊中暂无装备</p>
                                <p className="mt-1 text-slate-400">
                                    派遣居民出征迷宫，即可在探索过程中收获掉落装备！
                                </p>
                            </div>
                        )}
                    </>
                )}

                {tab === 'market' && (
                    <CombatMarketPanel
                        profile={profile}
                        actions={actions}
                        disabled={busy}
                    />
                )}

                {tab === 'skills' && (
                    <CombatSkillsPanel profile={profile} />
                )}
            </div>
        </div>
    );
}
