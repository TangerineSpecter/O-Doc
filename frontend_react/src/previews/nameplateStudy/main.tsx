import {createRoot} from 'react-dom/client';
import {Check, MapPin, Sparkles} from 'lucide-react';
import {MonsterPortrait} from '../../components/Combat/atlas/MonsterPortrait';
import {getMonsterHabitat} from '../../components/Combat/atlas/monsterHabitats';
import '../../index.css';
import './style.css';

const habitat = getMonsterHabitat(['dungeon.sprout_meadow']);
function Scene() {
    return <MonsterPortrait monsterId="monster.dawnfire_glowbug" name="晨光萤" habitat={habitat} className="study-scene" />;
}
function Badges() {
    return <div className="study-badges"><span>普通魔物 <i /> Lv.10–15</span><span className="study-defeated"><Check size={11} />已击败</span></div>;
}
function Study() {
    return <main className="nameplate-study">
        <header><div className="study-kicker">冒险图鉴 / 信息区设计</div><h1>让名字成为画面的一部分</h1><p>同一角色、同一场景，比较三种构图方式。</p></header>
        <div className="study-grid">
            <section><div className="study-label"><b>A</b><h2>场景标题</h2><span>推荐方向</span></div>
                <article className="study-card scene-title"><Scene /><Badges /><div className="scene-title-shade" /><div className="scene-title-copy"><div className="scene-title-location"><span />新芽草甸</div><h3>晨光萤</h3></div></article>
                <p className="study-note">名称落在左下角，以字号和对齐建立主次。保留完整场景，没有独立底板。</p>
            </section>
            <section><div className="study-label"><b>B</b><h2>像素游戏</h2></div>
                <article className="study-card game-title"><Scene /><Badges /><div className="game-title-copy"><div className="game-sigil"><Sparkles size={18} /></div><div><h3>晨光萤</h3><p><MapPin size={10} />新芽草甸</p></div><div className="game-title-level"><small>等级</small>10<span>–15</span></div></div></article>
                <p className="study-note">像素切角、细边框与紧凑信息条，延续游戏界面的语言，角色仍是主角。</p>
            </section>
            <section><div className="study-label"><b>C</b><h2>自然图鉴</h2></div>
                <article className="study-card field-title"><Scene /><Badges /><div className="field-title-copy"><div className="field-title-meta"><span>新芽草甸</span><span>普通魔物</span></div><div className="field-title-heading"><h3>晨光萤</h3><span>Lv.<b>10–15</b></span></div></div></article>
                <p className="study-note">场景渐隐到暖白纸面，信息左对齐；细竖线与大小字形成安静的图鉴排版。</p>
            </section>
        </div>
        <footer>视觉比较预览 · 正式页面暂不变更</footer>
    </main>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Study />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
