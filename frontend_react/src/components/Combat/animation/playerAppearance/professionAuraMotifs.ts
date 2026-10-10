import {ellipse,polygon,star} from '../pixelEffectDrawing';
import type {ProfessionAuraProfile} from '../../art/professionAuras';
type Context=CanvasRenderingContext2D;

function stroke(c:Context,points:number[],color:string,width=8,alpha=.65) {
    c.save();c.globalAlpha=alpha;c.strokeStyle=color;c.lineWidth=width;c.beginPath();
    points.forEach((v,i)=>{if(i%2===0){if(i)c.lineTo(v,points[i+1]);else c.moveTo(v,points[i+1]);}});
    c.stroke();c.restore();
}
function blade(c:Context,x:number,y:number,height:number,color:string,light:string,lean=0) {
    c.save();c.translate(x,y);c.rotate(lean);
    polygon(c,[-12,0,-17,-height+40,0,-height-10,17,-height+40,12,0],color,.7);
    polygon(c,[-5,-12,-5,-height+42,0,-height,5,-height+42,5,-12],light,.8);
    polygon(c,[-44,-10,-44,-22,44,-22,44,-10],light,.75);c.restore();
}
function leaf(c:Context,x:number,y:number,size:number,color:string,light:string,angle=0) {
    c.save();c.translate(x,y);c.rotate(angle);
    polygon(c,[0,0,-size*.5,-size*.5,0,-size,size*.5,-size*.5],color,.72);
    stroke(c,[0,-6,0,-size+8],light,5,.8);c.restore();
}
function crescent(c:Context,x:number,y:number,r:number,color:string,angle=0) {
    c.save();c.translate(x,y);c.rotate(angle);c.globalAlpha=.65;c.fillStyle=color;c.beginPath();
    c.arc(0,0,r,.5,5.8);c.arc(r*.38,0,r*.82,5.7,.6,true);c.closePath();c.fill();c.restore();
}
function vine(c:Context,side:number,color:string,light:string,time:number,height=420) {
    const points:number[]=[];
    for(let i=0;i<9;i++) {const y=-i*height/8;const x=side*(185+Math.sin(i*.6+time*.2)*45);points.push(x,y);
        if(i>1)leaf(c,x,y,35+i*3,color,light,side*(i%2?.9:-.8));}
    stroke(c,points,color,9,.65);
}
function rune(c:Context,x:number,y:number,r:number,color:string,sides:number,angle=0) {
    const points:number[]=[];for(let i=0;i<=sides;i++){const a=i/sides*Math.PI*2+angle;points.push(x+Math.cos(a)*r,y+Math.sin(a)*r);}
    stroke(c,points,color,7,.6);
}

