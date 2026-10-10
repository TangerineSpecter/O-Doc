import {statLabels} from './presentation';
import {Activity, Crosshair, Sparkles, Swords} from 'lucide-react';

const baseStatKeys = ['strength', 'dexterity', 'intelligence', 'vitality', 'spirit', 'luck'];
const combatStatKeys = ['physicalAttack', 'magicAttack', 'physicalDefense', 'magicDefense', 'healing'];
const advancedStatKeys = ['accuracy', 'evasion', 'critical', 'criticalDamage'];

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
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-orange-500" />
                    <span>战斗属性面板</span>
                </h4>
            </div>

            {/* 1. 基础六维属性 */}
            <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>基础能力 (六维)</span>
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                    {baseStatKeys.map(key => (
                        <div key={key} className="rounded-lg bg-slate-50/80 p-2 text-center border border-slate-100">
                            <span className="block text-[10px] text-slate-400">{statLabels[key] || key}</span>
                            <span className="block text-xs font-bold text-slate-800 mt-0.5">
                                {formatValue(key, attributes[key])}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* 2. 核心攻防属性 */}
            <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                    <Swords className="w-3 h-3 text-rose-500" />
                    <span>攻防面板</span>
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                    {combatStatKeys.map(key => (
                        <div key={key} className="flex items-center justify-between rounded-lg bg-slate-50/80 px-2.5 py-1.5 border border-slate-100 text-xs">
                            <span className="text-[11px] text-slate-500">{statLabels[key] || key}</span>
                            <span className="font-bold text-slate-800">
                                {formatValue(key, attributes[key])}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* 3. 进阶判定属性 */}
            <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                    <Crosshair className="w-3 h-3 text-sky-500" />
                    <span>进阶战斗判定</span>
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                    {advancedStatKeys.map(key => (
                        <div key={key} className="flex items-center justify-between rounded-lg bg-sky-50/40 px-2.5 py-1.5 border border-sky-100/60 text-xs">
                            <span className="text-[11px] text-slate-500">{statLabels[key] || key}</span>
                            <span className="font-bold text-sky-800">
                                {formatValue(key, attributes[key])}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
