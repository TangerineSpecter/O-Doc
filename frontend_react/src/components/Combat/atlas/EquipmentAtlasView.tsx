import {useEffect, useMemo, useRef, useState} from 'react';
import {Search, X, Shield, Sparkles, CheckCircle2, Tag, Info} from 'lucide-react';
import type {CombatCatalog, CombatProfile} from '../../../types/api/combat';
import {AtlasGridCard} from './AtlasGridCard';
import {EquipmentPortrait} from './EquipmentPortrait';
import {BossCrownIcon, AtlasStatusBadge} from './RankBadge';
import {getEquipmentVisual} from './atlasIcons';
import {equipmentSlotLabel, equipmentTypeLabels, statLabels} from '../presentation';
import {EquipmentMetaSpecs} from '../ElementBadge';

export interface EquipmentAtlasViewProps {
    catalog: CombatCatalog;
    discoveries?: CombatProfile['discoveries'];
}

const slotFilters = [
    {value: 'all', label: '全部'},
    {value: 'weapon', label: '武器'},
    {value: 'offhand', label: '副手'},
    {value: 'head', label: '头饰'},
    {value: 'body', label: '护甲'},
    {value: 'hands', label: '手套'},
    {value: 'feet', label: '靴子'},
    {value: 'accessory', label: '饰品'},
] as const;

