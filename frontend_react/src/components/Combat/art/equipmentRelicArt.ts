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

function trainingSword(g:EquipmentPixelPainter,p:EquipmentPalette) {
    const wood={...p,base:'#bb884c',shade:'#795032',lit:'#e1b975',shine:'#f6db9b'};
    // One diagonal axis (x+y=46); the tang overlaps both blade and guard.
    // Paint the grip first so the crossguard sits over a continuous handle.
    g.bevel([[15,27],[19,31],[9,41],[5,37]],{...wood,base:'#79513c',lit:'#bc8a5b',shade:'#503432'},false);
    for(let i=0;i<3;i++)g.line([7+i*2,36-i*2],[10+i*2,38-i*2],wood.shade);
    g.bevel([[5,36],[11,42],[8,45],[2,39]],wood,false);
    g.bevel([[13,25],[31,7],[42,4],[39,15],[21,33]],wood,false);
    // Straight double bevels meet at a pointed tip, with a raised wooden ridge.
    g.poly([[15,25],[32,8],[40,6],[18,28]],wood.lit);
    g.poly([[18,28],[40,6],[38,14],[21,31]],wood.base);
    g.line([19,27],[37,9],wood.shine);
    g.line([23,28],[37,14],wood.shade);
    g.line([27,21],[31,17],'#a57540');
    g.bevel([[10,22],[24,36],[21,39],[7,25]],wood,false);
    g.line([10,24],[21,35],wood.lit);
    g.rect(15,29,2,2,wood.shine);
}

function greatsword(g:EquipmentPixelPainter,p:EquipmentPalette) {
    // Asymmetric hooked cleaver: toothed back, open heel notch and one sweeping edge.
    const steel={...p,base:'#858c89',shade:'#4d595b',lit:'#c3c7b8',shine:'#eee7cc'};
    const ferrule={...p,base:'#82745b',shade:'#4d4138',lit:'#c2af7f'};
    g.bevel([[18,27],[23,32],[10,44],[5,39]],{...p,base:'#6d4938',shade:'#382b2b',lit:'#ad8057'},false);
    for(let i=0;i<4;i++)g.line([8+i*2,37-i*2],[11+i*2,40-i*2],p.deep);
    g.bevel([[5,38],[11,44],[8,46],[2,40]],ferrule);
    g.bevel([[18,31],[14,27],[17,23],[20,23],[22,25],[25,24],[26,21],[24,18],[21,18],
        [25,13],[21,14],[28,8],[24,9],[31,4],[38,2],[44,2],
        [39,5],[37,8],[37,11],[40,14],[45,16],[42,21],[35,26],[29,31],[25,37]],steel);
    g.poly([[30,7],[37,4],[34,9],[35,13],[40,17],[35,22],[29,26],[28,20],[26,17]],steel.base);
    // Wide cutting bevel follows the convex front; the tip curls back into a hook.
    g.poly([[38,12],[40,14],[44,16],[41,20],[34,25],[28,30],[25,35],[24,32],[28,27],[34,22],[39,17],[36,13]],steel.lit);
    g.line([40,19],[34,24],steel.shine);
    g.line([33,25],[28,29],steel.shine);
    g.line([32,5],[38,3],steel.lit);
    // Offset engraved spine and sparse forged-metal facets, no central sword ridge.
    g.line([29,12],[31,9],steel.shade,2);
    g.line([28,15],[33,19],steel.shade);
    g.line([30,15],[34,18],steel.lit);
    g.rect(29,22,2,2,steel.shade);g.rect(32,20,2,1,steel.lit);
    g.rect(33,7,2,1,steel.lit);
    // Socket is an off-centre reinforced heel, not a symmetric crossguard.
    g.bevel([[17,27],[21,28],[26,33],[23,37],[16,31]],ferrule);
    g.poly([[19,29],[23,32],[22,34],[18,31]],steel.shade);
    g.rivet(19,30,p);g.rivet(22,33,p);

}
export function drawEquipmentRelic(g:EquipmentPixelPainter,p:EquipmentPalette,profile:Exclude<EquipmentArtProfile,{kind:'armor'|'head'|'instrument'}>) {
    if(profile.kind==='trainingSword')trainingSword(g,p);
    else if(profile.kind==='ring')ring(g,p);
    else if(profile.kind==='shield')shield(g,p,profile.style);
    else greatsword(g,p);
}
