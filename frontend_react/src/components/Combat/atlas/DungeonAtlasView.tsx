import {useMemo, useState} from 'react';
import {Search, X, Castle, Skull, Compass, Shield, Gem} from 'lucide-react';
import type {CombatCatalog, CombatRow} from '../../../types/api/combat';
import {AtlasGridCard} from './AtlasGridCard';
import {getDungeonVisual, getMonsterVisual} from './atlasIcons';

export interface DungeonAtlasViewProps {
    catalog: CombatCatalog;
}

interface DungeonMonsterItem {
    id: string;
    dungeonId: string;
    monsterId: string;
    levelMin: string;
    levelMax: string;
    encounterWeight: string;
    monster?: CombatRow;
    dropNames: string[];
}

export function DungeonAtlasView({catalog}: DungeonAtlasViewProps) {
    const tables = catalog.tables;
    const dungeons = tables.dungeons || [];
    const dungeonMonsters = tables.dungeonMonsters || [];
    const monsters = tables.monsters || [];
    const drops = tables.drops || [];
    const materials = tables.materials || [];

    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string>(dungeons[0]?.id || '');

    // 过滤地牢
    const visibleDungeons = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return dungeons;
        return dungeons.filter(d => {
            const matchName = (d.name || '').toLowerCase().includes(keyword);
            const matchId = (d.id || '').toLowerCase().includes(keyword);
            // 检查怪物名是否匹配
            const matchedMonsters = dungeonMonsters
                .filter(dm => (dm.dungeonId || '') === d.id)
                .some(dm => {
                    const m = monsters.find(row => row.id === dm.monsterId);
                    return m && (m.name || '').toLowerCase().includes(keyword);
                });
            return matchName || matchId || matchedMonsters;
        });
    }, [dungeons, dungeonMonsters, monsters, search]);

    const selected = visibleDungeons.find(d => d.id === selectedId) || visibleDungeons[0] || null;

    // 当前地牢的怪物与 Boss 数据
    const currentMonsters = useMemo<DungeonMonsterItem[]>(() => {
        if (!selected) return [];
        return dungeonMonsters
            .filter(dm => (dm.dungeonId || '') === selected.id)
            .map(dm => {
                const monster = monsters.find(m => m.id === dm.monsterId);
                const monsterDrops = drops
                    .filter(d => d.monsterId === dm.monsterId && d.itemKind === 'material')
                    .map(d => materials.find(m => m.id === d.itemId)?.name)
                    .filter((n): n is string => Boolean(n));
                return {
                    id: dm.id,
                    dungeonId: String(dm.dungeonId || ''),
                    monsterId: String(dm.monsterId || ''),
                    levelMin: String(dm.levelMin || ''),
                    levelMax: String(dm.levelMax || ''),
                    encounterWeight: String(dm.encounterWeight || ''),
                    monster,
                    dropNames: monsterDrops,
                };
            });
    }, [selected, dungeonMonsters, monsters, drops, materials]);

    const boss = useMemo(() => {
        if (!selected) return null;
        return monsters.find(m => m.id === selected.bossId);
    }, [selected, monsters]);

    const bossDrops = useMemo(() => {
        if (!boss) return [];
        return drops
            .filter(d => d.monsterId === boss.id && d.itemKind === 'material')
            .map(d => materials.find(m => m.id === d.itemId)?.name)
            .filter((n): n is string => Boolean(n));
    }, [boss, drops, materials]);

    const visual = selected ? getDungeonVisual(selected.id) : null;
    const VisualIcon = visual?.icon || Castle;

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            {/* 顶部搜索条 */}
            <div className="flex shrink-0 items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                    共收录 {dungeons.length} 处探险地牢，包含驻守魔物分布与首领挑战规则
                </span>
                <label className="relative flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-2xs transition-all focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/20 w-56">
                    <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <input
                        placeholder="搜索地牢或怪物..."
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

            {/* 双栏布局：左侧格子网格 + 右侧详情卡片 */}
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
                {/* 左侧格子列表 */}
                <div className="scrollbar-hide h-full overflow-y-auto pr-1">
                    {!visibleDungeons.length ? (
                        <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                            <Compass className="h-8 w-8 text-slate-300" />
                            <p className="mt-2 text-xs text-slate-500">未找到匹配的地牢</p>
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
                            {visibleDungeons.map(dungeon => {
                                const isSelected = selected?.id === dungeon.id;
                                const itemVisual = getDungeonVisual(dungeon.id);
                                const ItemIcon = itemVisual.icon;

                                return (
                                    <AtlasGridCard
                                        key={dungeon.id}
                                        id={dungeon.id}
                                        name={dungeon.name || dungeon.id}
                                        title={`${dungeon.name} · 推荐 Lv.${dungeon.recommendedLevelMin}–${dungeon.recommendedLevelMax}`}
                                        selected={isSelected}
                                        onClick={() => setSelectedId(dungeon.id)}
                                        icon={<ItemIcon className={`h-8 w-8 ${itemVisual.color}`} />}
                                        bgGradient={itemVisual.bgGradient}
                                        topLeftBadge={
                                            <span className="rounded-full bg-slate-900/60 px-1 py-0.2 text-[8px] font-semibold text-white backdrop-blur-xs">
                                                Lv.{dungeon.recommendedLevelMin}
                                            </span>
                                        }
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 右侧详情面板 */}
                {selected && (
                    <section
                        aria-label="地牢详情"
                        className="scrollbar-hide flex h-full flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                        <div className="space-y-4">
                            {/* 顶部橱窗 */}
                            <div className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border p-4 text-center bg-gradient-to-b ${visual?.bgGradient} ${visual?.border}`}>
                                {/* 标签栏 */}
                                <div className="mb-2 flex w-full items-center justify-between gap-1">
                                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-2xs">
                                        <Castle className="h-2.5 w-2.5 text-slate-400" />
                                        探索地牢
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 shadow-2xs">
                                        推荐 Lv.{selected.recommendedLevelMin}–{selected.recommendedLevelMax}
                                    </span>
                                </div>

                                {/* 居中大图标 */}
                                <div className="my-2 flex h-24 w-24 items-center justify-center rounded-2xl border border-white/80 bg-white/90 shadow-sm">
                                    <VisualIcon className={`h-12 w-12 ${visual?.color}`} />
                                </div>

                                {/* 地牢标题与装备需求 */}
                                <h3 className="text-base font-bold text-slate-800">{selected.name}</h3>
                                <p className="mt-1 text-xs text-slate-500">
                                    推荐装备等级：Lv.{selected.equipmentLevelMin}–{selected.equipmentLevelMax}
                                </p>
                            </div>

                            {/* 首领 Boss 机制卡片 */}
                            {boss && (
                                <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Skull className="h-4 w-4 text-amber-600" />
                                            <span className="text-xs font-bold text-amber-900">
                                                区域首领：{boss.name}
                                            </span>
                                        </div>
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                            Lv.{selected.bossLevelMin}–{selected.bossLevelMax}
                                        </span>
                                    </div>
                                    <p className="text-xs text-amber-700 leading-relaxed">
                                        击败 <strong className="font-semibold">{selected.bossStartKills}</strong> 只普通或精英怪物后，首领遭遇概率逐渐上升，上限{' '}
                                        <strong className="font-semibold">{Number(selected.bossProbabilityCap) * 100}%</strong>。
                                    </p>
                                    {bossDrops.length > 0 && (
                                        <div className="flex items-center gap-1.5 text-[11px] text-amber-800">
                                            <Gem className="h-3 w-3 text-amber-600 shrink-0" />
                                            <span>首领材料：{bossDrops.join('、')}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 驻守怪物分布 */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <Shield className="h-3.5 w-3.5 text-slate-400" />
                                        驻守魔物分布 ({currentMonsters.length})
                                    </h4>
                                    <span className="text-[10px] text-slate-400">权重越高越常见</span>
                                </div>
                                <div className="space-y-1.5">
                                    {currentMonsters.map(cm => {
                                        const mVisual = getMonsterVisual(cm.monsterId, cm.monster?.name, cm.monster?.rank);
                                        const MIcon = mVisual.icon;
                                        return (
                                            <div
                                                key={cm.id}
                                                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-2 text-xs transition-colors hover:bg-slate-50"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/60 bg-white ${mVisual.color}`}>
                                                        <MIcon className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-semibold text-slate-800 truncate">
                                                                {cm.monster?.name || cm.monsterId}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400">
                                                                Lv.{cm.levelMin}–{cm.levelMax}
                                                            </span>
                                                        </div>
                                                        {cm.dropNames.length > 0 && (
                                                            <p className="text-[10px] text-slate-500 truncate">
                                                                掉落：{cm.dropNames.join('、')}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right pl-2">
                                                    <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                                        权重 {cm.encounterWeight}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
