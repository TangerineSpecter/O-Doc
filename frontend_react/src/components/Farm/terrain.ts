import {Graphics} from 'pixi.js';
import {cellKey} from './pathfinding';
export const WIDTH = 768, HEIGHT = 512, TILE = 32;
export function terrain() {
    const g = new Graphics();
    g.rect(0,0,WIDTH,HEIGHT).fill(0xabc17b);
    for (let i=0;i<1800;i++) {
        const x=(i*127+41)%WIDTH, y=(i*83+17)%HEIGHT;
        g.rect(x,y, i%3 ? 2 : 3, 2).fill([0xa2b873,0xb6c985,0x9fb778,0xbacb8b][i%4]);
        if (i%37===0) g.rect(x,y,2,3).fill(0xe7ce85);
    }
    g.rect(11*TILE,2*TILE,2*TILE,12*TILE).fill(0xd6bd8b);
    g.rect(2*TILE,12*TILE,20*TILE,2*TILE).fill(0xd6bd8b);
    for(let i=0;i<190;i++) {
        const x=352+(i*17)%64,y=64+(i*43)%384;
        g.rect(x,y,3,2).fill(0xc6ad7c);
    }
    g.rect(17*TILE,13*TILE,5*TILE,2*TILE).fill(0x8fae98);
    g.rect(17*TILE+5,13*TILE+4,5*TILE-10,2*TILE-8).fill(0x7badaf);
    for(let i=0;i<12;i++) g.rect(550+(i*11)%130,425+(i*17)%45,12,2).fill(0xa2c6ba);
    // 固定围栏；门口在左下方，动物只在围栏内部活动。
    for(const y of [7*TILE,11*TILE]) {
        g.rect(15*TILE,y,8*TILE,3).fill(0x927852);
        g.rect(15*TILE,y+2*TILE,8*TILE,3).fill(0x927852);
        for(let x=15*TILE;x<=23*TILE;x+=TILE) {
            g.rect(x,y-5,4,12).fill(0xd7bd8d); g.rect(x,y+2*TILE-5,4,12).fill(0xd7bd8d);
        }
    }
    for(let x=1;x<24;x++) {
        g.rect(x*TILE,21,3,10).fill(0xb39b74);
        g.rect(x*TILE,HEIGHT-22,3,10).fill(0xb39b74);
    }
    g.rect(32,25,704,2).fill(0x967b56);g.rect(32,HEIGHT-18,704,2).fill(0x967b56);
    return g;
}
export function obstacles(): Set<string> {
    const set = new Set<string>();
    for (const [left,top,w,h] of [[17,4,3,3],[16,9,3,2],[17,13,5,2],[1,1,2,2],[21,1,2,2]])
        for(let x=left;x<left+w;x++) for(let y=top;y<top+h;y++) set.add(cellKey({x,y}));
    return set;
}
