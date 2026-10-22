import atlasUrl from '../../assets/combat/sprite-battle/klee-costumes.png';
import arenaUrl from '../../assets/combat/sprite-battle/academy-arena.png';
import moonUrl from '../../assets/combat/sprite-battle/mage_staff.png';
import infernoUrl from '../../assets/combat/sprite-battle/inferno_greatstaff.png';
import katanaUrl from '../../assets/combat/sprite-battle/blademaster_katana.png';
import {makeDummy,whiteMask} from './dummyArt';
import {outfits} from './catalog';
import type {BattleArt,SpriteFrame} from './types';

const imageAt=(url:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('战斗素材加载失败，请重试'));image.src=url;});
let pending:Promise<BattleArt>|undefined;

function cellRegion(image:HTMLImageElement,row:number,column:number){
    const x=Math.round(column*image.width/4),y=Math.round(row*image.height/3),w=Math.round((column+1)*image.width/4)-x,h=Math.round((row+1)*image.height/3)-y;
    const source=document.createElement('canvas');source.width=w;source.height=h;
    const g=source.getContext('2d',{willReadFrequently:true})!;g.drawImage(image,x,y,w,h,0,0,w,h);
    const data=g.getImageData(0,0,w,h),visited=new Uint8Array(w*h);let largest:number[]=[];
    // Ignore isolated alpha flecks around generated cells, retaining the connected character.
    for(let i=0;i<w*h;i++){
        if(visited[i]||data.data[i*4+3]<145)continue;
        const component=[i];visited[i]=1;
        for(let k=0;k<component.length;k++){
            const p=component[k],px=p%w,py=Math.floor(p/w);
            for(const n of [px>0?p-1:-1,px<w-1?p+1:-1,py>0?p-w:-1,py<h-1?p+w:-1])if(n>=0&&!visited[n]&&data.data[n*4+3]>=145){visited[n]=1;component.push(n);}
        }
        if(component.length>largest.length)largest=component;
    }
    if(largest.length<100)throw new Error('角色切片内容为空');
    const keep=new Uint8Array(w*h);let x0=w,y0=h,x1=0,y1=0;
    for(const p of largest){keep[p]=1;x0=Math.min(x0,p%w);x1=Math.max(x1,p%w);y0=Math.min(y0,Math.floor(p/w));y1=Math.max(y1,Math.floor(p/w));}
    for(let p=0;p<keep.length;p++)if(!keep[p])data.data[p*4+3]=0;
    g.putImageData(data,0,0);
    return {source,x:x0,y:y0,w:x1-x0+1,h:y1-y0+1,cellWidth:w};
}

function buildFrames(image:HTMLImageElement,row:number):SpriteFrame[]{
    const cells=[0,1,2,3].map(col=>cellRegion(image,row,col)),scale=116/cells[0].h;
    return cells.map((b,i)=>{
        const canvas=document.createElement('canvas');canvas.width=144;canvas.height=144;
        const g=canvas.getContext('2d')!;g.imageSmoothingEnabled=false;
        const dx=Math.round(72-(b.cellWidth/2-b.x)*scale),dy=Math.round(140-b.h*scale);
        g.drawImage(b.source,b.x,b.y,b.w,b.h,dx,dy,Math.round(b.w*scale),Math.round(b.h*scale));
        const hands=[{x:71,y:100},{x:42,y:79},{x:107,y:90},{x:106,y:90}];
        return {canvas,hand:hands[i]};
    });
}
export function loadBattleArt():Promise<BattleArt>{
    if(!pending)pending=Promise.all([arenaUrl,atlasUrl,moonUrl,infernoUrl,katanaUrl].map(imageAt)).then(([background,atlas,moon,inferno,katana])=>{
        const dummy=makeDummy();return {background,frames:Object.fromEntries(outfits.map(o=>[o.id,buildFrames(atlas,o.row)])) as BattleArt['frames'],weapons:{moon,inferno,katana},dummy,dummyFlash:whiteMask(dummy)};
    }).catch(error=>{pending=undefined;throw error;});return pending;
}
