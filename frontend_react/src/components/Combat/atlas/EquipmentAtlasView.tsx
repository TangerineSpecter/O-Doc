import {useMemo, useState} from 'react';
import {Search, X, Shield, Sparkles, CheckCircle2, Tag} from 'lucide-react';
import type {CombatCatalog, CombatProfile} from '../../../types/api/combat';
import {AtlasGridCard} from './AtlasGridCard';
import {getEquipmentVisual} from './atlasIcons';
import {slotLabels, statLabels} from '../presentation';

export interface EquipmentAtlasViewProps {
    catalog: CombatCatalog;
    discoveries?: CombatProfile['discoveries'];
}

const slotFilters = [
    {value: 'all', label: '全部'},
    {value: 'weapon', label: '武器'},
    {value: 'head', label: '头饰'},
    {value: 'body', label: '护甲'},
    {value: 'hands', label: '手套'},
    {value: 'feet', label: '靴子'},
    {value: 'accessory', label: '护符'},
] as const;

export function EquipmentAtlasView({catalog, discoveries}: EquipmentAtlasViewProps) {
    const tables = catalog.tables;
    const equipmentTemplates = tables.equipmentTemplates || [];
    const equipmentAffixes = tables.equipmentAffixes || [];
    const affixes = tables.affixes || [];
    const professions = tables.professions || [];

    const [slotFilter, setSlotFilter] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string>(equipmentTemplates[0]?.id || '');

    // 统计各部位数量
    const slotCounts = useMemo(() => {
        const counts: Record<string, number> = {all: equipmentTemplates.length};
        for (const e of equipmentTemplates) {
            const slot = e.slot || 'accessory';
            counts[slot] = (counts[slot] || 0) + 1;
        }
        return counts;
    }, [equipmentTemplates]);

    // 过滤列表
    const visibleEquipment = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        return equipmentTemplates.filter(e => {
            const matchSlot = slotFilter === 'all' || e.slot === slotFilter;
            const matchSearch =
                !keyword ||
                (e.name || '').toLowerCase().includes(keyword) ||
                (e.id || '').toLowerCase().includes(keyword);
            return matchSlot && matchSearch;
        });
    }, [equipmentTemplates, slotFilter, search]);

    const selected = visibleEquipment.find(e => e.id === selectedId) || visibleEquipment[0] || null;

    // 选中装备的详细属性
    const selectedDetails = useMemo(() => {
        if (!selected) return null;

        const isAcquired = Boolean(discoveries?.equipment.includes(selected.id));
        const isBossOnly = selected.bossOnly === '1' || selected.id.includes('boss');

        // 基础属性与成长
        const statConfig: [string, string][] = [
            ['physicalAttack', '物理攻击'],
            ['magicAttack', '魔法攻击'],
            ['hp', '生命上限'],
            ['mp', '魔力上限'],
            ['physicalDefense', '物理防御'],
            ['magicDefense', '魔法防御'],
            ['healing', '治疗能力'],
        ];

        const baseStats = statConfig
            .map(([stat, label]) => {
                const base = Number(selected[`${stat}Base`] || 0);
                const growth = Number(selected[`${stat}Growth`] || 0);
                if (!base && !growth) return null;
                return {stat, label, base, growth};
            })
            .filter(Boolean) as {stat: string; label: string; base: number; growth: number}[];

        // 职业限制
        const rootJobName =
            professions.find(p => p.id === selected.rootJob || p.id === `job.${selected.rootJob}`)?.name || '通用';

        // 词条池
        const affixPool = equipmentAffixes
            .filter(a => a.equipmentId === selected.id)
            .map(a => affixes.find(f => f.id === a.affixId)?.stat)
            .filter(Boolean)
            .map(stat => statLabels[stat || ''] || ({
                physical_attack: '物理攻击',
                magic_attack: '魔法攻击',
                physical_defense: '物理防御',
                magic_defense: '魔法防御',
                hp_max: '生命上限',
                mp_max: '魔力上限',
                critical_damage: '暴击伤害',
            }[stat || ''] || stat));

        const uniqueAffixes = Array.from(new Set(affixPool));

        return {
            isAcquired,
            isBossOnly,
            baseStats,
            rootJobName,
            uniqueAffixes,
        };
    }, [selected, discoveries, equipmentAffixes, affixes, professions]);

    const visual = selected
        ? getEquipmentVisual(selected.slot || '', selected.name, selectedDetails?.isBossOnly)
        : null;
    const VisualIcon = visual?.icon || Shield;

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            {/* 顶部工具栏：部位胶囊 + 搜索条 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 border border-slate-200/50" aria-label="装备部位筛选">
                    {slotFilters.map(tab => {
                        const count = slotCounts[tab.value] || 0;
                        const isActive = slotFilter === tab.value;
                        return (
                            <button
                                key={tab.value}
                                type="button"
                                aria-pressed={isActive}
                                onClick={() => setSlotFilter(tab.value)}
                                className={`inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                                    isActive
                                        ? 'bg-white text-orange-600 shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span
                                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                                        isActive ? 'bg-orange-100 text-orange-700' : 'bg-slate-200/70 text-slate-500'
                                    }`}
                                >
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <label className="relative flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-2xs transition-all focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/20 w-56">
                    <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <input
                        placeholder="搜索装备名称..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full min-w-0 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </label>
            </div>

            {/* 双栏布局 */}
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
                {/* 左侧装备网格 */}
                <div className="scrollbar-hide h-full overflow-y-auto pr-1">
                    {!visibleEquipment.length ? (
                        <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                            <Shield className="h-8 w-8 text-slate-300" />
                            <p className="mt-2 text-xs text-slate-500">未找到符合条件的装备</p>
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    className="mt-2 text-xs text-orange-600 hover:underline"
                                >
                                    清除搜索
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-[repeat(auto-fill,86px)] content-start gap-2.5">
                            {visibleEquipment.map(equip => {
                                const isSelected = selected?.id === equip.id;
                                const isBossOnly = equip.bossOnly === '1' || equip.id.includes('boss');
                                const eqVisual = getEquipmentVisual(equip.slot || '', equip.name, isBossOnly);
                                const EqIcon = eqVisual.icon;
                                const isAcquired = discoveries?.equipment.includes(equip.id);

                                return (
                                    <AtlasGridCard
                                        key={equip.id}
                                        id={equip.id}
                                        name={equip.name || equip.id}
                                        title={`${equip.name} · ${slotLabels[equip.slot || ''] || equip.slot} · Lv.${equip.levelMin}–${equip.levelMax}${isAcquired ? ' (已获得)' : ''}`}
                                        selected={isSelected}
                                        onClick={() => setSelectedId(equip.id)}
                                        icon={<EqIcon className={`h-8 w-8 ${eqVisual.color}`} />}
                                        bgGradient={eqVisual.bgGradient}
                                        topLeftBadge={
                                            <span className="rounded-full bg-slate-900/60 px-1 py-0.2 text-[8px] font-semibold text-white backdrop-blur-xs">
                                                Lv.{equip.levelMin}
                                            </span>
                                        }
                                        topRightBadge={
                                            isAcquired ? (
                                                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white shadow-2xs" title="已获得">
                                                    ✓
                                                </span>
                                            ) : isBossOnly ? (
                                                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-white shadow-2xs" title="Boss专属">
                                                    👑
                                                </span>
                                            ) : undefined
                                        }
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 右侧详情面板 */}
                {selected && selectedDetails && (
                    <section
                        aria-label="装备详情"
                        className="scrollbar-hide flex h-full flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                        <div className="space-y-4">
                            {/* 顶部橱窗 */}
                            <div className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border p-4 text-center bg-gradient-to-b ${visual?.bgGradient} ${visual?.border}`}>
                                <div className="mb-2 flex w-full items-center justify-between gap-1">
                                    <div className="flex items-center gap-1">
                                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-2xs">
                                            <Tag className="h-2.5 w-2.5 text-slate-400" />
                                            {slotLabels[selected.slot || ''] || selected.slot}
                                        </span>
                                        <span className="rounded-full bg-white/90 border border-slate-200/60 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-2xs">
                                            {selectedDetails.rootJobName}
                                        </span>
                                    </div>

                                    {selectedDetails.isAcquired && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 shadow-2xs">
                                            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                                            已获得
                                        </span>
                                    )}
                                </div>

                                <div className="my-2 flex h-24 w-24 items-center justify-center rounded-2xl border border-white/80 bg-white/90 shadow-sm">
                                    <VisualIcon className={`h-12 w-12 ${visual?.color}`} />
                                </div>

                                <h3 className="text-base font-bold text-slate-800">{selected.name}</h3>
                                <p className="mt-1 text-xs text-slate-500">
                                    适用装备等级：Lv.{selected.levelMin}–{selected.levelMax}
                                </p>
                            </div>

                            {/* 基础属性与成长路线 */}
                            <div className="space-y-1.5">
                                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                    <Shield className="h-3.5 w-3.5 text-slate-400" />
                                    基础属性与每级成长
                                </h4>
                                {!selectedDetails.baseStats.length ? (
                                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-500">
                                        该装备主要提供随机词条加成
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        {selectedDetails.baseStats.map(s => (
                                            <div
                                                key={s.stat}
                                                className="flex items-center justify-between rounded-xl bg-slate-50 px-2.5 py-1.5 border border-slate-100 text-xs"
                                            >
                                                <span className="text-slate-600">{s.label}</span>
                                                <span className="font-semibold text-slate-800">
                                                    {s.base} + {s.growth} ×等级
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 词条池 */}
                            {selectedDetails.uniqueAffixes.length > 0 && (
                                <div className="space-y-1.5">
                                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                        可能生成的词条池 ({selectedDetails.uniqueAffixes.length})
                                    </h4>
                                    <div className="flex flex-wrap gap-1">
                                        {selectedDetails.uniqueAffixes.map(affix => (
                                            <span
                                                key={affix}
                                                className="inline-flex items-center rounded-lg border border-slate-200/80 bg-white px-2 py-0.5 text-[11px] text-slate-700 shadow-2xs"
                                            >
                                                {affix}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 品质与词条机制说明 */}
                            <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs">
                                <div className="flex items-center justify-between font-semibold text-slate-700">
                                    <span>随机词条数量规则</span>
                                </div>
                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                    白装拥有 1 条随机词条；蓝装 2 条；金装 3 条。词条数值在装备掉落时随机决定。
                                </p>
                                <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-200/60 leading-relaxed">
                                    回收基础价：10 + 0.5 ×装备等级，根据品质与词条品质额外加成。
                                </p>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
