import {createRoot} from 'react-dom/client';
import {EquipmentPortrait} from '../../../../frontend_react/src/components/Combat/atlas/EquipmentPortrait';
import '../../../../frontend_react/src/index.css';

const elements = [['water','水'],['earth','土'],['wind','风'],['fire','火']] as const;
const weapons = [
    ['sword','长剑','long_sword'],['axe','战斧','axe'],['bow','长弓','bow'],
    ['dagger','短刃','dagger'],['mage_staff','单手法杖','mage_staff'],
    ['staff','双手法杖','two_handed_staff'],['holy_staff','圣职权杖','holy_staff'],
    ['instrument','竖琴','instrument'],
] as const;

export function Preview() {
    return <main className="mx-auto max-w-6xl space-y-5 px-5 py-8 text-slate-800">
        <header><h1 className="text-xl font-bold">四元素武器图标预览</h1>
            <p className="mt-2 text-sm text-slate-500">复用各武器已有轮廓，以右下角的元素标记区分属性。此页仅展示图标；实际掉落以当前目录为准。</p></header>
        {elements.map(([element,label])=><section key={element} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">{label}属性</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                {weapons.map(([id,name,type])=><div key={id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                    <EquipmentPortrait equipmentId={`equip.${id}.element.${element}`} name={`${label}属性${name}`} slot="weapon" equipmentType={type} className="mx-auto h-16 w-16"/>
                    <p className="mt-2 text-xs text-slate-600">{name}</p>
                </div>)}
            </div>
        </section>)}
    </main>;
}

createRoot(document.getElementById('root')!).render(<Preview/>);
