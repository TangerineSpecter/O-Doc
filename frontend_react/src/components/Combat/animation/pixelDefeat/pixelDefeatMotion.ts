/** Visual-only timing and deterministic fragments; no battle state or damage formula. */
export interface DefeatFragment {
    x:number;y:number;width:number;height:number;vx:number;vy:number;delay:number;life:number;
}
export const defeatClamp=(value:number)=>Math.max(0,Math.min(1,value));
export function createDefeatFragments(pixels:ImageData,boss:boolean):DefeatFragment[] {
    let seed=271828;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const pieces:DefeatFragment[]=[];
    for(let y=0;y<pixels.height;) {
        const height=Math.min(pixels.height-y,3+Math.floor(random()*3));
        for(let x=0;x<pixels.width;) {
            const width=Math.min(pixels.width-x,3+Math.floor(random()*5));
            let opaque=false;
            for(let py=y;py<y+height&&!opaque;py++)for(let px=x;px<x+width;px++) {
                if(pixels.data[(py*pixels.width+px)*4+3]>24){opaque=true;break;}
            }
            if(opaque) {
                const dx=(x+width/2)/pixels.width-.5,dy=(y+height/2)/pixels.height-.48;
                const angle=Math.atan2(dy,dx)+(random()-.5)*.6;
                const speed=(24+random()*72+Math.hypot(dx,dy)*32)*(boss?1.2:1);
                pieces.push({x,y,width,height,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-22-random()*25,
                    delay:random()*.07+Math.hypot(dx,dy)*.06,life:(boss?1.05:.83)+random()*.17});
            }
            x+=width;
        }
        y+=height;
    }
    return pieces;
}
export function sampleDefeatFragment(fragment:DefeatFragment,time:number) {
    const age=Math.max(0,time-fragment.delay),progress=defeatClamp(age/fragment.life);
    return {x:fragment.vx*age,y:fragment.vy*age+94*age*age,
        alpha:1-defeatClamp((progress-.3)/.7),scale:progress>.78?.5:progress>.6?.75:1};
}
