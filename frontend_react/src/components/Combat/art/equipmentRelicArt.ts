import {EquipmentPixelPainter} from './equipmentPixelPainter';
import type {EquipmentPalette} from './equipmentArtPalette';
import type {EquipmentArtProfile} from './equipmentArtProfile';

function ring(g:EquipmentPixelPainter,p:EquipmentPalette) {
    // An oblique gold band: open centre, dark inner wall and a raised, faceted stone setting.
    for(let y=12;y<43;y++)for(let x=7;x<40;x++) {
        const outer=((x-23)/15)**2+((y-28)/14)**2;
        const inner=((x-23)/10)**2+((y-27)/9)**2;
        if(outer>1||inner<1)continue;
        const color=outer>.87||inner<1.2?p.ink:y<23?p.goldShade:x<16?p.goldLight:y>35?p.goldShade:p.gold;
        g.rect(x,y,1,1,color);
    }
    g.line([11,29],[13,35],p.goldLight,2);g.line([16,38],[23,39],p.gold);
    g.bevel([[14,14],[19,8],[28,8],[34,14],[31,22],[17,22]],{...p,base:p.gold,shade:p.goldShade,lit:p.goldLight});
    g.poly([[18,14],[22,9],[27,10],[31,14],[28,20],[21,21],[17,18]],p.ink);
    g.poly([[19,14],[22,11],[27,11],[29,14],[27,18],[21,19],[19,17]],p.gem);
    g.poly([[19,14],[22,11],[25,11],[23,15],[19,16]],p.gemLight);
    g.poly([[24,16],[29,14],[27,18],[22,19]],p.gemShade);
    g.rect(21,12,2,2,p.shine);
    for(const [x,y]of [[17,13],[29,12],[16,19],[29,19]])g.rivet(x,y,p);
}

function feather(g:EquipmentPixelPainter,p:EquipmentPalette,x:number,y:number,mirror=false) {
    const s=mirror?-1:1,pt=(a:number,b:number):readonly[number,number]=>[x+a*s,y+b];
    g.bevel([pt(0,18),pt(-2,11),pt(1,5),pt(8,0),pt(8,7),pt(5,14)],{...p,base:p.lit,lit:p.shine,shade:p.base},false);
    g.line(pt(0,19),pt(6,4),p.goldShade);g.line(pt(2,13),pt(6,10),p.shine);
}
function head(g:EquipmentPixelPainter,p:EquipmentPalette,t:number) {
    // Each named headpiece has its own silhouette; no helmet/crown stand-in for every tier.
    if(t===0) {
        g.bevel([[6,23],[10,19],[18,17],[29,17],[38,20],[42,24],[38,29],[31,32],[16,32],[8,29]],p);
        g.poly([[11,24],[17,21],[29,21],[36,24],[31,26],[17,26]],p.deep);
        g.trim([8,25],[17,29],p);g.trim([17,29],[30,29],p);g.trim([30,29],[39,25],p);
        g.gem(24,28,5,p);g.rivet(12,27,p);g.rivet(34,27,p);
        g.poly([[7,25],[5,29],[9,32],[9,27]],p.goldShade);
    } else if(t===1) {
        feather(g,p,12,5);feather(g,p,35,10,true);
        g.bevel([[7,25],[14,22],[24,21],[34,23],[41,26],[37,33],[28,36],[17,35],[9,31]],p,false);
        g.poly([[12,26],[19,24],[29,24],[36,27],[31,29],[18,28]],p.deep);
        g.trim([9,29],[19,32],p);g.trim([19,32],[29,33],p);g.trim([29,33],[38,29],p);
        g.gem(24,32,4,p);g.rivet(12,30,p);g.rivet(35,31,p);
    } else if(t===2) {
        g.bevel([[6,27],[9,20],[13,23],[17,12],[24,18],[31,12],[35,23],[39,20],[42,28],[36,35],[13,35]],p);
        g.poly([[12,27],[18,24],[24,26],[30,24],[36,27],[32,29],[18,29]],p.deep);
        g.trim([9,29],[17,32],p);g.trim([17,32],[32,32],p);g.trim([32,32],[39,28],p);
        g.gem(24,30,5,p);g.gem(17,19,2,p);g.gem(31,19,2,p);
        g.line([14,26],[16,24],p.goldLight);g.line([34,26],[32,24],p.goldLight);
    } else {
        const sky=t===4;
        if(sky) {feather(g,p,8,8);feather(g,p,40,8,true);}
        g.bevel([[6,25],[8,14],[14,21],[16,10],[21,18],[24,5],[27,18],[32,10],[34,21],[40,14],[42,25],[37,34],[11,34]],p);
        g.poly([[11,25],[16,23],[24,26],[32,23],[37,25],[34,29],[14,29]],p.deep);
        g.trim([10,29],[16,32],p);g.trim([16,32],[32,32],p);g.trim([32,32],[38,29],p);
        g.gem(24,28,sky?6:5,p);g.gem(24,13,3,p);
        g.gem(13,27,2,p);g.gem(35,27,2,p);
        g.line([16,14],[18,20],p.goldLight);g.line([32,14],[30,20],p.goldLight);
        if(sky) {g.trim([21,20],[24,17],p);g.trim([24,17],[27,20],p);g.rect(23,7,2,2,p.shine);}
    }
}