/** Each job owns a distinct silhouette, while motifs share the novice pixel grain. */
export function drawProfessionMotif(rear:Context,floor:Context,p:ProfessionAuraProfile,time:number) {
    const {shape,color,light,tier}=p;
    ellipse(floor,0,8,145+tier*24,28+tier*6,color,.16);
    switch(shape) {
        case 'compass':
            star(floor,0,5,54,color,.7);[-180,180].forEach((x,i)=>star(rear,x,-110-Math.sin(time+i)*10,10,light,.8));break;
        case 'blades':
            [-1,1].forEach(s=>blade(rear,s*224,-20,340,color,light,s*.24));break;
        case 'crescent':
            crescent(rear,0,-300,264,color,-.4);stroke(rear,[-230,-180,-175,-220,-142,-296],light,9,.75);break;
        case 'rampart':
            [-1,1].forEach(s=>{polygon(rear,[s*170,-80,s*172,-386,s*255,-438,s*296,-368,s*274,-82],color,.46);stroke(rear,[s*206,-115,s*216,-360,s*254,-394],light,8,.7);});break;
        case 'swords':
            [-1,0,1].forEach(s=>blade(rear,s*224,-15,570-Math.abs(s)*92,color,light,s*.18));
            ellipse(floor,0,8,220,44,color,.7,5);break;
        case 'runeblade':
            rune(rear,0,-325,273,color,6,time*.06);[-1,1].forEach(s=>blade(rear,s*233,-70,366,color,light,s*-.2));break;
        case 'rage':
            [-1,1].forEach(s=>polygon(rear,[s*145,0,s*233,-145,s*218,-286,s*285,-404,s*272,-190,s*300,-70,s*233,0],color,.56));
            for(let i=0;i<3;i++)stroke(rear,[-220-i*12,-120-i*66,-270,-165-i*66],light,10,.65);break;
        case 'arcane':
            ellipse(rear,0,-310,248,248,color,.5,6);
            for(let i=0;i<4;i++){const a=i*Math.PI/2+time*.17;star(rear,Math.cos(a)*252,-310+Math.sin(a)*252,22,light,.9);}break;
        case 'elements':
            ellipse(rear,0,-300,257,257,color,.5,6);
            ['#f1b36d','#9ed9e7','#ccdc91','#c8c1ed'].forEach((c,i)=>{const a=i*Math.PI/2+time*.19;const x=Math.cos(a)*261,y=-300+Math.sin(a)*261;polygon(rear,[x,y-30,x+21,y,x,y+30,x-21,y],c,.9);});break;
        case 'triangle':
            rune(rear,0,-320,290,color,3,-Math.PI/2);rune(rear,0,-320,240,light,3,Math.PI/2);[-245,245].forEach(x=>star(rear,x,-165,18,light));break;
        case 'ice':
            [-240,-180,180,240].forEach((x,i)=>{const h=285+i%2*135;polygon(rear,[x-30,4,x-24,-h+35,x,-h,x+24,-h+35,x+30,4],color,.65);stroke(rear,[x,0,x,-h+20],light,7,.9);});break;
        case 'eye':
            crescent(rear,0,-325,285,color,.4);polygon(rear,[-68,-576,0,-607,68,-576,0,-545],light,.75);ellipse(rear,0,-576,12,24,color,.85);break;
        case 'spirits':
            [-1,0,1].forEach((s,i)=>{const x=s*232,y=-445+(s?90:0)+Math.sin(time*1.2+i)*14;ellipse(rear,x,y,34,43,color,.7);polygon(rear,[x-24,y+22,x+24,y+22,x+36,y+56,x,y+44,x-36,y+56],color,.7);ellipse(rear,x-10,y-4,4,7,light);ellipse(rear,x+10,y-4,4,7,light);});break;
        case 'feathers':
            [-1,1].forEach(s=>{leaf(rear,s*226,-55,175,color,light,s*-.55);stroke(rear,[s*250,-315,s*282,-252,s*256,-185],light,8,.7);});break;
        case 'arrows':
            [-1,0,1].forEach(s=>{const x=s*218,y=-390+(s?55:0);stroke(rear,[x,y+285,x,y],color,9);polygon(rear,[x-25,y+27,x,y-12,x+25,y+27,x,y+14],light,.8);});break;
        case 'moon':
            crescent(rear,0,-305,264,color,.1);[-1,1].forEach(s=>blade(rear,s*216,-30,240,color,light,s*.4));break;
        case 'reticle':
            ellipse(rear,0,-305,261,220,color,.55,7);[-1,1].forEach(s=>{stroke(rear,[s*290,-305,s*230,-305],light,10);leaf(rear,s*235,-72,170,color,light,s*-.7);});stroke(rear,[0,-615,0,-551],light,9);break;
        case 'paw':
            ellipse(rear,0,-580,36,26,color,.8);[-1,0,1].forEach(s=>ellipse(rear,s*30,-626,13,18,light,.85));vine(rear,-1,color,light,time,270);vine(rear,1,color,light,time,270);break;
        case 'shadowmoons':
            [-1,0,1].forEach(s=>crescent(rear,s*215,-335-Math.abs(s)*55,125-Math.abs(s)*30,color,s*.7));
            ellipse(floor,0,8,221,43,color,.55,7);break;
        case 'cards':
            [-1,1].forEach(s=>{const x=s*240,y=-315+Math.sin(time+s)*14;polygon(rear,[x-31,y-57,x+31,y-40,x+24,y+62,x-38,y+40],color,.72);star(rear,x,y,20,light,.9);});rune(floor,0,8,80,light,4,time*.07);break;
        case 'prayer':
            ellipse(rear,0,-305,242,251,color,.5,6);ellipse(rear,0,-305,266,276,light,.55,5);
            [-1,1].forEach(s=>polygon(rear,[s*240,-30,s*208,-30,s*225,-526,s*252,-566],light,.25));break;
        case 'vines':
            vine(rear,-1,color,light,time);vine(rear,1,color,light,time);break;
        case 'wings':
            [-1,1].forEach(s=>{for(let i=0;i<5;i++){const x=s*(145+i*22),y=-140-i*51;polygon(rear,[x,y,x+s*(125-i*12),y-88,x+s*71,y+42,x,y+94],i%2?light:color,.63);}});
            ellipse(rear,0,-584,65,20,light,.85,7);break;
        case 'judgment':
            blade(rear,0,-40,574,color,light);[-1,1].forEach(s=>{stroke(rear,[s*230,-260,s*230,-510],color,8);polygon(rear,[s*180,-330,s*280,-330,s*247,-290,s*211,-290],light,.75);});break;
        case 'canopy':
            vine(rear,-1,color,light,time,440);vine(rear,1,color,light,time,440);
            [-150,-75,0,75,150].forEach((x,i)=>leaf(rear,x,-530+Math.abs(x)*.35,75,color,light,(i-2)*.32));break;
        case 'grove':
            rune(rear,0,-300,281,color,6,-Math.PI/2);rune(floor,0,8,167,light,6);
            [-1,1].forEach(s=>vine(rear,s,color,light,time,390));break;
        default:break;
    }
    // Small rising lights unify the color grain without obscuring the face.
    if(tier>0)for(let i=0;i<4+tier;i++){const t=(time*.1+i*.16)%1;const x=(i%2?1:-1)*(210+(i%3)*20);star(rear,x,-40-t*420,8,light,(1-t)*.55);}
}
