import {EquipmentPixelPainter} from './equipmentPixelPainter';
import type {EquipmentPalette, ArmorFamily} from './equipmentArtPalette';
import type {Point} from './equipmentPixelPainter';

function clothBody(g:EquipmentPixelPainter,p:EquipmentPalette,t:number) {
    // A soft, full-length robe: flared sleeves, folded lapels and separate hanging panels.
    g.bevel([[16,7],[21,6],[24,10],[28,6],[33,8],[41,20],[36,24],[32,18],[33,31],[38,43],[27,42],[24,45],[21,42],[10,43],[15,30],[16,18],[11,24],[6,20]],p,false);
    g.poly([[18,11],[22,14],[20,32],[16,40],[12,41],[18,28]],p.shade);
    g.poly([[29,11],[32,16],[30,29],[35,41],[30,40],[27,29]],p.shade);
    g.poly([[21,9],[24,13],[27,9],[29,24],[24,28],[20,24]],p.deep);
    g.poly([[16,8],[20,6],[24,11],[22,16],[18,13]],p.lit);
    g.poly([[28,6],[32,8],[29,13],[26,16],[24,11]],p.base);
    g.trim([17,8],[23,14],p);g.trim([31,8],[25,14],p);
    g.trim([22,16],[20,40],p);g.trim([26,16],[28,40],p);
    g.line([13,40],[19,39],p.gold);g.line([29,39],[35,40],p.gold);
    g.line([11,18],[15,20],p.gold);g.line([34,20],[38,18],p.gold);
    g.rect(17,24,14,3,p.ink);g.rect(18,24,12,1,p.gold);g.gem(24,25,3,p);
    g.line([19,29],[17,36],p.lit);g.line([30,31],[32,37],p.base);
    if(t>=1) {g.line([20,19],[18,21],p.goldLight);g.line([28,19],[30,21],p.gold);}
    if(t>=2) {g.poly([[11,11],[16,7],[17,15],[12,18],[8,17]],p.shade);g.trim([10,14],[15,11],p);g.gem(32,14,2,p);}
    if(t>=3) {g.line([17,32],[14,36],p.gold);g.line([31,32],[34,36],p.gold);g.gem(24,35,2,p);}
    if(t===4) {for(const [x,y] of [[12,28],[35,28],[17,37],[31,37]]){g.rect(x,y,1,3,p.shine);g.rect(x-1,y+1,3,1,p.shine);}g.gem(24,15,3,p);}
}

function leatherBody(g:EquipmentPixelPainter,p:EquipmentPalette,t:number) {
    // Leather is a fitted jerkin with sewn edges, lacing and a functional diagonal strap.
    g.bevel([[14,7],[20,6],[24,10],[28,6],[34,8],[39,16],[34,20],[32,17],[32,34],[35,40],[27,41],[24,38],[21,41],[12,40],[15,34],[15,17],[11,20],[7,16]],p,false);
    g.poly([[19,8],[24,13],[29,8],[29,16],[24,20],[19,16]],p.deep);
    g.bevel([[11,10],[17,8],[19,15],[15,19],[8,17]],p,false);
    g.bevel([[31,8],[36,10],[40,17],[33,19],[29,15]],p,false);
    g.poly([[18,20],[23,22],[23,31],[17,32]],p.shade);
    g.poly([[26,21],[30,19],[31,32],[26,31]],p.shade);
    g.line([17,14],[31,31],p.ink,4);g.line([18,14],[31,30],p.goldShade,2);g.line([18,14],[30,29],p.lit);
    g.rect(14,32,19,4,p.ink);g.rect(15,32,17,2,p.shade);
    g.rect(22,31,6,5,p.goldShade);g.rect(23,32,4,3,p.goldLight);g.rect(24,33,2,1,p.deep);
    for(let y=20;y<=28;y+=3){g.line([22,y],[25,y+1],p.lit);g.line([22,y+1],[25,y],p.goldShade);}
    for(const x of [16,31])for(let y=23;y<31;y+=3)g.rect(x,y,1,1,p.lit);
    g.bevel([[28,34],[34,34],[35,39],[28,39]],p,false);g.rivet(30,35,p);
    if(t>=1){g.rivet(13,13,p);g.rivet(34,13,p);g.line([16,37],[20,38],p.lit);}
    if(t>=2){for(let y=22;y<30;y+=3){g.line([28,y],[30,y+1],p.deep);g.rect(18,y,1,2,p.deep);}g.gem(13,15,2,p);}
    if(t>=3){g.poly([[8,12],[11,7],[16,6],[18,10],[14,9],[11,13]],p.lit);g.poly([[30,8],[32,5],[37,8],[39,12],[34,10]],p.lit);}
    if(t===4){for(let y=17;y<31;y+=4)for(let x=17;x<31;x+=4){g.line([x,y],[x+2,y+2],p.goldShade);g.line([x+2,y+2],[x+4,y],p.gold);}g.gem(24,13,3,p);}
}

