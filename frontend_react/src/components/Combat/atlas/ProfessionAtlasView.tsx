import {useMemo, useState} from 'react';
import {Search, X, Sparkles, BookOpen, Zap, Shield, ArrowRight} from 'lucide-react';
import type {CombatCatalog} from '../../../types/api/combat';
import {AtlasGridCard} from './AtlasGridCard';
import {getProfessionVisual} from './atlasIcons';
import {effectText} from '../presentation';

export interface ProfessionAtlasViewProps {
    catalog: CombatCatalog;
}

interface SkillRankItem {
    id: string;
    skillId: string;
    rank: string;
    requiredLevel: string;
    costBase: string;
    costPerLevel: string;
    costRankFactor: string;
    cooldownRounds: string;
    description: string;
    effectsText: string;
}

interface SkillItem {
    id: string;
    name: string;
    professionId: string;
    learnLevel: string;
    kind: string;
    ranks: SkillRankItem[];
}

const stageFilters = [
    {value: 'all', label: '全部'},
    {value: '0', label: '初始 (0阶)'},
    {value: '1', label: '一转 (1阶)'},
    {value: '2', label: '二转 (2阶)'},
    {value: '3', label: '三转 (3阶)'},
] as const;

export function ProfessionAtlasView({catalog}: ProfessionAtlasViewProps) {
    const tables = catalog.tables;
    const professions = tables.professions || [];
    const skills = tables.skills || [];
    const skillLevels = tables.skillLevels || [];
    const skillEffects = tables.skillEffects || [];

    const [stageFilter, setStageFilter] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string>(professions[0]?.id || '');

    // 统计各阶数数量
    const stageCounts = useMemo(() => {
        const counts: Record<string, number> = {all: professions.length};
        for (const p of professions) {
            const st = String(p.stage ?? '0');
            counts[st] = (counts[st] || 0) + 1;
        }
        return counts;
    }, [professions]);

    // 过滤列表
    const visibleProfessions = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        return professions.filter(p => {
            const matchStage = stageFilter === 'all' || String(p.stage ?? '0') === stageFilter;
            const matchName = (p.name || '').toLowerCase().includes(keyword);
            const matchId = (p.id || '').toLowerCase().includes(keyword);
            // 搜索是否包含其技能
            const matchSkills = skills
                .filter(s => s.professionId === p.id)
                .some(s => (s.name || '').toLowerCase().includes(keyword));
            return matchStage && (matchName || matchId || matchSkills);
        });
    }, [professions, stageFilter, search, skills]);

    const selected = visibleProfessions.find(p => p.id === selectedId) || visibleProfessions[0] || null;

    // 职业进阶路径
    const promotionPath = useMemo(() => {
        if (!selected) return [];
        const path: typeof professions = [];
        let curr: (typeof professions)[0] | undefined = selected;
        while (curr) {
            path.unshift(curr);
            curr = curr.parentId ? professions.find(p => p.id === curr?.parentId) : undefined;
        }
        return path;
    }, [selected, professions]);

    // 属于该职业的技能列表
    const currentSkills = useMemo<SkillItem[]>(() => {
        if (!selected) return [];
        return skills
            .filter(s => s.professionId === selected.id)
            .map(skill => {
                const ranks: SkillRankItem[] = skillLevels
                    .filter(r => r.skillId === skill.id)
                    .map(rank => {
                        const effects = skillEffects.filter(f => f.skillLevelId === rank.id);
                        return {
                            id: rank.id,
                            skillId: String(rank.skillId || ''),
                            rank: String(rank.rank || '1'),
                            requiredLevel: String(rank.requiredLevel || '1'),
                            costBase: String(rank.costBase || '0'),
                            costPerLevel: String(rank.costPerLevel || '0'),
                            costRankFactor: String(rank.costRankFactor || '1'),
                            cooldownRounds: String(rank.cooldownRounds || '0'),
                            description: String(rank.description || ''),
                            effectsText: effects.map(effectText).join('；'),
                        };
                    });
                return {
                    id: skill.id,
                    name: String(skill.name || skill.id),
                    professionId: String(skill.professionId || ''),
                    learnLevel: String(skill.learnLevel || '1'),
                    kind: String(skill.kind || 'active'),
                    ranks,
                };
            });
    }, [selected, skills, skillLevels, skillEffects]);

    const visual = selected
        ? getProfessionVisual(selected.id, selected.name, selected.parentId, selected.stage)
        : null;
    const VisualIcon = visual?.icon || Sparkles;

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            {/* 顶部工具栏：阶数筛选 + 搜索条 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 border border-slate-200/50" aria-label="转职阶数筛选">
                    {stageFilters.map(tab => {
                        const count = stageCounts[tab.value] || 0;
                        const isActive = stageFilter === tab.value;
                        return (
                            <button
                                key={tab.value}
                                type="button"
                                aria-pressed={isActive}
                                onClick={() => setStageFilter(tab.value)}
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
                        placeholder="搜索职业或技能..."
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
                {/* 左侧职业网格 */}
                <div className="scrollbar-hide h-full overflow-y-auto pr-1">
                    {!visibleProfessions.length ? (
                        <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                            <BookOpen className="h-8 w-8 text-slate-300" />
                            <p className="mt-2 text-xs text-slate-500">未找到匹配的职业</p>
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
                            {visibleProfessions.map(prof => {
                                const isSelected = selected?.id === prof.id;
                                const pVisual = getProfessionVisual(prof.id, prof.name, prof.parentId, prof.stage);
                                const PIcon = pVisual.icon;
                                const stageLabel =
                                    prof.stage === '0' || prof.id === 'job.novice'
                                        ? '初始'
                                        : `${prof.stage}转`;

                                return (
                                    <AtlasGridCard
                                        key={prof.id}
                                        id={prof.id}
                                        name={prof.name || prof.id}
                                        title={`${prof.name} · ${stageLabel} · 转职 Lv.${prof.requiredLevel}`}
                                        selected={isSelected}
                                        onClick={() => setSelectedId(prof.id)}
                                        icon={<PIcon className={`h-8 w-8 ${pVisual.color}`} />}
                                        bgGradient={pVisual.bgGradient}
                                        topLeftBadge={
                                            <span className="rounded-full bg-slate-900/60 px-1 py-0.2 text-[8px] font-semibold text-white backdrop-blur-xs">
                                                Lv.{prof.requiredLevel}
                                            </span>
                                        }
                                        topRightBadge={
                                            <span className={`rounded-full px-1 py-0.2 text-[8px] font-bold ${
                                                prof.stage === '3'
                                                    ? 'bg-amber-500 text-white'
                                                    : prof.stage === '2'
                                                    ? 'bg-purple-600 text-white'
                                                    : 'bg-slate-200 text-slate-700'
                                            }`}>
                                                {stageLabel}
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
                        aria-label="职业与技能详情"
                        className="scrollbar-hide flex h-full flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                        <div className="space-y-4">
                            {/* 顶部橱窗 */}
                            <div className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border p-4 text-center bg-gradient-to-b ${visual?.bgGradient} ${visual?.border}`}>
                                <div className="mb-2 flex w-full items-center justify-between gap-1">
                                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-2xs">
                                        <Sparkles className="h-2.5 w-2.5 text-slate-400" />
                                        {selected.stage === '0' || selected.id === 'job.novice'
                                            ? '初始职业'
                                            : `${selected.stage} 阶转职`}
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-full border border-purple-200/80 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 shadow-2xs">
                                        转职等级：Lv.{selected.requiredLevel}
                                    </span>
                                </div>

                                <div className="my-2 flex h-24 w-24 items-center justify-center rounded-2xl border border-white/80 bg-white/90 shadow-sm">
                                    <VisualIcon className={`h-12 w-12 ${visual?.color}`} />
                                </div>

                                <h3 className="text-base font-bold text-slate-800">{selected.name}</h3>

                                {/* 进阶晋升路径 */}
                                {promotionPath.length > 1 && (
                                    <div className="mt-2 flex items-center justify-center gap-1 flex-wrap text-[11px] text-slate-500">
                                        {promotionPath.map((step, idx) => (
                                            <span key={step.id} className="inline-flex items-center gap-1">
                                                <span className={step.id === selected.id ? 'font-bold text-orange-600' : ''}>
                                                    {step.name}
                                                </span>
                                                {idx < promotionPath.length - 1 && (
                                                    <ArrowRight className="h-3 w-3 text-slate-300" />
                                                )}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 每级属性成长卡片 */}
                            <div className="space-y-1.5">
                                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                    <Shield className="h-3.5 w-3.5 text-slate-400" />
                                    每级属性固定成长
                                </h4>
                                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 space-y-2 text-xs">
                                    <div className="flex items-center justify-around border-b border-slate-200/60 pb-2">
                                        <div className="text-center">
                                            <span className="text-[10px] text-slate-400">生命成长 (HP)</span>
                                            <div className="font-bold text-emerald-600 text-sm">+{selected.hpGrowth}</div>
                                        </div>
                                        <div className="h-6 w-px bg-slate-200/60" />
                                        <div className="text-center">
                                            <span className="text-[10px] text-slate-400">魔力成长 (MP)</span>
                                            <div className="font-bold text-indigo-600 text-sm">+{selected.mpGrowth}</div>
                                        </div>
                                    </div>

                                    {/* 六维基础属性成长 */}
                                    <dl className="grid grid-cols-3 gap-1.5 pt-1 text-center">
                                        {[
                                            {key: 'strength', label: '力量', val: selected.strengthGrowth},
                                            {key: 'dexterity', label: '敏捷', val: selected.dexterityGrowth},
                                            {key: 'intelligence', label: '智力', val: selected.intelligenceGrowth},
                                            {key: 'vitality', label: '体质', val: selected.vitalityGrowth},
                                            {key: 'spirit', label: '精神', val: selected.spiritGrowth},
                                            {key: 'luck', label: '运气', val: selected.luckGrowth},
                                        ].map(item => (
                                            <div key={item.key} className="rounded-lg bg-white p-1.5 border border-slate-100 shadow-2xs">
                                                <dt className="text-[10px] text-slate-400">{item.label}</dt>
                                                <dd className="font-bold text-slate-700 text-xs mt-0.5">+{item.val || 0}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                </div>
                            </div>

                            {/* 专属职业技能 */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                                        职业技能 ({currentSkills.length})
                                    </h4>
                                    <span className="text-[10px] text-slate-400">随等级自动解锁升级</span>
                                </div>

                                {!currentSkills.length ? (
                                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                                        该职业暂无专属技能
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {currentSkills.map(skill => (
                                            <div
                                                key={skill.id}
                                                className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5 text-xs space-y-1.5"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-bold text-slate-800">{skill.name}</span>
                                                        <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-semibold ${
                                                            skill.kind === 'passive'
                                                                ? 'bg-sky-100 text-sky-700'
                                                                : 'bg-amber-100 text-amber-800'
                                                        }`}>
                                                            {skill.kind === 'passive' ? '被动' : '主动'}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-500">
                                                        解锁：Lv.{skill.learnLevel}
                                                    </span>
                                                </div>

                                                {/* 技能阶数列表 */}
                                                <div className="space-y-1 pt-1 border-t border-slate-200/50">
                                                    {skill.ranks.map(rank => (
                                                        <details
                                                            key={rank.id}
                                                            className="group rounded-lg bg-white p-1.5 border border-slate-100 text-[11px]"
                                                        >
                                                            <summary className="flex cursor-pointer items-center justify-between font-medium text-slate-700 hover:text-orange-600">
                                                                <span>
                                                                    Rank {rank.rank} · 学习 Lv.{rank.requiredLevel}
                                                                    {skill.kind === 'active' && ` · 冷却 ${rank.cooldownRounds} 回合`}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400 group-open:rotate-90 transition-transform">
                                                                    ▸
                                                                </span>
                                                            </summary>
                                                            <div className="mt-1 pt-1 border-t border-slate-100 space-y-1 text-slate-600 leading-relaxed">
                                                                <p className="text-slate-700 font-medium">
                                                                    {rank.effectsText || '无特殊效果'}
                                                                </p>
                                                                {skill.kind === 'active' && (
                                                                    <p className="text-[10px] text-slate-400">
                                                                        基础 MP 消耗：向上取整(({rank.costBase} + {rank.costPerLevel} ×角色等级) ×{rank.costRankFactor})
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </details>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
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
