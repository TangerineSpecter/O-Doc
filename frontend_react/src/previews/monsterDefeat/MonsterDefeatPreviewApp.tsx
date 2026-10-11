import {useState} from 'react';
import {defeatPreviewMonsters} from './defeatPreviewArt';
import MonsterDefeatStage from './MonsterDefeatStage';
import {battleBackgroundArt} from '../../components/Combat/art/battleBackgroundArt';
import type {BattleBackdrop} from '../../components/Combat/art/battleBackgroundArt';
export default function MonsterDefeatPreviewApp() {
    const [id,setId]=useState('monster.slime');
    const [backdrop,setBackdrop]=useState<BattleBackdrop>('dungeon.abandoned_mine');
    const monster=defeatPreviewMonsters.find(item=>item.id===id)!;
    return <main className="mx-auto max-w-5xl px-4 py-8 text-slate-800 sm:px-8 sm:py-12">
        <header className="mb-7"><p className="text-xs font-semibold tracking-[.18em] text-teal-600">战斗效果 / 01</p>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">击败 · 像素消散</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">六张地图 · 像素背景第二版。切换场景看人物与环境的搭配，也可以重播击败效果。</p></header>
        <nav aria-label="选择演示怪物" className="mb-5 flex flex-wrap gap-2">
            {defeatPreviewMonsters.map(item=><button key={item.id} aria-pressed={id===item.id} onClick={()=>setId(item.id)}
                className={`rounded-full border px-4 py-2.5 text-sm transition-colors ${id===item.id?'border-orange-300 bg-orange-50 font-semibold text-orange-700':'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                {item.name}<span className="ml-2 text-[10px] opacity-60">{item.rank}</span></button>)}
        </nav>
        <p className="mb-3 text-xs font-semibold text-teal-700">{backdrop==='plain'?'简洁舞台':battleBackgroundArt[backdrop].name}<span className="ml-2 font-normal text-slate-400">背景风格预览</span></p>
        <MonsterDefeatStage key={monster.id} monster={monster} backdrop={backdrop} onBackdropChange={setBackdrop}/>
        <div className="mt-6 flex flex-wrap justify-between gap-3 text-xs leading-5 text-slate-400"><span>背景独立于角色与特效 · 当前仅作风格对照</span>
            <a href="./monster-pixel-preview.html" className="text-teal-600">返回形象预览 ↗</a></div>
    </main>;
}