function lightBody(g:EquipmentPixelPainter,p:EquipmentPalette,t:number) {
    // Short, asymmetric lamellar vest over cloth, with open sides and flexible waist tabs.
    g.bevel([[16,7],[21,7],[24,11],[28,7],[32,8],[36,14],[32,19],[31,30],[34,38],[27,41],[23,36],[19,40],[13,38],[16,29],[15,18],[11,20],[8,15]],p,false);
    g.poly([[20,9],[24,13],[28,9],[27,18],[22,19]],p.deep);
    for(let y=17;y<30;y+=5) {
        g.bevel([[17,y],[23,y+2],[24,y+6],[17,y+4]],p);
        g.bevel([[24,y+2],[30,y],[31,y+4],[25,y+6]],p);
    }
    g.bevel([[9,11],[16,7],[20,13],[16,18],[8,17]],p);
    g.trim([10,12],[16,9],p);g.rivet(12,14,p);
    g.bevel([[30,10],[34,12],[36,16],[30,17],[28,14]],p);
    g.line([17,30],[30,30],p.ink,3);g.line([17,30],[30,30],p.gold);g.gem(24,30,2,p);
    g.trim([18,33],[17,37],p);g.trim([29,33],[31,37],p);
    if(t>=1) {g.poly([[30,8],[34,9],[39,24],[34,22],[32,15]],p.shade);g.line([35,14],[37,20],p.lit);}
    if(t>=2) {g.poly([[8,12],[10,7],[15,9],[18,5],[17,12]],p.lit);g.gem(15,12,2,p);g.trim([18,22],[22,24],p);}
    if(t===3) {g.poly([[29,9],[32,5],[35,6],[31,11]],p.shine);g.gem(24,16,3,p);g.line([21,35],[24,37],p.goldLight);}
}

function metalBody(g:EquipmentPixelPainter,p:EquipmentPalette,t:number,heavy:boolean) {
    const s=heavy?2:0;
    // Riveted heavy cuirass is square and layered; plate has a curved central breast and fauld.
    g.bevel([[15,7],[21,6],[24,10],[27,6],[33,7],[37,13],[33,22],[33,34],[30,40],[18,40],[14,34],[15,22],[11,13]],p);
    g.poly([[20,7],[24,11],[28,7],[28,15],[24,18],[20,15]],p.deep);
    if(heavy) {
        g.bevel([[6,9],[15,6],[20,12],[18,19],[7,21],[3,16]],p);
        g.bevel([[29,12],[33,6],[42,9],[45,16],[40,21],[30,19]],p);
        g.bevel([[15,17],[23,19],[24,29],[16,27]],p);
        g.bevel([[25,19],[33,17],[32,27],[24,29]],p);
        for(let y=29;y<39;y+=4)g.bevel([[15,y],[24,y+1],[33,y],[32,y+5],[16,y+5]],p);
        for(const [x,y] of [[7,13],[14,12],[35,12],[40,15],[17,22],[30,22]])g.rivet(x,y,p);
        g.line([7,18],[16,16],p.goldShade);g.line([32,16],[41,18],p.goldShade);
        if(t>=2) {g.poly([[5,11],[7,6],[10,10]],p.lit);g.poly([[38,10],[41,6],[43,12]],p.lit);}
    } else {
        g.bevel([[8,10],[16,7],[19,13],[17,18],[6,19],[4,15]],p);
        g.bevel([[30,13],[32,7],[40,10],[43,15],[41,19],[31,18]],p);
        g.bevel([[17,16],[24,19],[31,16],[32,23],[24,30],[16,23]],p);
        g.poly([[18,17],[23,20],[23,27],[17,23]],p.shine);
        g.poly([[25,20],[30,18],[31,23],[25,28]],p.shade);
        for(let y=29;y<38;y+=4)g.bevel([[15,y],[24,y+2],[33,y],[34,y+4],[24,y+6],[14,y+4]],p);
        g.trim([8,14],[15,11],p);g.trim([33,11],[40,14],p);
        if(t>=1){g.line([24,19],[24,28],p.gold);g.rivet(11,15,p);g.rivet(36,15,p);}
    }
    g.bevel([[14-s,32],[20,34],[19,43],[11-s,41]],p);
    g.bevel([[28,34],[34+s,32],[37+s,41],[29,43]],p);
    g.line([20,7],[24,12],p.goldShade);g.line([27,7],[24,12],p.goldLight);
    if(t>=1)g.gem(24,17,2,p);
    if(t>=2){g.trim([16,35],[15,40],p);g.trim([32,35],[33,40],p);g.gem(10,13,2,p);g.gem(37,13,2,p);}
    if(t>=3){g.poly([[17,19],[20,20],[24,24],[28,20],[31,19],[28,24],[24,28],[20,24]],p.gold);g.rect(23,22,2,4,p.goldLight);}
    if(heavy&&t===4){g.bevel([[6,6],[11,3],[13,8],[9,11]],p);g.bevel([[36,8],[38,3],[43,6],[40,11]],p);g.gem(24,23,3,p);}
}

