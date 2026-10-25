import {EquipmentPixelPainter} from './equipmentPixelPainter';
import type {EquipmentPalette} from './equipmentArtPalette';

/** A wooden harp with visible strings and a hollow soundbox, kept legible in bag slots. */
export function drawInstrument(g:EquipmentPixelPainter,p:EquipmentPalette,t:number) {
    g.bevel([[10,6],[16,4],[36,7],[41,14],[39,20],[34,17],[32,13],[17,11],[17,34],[27,38],[36,34],[40,38],[38,43],[24,45],[10,38]],p,false);
    g.poly([[18,13],[31,15],[33,18],[31,34],[26,36],[18,32]],p.deep);
    for(let i=0;i<5;i++)g.line([19+i*3,14+i/2|0],[19+i*3,32+i/2|0],i%2?p.gold:p.goldLight);
    g.line([12,12],[12,33],p.lit,2);g.line([14,36],[25,41],p.shine);
    g.trim([17,7],[33,10],p);g.gem(36,13,3,p);
    if(t>=1){g.bevel([[8,9],[5,5],[9,3],[15,7]],p,false);g.trim([28,40],[37,37],p);}
    if(t>=2){g.gem(15,34,3,p);g.line([24,40],[27,38],p.gemLight);}
    if(t>=3){g.bevel([[31,8],[35,3],[40,5],[39,12]],p,false);g.gem(25,40,2,p);}
    if(t===4){g.bevel([[8,27],[5,22],[8,17],[12,20]],p,false);g.line([20,8],[27,9],p.gemLight);g.gem(11,9,2,p);}
}
