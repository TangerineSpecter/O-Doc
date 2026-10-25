import type {ArmorFamily,EquipmentPalette} from './equipmentArtPalette';
import {EquipmentPixelPainter} from './equipmentPixelPainter';

/** Five head armour families, each with an unmistakable material and tier silhouette. */
export function drawEquipmentHead(g:EquipmentPixelPainter,p:EquipmentPalette,family:ArmorFamily,t:number) {
    if(family==='cloth') {
        // Soft brim and bent cloth cone, never metal crown points.
        const tips=[[24,7],[30,5],[35,9],[27,3],[37,5]] as const;
        const [tx,ty]=tips[t];
        g.bevel([[8,31],[13,25],[18,13],[tx,ty],[tx+5,ty+3],[27,18],[35,30]],p,false);
        g.poly([[18,27],[20,15],[tx,ty+3],[24,22],[25,30]],p.lit);
        g.poly([[26,18],[30,24],[33,31],[26,31]],p.shade);
        const brim= t===2 ? [[4,32],[12,27],[35,29],[44,35],[37,40],[11,38]] as const
            : [[3,32],[12,28],[35,29],[45,34],[39,39+t%2],[11,39-t%2]] as const;
        g.bevel(brim,p,false);
        g.line([14,28],[33,30],p.deep,3);g.line([15,28],[32,30],p.gold,1);
        g.gem(27,30,t?3:2,p);
        if(t>=1){g.line([23,18],[26,21],p.goldLight);g.line([26,21],[22,23],p.goldLight);}
        if(t===2){g.line([35,31],[38,41],p.gold);g.rect(37,40,3,4,p.shine);}
        if(t>=3){g.rect(18,16,2,2,p.shine);g.rect(29,25,2,2,p.goldLight);g.line([12,34],[35,36],p.goldLight);}
        if(t===4){g.line([13,35],[29,37],p.gemLight);g.line([29,37],[37,35],p.gemLight);g.gem(19,35,2,p);}
        return;
    }
    if(family==='leather') {
        g.bevel([[10,21],[15,12-t],[24,9],[34,13],[39,23],[37,34],[32,39],[28,32],[17,32],[12,40],[8,34]],p,false);
        g.poly([[14,22],[18,16],[28,15],[33,20],[34,29],[14,29]],p.lit);
        g.poly([[16,27],[32,27],[31,34],[17,34]],p.deep);
        g.line([12,23],[13,34],p.shade);g.line([35,23],[34,34],p.shade);
        for(let i=0;i<5;i++)g.rect(15+i*4,25,1,2,p.goldLight);
        if(t>=1){g.bevel([[32,18],[35,5],[39,8],[37,19]],p,false);g.line([34,18],[36,8],p.shine);}
        if(t>=2){g.poly([[15,18],[19,15],[22,20],[18,22]],p.shade);g.poly([[27,16],[31,18],[29,23],[25,20]],p.shade);}
        if(t>=3){g.bevel([[9,23],[5,16],[7,11],[12,19]],p,false);g.gem(24,23,3,p);}
        if(t===4)for(let i=0;i<3;i++){g.line([17+i*5,14],[20+i*5,17],p.gold);g.line([20+i*5,17],[17+i*5,20],p.shade);}
        return;
    }
    if(family==='light') {
        if(t===0){g.bevel([[6,23],[15,18],[33,18],[42,24],[37,31],[11,31]],p);g.gem(24,24,4,p);g.trim([9,26],[19,28],p);return;}
        g.bevel([[10,20],[15,10-t],[27,7],[36,14],[39,25],[34,37],[29,31],[15,32],[10,37],[7,26]],p);
        g.poly([[14,21],[21,16],[31,19],[33,29],[14,29]],p.deep);
        g.trim([11,19],[22,12],p);g.trim([22,12],[35,20],p);g.gem(23,18,3,p);
        if(t>=2)g.bevel([[9,20],[5,12],[10,14],[15,20]],p);
        if(t>=3)g.bevel([[34,20],[40,10],[42,17],[38,25]],p);
        if(t===4){g.trim([17,11],[24,7],p);g.line([26,11],[33,16],p.gemLight);}
        return;
    }
    const plate=family==='plate';
    g.bevel([[10,17-t%2],[17,8],[29,8],[38,17],[40,32],[34,41],[14,41],[8,32]],p);
    if(plate){
        g.bevel([[12,20],[24,17],[36,20],[35,35],[24,42],[13,35]],p);
        g.line([14,24],[22,23],p.deep,2);g.line([26,23],[34,24],p.deep,2);
        g.trim([24,18],[24,39],p);
        for(let i=0;i<3+t%2;i++)g.rect(16+i*4,31,1,4,p.deep);
    }else{
        g.poly([[13,21],[34,21],[33,32],[15,32]],p.deep);
        g.bevel([[8,24],[14,25],[16,39],[11,41],[7,34]],p);
        g.bevel([[34,25],[40,24],[41,34],[37,41],[32,39]],p);
        for(const x of [12,18,30,36])g.rivet(x,17,p);
    }
    if(t>=1)g.bevel([[19,9],[22,5],[26,5],[29,9],[27,17],[21,17]],p);
    if(t>=2){g.trim([11,35],[18,40],p);g.trim([29,40],[36,35],p);g.gem(24,17,3,p);}
    if(t>=3){g.bevel([[10,17],[5,9],[10,11],[16,17]],p);g.bevel([[33,17],[39,10],[43,9],[38,21]],p);}
    if(t===4){g.trim([15,13],[23,9],p);g.trim([25,9],[33,13],p);g.gem(24,12,2,p);}
}