function gloves(g:EquipmentPixelPainter,p:EquipmentPalette,t:number,f:ArmorFamily) {
    const metal=f==='heavy'||f==='plate',light=f==='light';
    // Two separate hands, staggered so the cuffs and fingers remain legible at small size.
    for(const [ox,oy] of [[0,4],[21,0]]) {
        const poly=(points:Point[])=>g.bevel(points.map(([x,y])=>[x+ox,y+oy] as Point),p,metal||light);
        poly([[7,8],[19,8],[20,17],[18,23],[18,34],[15,38],[8,37],[5,33],[5,26],[2,24],[2,20],[5,19],[7,24]]);
        poly([[6,8],[19,7],[20,17],[6,18]]);
        g.line([8+ox,10+oy],[17+ox,10+oy],p.goldLight);
        if(metal||light) {
            poly([[7,20],[16,19],[18,25],[16,29],[7,28]]);
            for(let y=29;y<35;y+=3)g.line([8+ox,y+oy],[16+ox,y+oy],p.shade);
            g.line([10+ox,30+oy],[10+ox,35+oy],p.lit);
        } else {
            g.line([8+ox,23+oy],[8+ox,33+oy],p.lit);
            for(let x=11;x<17;x+=3)g.line([x+ox,29+oy],[x+ox,34+oy],p.shade);
            if(f==='cloth') {g.trim([8+ox,14+oy],[17+ox,14+oy],p);g.line([10+ox,21+oy],[14+ox,25+oy],p.lit);}
            else {g.line([7+ox,17+oy],[18+ox,17+oy],p.deep,2);g.rivet(10+ox,16+oy,p);}
        }
        if(t>=1)g.gem(13+ox,13+oy,2,p);
        if(t>=2){g.trim([7+ox,20+oy],[11+ox,23+oy],p);g.trim([17+ox,20+oy],[13+ox,23+oy],p);}
        if(t>=3){poly([[6,8],[8,4],[12,7],[17,4],[20,8]]);g.gem(12+ox,23+oy,2,p);}
        if(t===4){g.line([7+ox,32+oy],[9+ox,35+oy],p.gold);g.line([17+ox,32+oy],[15+ox,35+oy],p.gold);}
    }
}

function boots(g:EquipmentPixelPainter,p:EquipmentPalette,t:number,f:ArmorFamily) {
    const metal=f==='heavy'||f==='plate',light=f==='light';
    for(const [ox,oy] of [[0,3],[21,0]]) {
        const poly=(points:Point[])=>g.bevel(points.map(([x,y])=>[x+ox,y+oy] as Point),p,metal||light);
        poly([[7,7],[18,7],[18,25],[21,30],[23,32],[23,38],[19,40],[3,40],[2,36],[5,31],[7,26]]);
        g.poly([[3+ox,36+oy],[22+ox,36+oy],[22+ox,39+oy],[4+ox,39+oy]],p.deep);
        poly([[6,7],[19,6],[19,13],[7,14]]);
        g.line([8+ox,8+oy],[16+ox,8+oy],p.goldLight);
        if(metal||light) {
            poly([[9,16],[17,15],[17,28],[13,31],[8,27]]);
            g.line([10+ox,17+oy],[11+ox,26+oy],p.shine);
            poly([[7,31],[14,29],[20,32],[22,35],[20,37],[6,37]]);
            g.line([8+ox,33+oy],[18+ox,33+oy],p.lit);
        } else {
            g.line([9+ox,16+oy],[8+ox,27+oy],p.lit);
            g.line([16+ox,15+oy],[16+ox,28+oy],p.shade);
            g.line([6+ox,30+oy],[17+ox,30+oy],p.deep,3);
            g.rect(12+ox,29+oy,4,3,p.gold);g.rect(13+ox,30+oy,2,1,p.deep);
            if(f==='cloth')g.trim([8+ox,16+oy],[10+ox,26+oy],p);
            else for(let y=17;y<26;y+=3)g.line([13+ox,y+oy],[15+ox,y+oy],p.lit);
        }
        if(t>=1)g.rivet(9+ox,10+oy,p);
        if(t>=2){g.gem(13+ox,12+oy,2,p);g.trim([7+ox,35+oy],[11+ox,35+oy],p);}
        if(t>=3){poly([[6,7],[8,3],[12,7],[18,4],[19,9]]);g.line([13+ox,20+oy],[15+ox,24+oy],p.gold);}
        if(t===4){g.gem(13+ox,24+oy,2,p);g.trim([18+ox,33+oy],[20+ox,35+oy],p);}
    }
}

export function drawEquipmentArmor(g:EquipmentPixelPainter,p:EquipmentPalette,family:ArmorFamily,slot:'body'|'hands'|'feet',tier:number) {
    if(slot==='hands')return gloves(g,p,tier,family);
    if(slot==='feet')return boots(g,p,tier,family);
    if(family==='cloth')clothBody(g,p,tier);
    else if(family==='leather')leatherBody(g,p,tier);
    else if(family==='light')lightBody(g,p,tier);
    else metalBody(g,p,tier,family==='heavy');
}
