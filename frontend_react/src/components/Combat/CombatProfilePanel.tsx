import {useState} from 'react';
import type {CombatEquipment, CombatCatalog, CombatProfile, CombatSnapshot} from '../../types/api/combat';
import EquipmentPreview from './EquipmentPreview';
import EquipmentCard from './EquipmentCard';
import ExplorationPreparation from './ExplorationPreparation';
import CombatLoadoutSlots from './CombatLoadoutSlots';
import CombatAttributesCard from './CombatAttributesCard';
import CombatMarketPanel from './CombatMarketPanel';
import CombatSkillsPanel from './CombatSkillsPanel';
import WorldDialog from '../AgentWorld/WorldDialog';
import AgentAvatar from '../AgentWorld/AgentAvatar';
import type {useCombatActions} from '../../hooks/useCombatActions';
import {Backpack, BookOpen, ChevronLeft, ChevronRight, Compass, Eye, Flame, Heart, History, ShoppingBag, Sparkles} from 'lucide-react';

export default function CombatProfilePanel({
    profile,
    catalog,
    actions,
    onObserve,
    recentExplorationId,
    activeResident,
    residents,
    actorIndex = 0,
    onChangeResident,
    onOpenHistory,
    historyCount = 0,
}: {
    profile: CombatProfile;
    catalog: CombatCatalog;
    actions: ReturnType<typeof useCombatActions>;
    onObserve: (id: string) => void;
    recentExplorationId?: string;
    activeResident?: {id: string; name: string; avatar?: string};
    residents?: {id: string; name: string; avatar?: string}[];
    actorIndex?: number;
    onChangeResident?: (index: number) => void;
    onOpenHistory?: () => void;
    historyCount?: number;
}) {
    const [preview, setPreview] = useState<{item: CombatEquipment; remove?: boolean; slot?: string} | null>(null);
    const [preparationOpen, setPreparationOpen] = useState(false);
    const [tab, setTab] = useState<'equipment' | 'market' | 'skills'>('equipment');
    const [qualityFilter, setQualityFilter] = useState<'all' | 'gold' | 'blue' | 'white'>('all');

    const job = catalog.tables.professions.find(row => row.id === profile.progression.job);
    const busy = actions.busy || Boolean(profile.activeExplorationId);
    const viewableExplorationId = profile.activeExplorationId || recentExplorationId;

    const hpPercent = Math.min(100, Math.max(0, (profile.hp / (Number(profile.attributes.hpMax) || 1)) * 100));
    const mpPercent = Math.min(100, Math.max(0, (profile.mp / (Number(profile.attributes.mpMax) || 1)) * 100));

    const currentLevel = profile.progression.level || 1;
    const currentExp = profile.progression.experience || 0;
    const levelExpRow = catalog?.tables?.level_experience?.find(
        row => row.id === `level.${currentLevel}` || row.level === String(currentLevel)
    );
    const maxExp = levelExpRow ? Number(levelExpRow.experience_to_next) || 0 : 0;
    const isMaxLevel = currentLevel >= 99;
    const expPercent = isMaxLevel ? 100 : maxExp > 0 ? Math.min(100, Math.max(0, (currentExp / maxExp) * 100)) : 0;

    // 装备过滤
    const filteredEquipment = profile.equipment.filter(item => {
        if (qualityFilter === 'all') return true;
        return item.snapshot.quality === qualityFilter;
    });

    const isWorn = (itemId: string) => Object.values(profile.loadout).includes(itemId);

    return (
        <div className="grid h-full min-h-0 grid-rows-2 lg:grid-cols-12 lg:grid-rows-1 gap-3.5">
            {/* 左栏：角色状态、纸娃娃装配与属性面板 (约 5/12 宽度) */}
            <div className="lg:col-span-5 flex flex-col min-h-0 overflow-y-auto scrollbar-hide space-y-3 pr-0.5">
                {/* 1. 角色英雄名片区 (Hero Profile) */}
                <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                    <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                            {/* 居民真实头像 */}
                            <div className="relative shrink-0 h-14 w-14 overflow-hidden rounded-xl bg-orange-50 border border-orange-100/80 shadow-2xs">
                                <AgentAvatar
                                    key={activeResident?.id || activeResident?.name}
                                    name={activeResident?.name || '居民'}
                                    avatar={activeResident?.avatar}
                                    size="lg"
                                />
                            </div>

                            {/* 角色姓名、切换器与等级信息 */}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-base font-bold text-slate-800 truncate">
                                        {activeResident?.name || '居民'}
                                    </h3>
                                    {/* 居民微型切换器 (若有多位居民) */}
                                    {residents && residents.length > 1 && (
                                        <div
                                            role="group"
                                            aria-label="切换居民"
                                            className="inline-flex items-center rounded-lg border border-slate-200/90 bg-slate-50 p-0.5 shadow-2xs"
                                        >
                                            <button
                                                type="button"
                                                aria-label="上一位居民"
                                                title="上一位居民 (按键盘 ← 键)"
                                                disabled={actorIndex <= 0}
                                                onClick={() => onChangeResident?.(actorIndex - 1)}
                                                className="rounded p-0.5 text-slate-500 hover:bg-white hover:text-orange-600 disabled:opacity-30 disabled:hover:bg-transparent"
                                            >
                                                <ChevronLeft className="h-3.5 w-3.5" />
                                            </button>
                                            <span className="px-1 text-[11px] font-medium text-slate-500 select-none">
                                                {actorIndex + 1}/{residents.length}
                                            </span>
                                            <button
                                                type="button"
                                                aria-label="下一位居民"
                                                title="下一位居民 (按键盘 → 键)"
                                                disabled={actorIndex >= residents.length - 1}
                                                onClick={() => onChangeResident?.(actorIndex + 1)}
                                                className="rounded p-0.5 text-slate-500 hover:bg-white hover:text-orange-600 disabled:opacity-30 disabled:hover:bg-transparent"
                                            >
                                                <ChevronRight className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                    <span className="inline-flex items-center rounded-md bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-700 border border-orange-200/60">
                                        Lv.{profile.progression.level} · {job?.name || '新手'}
                                    </span>
                                    {profile.promotionOptions.length > 0 && (
                                        <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                                            <Sparkles className="w-2.5 h-2.5" />
                                            可转职
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 观察进行中 / 查看上次战报 */}
                        {viewableExplorationId && (
                            <button
                                type="button"
                                onClick={() => onObserve(viewableExplorationId)}
                                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl bg-orange-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-95"
                            >
                                <Eye className="w-3.5 h-3.5" />
                                {profile.activeExplorationId ? '观察探索' : '上次战报'}
                            </button>
                        )}
                    </div>

                    {/* 历练经验成长条 (EXP) */}
                    <div className="mt-3 rounded-xl bg-gradient-to-r from-amber-50/70 via-orange-50/40 to-yellow-50/50 p-2.5 border border-amber-200/70 space-y-1.5 shadow-2xs">
                        <div className="flex items-center justify-between text-[11px] font-semibold">
                            <span className="flex items-center gap-1 text-amber-800">
                                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                历练经验 (EXP)
                            </span>
                            <span className="text-amber-900 font-bold">
                                {isMaxLevel ? (
                                    <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] text-amber-900 font-extrabold">
                                        MAX 已达上限
                                    </span>
                                ) : maxExp > 0 ? (
                                    <span className="flex items-center gap-1 font-mono text-xs">
                                        <span className="text-slate-800 font-bold">{currentExp}</span>
                                        <span className="text-slate-400 font-normal">/ {maxExp} Exp</span>
                                        <span className="ml-1 rounded bg-amber-100/90 px-1.5 py-0.2 text-[10px] font-bold text-amber-700">
                                            {expPercent.toFixed(1)}%
                                        </span>
                                    </span>
                                ) : (
                                    <span className="font-mono text-xs text-slate-700">{currentExp} Exp</span>
                                )}
                            </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-amber-100/80 overflow-hidden shadow-inner">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 transition-all duration-300 shadow-xs"
                                style={{width: `${expPercent}%`}}
                            />
                        </div>
                    </div>

                    {/* 可转职提醒横幅 */}
                    {profile.promotionOptions.length > 0 && (
                        <div className="mt-3 rounded-xl bg-amber-50/80 p-2.5 border border-amber-200/70 text-xs text-amber-800">
                            <p className="font-semibold">已达到转职等级。Agent 完成职业选择前，不能继续探索。</p>
                            <p className="text-[11px] text-amber-700 mt-0.5">
                                Agent 可选分支：{profile.promotionOptions.map(row => row.name).join('、')}
                            </p>
                            <p className="mt-0.5 text-[11px] text-amber-700">门槛后的经验会暂存，转职后继续结算。</p>
                            {profile.activeExplorationId && (
                                <p className="mt-0.5 text-[11px] text-amber-700">当前探索已暂停；选择完成后会自动继续剩余行程。</p>
                            )}
                            <button
                                type="button"
                                disabled={actions.busy || profile.promotionBusy}
                                onClick={() => void actions.act({operation: 'retry_promotion'})}
                                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                {profile.promotionBusy ? 'Agent 正在选择职业…' : profile.activeExplorationId ? '让 Agent 重试转职' : '让 Agent 选择职业'}
                            </button>
                        </div>
                    )}

                    {/* HP / MP 双通道充能槽 */}
                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50/80 p-2.5 border border-slate-100">
                        {/* HP */}
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-semibold">
                                <span className="flex items-center gap-1 text-emerald-700">
                                    <Heart className="w-3 h-3 fill-emerald-500 text-emerald-500" />
                                    HP 生命
                                </span>
                                <span className="text-slate-700">
                                    {profile.hp} / {profile.attributes.hpMax}
                                </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                                    style={{width: `${hpPercent}%`}}
                                />
                            </div>
                        </div>

                        {/* MP */}
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-semibold">
                                <span className="flex items-center gap-1 text-sky-700">
                                    <Flame className="w-3 h-3 text-sky-500" />
                                    MP 魔力
                                </span>
                                <span className="text-slate-700">
                                    {profile.mp} / {profile.attributes.mpMax}
                                </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-sky-500 transition-all duration-300"
                                    style={{width: `${mpPercent}%`}}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* 2. 纸娃娃六槽装备 */}
                <CombatLoadoutSlots
                    profile={profile}
                    disabled={busy}
                    onInspect={(item, remove, slot) => setPreview({item, remove, slot})}
                />

                {/* 3. 高密度战斗属性面板 */}
                <CombatAttributesCard attributes={profile.attributes} />
            </div>

            {/* 右栏：探索出发 & 整备工作台 (约 7/12 宽度) */}
            <div className="lg:col-span-7 flex flex-col min-h-0 overflow-y-auto scrollbar-hide lg:overflow-visible space-y-3">
                {/* 1. 探索出发卡片 (内嵌“探索历史”入口按钮) */}
                <section className="shrink-0 rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50/40 via-white to-amber-50/30 p-3.5 shadow-2xs sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                                <Compass className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                                <h3 className="text-sm font-bold text-slate-800">探索出发</h3>
                                <p className="mt-0.5 text-xs text-slate-500">配置迷宫目的地、探索时长与战术风格</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* 探索历史内嵌按钮 */}
                            {onOpenHistory && (
                                <button
                                    type="button"
                                    onClick={onOpenHistory}
                                    title="点击查看历史历练战报"
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-orange-200/80 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-all hover:bg-orange-50/70 hover:text-orange-600 active:scale-95"
                                >
                                    <History className="h-3.5 w-3.5 text-orange-500" />
                                    <span>探索历史</span>
                                    {historyCount > 0 && (
                                        <span className="rounded-full bg-orange-100 px-1.5 py-0.2 text-[10px] font-bold text-orange-700">
                                            {historyCount}
                                        </span>
                                    )}
                                </button>
                            )}

                            {profile.activeExplorationId ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-2 text-xs font-semibold text-orange-700">
                                    <Flame className="h-3.5 w-3.5" />
                                    {profile.promotionOptions.length > 0 ? '等待转职' : '探索进行中'}
                                </span>
                            ) : profile.promotionOptions.length > 0 ? (
                                <span className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800">
                                    <Sparkles className="h-4 w-4" />
                                    待转职
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    disabled={actions.busy}
                                    onClick={() => setPreparationOpen(true)}
                                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Compass className="h-4 w-4" />
                                    出发
                                </button>
                            )}
                        </div>
                    </div>
                    {profile.restUntil && !profile.activeExplorationId && (
                        <p className="mt-2.5 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
                            居民正在休息，仍可查看配置；休息结束前无法出发。
                        </p>
                    )}
                </section>

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
                                ].map(([k, label]) => (
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

            {/* 探索配置弹窗 */}
            {preparationOpen && (
                <WorldDialog
                    key={profile.actorId}
                    title="探索出发配置"
                    size="wide"
                    fixedHeight={false}
                    bare
                    onClose={() => setPreparationOpen(false)}
                >
                    <ExplorationPreparation
                        key={profile.actorId}
                        catalog={catalog}
                        profile={profile}
                        busy={actions.busy}
                        error={actions.error}
                        onStart={constraints => {
                            void actions.act<CombatSnapshot>({operation: 'prepare', constraints}).then(run => {
                                if (run) {
                                    setPreparationOpen(false);
                                    onObserve(run.id);
                                }
                            });
                        }}
                    />
                </WorldDialog>
            )}

            {/* 换装预览弹窗 */}
            {preview && (
                <EquipmentPreview
                    key={preview.item.id}
                    profile={profile}
                    item={preview.item}
                    initialSlot={preview.slot}
                    remove={preview.remove}
                    busy={actions.busy}
                    onClose={() => setPreview(null)}
                    onConfirm={slot => {
                        void actions
                            .act({
                                operation: 'equip',
                                equipment: {
                                    [slot]: preview.remove ? null : preview.item.id,
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
