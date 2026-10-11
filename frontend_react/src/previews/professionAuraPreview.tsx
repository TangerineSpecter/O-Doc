import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {outfitArts} from '../components/Combat/animation/playerAppearance/layeredPlayerArt';
import {AuraReviewCard} from './professionAura/AuraReviewCard';
import './professionAura/professionAuraPreview.css';

const families = [{id: 'all', name: '全部职业'}, {id: 'warrior', name: '战士系'}, {id: 'mage', name: '法师系'}, {id: 'ranger', name: '游侠系'}, {id: 'priest', name: '牧师系'}] as const;
function ProfessionAuraPreview() {
    const [family, setFamily] = useState<(typeof families)[number]['id']>('all');
    const [paused, setPaused] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    const visible = outfitArts.filter(o => family === 'all' || o.family === family);
    return <main className="aura-review">
        <header className="aura-review-header"><div><p className="aura-review-eyebrow">CHARACTER ATMOSPHERE / 02</p><h1>职业的气息</h1><p>同一个冒险者，29 种流动的光与意象。</p></div><a href="/combat-atlas-preview.html">冒险图鉴 ↗</a></header>
        <section className="aura-review-note"><strong>职业氛围，与装备和技能独立</strong><p>战意、浮焰、羽迹、祷光。辉光缓慢呼吸，意象各有节奏；点击卡片右下角可单独查看、换衣服和武器。</p></section>
        <div className="aura-review-toolbar"><nav aria-label="职业效果分类">{families.map(f => <button key={f.id} type="button" aria-pressed={family === f.id} onClick={() => setFamily(f.id)}>{f.name}</button>)}</nav><button type="button" className="aura-review-pause" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? '▶ 继续动画' : 'Ⅱ 暂停动画'}</button></div>
        <section className="aura-review-grid" aria-label="职业动态总览">{visible.map(outfit => <AuraReviewCard key={outfit.id} outfit={outfit} paused={paused}/>)}</section>
        <footer className="aura-review-footer">{visible.length} 个职业 · 与图鉴、分层预览共用绘制 · 列表缩略图使用静态合成，详情播放动态效果</footer>
    </main>;
}
createRoot(document.getElementById('root')!).render(<ProfessionAuraPreview/>);
