import {statLabels} from './presentation';
import {Activity, Crosshair, Sparkles, Swords} from 'lucide-react';

const baseStatsConfig = [
    {key: 'strength', label: '力量', abbr: 'STR', theme: 'border-rose-200/80 bg-rose-50/60 text-rose-700'},
    {key: 'dexterity', label: '敏捷', abbr: 'DEX', theme: 'border-emerald-200/80 bg-emerald-50/60 text-emerald-700'},
    {key: 'intelligence', label: '智力', abbr: 'INT', theme: 'border-sky-200/80 bg-sky-50/60 text-sky-700'},
    {key: 'vitality', label: '体质', abbr: 'VIT', theme: 'border-amber-200/80 bg-amber-50/60 text-amber-700'},
    {key: 'spirit', label: '精神', abbr: 'SPR', theme: 'border-purple-200/80 bg-purple-50/60 text-purple-700'},
    {key: 'luck', label: '运气', abbr: 'LUK', theme: 'border-yellow-200/80 bg-yellow-50/60 text-yellow-700'},
];

const combatStatGroups = [
    {
        title: '物理攻防',
        items: [
            {key: 'physicalAttack', label: '物理攻击'},
            {key: 'physicalDefense', label: '物理防御'},
        ],
    },
    {
        title: '魔法攻防',
        items: [
            {key: 'magicAttack', label: '魔法攻击'},
            {key: 'magicDefense', label: '魔法防御'},
        ],
    },
];

const advancedStatKeys = [
    {key: 'critical', label: '暴击率'},
    {key: 'criticalDamage', label: '暴击伤害'},
    {key: 'accuracy', label: '命中率'},
    {key: 'evasion', label: '闪避率'},
];

export default function CombatAttributesCard({
    attributes,
}: {
    attributes: Record<string, number | string>;
}) {
    const formatValue = (key: string, val: number | string | undefined) => {
        if (val == null) return '-';
        if (['accuracy', 'evasion', 'critical', 'criticalDamage'].includes(key)) {
            return `${(Number(val) * 100).toFixed(1)}%`;
        }
        return String(val);
    };

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-orange-500" />
                    <span>战斗属性面板</span>
                </h4>
                <span className="text-[10px] text-slate-400">实时战斗判定参考</span>
            </div>

            {/* 1. 基础六维属性 (6宫格彩色高密度胶囊) */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        <span>基础六维</span>
                    </p>
                </div>
                <div className="grid grid-cols-6 gap-1">
                    {baseStatsConfig.map(({key, label, abbr, theme}) => (
                        <div
                            key={key}
                            title={`${label} (${abbr}): ${attributes[key] ?? '-'}`}
                            className={`flex flex-col items-center justify-center rounded-lg border py-1 px-0.5 text-center transition-all ${theme}`}
                        >
                            <span className="text-[9px] font-bold tracking-tight opacity-75">{label}</span>
                            <span className="text-xs font-extrabold mt-0.5">
                                {formatValue(key, attributes[key])}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* 2. 核心攻防对比 (物理/魔法双通道) */}
            <div>
                <p className="text-[11px] font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                    <Swords className="w-3 h-3 text-rose-500" />
                    <span>攻防面板</span>
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                    {combatStatGroups.map(group => (
                        <div key={group.title} className="rounded-xl bg-slate-50/80 p-2 border border-slate-100 space-y-1">
                            {group.items.map(item => (
                                <div key={item.key} className="flex items-center justify-between text-xs">
                                    <span className="text-[11px] text-slate-500">{item.label}</span>
                                    <span className="font-bold text-slate-800">
                                        {formatValue(item.key, attributes[item.key])}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
                {attributes.healing != null && Number(attributes.healing) > 0 && (
                    <div className="mt-1 flex items-center justify-between rounded-lg bg-emerald-50/60 px-2.5 py-1 border border-emerald-100 text-xs">
                        <span className="text-[11px] text-emerald-700">治疗能力</span>
                        <span className="font-bold text-emerald-800">{formatValue('healing', attributes.healing)}</span>
                    </div>
                )}
            </div>

            {/* 3. 进阶判定属性 (4宫格精简标签) */}
            <div>
                <p className="text-[11px] font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                    <Crosshair className="w-3 h-3 text-sky-500" />
                    <span>进阶战斗判定</span>
                </p>
                <div className="grid grid-cols-4 gap-1">
                    {advancedStatKeys.map(({key, label}) => (
                        <div
                            key={key}
                            title={`${label}: ${formatValue(key, attributes[key])}`}
                            className="rounded-lg bg-sky-50/40 p-1.5 text-center border border-sky-100/70"
                        >
                            <span className="block text-[10px] text-slate-500 truncate">{label}</span>
                            <span className="block text-[11px] font-bold text-sky-800 mt-0.5">
                                {formatValue(key, attributes[key])}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
