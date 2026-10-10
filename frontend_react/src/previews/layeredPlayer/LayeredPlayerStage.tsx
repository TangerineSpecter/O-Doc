import {useEffect,useRef,useState} from 'react';
import {LayeredPlayerScene} from './LayeredPlayerScene';
import {auraNames} from '../../components/Combat/animation/playerAppearance/layeredPlayerArt';
import type {LayeredPlayerOptions} from '../../components/Combat/animation/playerAppearance/layeredPlayerArt';

export function LayeredPlayerStage({options}:{options:LayeredPlayerOptions}) {
    const host=useRef<HTMLDivElement>(null);
    const scene=useRef<LayeredPlayerScene|null>(null);
    const latest=useRef(options);latest.current=options;
    const [status,setStatus]=useState('正在装配人物与各层素材…');
    useEffect(()=>{
        const renderer=new LayeredPlayerScene(host.current!,latest.current);scene.current=renderer;
        let alive=true;
        void renderer.init().then(()=>{if(alive)setStatus('');}).catch(()=>{if(alive)setStatus('场景暂时无法加载，请刷新重试。');renderer.dispose();});
        return ()=>{alive=false;scene.current=null;renderer.dispose();};
    },[]);
    useEffect(()=>{scene.current?.configure(options);},[options]);
    return <section className="scene-card layered-scene-card">
        <div className={`layered-stage ${options.backdrop==='plain'?'plain':''}`}>
            <div className="scene-label"><span className="habitat">{options.backdrop==='cave'?'苔石洞窟':'素色对照'}</span><span className="habitat-en">SAME ADVENTURER</span></div>
            <div className="state-badge"><i/><span>{options.paused?'静态查看':'待机预览'}</span></div>
            <div ref={host} className="layered-canvas-host"/>
            {status&&<p className="layered-load" role="status">{status}</p>}
        </div>
        <footer className="scene-footer"><span>人物：已确认的新手</span><span>{auraNames[options.aura]}</span></footer>
    </section>;
}
