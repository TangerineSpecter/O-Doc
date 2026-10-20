import {useState} from 'react';
import type {CombatEquipment, CombatCatalog, CombatProfile, CombatSnapshot} from '../../types/api/combat';
import EquipmentPreview from './EquipmentPreview';
import ExplorationPreparation from './ExplorationPreparation';
import CombatLoadoutSlots from './CombatLoadoutSlots';
import CombatAttributesCard from './CombatAttributesCard';
import ExplorationDepartureCard from './ExplorationDepartureCard';
import CombatWorkbenchPanel from './CombatWorkbenchPanel';
import WorldDialog from '../AgentWorld/WorldDialog';
import AgentAvatar from '../AgentWorld/AgentAvatar';
import type {useCombatActions} from '../../hooks/useCombatActions';
import {
    Backpack,
    BookOpen,
    ChevronLeft,
    ChevronRight,
    Eye,
    Flame,
    Heart,
    RotateCw,
    Shield,
    ShoppingBag,
    Sparkles,
} from 'lucide-react';
import './CombatFlipCard.css';

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

    // 移动端专属交互状态：卡片翻转与整备弹窗
    const [isFlipped, setIsFlipped] = useState(false);
    const [mobileWorkbenchOpen, setMobileWorkbenchOpen] = useState(false);

    const job = catalog.tables.professions.find(row => row.id === profile.progression.job);
    const busy = actions.busy || Boolean(profile.activeExplorationId);
    const viewableExplorationId = profile.activeExplorationId || recentExplorationId;

    const hpPercent = Math.min(100, Math.max(0, (profile.hp / (Number(profile.attributes.hpMax) || 1)) * 100));
    const mpPercent = Math.min(100, Math.max(0, (profile.mp / (Number(profile.attributes.mpMax) || 1)) * 100));

    const currentLevel = profile.progression.level || 1;
    const currentExp = profile.progression.experience || 0;
    const levelExpRow = catalog?.tables?.levelExperience?.find(
        row => row.id === `level.${currentLevel}` || row.level === String(currentLevel)
    );
    const maxExp = levelExpRow ? Number(levelExpRow.experienceToNext) || 0 : 0;
    const isMaxLevel = currentLevel >= 99;
    const expPercent = isMaxLevel ? 100 : maxExp > 0 ? Math.min(100, Math.max(0, (currentExp / maxExp) * 100)) : 0;

    return (
        <div className="flex h-full min-h-0 flex-col gap-2.5">
            {/* 1. 紧凑型角色基础状态横条 (头像 + 等级职业 + 切换器 + HP/MP/EXP 三联状态条) - 桌面与移动端共享 */}
            <section className="shrink-0 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* 左侧：头像、姓名、居民切换、等级职业与观察按钮 */}
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative shrink-0 h-11 w-11 overflow-hidden rounded-xl bg-orange-50 border border-orange-100/80 shadow-2xs">
                            <AgentAvatar
                                key={activeResident?.id || activeResident?.name}
                                name={activeResident?.name || '居民'}
                                avatar={activeResident?.avatar}
                                size="md"
                            />
                        </div>

                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <h3 className="text-sm font-bold text-slate-800 truncate">
                                    {activeResident?.name || '居民'}
                                </h3>
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
                                            <ChevronLeft className="h-3 w-3" />
                                        </button>
                                        <span className="px-1 text-[10px] font-medium text-slate-500 select-none">
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
                                            <ChevronRight className="h-3 w-3" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center rounded-md bg-orange-50 px-1.5 py-0.5 text-[11px] font-bold text-orange-700 border border-orange-200/60">
                                    Lv.{profile.progression.level} · {job?.name || '新手'}
                                </span>
                                {profile.promotionOptions.length > 0 && (
                                    <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                                        <Sparkles className="w-2.5 h-2.5" />
                                        可转职
                                    </span>
                                )}
                                {viewableExplorationId && (
                                    <button
                                        type="button"
                                        onClick={() => onObserve(viewableExplorationId)}
                                        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-orange-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow-2xs transition-all hover:bg-orange-600 active:scale-95"
                                    >
                                        <Eye className="w-3 h-3" />
                                        {profile.activeExplorationId ? '观察探索' : '上次战报'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 右侧：HP / MP / EXP 三联紧凑充能槽 */}
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 flex-1 min-w-[260px] sm:min-w-[280px]">
                        {/* HP 生命 */}
                        <div className="rounded-xl bg-emerald-50/45 px-2 sm:px-2.5 py-1.5 border border-emerald-100/80 space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-semibold gap-1">
                                <span className="flex items-center gap-1 text-emerald-700 whitespace-nowrap">
                                    <Heart className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500 shrink-0" />
                                    HP
                                </span>
                                <span className="font-mono text-slate-700 truncate">
                                    {profile.hp}/{profile.attributes.hpMax}
                                </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-emerald-100/90 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                                    style={{width: `${hpPercent}%`}}
                                />
                            </div>
                        </div>

                        {/* MP 魔力 */}
                        <div className="rounded-xl bg-sky-50/45 px-2 sm:px-2.5 py-1.5 border border-sky-100/80 space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-semibold gap-1">
                                <span className="flex items-center gap-1 text-sky-700 whitespace-nowrap">
                                    <Flame className="w-2.5 h-2.5 text-sky-500 shrink-0" />
                                    MP
                                </span>
                                <span className="font-mono text-slate-700 truncate">
                                    {profile.mp}/{profile.attributes.mpMax}
                                </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-sky-100/90 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-sky-500 transition-all duration-300"
                                    style={{width: `${mpPercent}%`}}
                                />
                            </div>
                        </div>

                        {/* EXP 历练经验 */}
                        <div className="rounded-xl bg-amber-50/55 px-2 sm:px-2.5 py-1.5 border border-amber-200/70 space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-semibold gap-1">
                                <span className="flex items-center gap-1 text-amber-800 whitespace-nowrap">
                                    <Sparkles className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                    EXP
                                </span>
                                <span className="font-mono text-amber-900 font-bold truncate">
                                    {isMaxLevel
                                        ? 'MAX'
                                        : maxExp > 0
                                          ? `${currentExp}/${maxExp}`
                                          : `${currentExp} Exp`}
                                </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-amber-100/90 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 transition-all duration-300"
                                    style={{width: `${expPercent}%`}}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 可转职提醒横幅 */}
                {profile.promotionOptions.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50/80 px-3 py-1.5 border border-amber-200/70 text-xs text-amber-800">
                        <div className="min-w-0">
                            <span className="font-semibold">已达转职等级：</span>
                            <span className="text-[11px] text-amber-700">
                                可选 {profile.promotionOptions.map(row => row.name).join('、')}（完成转职前暂停探索，溢出经验将暂存）
                            </span>
                        </div>
                        <button
                            type="button"
                            disabled={actions.busy || profile.promotionBusy}
                            onClick={() => void actions.act({operation: 'retry_promotion'})}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Sparkles className="h-3 w-3" />
                            {profile.promotionBusy ? '选择职业中…' : profile.activeExplorationId ? '重试转职' : '让 Agent 选择职业'}
                        </button>
                    </div>
                )}
            </section>

            {/* 2. 桌面端经典双栏布局 (>= lg 宽屏显示) */}
            <div className="hidden lg:grid flex-1 min-h-0 grid-cols-12 gap-3 overflow-hidden">
                {/* 左主展区：下部【装备装配 + 战斗属性面板】双栏并排 (占 7/12 宽度) */}
                <div className="col-span-7 flex flex-col min-h-0 gap-2.5">
                    <div className="flex-1 min-h-0 grid grid-cols-12 gap-2.5">
                        <div className="col-span-7 min-h-0 flex flex-col">
                            <CombatLoadoutSlots
                                profile={profile}
                                disabled={busy}
                                onInspect={(item, remove, slot) => setPreview({item, remove, slot})}
                            />
                        </div>
                        <div className="col-span-5 min-h-0 flex flex-col">
                            <CombatAttributesCard attributes={profile.attributes} />
                        </div>
                    </div>
                </div>

                {/* 右栏：探索出发 & 整备工作台 (占 5/12 宽度) */}
                <div className="col-span-5 flex flex-col min-h-0 gap-2.5">
                    <ExplorationDepartureCard
                        profile={profile}
                        actions={actions}
                        onOpenHistory={onOpenHistory}
                        historyCount={historyCount}
                        onStartPreparation={() => setPreparationOpen(true)}
                    />
                    <CombatWorkbenchPanel
                        profile={profile}
                        actions={actions}
                        tab={tab}
                        onTabChange={setTab}
                        qualityFilter={qualityFilter}
                        onQualityFilterChange={setQualityFilter}
                        onInspectEquipment={(item, remove, slot) => setPreview({item, remove, slot})}
                        busy={busy}
                    />
                </div>
            </div>

            {/* 3. 移动端专属响应式布局 (< lg 手机/平板竖屏优化) */}
            <div className="flex lg:hidden flex-1 min-h-0 flex-col gap-2.5">
                {/* 核心卡片 3D 翻转容器 */}
                <div className="combat-flip-perspective flex-1 min-h-[420px] w-full relative">
                    <div className={`combat-flip-card-inner ${isFlipped ? 'is-flipped' : ''}`}>
                        {/* 正面：默认展示角色装备装配纸娃娃 */}
                        <div className="combat-flip-card-face combat-flip-card-front">
                            <CombatLoadoutSlots
                                profile={profile}
                                disabled={busy}
                                onInspect={(item, remove, slot) => setPreview({item, remove, slot})}
                                onFlip={() => setIsFlipped(true)}
                            />
                        </div>

                        {/* 背面：翻转后展示【探索出发】卡片 + 【战斗属性面板】 */}
                        <div className="combat-flip-card-face combat-flip-card-back">
                            <div className="flex h-full min-h-[420px] flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs gap-2">
                                {/* 背面顶部操作条：标题与翻转回正面按钮 */}
                                <div className="flex shrink-0 items-center justify-between pb-2 border-b border-slate-100">
                                    <div className="flex items-center gap-1.5">
                                        <Shield className="w-3.5 h-3.5 text-orange-500" />
                                        <h4 className="text-xs font-bold text-slate-800">战斗属性 & 探索出发</h4>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsFlipped(false)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-orange-200/90 bg-orange-50/90 px-2 py-1 text-[11px] font-semibold text-orange-700 shadow-2xs hover:bg-orange-100 active:scale-95 transition-all"
                                        title="翻转卡片：返回装备装配"
                                    >
                                        <RotateCw className="w-3 h-3 text-orange-600" />
                                        <span>返回配装</span>
                                    </button>
                                </div>

                                {/* 上部分：探索出发卡片 */}
                                <ExplorationDepartureCard
                                    profile={profile}
                                    actions={actions}
                                    onOpenHistory={onOpenHistory}
                                    historyCount={historyCount}
                                    onStartPreparation={() => setPreparationOpen(true)}
                                />

                                {/* 下部分：战斗属性面板 (带平滑独立内部滚动) */}
                                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
                                    <CombatAttributesCard attributes={profile.attributes} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 移动端整备入口操作栏：将行囊背包、补给市场、技能收纳为 3 个快捷按钮 */}
                <div className="grid grid-cols-3 gap-2 shrink-0 pt-0.5">
                    <button
                        type="button"
                        onClick={() => {
                            setTab('equipment');
                            setMobileWorkbenchOpen(true);
                        }}
                        className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-orange-50/80 border border-orange-200/80 text-xs font-semibold text-orange-700 shadow-2xs hover:bg-orange-100 active:scale-[0.98] transition-all"
                    >
                        <Backpack className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                        <span className="truncate">装备行囊</span>
                        <span className="rounded-full bg-orange-200/80 px-1.5 py-0.2 text-[10px] text-orange-800 font-bold shrink-0">
                            {profile.equipment.length}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setTab('market');
                            setMobileWorkbenchOpen(true);
                        }}
                        className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 active:scale-[0.98] transition-all"
                    >
                        <ShoppingBag className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">补给与市场</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setTab('skills');
                            setMobileWorkbenchOpen(true);
                        }}
                        className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 active:scale-[0.98] transition-all"
                    >
                        <BookOpen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">战斗技能</span>
                        {profile.skills.length > 0 && (
                            <span className="rounded-full bg-slate-200/80 px-1.5 py-0.2 text-[10px] text-slate-700 font-bold shrink-0">
                                {profile.skills.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* 移动端整备工作台独立弹窗 (点击装备行囊/补给与市场/战斗技能时打开) */}
            {mobileWorkbenchOpen && (
                <WorldDialog
                    title="冒险整备"
                    description="管理行囊装备、采购补给药水或查看战斗技能。"
                    size="wide"
                    onClose={() => setMobileWorkbenchOpen(false)}
                >
                    <CombatWorkbenchPanel
                        profile={profile}
                        actions={actions}
                        tab={tab}
                        onTabChange={setTab}
                        qualityFilter={qualityFilter}
                        onQualityFilterChange={setQualityFilter}
                        onInspectEquipment={(item, remove, slot) => setPreview({item, remove, slot})}
                        busy={busy}
                    />
                </WorldDialog>
            )}

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
