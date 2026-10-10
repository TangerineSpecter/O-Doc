import type {CombatProfile} from '../../types/api/combat';
import {effectText} from './presentation';
import {BookOpen, Flame, Sparkles, Zap} from 'lucide-react';

export default function CombatSkillsPanel({profile}: {profile: CombatProfile}) {
    const hasSkills = profile.skills.length > 0;

    return (
        <div className="space-y-3">
            {hasSkills ? (
                <div className="grid gap-2.5 sm:grid-cols-2">
                    {profile.skills.map(skill => {
                        const isPassive = skill.kind === 'passive';
                        return (
                            <article
                                key={skill.id}
                                className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs transition-all hover:border-slate-300 flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span
                                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                                                    isPassive
                                                        ? 'bg-sky-100 text-sky-600'
                                                        : 'bg-orange-100 text-orange-600'
                                                }`}
                                            >
                                                {isPassive ? (
                                                    <Zap className="h-3.5 w-3.5" />
                                                ) : (
                                                    <Flame className="h-3.5 w-3.5" />
                                                )}
                                            </span>
                                            <strong className="text-xs font-bold text-slate-800 truncate">
                                                {skill.name}
                                            </strong>
                                        </div>
                                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                            Lv.{skill.rank}
                                        </span>
                                    </div>

                                    {/* 消耗与类型 */}
                                    <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                                        <span
                                            className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                                                isPassive
                                                    ? 'bg-sky-50 text-sky-700 border border-sky-200/60'
                                                    : 'bg-orange-50 text-orange-700 border border-orange-200/60'
                                            }`}
                                        >
                                            {isPassive ? '被动技能' : '主动技能'}
                                        </span>
                                        {!isPassive && (
                                            <span>
                                                消耗 {skill.parameters.currentCost} MP · 冷却 {skill.parameters.cooldownRounds} 回合
                                            </span>
                                        )}
                                    </div>

                                    {/* 效果描述 */}
                                    <div className="mt-2.5 space-y-1">
                                        {skill.effects.map((effect, idx) => (
                                            <div
                                                key={idx}
                                                className="rounded-md bg-slate-50/80 px-2 py-1 text-[11px] text-slate-600 border border-slate-100"
                                            >
                                                {effectText(effect)}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 mb-3">
                        <BookOpen className="h-6 w-6" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-800">暂无已领悟技能</h4>
                    <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                        居民当前处于新手阶段。当角色等级达到 <strong>Lv.10</strong> 并在探索返回后完成一转，即可自动领悟专属职业技能！
                    </p>
                    {profile.promotionOptions.length > 0 && (
                        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs text-amber-800 border border-amber-200">
                            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                            <span>可选转职分支：{profile.promotionOptions.map(row => row.name).join('、')}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
