import {useEffect, useRef, useState} from 'react';
import {Check, Crosshair, Film, ImagePlus, Pause, Play, RotateCcw, Scissors, Upload} from 'lucide-react';
import type {FrameName} from '../campWorld/art';
import type {ResidentId} from '../campWorld/types';
import {PixelPreview} from './AssetLibrary';
import {Switch} from './ObjectInspector';
import type {StudioArt} from './types';

const actions:{id:string;name:string;frames:FrameName[]}[]=[
    {id:'idle',name:'待机',frames:['idle']},{id:'walk',name:'行走',frames:['walk0','walk1','walk2','walk1']},
    {id:'wave',name:'打招呼',frames:['wave','idle']},{id:'sit',name:'坐下',frames:['sit']},
    {id:'roast',name:'烤棉花糖',frames:['roast','happy']},{id:'happy',name:'开心',frames:['happy','idle']},
];
const frameNames:FrameName[]=['idle','walk0','walk1','walk2','wave','sit','roast','happy'];
const labels=['待机','行走 01','行走 02','行走 03','招手','坐下','烤棉花糖','开心'];

function sliceSheet(image:HTMLImageElement,columns:number,rows:number):HTMLCanvasElement[] {
    return Array.from({length:columns*rows},(_,i)=>{
        const canvas=document.createElement('canvas');canvas.width=Math.floor(image.width/columns);canvas.height=Math.floor(image.height/rows);
        canvas.getContext('2d')!.drawImage(image,(i%columns)*canvas.width,Math.floor(i/columns)*canvas.height,canvas.width,canvas.height,0,0,canvas.width,canvas.height);return canvas;
    });
}