export function EquipmentAtlasView({catalog, discoveries}: EquipmentAtlasViewProps) {
    const tables = catalog.tables;
    const equipmentTemplates = tables.equipmentTemplates || [];
    const equipmentAffixes = tables.equipmentAffixes || [];
    const equipmentProfessions = tables.equipmentProfessions || [];
    const affixes = tables.affixes || [];
    const professions = tables.professions || [];
    const skills = tables.skills || [];

    const [slotFilter, setSlotFilter] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string>(equipmentTemplates[0]?.id || '');
    const [showEquipmentRules, setShowEquipmentRules] = useState(false);
    const equipmentRulesRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showEquipmentRules) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (equipmentRulesRef.current && !equipmentRulesRef.current.contains(event.target as Node)) {
                setShowEquipmentRules(false);
            }
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setShowEquipmentRules(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [showEquipmentRules]);

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

        // 职业限制与精通技能
        const rootJobName =
            professions.find(p => p.id === selected.rootJob || p.id === `job.${selected.rootJob}`)?.name || '通用';
        const requiredMasteryNames = Array.from(new Set(
            String(selected.requiredMastery || '').split(';').filter(Boolean)
                .map(id => skills.find(skill => skill.id === id)?.name)
                .filter(Boolean)
        ));
        const requiredMasteryName = requiredMasteryNames.join('、');
        const requiredMasteryLabel = String(selected.requiredMastery || '').split(';').filter(Boolean)
            .map(id => {
                const mastery = skills.find(skill => skill.id === id);
                const profession = professions.find(job => job.id === mastery?.professionId);
                return mastery ? `${mastery.name}${profession ? `（${profession.name}）` : ''}` : '';
            }).filter(Boolean).join('、');

        const permittedProfessionIds = equipmentProfessions
            .filter(row => row.equipmentId === selected.id)
            .map(row => row.professionId)
            .filter((id): id is string => Boolean(id));
        const permittedProfessions = professions
            .filter(job => permittedProfessionIds.includes(job.id))
            .map(job => job.name || job.id);
        const isUniversal = permittedProfessionIds.length
            ? permittedProfessionIds.length === professions.length
            : !selected.rootJob && !requiredMasteryLabel;
        const allowedProfessionLabel = isUniversal
            ? '全职业'
            : permittedProfessions.length
                ? permittedProfessions.join('、')
                : requiredMasteryLabel || rootJobName;

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
            requiredMasteryLabel,
            requiredMasteryName,
            isUniversal,
            allowedProfessionLabel,
            permittedProfessions,
            equipmentTypeLabel: equipmentTypeLabels[String(selected.equipmentType || '')] || (isUniversal ? equipmentTypeLabels.generic : ''),
            uniqueAffixes,
        };
    }, [selected, discoveries, equipmentAffixes, equipmentProfessions, affixes, professions, skills]);

    const visual = selected
        ? getEquipmentVisual(selected.slot || '', selected.name, selectedDetails?.isBossOnly, selected.equipmentType)
        : null;

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

                <div className="flex items-center gap-2">
                    <div ref={equipmentRulesRef} className="relative">
                        <button
                            type="button"
                            aria-label="查看装备词条与回收规则"
                            aria-expanded={showEquipmentRules}
                            aria-controls="equipment-rules-popover"
                            onClick={() => setShowEquipmentRules(open => !open)}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-orange-500/30 ${
                                showEquipmentRules
                                    ? 'border-orange-200 bg-orange-50 text-orange-600'
                                    : 'border-slate-200 bg-white text-slate-400 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600'
                            }`}
                        >
                            <Info className="h-4 w-4" />
                        </button>
                        {showEquipmentRules && (
                            <div
                                id="equipment-rules-popover"
                                role="dialog"
                                aria-label="装备词条与回收规则"
                                className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3.5 text-xs shadow-xl"
                            >
                                <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-slate-700">
                                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                    <span>随机词条数量规则</span>
                                </div>
                                <p className="text-[11px] leading-relaxed text-slate-500">
                                    白装拥有 1 条随机词条；蓝装 2 条；金装 3 条。等级越高，词条数值范围越高；蓝装、金装还拥有更高的基础属性和词条数值。数值在掉落时随机生成并固定，百分比词条采用独立成长曲线。
                                </p>
                                <p className="mt-2 border-t border-slate-200/60 pt-1.5 text-[11px] leading-relaxed text-slate-400">
                                    回收基础价：10 + 0.5 ×装备等级，根据品质与词条品质额外加成。
                                </p>
                            </div>
                        )}
                    </div>
                    <label className="relative flex w-56 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-2xs transition-all focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/20">
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
                                aria-label="清除搜索"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </label>
                </div>
            </div>

            {/* 双栏布局 */}
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
                {/* 左侧装备网格 */}
                <div className="scrollbar-hide h-full overflow-y-auto p-1.5 pt-2">
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
                                const eqVisual = getEquipmentVisual(equip.slot || '', equip.name, isBossOnly, equip.equipmentType);
                                const isAcquired = discoveries?.equipment.includes(equip.id);

                                return (
                                    <AtlasGridCard
                                        key={equip.id}
                                        id={equip.id}
                                        name={equip.name || equip.id}
                                        title={`${equip.name} · ${equipmentSlotLabel(equip.slot || '', String(equip.equipmentType || ''))}${equip.equipmentType ? ` · ${equipmentTypeLabels[equip.equipmentType] || equip.equipmentType}` : !equip.rootJob && !equip.requiredMastery ? ` · ${equipmentTypeLabels.generic}` : ''} · Lv.${equip.levelMin}–${equip.levelMax}${isAcquired ? ' (已获得)' : ''}`}
                                        selected={isSelected}
                                        completed={isAcquired}
                                        onClick={() => setSelectedId(equip.id)}
                                        icon={<EquipmentPortrait equipmentId={equip.id} name={equip.name} slot={equip.slot} equipmentType={equip.equipmentType} bossOnly={isBossOnly} decorative className="h-full w-full" fallbackClassName="h-8 w-8" />}
                                        bgGradient={eqVisual.bgGradient}
                                        topLeftBadge={
                                            <span className="rounded-full bg-slate-900/60 px-1 py-0.2 text-[8px] font-semibold text-white backdrop-blur-xs">
                                                Lv.{equip.levelMin}
                                            </span>
                                        }
                                        topRightBadge={
                                            <AtlasStatusBadge isBossOnly={isBossOnly} />
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
                                <div className="mb-2 flex w-full flex-wrap items-center justify-between gap-1.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200/60 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-2xs whitespace-nowrap">
                                            <Tag className="h-2.5 w-2.5 text-slate-400" />
                                            {equipmentSlotLabel(selected.slot || '', String(selected.equipmentType || ''))}
                                        </span>
                                        {selectedDetails.equipmentTypeLabel && (
                                            <span className="shrink-0 rounded-full border border-orange-200/70 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700 shadow-2xs whitespace-nowrap">
                                                {selectedDetails.equipmentTypeLabel}
                                            </span>
                                        )}
                                        {selected.grip === 'two_handed' && (
                                            <span className="shrink-0 rounded-full border border-slate-200/60 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-2xs whitespace-nowrap">
                                                双手
                                            </span>
                                        )}
                                        {selectedDetails.isBossOnly && (
                                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/80 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 shadow-2xs whitespace-nowrap">
                                                <BossCrownIcon className="h-2.5 w-2.5 text-amber-600 shrink-0" />
                                                Boss专属
                                            </span>
                                        )}
                                    </div>

                                    {selectedDetails.isAcquired && (
                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 shadow-2xs whitespace-nowrap">
                                            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                                            已获得
                                        </span>
                                    )}
                                </div>

                                <div className="my-2 flex h-24 w-24 items-center justify-center rounded-2xl border border-white/80 bg-white/90 shadow-sm">
                                    <EquipmentPortrait equipmentId={selected.id} name={selected.name} slot={selected.slot} equipmentType={selected.equipmentType} bossOnly={selectedDetails.isBossOnly} className="h-full w-full" />
                                </div>

                                <h3 className="text-base font-bold text-slate-800 tracking-tight">{selected.name}</h3>

                                <EquipmentMetaSpecs
                                    levelMin={Number(selected.levelMin || 1)}
                                    levelMax={Number(selected.levelMax || selected.levelMin || 1)}
                                    slot={selected.slot}
                                    element={selected.element}
                                    allowedProfessionLabel={selectedDetails.allowedProfessionLabel}
                                    professions={selectedDetails.permittedProfessions}
                                    requiredMastery={selectedDetails.requiredMasteryName}
                                />
                            </div>

                            {/* 基础属性与成长路线 */}
                            <div className="space-y-1.5">
                                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                    <Shield className="h-3.5 w-3.5 text-slate-400" />
                                    白装基础属性与每级成长
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

                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
