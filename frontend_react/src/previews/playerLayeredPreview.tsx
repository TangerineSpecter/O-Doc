import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import './slimePreview.css';
import './playerLayeredPreview.css';
import {LayeredPlayerStage} from './layeredPlayer/LayeredPlayerStage';
import {auraNames,initialLayeredOptions,outfitArts,independentWeapons} from '../components/Combat/animation/playerAppearance/layeredPlayerArt';
import type {LayeredPlayerOptions,ProfessionAuraId} from '../components/Combat/animation/playerAppearance/layeredPlayerArt';
import {familyNames} from '../components/Combat/art/professionConcepts';
import type {ConceptFamily} from '../components/Combat/art/professionConcepts';
import {playerSheetUrl} from '../components/Combat/art/playerVisuals';
import {getProfessionAura} from '../components/Combat/art/professionAuras';

const layerOptions=[
    ['showGround','脚下光环','独立于鞋和防具'],
    ['showRear','背后职业效果','火焰、圣光与光点'],
    ['showBody','人物底模','固定新手的脸、手脚与比例'],
    ['showOutfit','服装层','单独替换衣服与披肩'],
    ['showWeapon','武器层','随选择替换，保留人物'],
] as const;
const presets=[
    {name:'炎术师',aura:'flame',outfit:'job.pyromancer',description:'浮焰与暖金辉光'},
    {name:'牧师',aura:'holy',outfit:'job.priest',description:'背后圣光与星芒'},
    {name:'圣骑士',aura:'cross',outfit:'job.paladin',description:'脚下十字光环'},
] as const;
const auraIcons:Partial<Record<ProfessionAuraId,string>>={none:'—',flame:'♨',holy:'✧',cross:'✚'};

