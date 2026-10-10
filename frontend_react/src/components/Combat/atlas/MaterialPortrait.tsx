import {useEffect,useState} from 'react';
import {isMaterialArt,materialArtProfiles} from '../art/materialVisuals';
import {drawMaterialArt} from '../art/materialArtDrawing';
import {getMaterialVisual} from './atlasIcons';
const sprites=new Map<string,string>();
function spriteFor(id:string) {
    if(!isMaterialArt(id))return;
    if(sprites.has(id))return sprites.get(id);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
    drawMaterialArt(canvas.getContext('2d')!,materialArtProfiles[id]);
    const url=canvas.toDataURL();sprites.set(id,url);return url;
}
export function MaterialPortrait({materialId,name,decorative=false,className=''}:{materialId:string;name?:string;decorative?:boolean;className?:string}) {
    const [image,setImage]=useState<{id:string;url?:string}>({id:''});
    useEffect(()=>{
        let alive=true;
        void Promise.resolve().then(()=>spriteFor(materialId)).then(url=>{if(alive)setImage({id:materialId,url});});
        return()=>{alive=false;};
    },[materialId]);
    const sprite=image.id===materialId?image.url:undefined;
    const visual=getMaterialVisual(materialId,name);const Icon=visual.icon;
    return <div className={`flex items-center justify-center ${className}`} data-material-art-id={materialId}
        role={decorative?undefined:'img'} aria-hidden={decorative||undefined} aria-label={decorative?undefined:`${name||materialId}形象`}>
        {sprite?<img src={sprite} alt="" draggable={false} className="h-[88%] w-[88%] object-contain" style={{imageRendering:'pixelated'}}/>:<Icon className={`h-10 w-10 ${visual.color}`}/>}
    </div>;
}
