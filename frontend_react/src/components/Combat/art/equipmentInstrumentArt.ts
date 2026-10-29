import {EquipmentPixelPainter} from './equipmentPixelPainter';
import type {EquipmentPalette} from './equipmentArtPalette';
import type {WeaponElement} from './equipmentArtProfile';

const INK = '#261513';

function drawStrings(g:EquipmentPixelPainter, topY:number, bottomY:number, c1:string, c2:string, xStart=19, count=5) {
    for(let i=0;i<count;i++) {
        const x = xStart + i*3;
        const y0 = topY + (i>>1);
        const y1 = bottomY + (i>>1);
        g.line([x,y0],[x,y1],INK,2);
        g.line([x,y0],[x,y1],i%2?c1:c2);
    }
}

/** Base Lv.10 wooden harp, plus element-specific and high-tier harp silhouettes.
 * Note: Both grip anchors (14,26) and (35,30) must land on solid opaque frame pixels. */
export function drawInstrument(g:EquipmentPixelPainter,p:EquipmentPalette,t:number,element?:Exclude<WeaponElement,'none'>) {
    if(!element && t===0) {
        g.bevel([[10,6],[16,4],[36,7],[41,14],[39,20],[34,17],[32,13],[17,11],[17,34],[27,38],[36,34],[40,38],[38,43],[24,45],[10,38]],p,false);
        g.poly([[18,13],[31,15],[33,18],[31,34],[26,36],[18,32]],p.deep);
        for(let i=0;i<5;i++)g.line([19+i*3,14+i/2|0],[19+i*3,32+i/2|0],i%2?p.gold:p.goldLight);
        g.line([12,12],[12,33],p.lit,2);g.line([14,36],[25,41],p.shine);
        g.trim([17,7],[33,10],p);g.gem(36,13,3,p);
        return;
    }
    if(!element && t===1) {
        // 吟风竖琴 (Lv.30): Swan-neck gold top bar, emerald soundbox, and 3 bold outspread white-teal wings on left.
        const wing:EquipmentPalette={...p,shade:'#115e59',base:'#14b8a6',lit:'#99f6e4',shine:'#ffffff',gold:'#eab308',goldShade:'#854d0e',goldLight:'#fef08a',gem:'#10b981',gemShade:'#065f46',gemLight:'#d1fae5'};
        const plume:EquipmentPalette={...wing,shade:'#64748b',base:'#cbd5e1',lit:'#f8fafc',shine:'#ffffff'};
        g.poly([[17,11],[34,14],[36,33],[26,36],[17,32]],'#134e4a');
        drawStrings(g,11,33,wing.goldLight,'#99f6e4',19,5);
        g.bevel([[31,13],[38,15],[40,33],[34,37],[31,32]],{...wing,base:wing.gold,shade:wing.goldShade,lit:wing.goldLight});
        g.bevel([[12,7],[23,4],[39,8],[44,14],[40,20],[33,15],[18,12],[18,31],[28,35],[39,30],[43,36],[38,44],[22,45],[10,38]],wing);
        // Paint 3 large snow-white & teal wing-feathers ON TOP of the left pillar!
        for(const [ox,oy,w] of [[4,6,14],[3,15,15],[5,24,13]] as const) {
            g.bevel([[ox,oy],[ox+w,oy+2],[ox+w-1,oy+8],[ox+4,oy+7]],plume);
            g.line([ox+2,oy+2],[ox+w-3,oy+3],'#ffffff');
        }
        g.trim([18,7],[37,11],wing);
        g.gem(23,39,4,wing);g.gem(37,14,3,wing);
        return;
    }
    if(!element && t>=2) {
        // 月弦竖琴 (Lv.50+): True Crescent-Moon Lyre (`弯月星辉琴`) — a giant silver-blue crescent moon with golden star horns!
        const moon:EquipmentPalette={...p,shade:'#312e81',base:'#6366f1',lit:'#c7d2fe',shine:'#ffffff',gold:'#eab308',goldShade:'#854d0e',goldLight:'#fef08a',gem:'#38bdf8',gemShade:'#0369a1',gemLight:'#e0f2fe'};
        g.poly([[17,11],[35,14],[36,33],[25,36],[17,31]],'#1e1b4b');
        drawStrings(g,10,34,'#ffffff',moon.goldLight,19,5);
        // Right starlight bridge through (35,30) with crescent star finial at top-right (40,12).
        g.bevel([[31,11],[39,13],[40,33],[34,37],[31,31]],{...moon,base:moon.gold,shade:moon.goldShade,lit:moon.goldLight});
        // Giant sweeping Crescent Moon body on the left & bottom!
        g.bevel([[24,3],[36,6],[31,11],[20,11],[16,18],[16,28],[22,34],[35,33],[43,35],[38,42],[26,45],[13,42],[6,33],[4,21],[7,10],[15,4]],moon);
        g.poly([[8,14],[13,9],[13,34],[8,29]],moon.shine);
        // Golden 4-pointed star at top-right horn (38,10) & bottom-right horn (39,36).
        g.bevel([[34,6],[40,4],[44,10],[39,15],[33,12]],{...moon,base:moon.gold,shade:moon.goldShade,lit:moon.goldLight});
        g.gem(19,38,4,moon);g.gem(11,22,3,moon);
        return;
    }
    if(element==='water') {
        // 潮汐旅人竖琴: Curling white-crested tsunami wave pillar, pink coral arch & large spiral Nautilus shell base!
        const water:EquipmentPalette={...p,shade:'#0077b6',base:'#00b4d8',lit:'#90e0ef',shine:'#ffffff',gold:'#ff758f',goldShade:'#a4133c',goldLight:'#ffc2d1',gem:'#caf0f8',gemShade:'#0077b6',gemLight:'#ffffff'};
        const shell:EquipmentPalette={...water,shade:'#9d4edd',base:'#ff758f',lit:'#ffb3c6',shine:'#fff0f3'};
        g.poly([[17,12],[34,14],[36,33],[25,36],[17,31]],'#03045e');
        drawStrings(g,12,33,'#ffffff','#90e0ef',19,5);
        // Right coral-wave grip column through (35,30).
        g.bevel([[31,12],[38,15],[40,33],[34,37],[31,31]],water);
        // Curling ocean wave left pillar + top wave arch.
        g.bevel([[10,4],[24,3],[38,8],[43,14],[39,20],[32,15],[17,12],[17,31],[10,33],[5,25],[8,16],[4,9]],water);
        g.poly([[6,8],[16,4],[22,6],[14,11],[7,11]],'#ffffff');
        // Branching pink coral crown on top-right!
        g.bevel([[28,4],[35,2],[37,7],[44,5],[43,12],[34,13],[28,9]],shell);
        // Giant spiral Nautilus sea-conch soundbox painted ON TOP at the bottom (y=26..45)!
        g.bevel([[7,28],[19,26],[29,33],[42,32],[43,39],[35,44],[19,45],[9,42],[5,35]],shell);
        g.line([12,32],[18,31],'#ffffff',2);g.line([18,31],[19,37],'#ffffff',2);g.line([13,38],[19,37],'#ffc2d1',2);
        g.gem(28,38,4,water);
        return;
    }
    if(element==='earth' && t===0) {
        // 琥岩旅人竖琴 (Lv.10): Dark basalt crag frame with 3 huge glowing golden-amber crystal clusters bursting out!
        const rock:EquipmentPalette={...p,shade:'#292524',base:'#57534e',lit:'#a8a29e',shine:'#e7e5e4',gold:'#f59f00',goldShade:'#92400e',goldLight:'#ffe066',gem:'#f59f00',gemShade:'#78350f',gemLight:'#fff9db'};
        const amber:EquipmentPalette={...rock,shade:'#b45309',base:'#f59f00',lit:'#ffe066',shine:'#fff9db'};
        g.poly([[17,12],[34,14],[36,33],[25,36],[17,32]],'#1c1917');
        drawStrings(g,12,33,'#fff9db','#f59f00',19,5);
        g.bevel([[31,13],[38,15],[40,34],[33,37],[31,32]],rock,false);
        g.bevel([[9,6],[19,4],[38,8],[43,15],[38,21],[32,16],[17,13],[17,31],[27,35],[38,31],[42,37],[36,44],[21,45],[8,39]],rock,false);
        // 3 large jagged glowing amber crystal prisms ON TOP of the basalt frame!
        g.bevel([[3,9],[13,6],[16,13],[10,18],[3,14]],amber);
        g.bevel([[3,22],[13,19],[16,27],[9,31],[3,27]],amber);
        g.bevel([[30,32],[41,29],[45,36],[38,43],[29,39]],amber);
        g.gem(20,39,4,rock);
        return;
    }
    if(element==='earth') {
        // 琥岩吟风竖琴 (Lv.30): Imperial Black-Gold Dragon Harp with 4 colossal blazing amber crystal blades!
        const dragon:EquipmentPalette={...p,shade:'#1c1917',base:'#44403c',lit:'#78716c',shine:'#fff9db',gold:'#f59f00',goldShade:'#78350f',goldLight:'#fde047',gem:'#f76707',gemShade:'#7c2d12',gemLight:'#fff3bf'};
        const amber:EquipmentPalette={...dragon,shade:'#b45309',base:'#f59f00',lit:'#ffe066',shine:'#fff9db'};
        g.poly([[18,12],[34,14],[36,33],[25,36],[18,32]],'#1c1917');
        drawStrings(g,12,33,'#fff9db','#f59f00',19,5);
        g.bevel([[31,12],[39,14],[41,33],[34,38],[31,32]],dragon);
        g.bevel([[12,6],[24,4],[39,8],[44,15],[39,21],[33,15],[18,12],[18,31],[28,35],[39,30],[43,36],[38,44],[22,45],[9,39]],dragon);
        // Paint 4 huge dragon-spine amber crystal blades ON TOP of the left pillar & top!
        for(const [ox,oy] of [[4,4],[2,12],[2,20],[4,28]] as const) {
            g.bevel([[ox,oy],[ox+12,oy-1],[ox+15,oy+5],[ox+5,oy+7]],amber);
            g.line([ox+2,oy+1],[ox+11,oy+1],'#ffffff');
        }
        g.bevel([[24,2],[33,2],[36,8],[25,8]],amber);
        g.trim([14,37],[36,40],dragon);
        g.gem(22,39,5,dragon);g.gem(37,15,3,dragon);
        return;
    }
    if(element==='wind') {
        // 岚羽吟风竖琴 (Lv.30): Grand Valkyrie Swan-Wing Harp — 4 huge snow-white feather wings + golden wind-bell!
        const wind:EquipmentPalette={...p,shade:'#0f766e',base:'#14b8a6',lit:'#99f6e4',shine:'#ffffff',gold:'#eab308',goldShade:'#854d0e',goldLight:'#fef08a',gem:'#10b981',gemShade:'#065f46',gemLight:'#d1fae5'};
        const feather:EquipmentPalette={...wind,shade:'#94a3b8',base:'#e2e8f0',lit:'#f8fafc',shine:'#ffffff'};
        g.poly([[18,12],[34,14],[36,33],[26,36],[18,32]],'#042f2e');
        drawStrings(g,12,33,'#ffffff','#5eead4',19,5);
        g.bevel([[31,13],[38,15],[40,33],[34,37],[31,32]],wind);
        g.bevel([[13,6],[24,4],[39,8],[44,14],[40,21],[34,16],[18,12],[18,31],[28,35],[39,30],[43,36],[38,44],[23,45],[9,38]],wind);
        // Paint 4 sweeping snow-white swan-wing feathers ON TOP of the left pillar!
        for(const [ox,oy,w] of [[4,3,15],[2,10,17],[2,18,16],[4,26,14]] as const) {
            g.bevel([[ox,oy],[ox+w,oy+1],[ox+w-1,oy+7],[ox+4,oy+6]],feather);
            g.line([ox+2,oy+2],[ox+w-3,oy+2],'#ffffff',2);
        }
        // Golden wind-bell hanging at top-right (40,19).
        g.bevel([[36,15],[43,15],[44,22],[35,22]],{...wind,base:wind.gold,shade:wind.goldShade,lit:wind.goldLight});
        g.trim([15,37],[36,40],wind);
        g.gem(22,39,4,wind);g.gem(35,12,3,wind);
        return;
    }
    // 熔羽吟风竖琴 (fire Lv.30): Blazing Phoenix Flame-Plume Harp — crimson-orange-yellow fire wings ON TOP of obsidian frame!
    const fire:EquipmentPalette={...p,shade:'#1c1917',base:'#44403c',lit:'#dc2626',shine:'#fef08a',gold:'#f97316',goldShade:'#7c2d12',goldLight:'#fde047',gem:'#ef4444',gemShade:'#7f1d1d',gemLight:'#fef08a'};
    const flame:EquipmentPalette={...fire,shade:'#b91c1c',base:'#f97316',lit:'#facc15',shine:'#ffffff'};
    g.poly([[18,12],[34,14],[36,33],[26,36],[18,32]],'#1f0909');
    drawStrings(g,12,33,'#fef08a','#f97316',19,5);
    g.bevel([[31,13],[38,15],[40,33],[34,37],[31,32]],fire);
    g.bevel([[13,6],[25,4],[41,6],[44,13],[39,20],[33,15],[18,12],[18,31],[28,35],[39,30],[43,36],[38,44],[23,45],[9,38]],fire);
    // Paint 4 blazing phoenix flame-plumes ON TOP of the left pillar & crest!
    for(const [ox,oy,w] of [[5,3,15],[2,10,17],[2,18,16],[4,26,14]] as const) {
        g.bevel([[ox,oy],[ox+w,oy+1],[ox+w-1,oy+7],[ox+4,oy+6]],flame);
        g.poly([[ox+2,oy+2],[ox+w-4,oy+2],[ox+w-3,oy+5],[ox+4,oy+5]],'#fde047');
        g.rect(ox+3,oy+2,4,2,'#ffffff');
    }
    g.trim([14,36],[36,40],fire);
    g.gem(22,39,5,fire);g.gem(36,13,3,fire);
}
