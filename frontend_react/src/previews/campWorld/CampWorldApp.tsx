import {ChevronLeft, ChevronRight, Crosshair, Flame, Fish, Footprints, Leaf, MapPin, MessageCircle, MousePointer2, Pause, Play, RotateCcw, ScanLine, Sparkles, Sun, Wind, X} from 'lucide-react';
import {ASSET_ROOT} from './art';
import {timeLabel} from './simulation';
import {findObject, RESIDENT_COLORS, RESIDENT_NAMES, worldObjects} from './worldMap';
import {useCampWorld} from './useCampWorld';
import type {ResidentId, WorldCommand, WorldSnapshot} from './types';

function Portrait({id, small = false}: {id: ResidentId; small?: boolean}) {
    return <span className={`camp-portrait camp-portrait--${id}${small ? ' camp-portrait--small' : ''}`} aria-hidden="true">
        <img src={`${ASSET_ROOT}characters.png`} alt="" draggable={false}/>
    </span>;
}

function SpeechLayer({snapshot, command}: {snapshot: WorldSnapshot; command: (command: WorldCommand) => void}) {
    const close = Math.abs(snapshot.residents[0].x - snapshot.residents[1].x) < 170;
    return <div className="camp-speech-layer">
        {snapshot.residents.filter(resident => resident.x >= snapshot.cameraX + 5 && resident.x <= snapshot.cameraX + snapshot.viewWidth - 5).map(resident => <div key={resident.id}>
            {resident.speech && <div className={`camp-speech camp-speech--${resident.id}${resident.id !== snapshot.selected ? ' camp-speech--other' : ''}`} key={resident.speech.since}
                style={{left: `clamp(var(--camp-bubble-inset), ${(resident.x - snapshot.cameraX) / snapshot.viewWidth * 100}%, calc(100% - var(--camp-bubble-inset)))`, top: `${(resident.y - 82) / 4}%`, marginTop: close && resident.id === 'anya' ? 'var(--camp-speech-lift)' : 0}}>
                <span className="camp-speech-name"><i style={{background: RESIDENT_COLORS[resident.id]}}/>{resident.name}<span>说</span></span>
                <p>{resident.speech.text}</p>
            </div>}
            <button type="button" className={`camp-name-tag${snapshot.selected === resident.id ? ' is-selected' : ''}`}
                style={{left: `${(resident.x - snapshot.cameraX) / snapshot.viewWidth * 100}%`, top: `${(resident.y + 12) / 4}%`}}
                onClick={() => command({type: 'select', id: resident.id})} aria-label={`选择${resident.name}`}>
                <i style={{background: RESIDENT_COLORS[resident.id]}}/>{resident.name}
            </button>
        </div>)}
    </div>;
}

function ResidentCards({snapshot, command}: {snapshot: WorldSnapshot; command: (command: WorldCommand) => void}) {
    return <div className="camp-residents" aria-label="营地居民">
        {snapshot.residents.map(resident => <button type="button" className={`camp-resident-card${snapshot.selected === resident.id ? ' is-selected' : ''}`}
            key={resident.id} onClick={() => command({type: 'select', id: resident.id})} aria-pressed={snapshot.selected === resident.id}>
            <Portrait id={resident.id}/>
            <span className="camp-resident-copy"><span className="camp-resident-name">{resident.name}<span className={`camp-resident-dot dot-${resident.id}`}/></span>
                <span className="camp-resident-status">{resident.pose === 'walk' ? <Footprints size={12}/> : <Sparkles size={12}/>}<span>{resident.status}</span></span>
                <span className="camp-resident-personality">{resident.id === 'klee' ? '小小冒险家 · 好奇心满格' : '读心小侦探 · 花生爱好者'}</span>
            </span>
            <span className="camp-card-select">{snapshot.selected === resident.id ? '已选择' : '选择'}</span>
        </button>)}
    </div>;
}