function PlayerLayeredPreview() {
    const [options,setOptions]=useState<LayeredPlayerOptions>(()=>{
        const requestedJob=new URLSearchParams(location.search).get('job');
        const outfit=outfitArts.find(item=>item.id===requestedJob);
        return {...initialLayeredOptions,
            ...(outfit?{outfit:outfit.id,aura:getProfessionAura(outfit.id),weapon:'none' as const,backdrop:'plain' as const}:{}),
            paused:matchMedia('(prefers-reduced-motion: reduce)').matches};
    });
    const [family,setFamily]=useState<ConceptFamily|'all'>('all');
    const [keepClothes,setKeepClothes]=useState(true);
    const outfit=outfitArts.find(o=>o.id===options.outfit)!;
    const weapon=independentWeapons.find(w=>w.id===options.weapon);
    function update<K extends keyof LayeredPlayerOptions>(key:K,value:LayeredPlayerOptions[K]) {setOptions(current=>({...current,[key]:value}));}
    function preset(value:typeof presets[number]) {
        setOptions(current=>({...current,aura:value.aura,outfit:keepClothes?current.outfit:value.outfit}));
    }
    return <main className="slime-preview layered-preview">
        <header className="preview-header"><div><p className="eyebrow"><span className="orange-dot"/>角色装配<span className="edition">/ 03</span></p>
            <h1>同一个冒险者<span className="name-en">LAYERED ADVENTURER</span></h1>
            <p className="intro">换衣服，换武器，职业气息依然保留。</p></div><div className="badges"><span>新手统一底模</span><span>独立组合预览</span></div></header>
        <section className="layered-presets" aria-label="职业效果快捷选择">
            {presets.map(p=><button key={p.aura} type="button" aria-pressed={options.aura===p.aura} onClick={()=>preset(p)}><span className={`layered-preset-icon icon-${p.aura}`}>{auraIcons[p.aura]}</span><span><strong>{p.name}</strong><small>{p.description}</small></span></button>)}
            <label className="layered-preserve"><input type="checkbox" checked={keepClothes} onChange={event=>setKeepClothes(event.target.checked)}/>切换职业效果时保留衣服</label>
        </section>
        <div className="layered-layout"><div>
            <LayeredPlayerStage options={options}/>
            <div className="layered-combination"><span><strong>人物</strong>新手</span><b>＋</b><span><strong>服装</strong>{options.showOutfit?outfit.name:'基础内搭'}</span><b>＋</b><span><strong>武器</strong>{options.showWeapon?weapon?.name??'空手':'隐藏'}</span><b>＋</b><span><strong>职业效果</strong>{auraNames[options.aura].split(' · ')[0]}</span></div>
            <section className="layered-wardrobe"><div className="layered-section-heading"><h2>衣服可以自由换</h2><span>职业效果保持当前选择</span></div>
                <nav className="layered-families" aria-label="服装分类">{(['all','novice','warrior','mage','ranger','priest'] as const).map(value=><button key={value} type="button" aria-pressed={value===family} onClick={()=>setFamily(value)}>{value==='all'?'全部':familyNames[value]}</button>)}</nav>
                <div className="layered-outfits">{outfitArts.filter(o=>family==='all'||o.family===family).map(o=><button type="button" key={o.id} aria-pressed={o.id===options.outfit} onClick={()=>update('outfit',o.id)}>{o.name}</button>)}</div>
                <p>原四套服装沿用已确认素材；其余服装先按统一身体框架适配。</p>
            </section>
        </div><aside className="layered-controls">
            <section className="controls-card"><div className="controls-heading"><h2>分层查看</h2><span>逐层开关</span></div>
                <div className="layered-layer-list">{layerOptions.map(([key,title,description],index)=><label key={key}><span className="layered-layer-number">0{index+1}</span><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={options[key]} onChange={e=>update(key,e.target.checked)}/></label>)}</div>
                <div className="control-divider"/><div className="layered-quick-views"><button type="button" onClick={()=>setOptions(current=>({...current,showBody:true,showOutfit:false,showWeapon:false,showRear:false,showGround:false}))}>只看底模</button><button type="button" onClick={()=>setOptions(current=>({...current,showBody:false,showOutfit:false,showWeapon:false,showRear:true,showGround:true}))}>只看职业效果</button><button type="button" onClick={()=>setOptions(current=>({...current,showBody:true,showOutfit:true,showWeapon:true,showRear:true,showGround:true}))}>完整组合</button></div>
                <div className="control-divider"/><div className="layered-effect-options" role="group" aria-label="职业效果">{(Object.keys(auraNames) as ProfessionAuraId[]).map(id=><button type="button" key={id} aria-pressed={options.aura===id} onClick={()=>update('aura',id)}><span>{auraIcons[id]}</span>{auraNames[id]}</button>)}</div>
                <div className="control-row"><span>背景</span><div className="segmented"><button type="button" aria-pressed={options.backdrop==='cave'} onClick={()=>update('backdrop','cave')}>洞窟</button><button type="button" aria-pressed={options.backdrop==='plain'} onClick={()=>update('backdrop','plain')}>素色</button></div></div>
                <button type="button" className="pause-button" onClick={()=>update('paused',!options.paused)} aria-pressed={options.paused}>{options.paused?'▶ 继续动画':'Ⅱ 暂停查看'}</button>
            </section>
            <section className="layered-identity-note"><div className="layered-identity-head"><img src={playerSheetUrl} alt="原新手的头部素材"/></div><div><strong>脸与发型来自原新手</strong><p>所有衣服共用这一份人物。脸、手脚比例与人物大小保持一致。</p></div></section>
        </aside></div>
        <section className="layered-weapon-section"><div className="layered-section-heading"><h2>独立武器</h2><span>只更换武器，不更换衣服或职业效果</span></div>
            <div className="layered-weapons"><button type="button" aria-pressed={options.weapon==='none'} onClick={()=>update('weapon','none')}><span className="layered-empty-hand">◡</span><strong>空手</strong></button>{independentWeapons.map(w=><button type="button" key={w.id} aria-pressed={options.weapon===w.id} onClick={()=>update('weapon',w.id)}><div className="layered-weapon-thumb"><div style={{aspectRatio:`${w.art.region.width}/${w.art.region.height}`}}><img src={w.art.url} alt="" style={{width:`${w.art.size.width/w.art.region.width*100}%`,height:`${w.art.size.height/w.art.region.height*100}%`,left:`${-w.art.region.x/w.art.region.width*100}%`,top:`${-w.art.region.y/w.art.region.height*100}%`}}/></div></div><strong>{w.name}</strong></button>)}</div>
        </section>
        <footer className="layered-page-footer"><span>职业氛围效果 · 与战斗技能分开</span><a href="/profession-aura-preview.html">查看全部职业动态氛围 ↗</a><a href="/profession-design-preview.html">查看上一版完整概念稿 ↗</a></footer>
    </main>;
}
createRoot(document.getElementById('root')!).render(<PlayerLayeredPreview/>);
