import {useMemo, useState} from 'react';
import {Search, X, Skull, Shield, CheckCircle2, Eye, EyeOff, Info, Swords, Gem, Crosshair} from 'lucide-react';
import type {CombatCatalog, CombatProfile} from '../../../types/api/combat';
import {AtlasGridCard} from './AtlasGridCard';
import {MonsterPortrait} from './MonsterPortrait';
import {RankTag, AtlasStatusBadge} from './RankBadge';
import {getMonsterHabitat} from './monsterHabitats';
import {getMonsterVisual} from './atlasIcons';
import {getMonsterPixelArt} from '../art/monsterPixelArt';
import {isMeadowMonsterId} from '../animation/meadowPixels/meadowTypes';
import {elementNotes, elementOrder, statLabels} from '../presentation';
import {ElementBadge, ElementResistCard} from '../ElementBadge';
import {equipmentDropCandidates} from './equipmentDropCandidates';

export interface MonsterAtlasViewProps {
    catalog: CombatCatalog;
    discoveries?: CombatProfile['discoveries'];
    includeDraftArt?: boolean;
    initialMonsterId?: string;
}

export function MonsterAtlasView({catalog, discoveries, includeDraftArt = false, initialMonsterId}: MonsterAtlasViewProps) {
    const tables = catalog.tables;
    const monsters = tables.monsters || [];
    const drops = tables.drops || [];
    const materials = tables.materials || [];
    const equipmentPools = tables.equipmentPools || [];
    const equipmentTemplates = tables.equipmentTemplates || [];
    const bossDrops = tables.bossDrops || [];
    const monsterActions = tables.monsterActions || [];
    const skills = tables.skills || [];
    const skillLevels = tables.skillLevels || [];
    const skillEffects = tables.skillEffects || [];
    const dungeonMonsters = tables.dungeonMonsters || [];
    const dungeons = tables.dungeons || [];

    const [rankFilter, setRankFilter] = useState<'all' | 'normal' | 'elite' | 'boss'>('all');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string>(initialMonsterId || monsters[0]?.id || '');

    // 统计各 rank 数量
    const rankCounts = useMemo(() => {
        const counts = {all: monsters.length, normal: 0, elite: 0, boss: 0};
        for (const m of monsters) {
            const rank = (m.rank || 'normal') as 'normal' | 'elite' | 'boss';
            if (counts[rank] !== undefined) counts[rank]++;
        }
        return counts;
    }, [monsters]);

    // 过滤列表
    const visibleMonsters = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        return monsters.filter(m => {
            const matchRank = rankFilter === 'all' || (m.rank || 'normal') === rankFilter;
            const matchSearch =
                !keyword ||
                (m.name || '').toLowerCase().includes(keyword) ||
                (m.id || '').toLowerCase().includes(keyword);
            return matchRank && matchSearch;
        });
    }, [monsters, rankFilter, search]);

    const selected = visibleMonsters.find(m => m.id === selectedId) || visibleMonsters[0] || null;
    const selectedPixelArt = selected && (isMeadowMonsterId(selected.id) || getMonsterPixelArt(selected.id, includeDraftArt));

    // 选中的怪物数据
    const selectedDetails = useMemo(() => {
        if (!selected) return null;

        const isDefeated = discoveries?.defeated.includes(selected.id);
        const isEncountered = discoveries?.encountered.includes(selected.id);

        // 基础属性
        const preview = catalog.monsterPreviews?.find(p => p.id === selected.id);
        const attributes = preview?.attributes || {};

        // 掉落材料
        const dropMats = drops
            .filter(d => d.monsterId === selected.id && d.itemKind === 'material')
            .map(d => materials.find(m => m.id === d.itemId)?.name)
            .filter((n): n is string => Boolean(n));

        // 掉落装备
        const dropEquips = equipmentDropCandidates(selected.id, {
            monsters, drops, equipmentPools, equipmentTemplates, dungeonMonsters, dungeons, bossDrops,
        });

        // 怪物技能
        const actions = monsterActions
            .filter(a => a.monsterId === selected.id && a.skillId)
            .map(a => {
                const name = skills.find(s => s.id === a.skillId)?.name;
                if (!name) return '';
                const levelIds = new Set(skillLevels.filter(level => level.skillId === a.skillId).map(level => level.id));
                const notes = elementNotes(skillEffects.filter(effect => levelIds.has(String(effect.skillLevelId || ''))));
                return notes.length ? `${name}（${notes.join('、')}）` : name;
            })
            .filter((n): n is string => Boolean(n));

        // 出没地牢
        const dungeonIds = dungeonMonsters.filter(dm => dm.monsterId === selected.id)
            .map(dm => dm.dungeonId).filter((id): id is string => Boolean(id));
        const dungeonNames = dungeonIds
            .map(id => dungeons.find(d => d.id === id)?.name)
            .filter((n): n is string => Boolean(n));
        // 如果是 boss
        const bossDungeon = dungeons.find(d => d.bossId === selected.id);
        if (bossDungeon) {
            dungeonIds.push(bossDungeon.id);
            if (bossDungeon.name && !dungeonNames.includes(bossDungeon.name)) dungeonNames.push(`${bossDungeon.name} (首领)`);
        }

        return {
            isDefeated,
            isEncountered,
            attributes,
            dropMats,
            dropEquips: dropEquips.length ? dropEquips.join('、') : '没有等级匹配的装备',
            actions: actions.length ? actions : ['普通攻击'],
            dungeonNames,
            habitat: getMonsterHabitat(dungeonIds),
        };
    }, [selected, discoveries, catalog.monsterPreviews, monsters, drops, materials, equipmentPools, equipmentTemplates, bossDrops, monsterActions, skills, skillLevels, skillEffects, dungeonMonsters, dungeons]);

    const visual = selected ? getMonsterVisual(selected.id, selected.name, selected.rank) : null;

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            {/* 顶部工具栏：筛选胶囊 + 搜索条 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 border border-slate-200/50" aria-label="怪物分类筛选">
                    {(
                        [
                            {value: 'all', label: '全部'},
                            {value: 'normal', label: '普通'},
                            {value: 'elite', label: '精英'},
                            {value: 'boss', label: '首领 Boss'},
                        ] as const
                    ).map(tab => {
                        const count = rankCounts[tab.value];
                        const isActive = rankFilter === tab.value;
                        return (
                            <button
                                key={tab.value}
                                type="button"
                                aria-pressed={isActive}
                                onClick={() => setRankFilter(tab.value)}
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
                        placeholder="搜索怪物名称..."
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
                {/* 左侧怪物网格 */}
                <div className="scrollbar-hide h-full overflow-y-auto p-1.5 pt-2">
                    {!visibleMonsters.length ? (
                        <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                            <Skull className="h-8 w-8 text-slate-300" />
                            <p className="mt-2 text-xs text-slate-500">未找到符合条件的怪物</p>
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
                            {visibleMonsters.map(monster => {
                                const isSelected = selected?.id === monster.id;
                                const mVisual = getMonsterVisual(monster.id, monster.name, monster.rank);
                                const isDefeated = discoveries?.defeated.includes(monster.id);
                                const isEncountered = discoveries?.encountered.includes(monster.id);

                                return (
                                    <AtlasGridCard
                                        key={monster.id}
                                        id={monster.id}
                                        name={monster.name || monster.id}
                                        title={`${monster.name} · Lv.${monster.levelMin}–${monster.levelMax} · ${isDefeated ? '已击败' : isEncountered ? '已遭遇' : '尚未遭遇'}`}
                                        selected={isSelected}
                                        completed={isDefeated}
                                        onClick={() => setSelectedId(monster.id)}
                                        icon={<MonsterPortrait monsterId={monster.id} name={monster.name} rank={monster.rank} includeDraftArt={includeDraftArt} decorative className="h-full w-full" fallbackClassName="h-8 w-8" />}
                                        bgGradient={mVisual.bgGradient}
                                        topLeftBadge={
                                            <span className="rounded-full bg-slate-900/60 px-1 py-0.2 text-[8px] font-semibold text-white backdrop-blur-xs">
                                                Lv.{monster.levelMin}
                                            </span>
                                        }
                                        topRightBadge={
                                            <AtlasStatusBadge rank={monster.rank} />
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
                        aria-label="怪物详情"
                        className="scrollbar-hide flex h-full flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                        <div className="space-y-4">
                            {/* 顶部橱窗 */}
                            <div className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border text-center ${selectedDetails.habitat ? 'bg-[#e8eee3] border-[#d5e0d7]' : `p-4 bg-gradient-to-b ${visual?.bgGradient} ${visual?.border}`}`}>
                                {/* 状态栏与品质 */}
                                <div className={`flex items-center justify-between gap-1 ${selectedDetails.habitat ? 'absolute inset-x-3 top-3 z-10' : 'mb-2 w-full'}`}>
                                    <div className="flex items-center gap-1">
                                        <RankTag rank={selected.rank} />
                                        <span className="rounded-full bg-white/90 border border-slate-200/60 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-2xs">
                                            Lv.{selected.levelMin}–{selected.levelMax}
                                        </span>
                                    </div>

                                    {/* 探索记录状态 */}
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shadow-2xs ${
                                        selectedDetails.isDefeated
                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                            : selectedDetails.isEncountered
                                            ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                                    }`}>
                                        {selectedDetails.isDefeated ? (
                                            <>
                                                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                                                已击败
                                            </>
                                        ) : selectedDetails.isEncountered ? (
                                            <>
                                                <Eye className="h-2.5 w-2.5 text-sky-600" />
                                                已遭遇
                                            </>
                                        ) : (
                                            <>
                                                <EyeOff className="h-2.5 w-2.5 text-slate-400" />
                                                尚未遭遇
                                            </>
                                        )}
                                    </span>
                                </div>

                                {/* 出没地场景与怪物形象 */}
                                <div className={selectedDetails.habitat ? 'w-full' : selectedPixelArt ? 'my-2 flex h-56 w-full items-center justify-center' : 'my-2 flex h-24 w-24 items-center justify-center rounded-2xl border border-white/80 bg-white/90 shadow-sm'}>
                                    <MonsterPortrait key={selected.id} monsterId={selected.id} name={selected.name} rank={selected.rank} includeDraftArt={includeDraftArt} animated habitat={selectedDetails.habitat} className={selectedDetails.habitat ? 'aspect-[32/25] w-full' : 'h-full w-full'} fallbackClassName={selectedDetails.habitat ? 'h-16 w-16' : undefined} />
                                </div>

                                {selectedDetails.habitat ? (
                                    <>
                                        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 top-[48%] bg-gradient-to-t from-[#172e24]/65 to-transparent" />
                                        <div className="absolute inset-x-6 bottom-5 text-left text-white">
                                            {selectedDetails.dungeonNames.length > 0 && (
                                                <p className="flex items-start gap-1.5 text-[10px] leading-relaxed tracking-[0.12em] text-[#edf0d6]">
                                                    <span aria-hidden="true" className="mt-1 h-[5px] w-[5px] shrink-0 rotate-45 bg-[#f3c472]" />
                                                    <span><span className="sr-only">出没地：</span>{selectedDetails.dungeonNames.join('、')}</span>
                                                </p>
                                            )}
                                            <h3 className="mt-1.5 text-[25px] font-bold leading-tight tracking-[0.07em] [text-shadow:0_1px_4px_#172e2455]">{selected.name}</h3>
                                        </div>
                                    </>
                                ) : (
                                    <div>
                                        <h3 className="text-base font-bold text-slate-800">{selected.name}</h3>
                                        {selectedDetails.dungeonNames.length > 0 && (
                                            <p className="mt-1 text-xs text-slate-500">
                                                出没地：{selectedDetails.dungeonNames.join('、')}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-slate-700 flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        <Swords className="h-3.5 w-3.5 text-orange-500" />
                                        攻击属性与抗性
                                    </span>
                                    <span className="text-[10px] font-normal text-slate-400">负抗性受弱点克制</span>
                                </h4>

                                <div className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-gradient-to-r from-slate-50 via-white to-slate-50/60 px-3 py-2 text-xs shadow-2xs">
                                    <span className="flex items-center gap-1.5 font-medium text-slate-600">
                                        <Crosshair className="h-3.5 w-3.5 text-slate-400" />
                                        普通攻击属性
                                    </span>
                                    <ElementBadge element={String(selectedDetails.attributes.element || '')} size="md" />
                                </div>

                                <dl className="grid grid-cols-3 gap-1.5 text-xs">
                                    {elementOrder.map(element => {
                                        const value = selectedDetails.attributes[`${element}Resist`] ?? selectedDetails.attributes[`${element}_resist`] ?? 0;
                                        return (
                                            <ElementResistCard key={element} element={element} value={value} />
                                        );
                                    })}
                                </dl>
                            </div>

                            {/* 基础属性网格 */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                    <span className="flex items-center gap-1.5">
                                        <Shield className="h-3.5 w-3.5 text-slate-400" />
                                        初始属性（最低等级）
                                    </span>
                                    <span className="text-[10px] font-normal text-slate-400">随等级动态成长</span>
                                </div>
                                <dl className="grid grid-cols-2 gap-1.5 text-xs">
                                    {Object.entries(selectedDetails.attributes)
                                        .filter(([key]) => statLabels[key] && key !== 'element' && !key.endsWith('Resist') && !key.endsWith('_resist'))
                                        .map(([key, value]) => (
                                            <div
                                                key={key}
                                                className="flex items-center justify-between rounded-xl bg-slate-50 px-2.5 py-1.5 border border-slate-100"
                                            >
                                                <dt className="text-slate-500">{statLabels[key]}</dt>
                                                <dd className="font-semibold text-slate-800">
                                                    {['accuracy', 'evasion', 'critical', 'criticalDamage'].includes(key)
                                                        ? `${(Number(value) * 100).toFixed(1)}%`
                                                        : String(value)}
                                                </dd>
                                            </div>
                                        ))}
                                </dl>
                            </div>

                            {/* 掉落与技能卡片 */}
                            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs">
                                <div className="flex items-start gap-2">
                                    <Gem className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="font-semibold text-slate-700">掉落材料：</span>
                                        <span className="text-slate-600">
                                            {selectedDetails.dropMats.length ? selectedDetails.dropMats.join('、') : '无'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2">
                                    <Shield className="h-3.5 w-3.5 text-sky-500 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="font-semibold text-slate-700">等级匹配的可能掉落装备：</span>
                                        <span className="text-slate-600">{selectedDetails.dropEquips}</span>
                                        <p className="mt-1 text-slate-400">图鉴按怪物出没等级列候选；普通怪和精英还受掉落概率影响，Boss 按首领装备规则结算。</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2">
                                    <Swords className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="font-semibold text-slate-700">行动技能：</span>
                                        <span className="text-slate-600">{selectedDetails.actions.join('、')}</span>
                                    </div>
                                </div>
                            </div>

                            {/* 掉落机制提示条 */}
                            <div className="flex items-center gap-2 rounded-xl bg-amber-50/80 px-3 py-2 text-[11px] text-amber-800 border border-amber-100">
                                <Info className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                                <span>掉落受居民累计额度限制，提前召回与重新出发不重置额度。</span>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