export function CampWorldApp() {
    const {host, snapshot, hovered, loading, error, command, retry} = useCampWorld();
    const inspected = findObject(snapshot.inspected), hoverObject = findObject(hovered);
    const selectedName = RESIDENT_NAMES[snapshot.selected];
    return <div className="camp-page">
        <nav className="camp-topbar" aria-label="当前位置"><div className="camp-wordmark"><span className="camp-logo"><Leaf size={18}/></span><strong>Agent 世界</strong><span className="camp-nav-divider"/><span>生活场景</span></div>
            <span className="camp-preview-badge"><span/>独立演示</span>
        </nav>
        <main className="camp-main">
            <header className="camp-page-heading"><div><p className="camp-eyebrow">A LITTLE WORLD, A LITTLE WONDER.</p><h1>林间慢日<span className="camp-heading-leaf">✳</span></h1><p className="camp-subtitle">晚风、棉花糖，和两个闲不住的小朋友。</p></div>
                <div className="camp-heading-meta"><span><MapPin size={13}/>三叶营地</span><span className="camp-meta-line"/><span>横版 2D · 第 01 天</span></div>
            </header>
            <section className="camp-world-card" aria-label="林间营地互动演示">
                <div className="camp-stage">
                    <div className="camp-world-host" ref={host}/>
                    {!loading && !error && <>
                        <div className="camp-weather"><Sun size={17}/><strong>{timeLabel(snapshot.time)}</strong><span>晴</span><i/><Wind size={13}/><span>微风</span></div>
                        <div className={`camp-live-badge${snapshot.paused ? ' is-paused' : ''}`}><span/>{snapshot.paused ? '时光暂停中' : '小世界正在发生'}</div>
                        <SpeechLayer snapshot={snapshot} command={command}/>
                        <button type="button" className="camp-pan-button camp-pan-left" aria-label="向左查看营地" onClick={() => command({type: 'pan', direction: -1})}><ChevronLeft size={20}/></button>
                        <button type="button" className="camp-pan-button camp-pan-right" aria-label="向右查看营地" onClick={() => command({type: 'pan', direction: 1})}><ChevronRight size={20}/></button>
                        <button type="button" className={`camp-follow-button${snapshot.following ? ' is-following' : ''}`} aria-pressed={snapshot.following} onClick={() => command({type: 'follow'})}><Crosshair size={11}/>{snapshot.following ? `跟随${selectedName}` : '恢复跟随'}<span>· 左右拖动画面</span></button>
                        {inspected && <aside className="camp-object-info" aria-label="物体信息">
                            <div className="camp-object-type"><span><span style={{background: inspected.color}}/>{inspected.kind}</span><button type="button" aria-label="关闭物体信息" onClick={() => command({type: 'closeInspector'})}><X size={15}/></button></div>
                            <h2>{inspected.name}</h2><p>{inspected.description}</p>
                            <button type="button" className="camp-object-action" onClick={() => command({type: 'interact', objectId: inspected.id})}><Footprints size={14}/>{selectedName} · {inspected.action}</button>
                        </aside>}
                        {hoverObject && !inspected && <div className="camp-hover-label"><MousePointer2 size={13}/><strong>{hoverObject.name}</strong><span>{hoverObject.action}</span></div>}
                        {snapshot.notice && <div className="camp-notice" role="status">{snapshot.notice}</div>}
                        {snapshot.debug && <div className="camp-debug-key"><span><i className="key-collision"/>阻挡范围</span><span><i className="key-click"/>物体范围</span><span><i className="key-interact"/>互动位置</span><span><i className="key-route"/>行走路线</span></div>}
                        <div className="camp-scene-caption"><span>TRIFOIL CAMPSITE</span><span>来，浪费一点美好的时间。</span></div>
                    </>}
                    {(loading || error) && <div className="camp-loading" style={{backgroundImage: `linear-gradient(#183b3055,#183b3077), url(${ASSET_ROOT}side-forest.png)`}}>
                        <Leaf size={27}/><strong>{error || '正在点亮林间的小世界…'}</strong>{error ? <button type="button" onClick={retry}>再试一次</button> : <span>可莉和阿尼亚马上就到</span>}
                    </div>}
                </div>
                <div className="camp-toolbar">
                    <div className="camp-toolbar-left"><button type="button" className="camp-auto-toggle" aria-pressed={snapshot.automatic} onClick={() => command({type: 'automatic'})}><span className={`camp-toggle-track${snapshot.automatic ? ' is-on' : ''}`}><i/></span>自由活动</button><span className="camp-tool-divider"/>
                        <button type="button" className="camp-tool-button" onClick={() => command({type: 'gather'})}><Flame size={15}/><span>一起烤棉花糖</span></button>
                        <button type="button" className="camp-tool-button" onClick={() => command({type: 'interact', objectId: 'pond'})}><Fish size={15}/><span>去钓鱼</span></button>
                    </div>
                    <div className="camp-toolbar-right"><button type="button" className={`camp-tool-button camp-debug-button${snapshot.debug ? ' is-active' : ''}`} aria-pressed={snapshot.debug} onClick={() => command({type: 'debug'})}><ScanLine size={15}/><span>物体与碰撞</span></button>
                        <span className="camp-tool-divider"/><button type="button" className="camp-speed" onClick={() => command({type: 'speed'})} aria-label={`播放速度 ${snapshot.speed} 倍`}>{snapshot.speed}×</button>
                        <button type="button" className="camp-icon-button" aria-label={snapshot.paused ? '继续活动' : '暂停活动'} onClick={() => command({type: 'pause'})}>{snapshot.paused ? <Play size={16}/> : <Pause size={16}/>}</button>
                        <button type="button" className="camp-icon-button" aria-label="重新开始营地演示" onClick={() => command({type: 'reset'})}><RotateCcw size={15}/></button>
                    </div>
                </div>
            </section>
            <div className="camp-underworld">
                <section className="camp-resident-section"><div className="camp-section-heading"><h2>今天，也在好好玩耍</h2><span>2 位营地居民</span></div><ResidentCards snapshot={snapshot} command={command}/>
                    <p className="camp-instruction"><MousePointer2 size={13}/><span>点击地面左右走，碰到障碍会跳过。拖动画面，看看街道另一边。</span></p>
                </section>
                <section className="camp-journal"><div className="camp-section-heading"><h2><MessageCircle size={14}/>营地小记</h2><span>刚刚发生</span></div>
                    <div className="camp-journal-entries" aria-live="off">{snapshot.journal.slice(0, 3).map(entry => <div className="camp-journal-entry" key={entry.id}><time>{entry.time}</time><p>{entry.text}</p></div>)}</div>
                </section>
            </div>
            <footer className="camp-footer"><span><Leaf size={12}/>把生活交给一点好奇心。</span><span>{worldObjects.length} 处可探索的地方<span className="camp-footer-separator">·</span>点击角色可以打招呼</span></footer>
        </main>
    </div>;
}
