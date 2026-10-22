import type {ObjectArt, Resident, ResidentId} from './types';

export const ASSET_ROOT = `${import.meta.env.BASE_URL}previews/camp-world/`;
export type FrameName = 'idle' | 'walk0' | 'walk1' | 'walk2' | 'wave' | 'sit' | 'roast' | 'happy';
export interface PixelFrame {canvas: HTMLCanvasElement; alpha: Uint8ClampedArray}
export interface CampArt {background: HTMLImageElement; frames: Record<ResidentId, Record<FrameName, PixelFrame>>; objects: Record<ObjectArt, PixelFrame>}
const names: FrameName[] = ['idle', 'walk0', 'walk1', 'walk2', 'wave', 'sit', 'roast', 'happy'];
let pending: Promise<CampArt> | undefined;

function imageAt(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('营地素材加载失败，请刷新重试。')); image.src = url;
    });
}

function crop(image: HTMLImageElement, region: number[]): HTMLCanvasElement {
    const [x,y,w,h] = region;
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(image,x,y,w,h,0,0,w,h);
    return canvas;
}

function bounds(canvas: HTMLCanvasElement) {
    const data = canvas.getContext('2d', {willReadFrequently: true})!.getImageData(0,0,canvas.width,canvas.height).data;
    let x0=canvas.width,y0=canvas.height,x1=0,y1=0;
    for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) if(data[(y*canvas.width+x)*4+3]>110) {
        x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
    }
    return {x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};
}

function frame(canvas: HTMLCanvasElement): PixelFrame {
    return {canvas,alpha:canvas.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,canvas.width,canvas.height).data};
}

function makeFrame(image: HTMLImageElement,row: number,column: number,id: ResidentId): PixelFrame {
    const columns=[0,319,637,959,1254],rows=[0,332,643,950,1254],centers=[159,474,788,1110];
    const sx=image.width/1254,sy=image.height/1254;
    const left=Math.round(columns[column]*sx),top=Math.round(rows[row]*sy);
    const source=crop(image,[left,top,Math.round(columns[column+1]*sx)-left,Math.round(rows[row+1]*sy)-top]);
    const b=bounds(source),scale=(id==='klee'?.218:.205)/sy;
    const canvas=document.createElement('canvas');canvas.width=88;canvas.height=88;
    const g=canvas.getContext('2d')!;g.imageSmoothingEnabled=false;
    const w=Math.round(b.w*scale),h=Math.round(b.h*scale),x=Math.round(44-(centers[column]*sx-left-b.x)*scale);
    g.drawImage(source,b.x,b.y,b.w,b.h,x,84-h,w,h);
    return frame(canvas);
}

function makeObject(image: HTMLImageElement,region:number[],width:number,height:number):PixelFrame {
    const source=crop(image,region),b=bounds(source),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const g=canvas.getContext('2d')!;g.imageSmoothingEnabled=false;g.drawImage(source,b.x,b.y,b.w,b.h,0,0,width,height);
    return frame(canvas);
}

export function loadCampArt():Promise<CampArt> {
    if(!pending) pending=Promise.all(['side-forest.png','characters.png','side-objects.png'].map(name=>imageAt(ASSET_ROOT+name)))
        .then(([background,sheet,objects])=>{
            const build=(id:ResidentId,row:number)=>Object.fromEntries(names.map((name,index)=>[name,makeFrame(sheet,row+Math.floor(index/4),index%4,id)])) as Record<FrameName,PixelFrame>;
            return {background,frames:{klee:build('klee',0),anya:build('anya',2)},objects:{
                cabin:makeObject(objects,[8,90,558,590],202,213),tree:makeObject(objects,[570,25,585,660],189,218),
                bench:makeObject(objects,[1160,480,376,205],114,55),picnic:makeObject(objects,[75,725,470,270],87,49),
                fire:makeObject(objects,[630,815,380,180],68,30),rock:makeObject(objects,[1100,790,420,210],53,28),
            }};
        }).catch(error=>{pending=undefined;throw error;});
    return pending;
}

export function frameFor(art:CampArt,resident:Resident,time:number):PixelFrame {
    const frames=art.frames[resident.id];
    if(resident.pose==='walk')return frames[(['walk0','walk1','walk2','walk1'] as const)[Math.floor(resident.travel/6)%4]];
    if(resident.pose==='fish')return time-resident.actionSince>8&&time-resident.actionSince<10.7?frames.happy:frames.idle;
    if(resident.pose==='inspect')return Math.floor((time-resident.actionSince)*.7)%4===2?frames.happy:frames.idle;
    return frames[resident.pose];
}
