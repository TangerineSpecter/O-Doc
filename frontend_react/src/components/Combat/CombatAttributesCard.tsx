import {Activity, Crosshair, Sparkles, Swords} from 'lucide-react';
import {elementOrder, formatRatio} from './presentation';
import {getElementConfig} from './ElementBadge';

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
        <section className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs gap-2">
            <div className="flex shrink-0 items-center justify-between pb-1.5 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-orange-500" />
                    <span>战斗属性面板</span>
                </h4>
                <span className="text-[10px] text-slate-400">实时战斗判定</span>
            </div>

            {/* 1. 基础六维属性 (3x2 高密度胶囊，兼顾紧凑高度与多位数可读性) */}
            <div>
                <p className="text-[10px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>基础六维</span>
                </p>
                <div className="grid grid-cols-3 gap-1">
                    {baseStatsConfig.map(({key, label, abbr, theme}) => (
                        <div
                            key={key}
                            title={`${label} (${abbr}): ${attributes[key] ?? '-'}`}
                            className={`flex items-center justify-between rounded-lg border px-2 py-1 transition-all ${theme}`}
                        >
                            <span className="text-[10px] font-bold tracking-tight opacity-80">{label}</span>
                            <span className="font-mono text-xs font-extrabold">
                                {formatValue(key, attributes[key])}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* 2. 核心攻防对比 (物理/魔法双通道) */}
            <div>
                <p className="text-[10px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Swords className="w-3 h-3 text-rose-500" />
                    <span>攻防面板</span>
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                    {combatStatGroups.map(group => (
                        <div
                            key={group.title}
                            className="rounded-xl bg-slate-50/80 px-2 py-1.5 border border-slate-100 space-y-0.5"
                        >
                            {group.items.map(item => (
                                <div key={item.key} className="flex items-center justify-between text-[11px]">
                                    <span className="text-slate-500">{item.label}</span>
                                    <span className="font-mono font-bold text-slate-800">
                                        {formatValue(item.key, attributes[item.key])}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
                {attributes.healing != null && Number(attributes.healing) > 0 && (
                    <div className="mt-1 flex items-center justify-between rounded-lg bg-emerald-50/60 px-2 py-0.5 border border-emerald-100 text-[11px]">
                        <span className="text-emerald-700">治疗能力</span>
                        <span className="font-mono font-bold text-emerald-800">
                            {formatValue('healing', attributes.healing)}
                        </span>
                    </div>
                )}
            </div>

            {/* 3. 进阶判定属性 (2x2 对齐胶囊，防止长数值截断) */}
            <div>
                <p className="text-[10px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Crosshair className="w-3 h-3 text-sky-500" />
                    <span>进阶战斗判定</span>
                </p>
                <div className="grid grid-cols-2 gap-1">
                    {advancedStatKeys.map(({key, label}) => (
                        <div
                            key={key}
                            title={`${label}: ${formatValue(key, attributes[key])}`}
                            className="flex items-center justify-between rounded-lg bg-sky-50/45 px-2 py-1 border border-sky-100/80 text-[11px]"
                        >
                            <span className="text-slate-500 truncate">{label}</span>
                            <span className="font-mono font-bold text-sky-800">
                                {formatValue(key, attributes[key])}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* 4. 五系属性强化与抗性 */}
            <div>
                <p className="text-[10px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-orange-500" />
                    <span>属性强化与抗性</span>
                </p>
                <div className="space-y-1">
                    {elementOrder.map(element => {
                        const cfg = getElementConfig(element);
                        const Icon = cfg.Icon;
                        const power = attributes[`${element}Power`] ?? attributes[`${element}_power`] ?? 0;
                        const resist = attributes[`${element}Resist`] ?? attributes[`${element}_resist`] ?? 0;
                        const isWeakness = Number(resist) < -0.0001;
                        return (
                            <div
                                key={element}
                                className={`grid grid-cols-[2.2rem_1fr_1fr] items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] sm:text-[11px] shadow-2xs transition-all ${cfg.resistBg}`}
                            >
                                <span className={`flex items-center gap-1 font-bold ${cfg.resistLabelColor}`}>
                                    <Icon className={`h-3 w-3 shrink-0 ${cfg.iconColor}`} />
                                    <span>{cfg.label}</span>
                                </span>
                                <span className="text-slate-500">
                                    强化 <strong className="font-mono font-bold text-slate-800">{formatRatio(power)}</strong>
                                </span>
                                <span className="text-right text-slate-500">
                                    抗性{' '}
                                    <strong
                                        className={`font-mono font-bold ${
                                            isWeakness ? 'text-rose-600' : 'text-slate-800'
                                        }`}
                                    >
                                        {formatRatio(resist)}
                                    </strong>
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