export function SpriteLab({art}:{art:StudioArt}) {
    const [resident,setResident]=useState<ResidentId>('klee'),[action,setAction]=useState('walk'),[fps,setFps]=useState(7),[playing,setPlaying]=useState(true),[anchor,setAnchor]=useState(true),[flipped,setFlipped]=useState(false),[index,setIndex]=useState(0);
    const [upload,setUpload]=useState<HTMLImageElement|null>(null),[uploadName,setUploadName]=useState(''),[customFrames,setCustomFrames]=useState<HTMLCanvasElement[]>([]),[columns,setColumns]=useState(4),[rows,setRows]=useState(2),[error,setError]=useState('');
    const canvas=useRef<HTMLCanvasElement>(null),input=useRef<HTMLInputElement>(null);
    const sequence=upload?customFrames:actions.find(a=>a.id===action)!.frames.map(name=>art.characters[resident][name]);
    const frames=upload?customFrames:frameNames.map(name=>art.characters[resident][name]);
    const current=sequence[index%Math.max(1,sequence.length)];
    useEffect(()=>{
        if(!playing||sequence.length<2)return;
        const timer=setInterval(()=>setIndex(i=>(i+1)%sequence.length),1000/fps);return()=>clearInterval(timer);
    },[playing,fps,sequence.length]);
    useEffect(()=>{
        const target=canvas.current;if(!target||!current)return;
        const g=target.getContext('2d')!;g.clearRect(0,0,target.width,target.height);g.imageSmoothingEnabled=false;
        const scale=Math.min(3,260/current.width,260/current.height),w=Math.round(current.width*scale),h=Math.round(current.height*scale),x=(target.width-w)/2,y=target.height-49-h;
        g.fillStyle='#b5c1ba44';g.beginPath();g.ellipse(target.width/2,target.height-49,47,6,0,0,Math.PI*2);g.fill();
        g.save();if(flipped){g.translate(x+w,y);g.scale(-1,1);}else g.translate(x,y);g.drawImage(current,0,0,w,h);g.restore();
        if(anchor){const ax=target.width/2,ay=upload?y+h:y+84*scale;g.strokeStyle='#f48d49';g.lineWidth=1;g.setLineDash([3,3]);g.beginPath();g.moveTo(ax,24);g.lineTo(ax,target.height-18);g.moveTo(55,ay);g.lineTo(target.width-55,ay);g.stroke();g.setLineDash([]);g.beginPath();g.arc(ax,ay,4,0,Math.PI*2);g.stroke();}
        target.dataset.frame=String(index%Math.max(1,sequence.length));
    },[current,anchor,flipped,upload,index,sequence.length]);
    const importSheet=(file:File|undefined)=>{
        if(!file)return;if(!['image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){setError('请选择 10MB 以内的 PNG 或 WebP 精灵图');return;}
        const url=URL.createObjectURL(file),image=new Image();
        image.onload=()=>{URL.revokeObjectURL(url);if(image.width>8192||image.height>8192){setError('图片边长请控制在 8192 像素以内');return;}setUpload(image);setCustomFrames(sliceSheet(image,columns,rows));setUploadName(file.name);setIndex(0);setError('');};
        image.onerror=()=>{URL.revokeObjectURL(url);setError('图片读取失败，请换一张图片');};image.src=url;
    };
    const recut=(nextColumns:number,nextRows:number)=>{setColumns(nextColumns);setRows(nextRows);if(upload)setCustomFrames(sliceSheet(upload,nextColumns,nextRows));setIndex(0);};
    return <div className="studio-sprite-layout">
        <aside className="studio-card studio-sprite-library"><div className="studio-panel-heading"><span><Film size={16}/>角色模板</span><small>2 位</small></div>
            <div className="studio-character-list">{(['klee','anya'] as const).map(id=><button type="button" className={!upload&&resident===id?'active':''} key={id} onClick={()=>{setResident(id);setUpload(null);setIndex(0);}}><PixelPreview source={art.characters[id].idle}/><span><strong>{id==='klee'?'可莉':'阿尼亚'}</strong><small>{id==='klee'?'小小冒险家':'读心小侦探'}</small></span>{!upload&&resident===id&&<Check size={14}/>}</button>)}</div>
            <div className="studio-panel-subheading">动作列表<span>8 张切片</span></div>
            <div className="studio-action-list">{actions.map(a=><button type="button" key={a.id} disabled={!!upload} className={action===a.id&&!upload?'active':''} onClick={()=>{setAction(a.id);setIndex(0);setPlaying(true);}}><span>{a.name}</span><small>{a.frames.length===1?'静态姿态':`${a.frames.length} 帧循环`}</small></button>)}</div>
            <div className="studio-library-tip"><Scissors size={18}/><strong>图片切片 → 动作播放</strong><p>示例角色沿用已制作的切片。也可以导入自己的精灵图，按行列切开预览。</p></div>
            <button type="button" className="studio-outline-button" onClick={()=>input.current?.click()}><ImagePlus size={14}/>导入精灵图</button><input ref={input} hidden type="file" accept="image/png,image/webp" onChange={e=>{importSheet(e.target.files?.[0]);e.target.value='';}}/>
        </aside>
        <section className="studio-sprite-main">
            <div className="studio-card studio-animation-card"><div className="studio-panel-heading"><span>动作预览<small>{upload?uploadName:resident==='klee'?'可莉 / 横版角色':'阿尼亚 / 横版角色'}</small></span><span className="studio-small-badge">正视 · 左右朝向</span></div>
                <div className="studio-animation-stage"><span className="studio-animation-watermark">CHARACTER WORKSHOP</span><canvas ref={canvas} width={560} height={340} aria-label="角色动作预览"/><span className="studio-anchor-label">{anchor?'＋ 脚底锚点':'像素比例保持清晰'}</span></div>
                <div className="studio-playback"><div><button type="button" aria-label={playing?'暂停动作':'播放动作'} className="studio-play-circle" onClick={()=>setPlaying(!playing)}>{playing?<Pause size={15}/>:<Play size={15}/>}</button><button type="button" className="studio-icon-button" aria-label="重播动作" onClick={()=>setIndex(0)}><RotateCcw size={14}/></button><strong>{upload?'切片序列':actions.find(a=>a.id===action)!.name}</strong><span>FRAME {String(index%Math.max(1,sequence.length)+1).padStart(2,'0')} / {String(sequence.length).padStart(2,'0')}</span></div><span>{fps} FPS</span></div>
            </div>
            <div className="studio-card studio-frames-card"><div className="studio-panel-heading"><span><Scissors size={14}/>切片预览</span><small>{upload?`${columns} 列 × ${rows} 行`:'已对齐脚底 · 88 × 88 px / 帧'}</small></div><div className="studio-frames">{frames.map((frame,i)=><button type="button" key={i} className={frame===current?'active':''} onClick={()=>{setPlaying(false);if(upload)setIndex(i);else{const name=frameNames[i],a=actions.find(a=>a.frames.includes(name))!;setAction(a.id);setIndex(a.frames.indexOf(name));}}}><PixelPreview source={frame}/><span>{upload?`帧 ${i+1}`:labels[i]}</span></button>)}</div></div>
        </section>
        <aside className="studio-card studio-inspector"><div className="studio-panel-heading"><span>动画设置</span><Crosshair size={15}/></div>
            <div className="studio-inspector-section"><span className="studio-field-label">播放速度</span><div className="studio-fps"><input aria-label="动画帧率" type="range" min={2} max={12} value={fps} onChange={e=>setFps(Number(e.target.value))}/><strong>{fps}<small> FPS</small></strong></div>
                <div className="studio-setting-row"><span>显示脚底锚点</span><Switch checked={anchor} label="显示脚底锚点" onChange={()=>setAnchor(!anchor)}/></div><div className="studio-setting-row"><span>水平翻转</span><Switch checked={flipped} label="角色水平翻转" onChange={()=>setFlipped(!flipped)}/></div></div>
            <div className="studio-inspector-section"><div className="studio-panel-subheading">切片规则<Scissors size={13}/></div>{upload?<><div className="studio-coordinates"><label><span>列</span><input type="number" min={1} max={8} value={columns} aria-label="精灵图列数" onChange={e=>recut(Math.max(1,Math.min(8,Number(e.target.value)||1)),rows)}/></label><label><span>行</span><input type="number" min={1} max={8} value={rows} aria-label="精灵图行数" onChange={e=>recut(columns,Math.max(1,Math.min(8,Number(e.target.value)||1)))}/></label></div><p className="studio-field-note">等宽等高切片，按从左到右、从上到下播放。</p></>:<dl className="studio-sprite-spec"><div><dt>单帧画布</dt><dd>88 × 88 px</dd></div><div><dt>脚底坐标</dt><dd>44, 84</dd></div><div><dt>背景</dt><dd>原生透明</dd></div><div><dt>左右朝向</dt><dd>水平翻转</dd></div></dl>}</div>
            <div className="studio-template-explanation"><span><Upload size={15}/>生图模板的作用</span><p>先约束角色风格、帧数和排列，再检查切片与锚点。预览通过后，才能成为可用的角色模板。</p><small>此处演示素材切片与播放，未调用系统生图接口。</small></div>
            {error&&<p className="studio-upload-error" role="alert">{error}</p>}
        </aside>
    </div>;
}
