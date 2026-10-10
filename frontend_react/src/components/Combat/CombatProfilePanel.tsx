import {useState} from 'react';
import type {CombatEquipment, CombatCatalog, CombatProfile, CombatSnapshot} from '../../types/api/combat';
import EquipmentPreview from './EquipmentPreview';
import EquipmentCard from './EquipmentCard';
import ExplorationPreparation from './ExplorationPreparation';
import CombatLoadoutSlots from './CombatLoadoutSlots';
import CombatAttributesCard from './CombatAttributesCard';
import CombatMarketPanel from './CombatMarketPanel';
import CombatSkillsPanel from './CombatSkillsPanel';
import type {useCombatActions} from '../../hooks/useCombatActions';
import {Backpack, BookOpen, Eye, Flame, Heart, ShoppingBag, Sparkles, User} from 'lucide-react';

export default function CombatProfilePanel({
    profile,
    catalog,
    actions,
    onObserve,
}: {
    profile: CombatProfile;
    catalog: CombatCatalog;
    actions: ReturnType<typeof useCombatActions>;
    onObserve: (id: string) => void;
}) {
    const [preview, setPreview] = useState<{item: CombatEquipment; remove?: boolean} | null>(null);
    const [tab, setTab] = useState<'equipment' | 'market' | 'skills'>('equipment');
    const [qualityFilter, setQualityFilter] = useState<'all' | 'gold' | 'blue' | 'white'>('all');

    const job = catalog.tables.professions.find(row => row.id === profile.progression.job);
    const busy = actions.busy || Boolean(profile.activeExplorationId);

    const hpPercent = Math.min(100, Math.max(0, (profile.hp / (Number(profile.attributes.hpMax) || 1)) * 100));
    const mpPercent = Math.min(100, Math.max(0, (profile.mp / (Number(profile.attributes.mpMax) || 1)) * 100));

    // 装备过滤
    const filteredEquipment = profile.equipment.filter(item => {
        if (qualityFilter === 'all') return true;
        return item.snapshot.quality === qualityFilter;
    });

    const isWorn = (itemId: string) => Object.values(profile.loadout).includes(itemId);

    return (
        <div className="grid h-full min-h-0 grid-rows-2 lg:grid-cols-12 lg:grid-rows-1 gap-3.5">
            {/* 左栏：角色状态与装配看板 (约 5/12 宽度) */}
            <div className="lg:col-span-5 flex flex-col min-h-0 overflow-y-auto scrollbar-hide space-y-3.5 pr-0.5">
                {/* 1. 角色名片与核心状态 */}
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 font-bold text-base shadow-2xs">
                                <User className="h-6 w-6" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <h3 className="text-base font-bold text-slate-800 truncate">
                                        Lv.{profile.progression.level} · {job?.name || '新手'}
                                    </h3>
                                    {profile.promotionOptions.length > 0 && (
                                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                                            <Sparkles className="w-2.5 h-2.5" />
                                            可转职
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                    当前经验值：<strong className="text-slate-600 font-medium">{profile.progression.experience}</strong> Exp
                                </p>
                            </div>
                        </div>

                        {profile.activeExplorationId && (
                            <button
                                type="button"
                                onClick={() => onObserve(profile.activeExplorationId!)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600 active:scale-95 transition-all whitespace-nowrap shrink-0 animate-pulse"
                            >
                                <Eye className="w-3.5 h-3.5" />
                                观察探索
                            </button>
                        )}
                    </div>

                    {/* 可转职提醒横幅 */}
                    {profile.promotionOptions.length > 0 && (
                        <div className="mt-3 rounded-xl bg-amber-50/80 p-2.5 border border-amber-200/70 text-xs text-amber-800">
                            <p className="font-semibold">已达转职条件！完成本次探索后即可选择职业分支：</p>
                            <p className="text-[11px] text-amber-700 mt-0.5">
                                可选分支：{profile.promotionOptions.map(row => row.name).join('、')}
                            </p>
                        </div>
                    )}

                    {/* 状态资源槽：HP / MP */}
                    <div className="mt-3.5 space-y-2 rounded-xl bg-slate-50/80 p-3 border border-slate-100">
                        {/* HP */}
                        <div>
                            <div className="flex items-center justify-between text-[11px] font-semibold">
                                <span className="flex items-center gap-1 text-emerald-700">
                                    <Heart className="w-3 h-3 fill-emerald-500 text-emerald-500" />
                                    生命值 (HP)
                                </span>
                                <span className="text-slate-700">
                                    {profile.hp} / {profile.attributes.hpMax}
                                </span>
                            </div>
                            <div className="mt-1 h-2 w-full rounded-full bg-slate-200/80 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                                    style={{width: `${hpPercent}%`}}
                                />
                            </div>
                        </div>

                        {/* MP */}
                        <div>
                            <div className="flex items-center justify-between text-[11px] font-semibold">
                                <span className="flex items-center gap-1 text-sky-700">
                                    <Flame className="w-3 h-3 text-sky-500" />
                                    魔力值 (MP)
                                </span>
                                <span className="text-slate-700">
                                    {profile.mp} / {profile.attributes.mpMax}
                                </span>
                            </div>
                            <div className="mt-1 h-2 w-full rounded-full bg-slate-200/80 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-sky-500 transition-all duration-300"
                                    style={{width: `${mpPercent}%`}}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* 2. 六槽纸娃娃装备 */}
                <CombatLoadoutSlots
                    profile={profile}
                    disabled={busy}
                    onInspect={(item, remove) => setPreview({item, remove})}
                />

                {/* 3. 战斗属性面板 */}
                <CombatAttributesCard attributes={profile.attributes} />
            </div>

            {/* 右栏：出征派遣 & 整备工作台 (约 7/12 宽度) */}
            <div className="lg:col-span-7 flex flex-col min-h-0 overflow-y-auto scrollbar-hide lg:overflow-visible space-y-3">
                {/* 1. 顶部：出征派遣控制台 */}
                <div className="shrink-0">
                    <ExplorationPreparation
                        key={profile.actorId}
                        catalog={catalog}
                        profile={profile}
                        busy={actions.busy}
                        onStart={constraints => {
                            void actions.act<CombatSnapshot>({operation: 'prepare', constraints}).then(run => {
                                if (run) onObserve(run.id);
                            });
                        }}
                    />
                </div>

                {/* 2. 下部：整备工作台 Tab 容器 */}
                <div className="shrink-0 lg:flex-1 min-h-0 flex flex-col rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                    {/* Tab 导航头 */}
                    <div className="flex shrink-0 items-center justify-between pb-3 border-b border-slate-100 gap-2 flex-wrap">
                        <div className="flex max-w-full gap-1 overflow-x-auto scrollbar-hide rounded-full bg-slate-100 p-1">
                            <button
                                type="button"
                                aria-pressed={tab === 'equipment'}
                                onClick={() => setTab('equipment')}
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
                                onClick={() => setTab('market')}
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
                                onClick={() => setTab('skills')}
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
                                ] .map(([k, label]) => (
                                    <button
                                        key={k}
                                        type="button"
                                        onClick={() => setQualityFilter(k as typeof qualityFilter)}
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
                    <div className="lg:flex-1 min-h-0 lg:overflow-y-auto scrollbar-hide pt-3">
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
                                                onEquip={() => setPreview({item})}
                                                onUnequip={() => setPreview({item, remove: true})}
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
                                        <p className="mt-1 text-slate-400">派遣居民出征迷宫，即可在探索过程中收获掉落装备！</p>
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
            </div>

            {/* 换装预览弹窗 */}
            {preview && (
                <EquipmentPreview
                    key={preview.item.id}
                    profile={profile}
                    item={preview.item}
                    remove={preview.remove}
                    busy={actions.busy}
                    onClose={() => setPreview(null)}
                    onConfirm={() => {
                        void actions
                            .act({
                                operation: 'equip',
                                equipment: {
                                    [preview.item.snapshot.slot]: preview.remove ? null : preview.item.id,
                                },
                            })
                            .then(result => {
                                if (result) setPreview(null);
                            });
                    }}
                />
            )}
        </div>
    );
}
