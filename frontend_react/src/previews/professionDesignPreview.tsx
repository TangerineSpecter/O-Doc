import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import './slimePreview.css';
import './professionDesignPreview.css';
import {professionConcepts, weaponConcepts, familyNames} from '../components/Combat/art/professionConcepts';
import type {ConceptArt, ConceptFamily, ProfessionConcept} from '../components/Combat/art/professionConcepts';

function ConceptSprite({art}: {art: ConceptArt}) {
    const {region, size, url} = art;
    return <div className="concept-sprite" style={{aspectRatio:`${region.width}/${region.height}`}}>
        <img src={url} alt="" draggable={false} style={{width:`${size.width/region.width*100}%`,height:`${size.height/region.height*100}%`,left:`${-region.x/region.width*100}%`,top:`${-region.y/region.height*100}%`}} />
    </div>;
}
function StageLabel({concept}: {concept: ProfessionConcept}) {
    return <span className={`concept-tier tier-${concept.stage}`}>{concept.stage ? `${concept.stage} 转` : '初始'}</span>;
}
function ProfessionDesignPreview() {
    const [family,setFamily] = useState<ConceptFamily | 'all'>('all');
    const [selectedId,setSelectedId] = useState('job.warrior');
    const [weaponId,setWeaponId] = useState('equip.sword');
    const [plain,setPlain] = useState(false);
    const selected = professionConcepts.find(c=>c.id===selectedId)!;
    const weapon = weaponConcepts.find(c=>c.id===weaponId)!;
    const visible = professionConcepts.filter(c=>family==='all'||c.family===family);
    function changeFamily(value: ConceptFamily | 'all') {
        setFamily(value);
        if (value!=='all'&&selected.family!==value) setSelectedId(professionConcepts.find(c=>c.family===value)!.id);
    }
    return <main className="slime-preview profession-preview">
        <header className="preview-header">
            <div><p className="eyebrow"><span className="orange-dot"/>角色与装备<span className="edition">/ 02</span></p>
                <h1>冒险者的衣橱<span className="name-en">PIXEL ADVENTURERS</span></h1>
                <p className="intro">同一个冒险者，29 种职业外观。挑一套衣服，再看看独立的武器。</p></div>
            <div className="badges"><span>25 款新外观</span><span>5 款新武器</span></div>
        </header>
        <nav className="concept-filters" aria-label="职业路线">
            {(['all','novice','warrior','mage','ranger','priest'] as const).map(value=><button key={value} type="button" aria-pressed={family===value} onClick={()=>changeFamily(value)}>
                {value==='all'?'全部':familyNames[value]}<span>{professionConcepts.filter(c=>value==='all'||c.family===value).length}</span>
            </button>)}
        </nav>
        <div className="concept-layout">
            <section className="concept-grid" aria-label="职业外观总览">
                {visible.map(c=><button key={c.id} type="button" className={`concept-card family-${c.family}`} aria-pressed={selectedId===c.id} onClick={()=>setSelectedId(c.id)}>
                    <div className="concept-card-top"><span>Lv.{c.level}</span><StageLabel concept={c}/></div>
                    <div className="concept-card-art"><ConceptSprite art={c.art}/></div>
                    <strong>{c.name}</strong><small>{c.approved?'已确认':'新方案'}</small>
                </button>)}
            </section>
            <aside className="concept-detail" aria-label="选中的形象">
                <section className="scene-card">
                    <div className={`concept-stage ${plain?'plain':''}`}>
                        <div className="scene-label"><span className="habitat">{plain?'形象对照':'苔石洞窟'}</span><span className="habitat-en">{plain?'CHARACTER STUDY':'MOSS CAVE'}</span></div>
                        <div className="state-badge"><i/><span>{selected.approved?'已确认':'首版形象'}</span></div>
                        <div className="concept-ground-shadow"/><div className="concept-large-character"><ConceptSprite art={selected.art}/></div>
                    </div>
                    <footer className="concept-detail-footer"><div><h2>{selected.name}</h2><p>{familyNames[selected.family]} · Lv.{selected.level} · {selected.stage?`${selected.stage} 转`:'初始职业'}</p></div><StageLabel concept={selected}/></footer>
                </section>
                <div className="concept-description"><p>{selected.description}</p><span>成长路线：{selected.parent} → {selected.name}</span>
                    <div className="control-row"><span>背景</span><div className="segmented"><button type="button" aria-pressed={!plain} onClick={()=>setPlain(false)}>洞窟</button><button type="button" aria-pressed={plain} onClick={()=>setPlain(true)}>素色</button></div></div>
                </div>
                <section className="concept-weapon-detail"><div><p className="eyebrow">独立武器对照</p><h2>{weapon.name}</h2><p>{weapon.description}</p></div><div className="concept-weapon-sprite"><ConceptSprite art={weapon.art}/></div></section>
            </aside>
        </div>
        <section className="concept-weapons" aria-label="武器形象总览">
            <div className="concept-section-heading"><div><p className="eyebrow"><span className="orange-dot"/>装备形象</p><h2>六种武器，独立换装</h2></div><span>保留已确认的水晶法杖</span></div>
            <div className="concept-weapon-grid">{weaponConcepts.map(w=><button type="button" key={w.id} aria-pressed={weaponId===w.id} className="concept-card" onClick={()=>setWeaponId(w.id)}><div className="concept-weapon-card-art"><ConceptSprite art={w.art}/></div><strong>{w.name}</strong><small>{w.approved?'已确认':'新方案'}</small></button>)}</div>
            <p className="concept-weapons-note">武器随实际装备变化，职业服装保持独立。这里先看外观，持握动作在确认后制作。</p>
        </section>
        <footer className="concept-page-footer"><a href="/player-layered-preview.html">打开统一人物底模与分层组合新版 ↗</a><a href="/player-route-preview.html">打开原角色动作与技能预览 ↗</a></footer>
    </main>;
}
createRoot(document.getElementById('root')!).render(<ProfessionDesignPreview/>);
