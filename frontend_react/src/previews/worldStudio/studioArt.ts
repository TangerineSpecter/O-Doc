import {ASSET_ROOT, loadCampArt} from '../campWorld/art';
import type {StudioArt} from './types';

export async function loadStudioArt():Promise<StudioArt> {
    const [camp,lamp]=await Promise.all([loadCampArt(),new Promise<HTMLImageElement>((resolve,reject)=>{
        const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('路灯素材加载失败，请重试'));image.src=ASSET_ROOT+'street-lamp.png';
    })]);
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=128;
    const g=canvas.getContext('2d')!;g.imageSmoothingEnabled=false;
    const source=document.createElement('canvas');source.width=lamp.width;source.height=lamp.height;
    const sg=source.getContext('2d',{willReadFrequently:true})!;sg.drawImage(lamp,0,0);
    const data=sg.getImageData(0,0,lamp.width,lamp.height).data;
    let left=lamp.width,top=lamp.height,right=0,bottom=0;
    for(let y=0;y<lamp.height;y++)for(let x=0;x<lamp.width;x++)if(data[(y*lamp.width+x)*4+3]>110){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    if(right<left||bottom<top)throw new Error('路灯素材内容为空');
    const scale=Math.min(60/(right-left+1),128/(bottom-top+1));
    const w=Math.round((right-left+1)*scale),h=Math.round((bottom-top+1)*scale);
    g.drawImage(lamp,left,top,right-left+1,bottom-top+1,Math.round((64-w)/2),128-h,w,h);
    return {background:camp.background,objects:{...Object.fromEntries(Object.entries(camp.objects).map(([id,frame])=>[id,frame.canvas])),lamp:canvas} as StudioArt['objects'],characters:{
        klee:Object.fromEntries(Object.entries(camp.frames.klee).map(([id,frame])=>[id,frame.canvas])) as StudioArt['characters']['klee'],
        anya:Object.fromEntries(Object.entries(camp.frames.anya).map(([id,frame])=>[id,frame.canvas])) as StudioArt['characters']['anya'],
    }};
}