function shield(g:EquipmentPixelPainter,p:EquipmentPalette,style:'small'|'large'|'magic') {
    if(style==='small') {
        // Oak round shield, iron hoop, visible plank grain and a domed steel boss.
        const outline=[[18,5],[30,5],[38,10],[43,18],[43,29],[38,37],[30,42],[18,42],[10,37],[5,29],[5,18],[10,10]] as const;
        const steel={...p,shade:'#535b66',base:'#8e9c9f',lit:'#c5d1ca',shine:'#f3e6bd'};
        g.bevel(outline,steel);
        g.bevel([[18,9],[29,9],[35,13],[39,20],[39,28],[35,34],[28,38],[19,38],[13,34],[9,28],[9,20],[13,13]],p,false);
        for(const x of [16,23,30])g.line([x,12],[x,36],p.shade);
        g.line([12,18],[14,25],p.lit);g.line([32,16],[34,23],p.lit);g.line([18,30],[20,34],p.lit);
        for(const [x,y]of [[15,9],[30,9],[38,17],[38,29],[30,37],[15,37],[7,27],[7,17]])g.rivet(x,y,p);
        g.bevel([[19,17],[27,17],[31,21],[31,28],[27,32],[19,32],[15,28],[15,21]],steel);
        g.bevel([[20,19],[26,19],[28,22],[28,27],[25,29],[20,28],[18,25],[18,22]],steel);
        g.rect(20,21,3,2,steel.shine);
        return;
    }
    if(style==='large') {
        g.bevel([[10,4],[37,4],[41,9],[39,29],[34,38],[24,45],[14,38],[9,29],[7,9]],p);
        g.bevel([[13,8],[34,8],[36,12],[34,28],[30,35],[24,40],[18,35],[13,28],[11,12]],{...p,base:p.shade,lit:p.base,shade:p.deep});
        g.trim([12,9],[16,30],p);g.trim([35,9],[32,30],p);g.trim([16,30],[24,39],p);g.trim([32,30],[24,39],p);
        g.bevel([[21,8],[27,8],[27,33],[24,39],[21,33]],p);
        g.bevel([[12,18],[36,18],[35,23],[13,23]],{...p,base:p.gold,shade:p.goldShade,lit:p.goldLight});
        g.gem(24,19,5,p);g.line([23,27],[23,33],p.shine);
        for(const [x,y]of [[12,8],[34,8],[14,27],[32,27],[19,34],[28,34]])g.rivet(x,y,p);
        return;
    }
    g.bevel([[24,3],[33,8],[40,13],[38,29],[31,38],[24,44],[17,38],[10,29],[8,13],[16,8]],p);
    g.bevel([[24,8],[34,15],[33,28],[24,37],[15,28],[14,15]],{...p,base:'#405c80',shade:'#2c3f60',lit:'#709cba'});
    g.trim([24,6],[37,15],p);g.trim([37,15],[35,28],p);g.trim([35,28],[24,40],p);
    g.trim([24,6],[11,15],p);g.trim([11,15],[13,28],p);g.trim([13,28],[24,40],p);
    g.poly([[24,12],[27,19],[33,23],[27,27],[24,34],[21,27],[15,23],[21,19]],p.ink);
    g.gem(24,23,7,p);
    for(const [x,y]of [[17,16],[30,16],[16,28],[31,28]]){g.line([x,y],[x+2,y+2],p.gemLight);g.rect(x,y+3,1,2,p.gem);}
    g.rivet(23,7,p);g.rivet(12,16,p);g.rivet(34,16,p);
}

function greatsword(g:EquipmentPixelPainter,p:EquipmentPalette) {
    // Long two-hand grip and broad, bevelled blade, posed like the approved longsword.
    g.bevel([[14,29],[31,7],[42,3],[39,15],[22,35]],p);
    g.poly([[18,29],[33,9],[39,6],[36,14],[21,32]],p.lit);
    g.poly([[17,29],[33,9],[39,6],[22,30]],p.shine);
    g.poly([[22,29],[36,12],[38,7],[38,14],[23,33]],p.shade);
    g.line([23,25],[32,14],p.base,2);
    g.line([22,26],[27,20],p.gem,2);g.line([23,25],[27,20],p.gemLight);
    const gold={...p,base:p.gold,shade:p.goldShade,lit:p.goldLight};
    g.bevel([[8,24],[12,24],[15,28],[21,32],[26,34],[27,38],[23,40],[18,35],[12,31],[7,28]],gold);
    g.bevel([[6,38],[13,29],[18,34],[10,43]],{...p,base:'#79503d',shade:'#4b3030',lit:'#ac7850',shine:'#d6a36d'},false);
    for(let i=0;i<4;i++)g.line([8+i*2,38-i*2],[11+i*2,40-i*2],p.deep);
    g.bevel([[3,40],[6,37],[12,41],[11,45],[6,46],[2,43]],gold);
    g.gem(7,42,2,p);g.gem(17,31,3,p);
}
export function drawEquipmentRelic(g:EquipmentPixelPainter,p:EquipmentPalette,profile:Exclude<EquipmentArtProfile,{kind:'armor'}>) {
    if(profile.kind==='ring')ring(g,p);
    else if(profile.kind==='head')head(g,p,profile.tier);
    else if(profile.kind==='shield')shield(g,p,profile.style);
    else greatsword(g,p);
}
