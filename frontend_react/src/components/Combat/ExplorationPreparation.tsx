import {useState} from 'react';
import {Select} from '../common/Select';
import type {CombatCatalog, CombatProfile} from '../../types/api/combat';
import {AlertCircle, Compass, Flame, ShieldAlert, Sparkles} from 'lucide-react';

export default function ExplorationPreparation({
    catalog,
    profile,
    busy,
    onStart,
}: {
    catalog: CombatCatalog;
    profile: CombatProfile;
    busy: boolean;
    onStart: (constraints: Record<string, string | number>) => void;
}) {
    const recommended =
        [...catalog.tables.dungeons.filter(row => row.enabled === '1')]
            .reverse()
            .find(d => Number(d.recommendedLevelMin) <= profile.progression.level)?.id ||
        catalog.tables.dungeons[0]?.id;

    const [dungeon, setDungeon] = useState(recommended);
    const [duration, setDuration] = useState('1800');
    const [style, setStyle] = useState('style.balanced');
    const selected = catalog.tables.styles.find(row => row.id === style);

    const energyCost = 10 + 2 * Math.ceil(Number(duration) / 300);
    const isExploring = Boolean(profile.activeExplorationId);

    return (
        <section className="relative rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50/30 via-white to-amber-50/20 p-4 sm:p-5 shadow-xs">
            {/* 标题 */}
            <div className="flex items-center justify-between pb-3 border-b border-orange-100/70">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                        <Compass className="h-4 w-4" />
                    </span>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">探索出征派遣台</h3>
                        <p className="text-[11px] text-slate-500">指定目标与时长，居民将自主搭配行囊出发探索</p>
                    </div>
                </div>
                {isExploring && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700 animate-pulse">
                        <Flame className="w-3.5 h-3.5" />
                        探索进行中
                    </span>
                )}
            </div>

            {/* 下拉配置三栏 */}
            <div className="mt-3.5 grid gap-2.5 sm:grid-cols-3">
                <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">目的地地牢</label>
                    <Select
                        menuPortal
                        value={dungeon}
                        onChange={setDungeon}
                        options={catalog.tables.dungeons
                            .filter(row => row.enabled === '1')
                            .map(row => ({
                                value: row.id,
                                label: `${row.name} · Lv.${row.recommendedLevelMin}–${row.recommendedLevelMax}`,
                            }))}
                    />
                </div>
                <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">预计探索时长</label>
                    <Select
                        menuPortal
                        value={duration}
                        onChange={setDuration}
                        options={[
                            {value: '1800', label: '30 分钟（短途）'},
                            {value: '3600', label: '1 小时（标准）'},
                            {value: '7200', label: '2 小时（深度）'},
                        ]}
                    />
                </div>
                <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">作战战术风格</label>
                    <Select
                        menuPortal
                        value={style}
                        onChange={setStyle}
                        options={catalog.tables.styles
                            .filter(row => row.enabled === '1')
                            .map(row => ({value: row.id, label: row.name || row.id}))}
                    />
                </div>
            </div>

            {/* 战术与消耗详情 */}
            <div className="mt-3 rounded-xl bg-white/80 p-3 border border-orange-100/60 text-xs space-y-1.5">
                <div className="flex items-center justify-between flex-wrap gap-1 text-slate-600">
                    <span className="flex items-center gap-1 font-medium">
                        <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                        <span>预估体力消耗：<strong className="text-orange-600 font-bold">{energyCost}</strong> 体力</span>
                    </span>
                    <span className="text-[11px] text-slate-400">（如需前往市场采购补给，另需 5 体力入场）</span>
                </div>

                {selected && (
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100 text-[11px] text-slate-500 flex-wrap">
                        <span>战术倾向：普攻权重 {selected.attackWeight}</span>
                        <span>·</span>
                        <span>技能权重 {selected.skillWeight}</span>
                        <span>·</span>
                        <span>生命低于 {Math.round(Number(selected.healThreshold) * 100)}% 优先使用药剂</span>
                    </div>
                )}
            </div>

            {/* 倒地休息警告 */}
            {profile.restUntil && (
                <div className="mt-2.5 flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 border border-amber-200/60">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                    <span>该居民体力耗尽倒地，需要休息至 {new Date(profile.restUntil).toLocaleTimeString('zh-CN')}</span>
                </div>
            )}

            {/* 操作主按钮 */}
            <div className="mt-3.5 flex justify-end">
                <button
                    type="button"
                    disabled={busy || isExploring || Boolean(profile.restUntil)}
                    onClick={() => onStart({dungeonId: dungeon, durationSeconds: Number(duration), styleId: style})}
                    className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-95 disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                    {isExploring ? (
                        <>
                            <ShieldAlert className="w-4 h-4" />
                            居民正在探索中
                        </>
                    ) : (
                        <>
                            <Compass className="w-4 h-4" />
                            让居民准备出发
                        </>
                    )}
                </button>
            </div>
        </section>
    );
}
