import {useMemo, useState} from 'react';
import {Search, X, Gem, Coins, Skull, Castle} from 'lucide-react';
import type {CombatCatalog} from '../../../types/api/combat';
import {AtlasGridCard} from './AtlasGridCard';
import {getMaterialVisual, getMonsterVisual} from './atlasIcons';

export interface MaterialAtlasViewProps {
    catalog: CombatCatalog;
}

export function MaterialAtlasView({catalog}: MaterialAtlasViewProps) {
    const tables = catalog.tables;
    const materials = tables.materials || [];
    const drops = tables.drops || [];
    const monsters = tables.monsters || [];
    const dungeonMonsters = tables.dungeonMonsters || [];
    const dungeons = tables.dungeons || [];

    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string>(materials[0]?.id || '');

    // 搜索过滤
    const visibleMaterials = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return materials;
        return materials.filter(m => {
            const matchName = (m.name || '').toLowerCase().includes(keyword);
            const matchId = (m.id || '').toLowerCase().includes(keyword);
            // 匹配掉落此材料的怪物名
            const matchedMonsters = drops
                .filter(d => d.itemId === m.id && d.itemKind === 'material')
                .some(d => {
                    const monster = monsters.find(row => row.id === d.monsterId);
                    return monster && (monster.name || '').toLowerCase().includes(keyword);
                });
            return matchName || matchId || matchedMonsters;
        });
    }, [materials, drops, monsters, search]);

    const selected = visibleMaterials.find(m => m.id === selectedId) || visibleMaterials[0] || null;

    // 选中材料的产出来源详情
    const sources = useMemo(() => {
        if (!selected) return [];
        return drops
            .filter(d => d.itemId === selected.id && d.itemKind === 'material')
            .map(d => {
                const monster = monsters.find(m => m.id === d.monsterId);
                // 出没地牢
                const dungeonNames = dungeonMonsters
                    .filter(dm => dm.monsterId === d.monsterId)
                    .map(dm => dungeons.find(dun => dun.id === dm.dungeonId)?.name)
                    .filter((n): n is string => Boolean(n));
                const bossDungeon = dungeons.find(dun => dun.bossId === d.monsterId)?.name;
                if (bossDungeon && !dungeonNames.includes(bossDungeon)) {
                    dungeonNames.push(`${bossDungeon} (首领)`);
                }

                return {
                    id: d.id,
                    monster,
                    quantityMin: d.quantityMin || 1,
                    quantityMax: d.quantityMax || 1,
                    dungeonNames,
                };
            });
    }, [selected, drops, monsters, dungeonMonsters, dungeons]);

    const visual = selected ? getMaterialVisual(selected.id, selected.name) : null;
    const VisualIcon = visual?.icon || Gem;

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            {/* 顶部搜索条 */}
            <div className="flex shrink-0 items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                    共收录 {materials.length} 种战利品材料，包含回收价值与魔物产出来源
                </span>
                <label className="relative flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-2xs transition-all focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/20 w-56">
                    <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <input
                        placeholder="搜索材料或掉落来源..."
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
                {/* 左侧网格 */}
                <div className="scrollbar-hide h-full overflow-y-auto pr-1">
                    {!visibleMaterials.length ? (
                        <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                            <Gem className="h-8 w-8 text-slate-300" />
                            <p className="mt-2 text-xs text-slate-500">未找到匹配的材料</p>
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
                            {visibleMaterials.map(mat => {
                                const isSelected = selected?.id === mat.id;
                                const itemVisual = getMaterialVisual(mat.id, mat.name);
                                const ItemIcon = itemVisual.icon;

                                return (
                                    <AtlasGridCard
                                        key={mat.id}
                                        id={mat.id}
                                        name={mat.name || mat.id}
                                        title={`${mat.name} · 等级 Lv.${mat.level} · 回收 ¥${mat.salePrice}/个`}
                                        selected={isSelected}
                                        onClick={() => setSelectedId(mat.id)}
                                        icon={<ItemIcon className={`h-8 w-8 ${itemVisual.color}`} />}
                                        bgGradient={itemVisual.bgGradient}
                                        topLeftBadge={
                                            <span className="rounded-full bg-slate-900/60 px-1 py-0.2 text-[8px] font-semibold text-white backdrop-blur-xs">
                                                Lv.{mat.level}
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
                        aria-label="材料详情"
                        className="scrollbar-hide flex h-full flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                        <div className="space-y-4">
                            {/* 顶部橱窗 */}
                            <div className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border p-4 text-center bg-gradient-to-b ${visual?.bgGradient} ${visual?.border}`}>
                                <div className="mb-2 flex w-full items-center justify-between gap-1">
                                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-2xs">
                                        <Gem className="h-2.5 w-2.5 text-slate-400" />
                                        材料 Lv.{selected.level}
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 shadow-2xs">
                                        <Coins className="h-2.5 w-2.5 text-amber-500" />
                                        回收 ¥{selected.salePrice}/个
                                    </span>
                                </div>

                                <div className="my-2 flex h-24 w-24 items-center justify-center rounded-2xl border border-white/80 bg-white/90 shadow-sm">
                                    <VisualIcon className={`h-12 w-12 ${visual?.color}`} />
                                </div>

                                <h3 className="text-base font-bold text-slate-800">{selected.name}</h3>
                                <p className="mt-1 text-xs text-slate-500 font-mono text-[11px]">{selected.id}</p>
                            </div>

                            {/* 回收定价卡片 */}
                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-1.5 text-xs">
                                <div className="flex items-center justify-between font-semibold text-slate-700">
                                    <span className="flex items-center gap-1.5">
                                        <Coins className="h-3.5 w-3.5 text-amber-500" />
                                        商店回收基准价
                                    </span>
                                    <span className="text-amber-700 font-bold">¥{selected.salePrice} / 个</span>
                                </div>
                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                    在居民背包结算或城镇回收商店可按此单价出售换取金币。
                                </p>
                            </div>

                            {/* 获取途径来源 */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <Skull className="h-3.5 w-3.5 text-slate-400" />
                                        魔物产出来源 ({sources.length})
                                    </h4>
                                    <span className="text-[10px] text-slate-400">单次掉落数量</span>
                                </div>

                                {!sources.length ? (
                                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                                        暂无掉落魔物记录
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        {sources.map(src => {
                                            const mVisual = getMonsterVisual(
                                                src.monster?.id || '',
                                                src.monster?.name,
                                                src.monster?.rank
                                            );
                                            const MIcon = mVisual.icon;

                                            return (
                                                <div
                                                    key={src.id}
                                                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/60 bg-white ${mVisual.color}`}>
                                                            <MIcon className="h-4 w-4" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-semibold text-slate-800 truncate">
                                                                    {src.monster?.name || src.id}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400">
                                                                    Lv.{src.monster?.levelMin}–{src.monster?.levelMax}
                                                                </span>
                                                            </div>
                                                            {src.dungeonNames.length > 0 && (
                                                                <p className="text-[10px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                                                                    <Castle className="h-2.5 w-2.5 text-slate-400" />
                                                                    {src.dungeonNames.join('、')}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 text-right pl-2">
                                                        <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                                            ×{src.quantityMin === src.quantityMax ? src.quantityMin : `${src.quantityMin}–${src.quantityMax}`}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
