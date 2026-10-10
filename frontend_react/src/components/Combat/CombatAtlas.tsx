import {useState} from 'react';
import type {CombatCatalog, CombatProfile} from '../../types/api/combat';
import {DungeonAtlasView} from './atlas/DungeonAtlasView';
import {MonsterAtlasView} from './atlas/MonsterAtlasView';
import {MaterialAtlasView} from './atlas/MaterialAtlasView';
import {EquipmentAtlasView} from './atlas/EquipmentAtlasView';
import {ProfessionAtlasView} from './atlas/ProfessionAtlasView';

export type CombatAtlasTab = 'dungeons' | 'monsters' | 'materials' | 'equipmentTemplates' | 'professions';

const categories: {value: CombatAtlasTab; label: string; dot: string}[] = [
    {value: 'dungeons', label: '地牢与怪物', dot: 'bg-emerald-500'},
    {value: 'monsters', label: '怪物图鉴', dot: 'bg-sky-500'},
    {value: 'materials', label: '材料图鉴', dot: 'bg-amber-500'},
    {value: 'equipmentTemplates', label: '装备图鉴', dot: 'bg-slate-400'},
    {value: 'professions', label: '职业与技能', dot: 'bg-violet-400'},
];

export default function CombatAtlas({
    catalog,
    discoveries,
}: {
    catalog: CombatCatalog;
    discoveries?: CombatProfile['discoveries'];
}) {
    const [kind, setKind] = useState<CombatAtlasTab>('dungeons');
    const tables = catalog.tables;

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            {/* 二级分类胶囊栏 */}
            <div className="scrollbar-hide shrink-0 overflow-x-auto" aria-label="冒险图鉴分类">
                <div className="flex w-max min-w-full gap-1 rounded-full border border-slate-200/60 bg-slate-100 p-1">
                    {categories.map(tab => {
                        const count = tables[tab.value]?.length || 0;
                        const isActive = kind === tab.value;
                        return (
                            <button
                                key={tab.value}
                                type="button"
                                aria-pressed={isActive}
                                onClick={() => setKind(tab.value)}
                                className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 ${
                                    isActive
                                        ? 'bg-white text-orange-600 shadow-2xs'
                                        : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
                                }`}
                            >
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tab.dot}`} />
                                <span>{tab.label}</span>
                                <span
                                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                                        isActive
                                            ? 'bg-orange-100 text-orange-700'
                                            : 'bg-slate-200/80 text-slate-500'
                                    }`}
                                >
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 图鉴主展示区：左侧网格，右侧详情 */}
            <div className="min-h-0 flex-1">
                {kind === 'dungeons' && <DungeonAtlasView catalog={catalog} />}
                {kind === 'monsters' && <MonsterAtlasView catalog={catalog} discoveries={discoveries} />}
                {kind === 'materials' && <MaterialAtlasView catalog={catalog} />}
                {kind === 'equipmentTemplates' && (
                    <EquipmentAtlasView catalog={catalog} discoveries={discoveries} />
                )}
                {kind === 'professions' && <ProfessionAtlasView catalog={catalog} />}
            </div>
        </div>
    );
}
