import {PixelPainter} from './pixelPainter';
import type {MaterialArtProfile} from './materialVisuals';

/** Original 32 px loot sprites; silhouette and color come from the stable item ID. */
export function drawMaterialArt(ctx:CanvasRenderingContext2D,p:MaterialArtProfile) {
    ctx.clearRect(0,0,32,32);const g=new PixelPainter(ctx);const {color:c,shadow:s,light:l,shape}=p;
    g.ellipse(16,28,11,2,'#cbd9d0');
    const gem=(x:number,y:number,w:number,h:number)=>{g.polygon([x,y-h,x+w,y-3,x+w-1,y+h,x,y+h+3,x-w,y+h,x-w,y-3],s);g.polygon([x,y-h+2,x+w-2,y-2,x,y+h,x-w+2,y-2],c);g.polygon([x,y-h+2,x,y+h,x-w+2,y-2],l);};
    const spark=(x:number,y:number,col:string=l)=>{g.rect(x-2,y,5,1,col);g.rect(x,y-2,1,5,col);};
    switch(shape) {
        case 'slime':
            g.polygon([5,26,6,19,10,13,15,5,17,10,25,18,28,25,24,28,10,28],s);
            g.polygon([7,25,8,19,12,14,16,8,17,12,24,19,26,25,21,27,11,27],c);
            g.polygon([9,20,11,15,15,11,14,16,11,21],l);g.ellipse(23,21,2,2,l);g.rect(17,25,7,1,'#469ab3');break;
        case 'wing':
            g.polygon([4,8,10,12,17,4,22,8,29,6,27,20,24,17,19,22,16,18,10,23,8,19,3,23],s);
            g.polygon([5,10,10,15,17,6,20,10,26,9,24,15,19,18,16,16,10,20,8,17,5,20],c);
            g.line(18,8,19,18,l);g.line(18,8,10,20,l);g.rect(15,5,3,3,l);break;
        case 'moss':
        case 'ore':
        case 'magma':
            g.polygon([4,22,7,11,14,6,23,8,28,17,25,27,11,28],s);
            g.polygon([6,21,9,12,15,8,22,10,25,17,22,25,12,26],c);
            g.polygon([9,12,15,8,22,10,16,17,7,19],l);g.polygon([16,17,25,17,22,25,13,26],s);
            if(shape==='moss'){g.polygon([7,10,11,7,15,9,19,7,23,10,20,14,10,14], '#91b66c');g.rect(10,9,5,2,'#c6d894');g.rect(22,18,3,3,'#92ad73');}
            if(shape==='ore'){g.rect(8,17,4,3,'#d5b67b');g.rect(19,12,3,3,'#c5d9df');g.rect(19,22,3,2,'#a9c1c9');}
            if(shape==='magma'){g.line(17,9,15,17,'#f8bb70',2);g.line(15,17,20,23,'#ef9259',2);g.line(15,17,8,22,'#f8bb70');g.rect(22,16,2,3,'#f8bb70');}break;
        case 'pelt':
            g.polygon([9,9,7,5,11,3,15,7,20,4,24,7,22,12,26,18,24,25,19,23,16,27,11,24,6,26,6,19,9,15],s);
            g.polygon([10,10,11,6,15,9,20,7,21,12,24,19,22,23,19,21,16,25,12,21,9,23,9,18,11,14],c);
            g.polygon([13,10,18,10,21,17,18,23,13,20,11,15],l);g.line(24,23,28,26,s,2);g.line(28,26,26,29,s);break;
        case 'fur_tuft':
            g.polygon([5,22,6,19,9,17,9,13,13,14,15,9,18,13,22,11,22,16,26,18,27,22,24,26,9,26],s);
            g.polygon([7,22,8,19,11,18,12,14,14,17,16,12,18,16,21,14,21,18,24,19,25,22,22,24,10,24],c);
            g.polygon([11,18,12,15,14,18,16,15,18,18,16,21,12,21],l);
            g.line(9,21,11,19,l);g.line(18,22,21,19,l);g.rect(15,22,2,1,'#aa987a');break;
        case 'shell_fragment':
            g.polygon([6,8,11,5,16,7,22,5,27,9,25,15,28,18,25,25,18,27,14,24,8,26,5,20,8,16,4,12],s);
            g.polygon([8,9,12,7,16,9,22,7,25,10,22,15,25,18,23,23,18,25,15,22,10,24,7,20,10,16,6,12],c);
            g.polygon([8,10,12,8,15,10,11,16,8,15,6,12],l);
            g.polygon([16,10,21,8,23,10,20,15,16,17], '#96b77a');
            g.line(11,21,18,13,s,2);g.line(17,18,22,20,l);g.rect(12,22,3,1,'#b6d18a');break;
        case 'core':
            g.ellipse(16,17,11,11,s);g.ellipse(16,16,9,9,c);g.ellipse(16,16,6,6,s);gem(16,15,4,5);g.rect(7,14,3,2,l);g.rect(22,17,3,2,l);g.rect(14,5,3,3,l);break;
        case 'spore':
            [[10,20,5],[21,19,6],[16,10,4]].forEach(([x,y,r])=>{g.ellipse(x,y,r+1,r+1,s);g.ellipse(x,y-1,r,r,c);g.ellipse(x-1,y-2,2,2,l);g.rect(x+1,y+1,2,2,'#6c925c');});spark(26,9);spark(5,13);break;
        case 'fang':
            g.polygon([10,5,22,6,24,12,21,22,15,28,10,26,14,21,14,14,10,12],s);
            g.polygon([12,8,21,8,22,12,19,22,14,26,16,21,16,12],c);g.polygon([13,9,17,9,18,14,17,20,15,23,16,13],l);g.rect(10,6,11,4,'#ba9572');break;
        case 'resin':
            g.polygon([15,4,19,11,25,17,26,23,22,28,11,28,6,23,7,17,12,11],s);
            g.polygon([15,7,18,13,23,18,24,23,21,26,12,26,8,22,9,18,13,12],c);
            g.line(11,16,14,11,l,2);g.ellipse(11,21,2,3,l);g.line(17,23,19,14,'#8e8e57');g.line(18,18,22,16,'#8e8e57');spark(26,11);break;
        case 'bone':
            g.polygon([8,5,13,4,15,8,21,15,26,17,28,22,25,26,21,25,18,22,12,15,7,13,4,9],s);
            g.polygon([8,7,12,6,13,10,20,17,25,19,26,22,24,24,21,23,19,20,11,13,7,11,6,9],c);
            g.line(9,8,23,21,l,2);g.line(15,12,13,16,s);g.line(20,17,23,16,s);break;
        case 'water':
            g.ellipse(16,16,11,11,s);g.ellipse(16,15,9,10,c);g.ellipse(16,16,6,6,l);g.ellipse(18,17,5,4,c);g.line(10,9,13,7,l,2);g.rect(12,28,8,1,c);spark(27,7);break;
        case 'shards':
            gem(10,20,5,7);gem(20,15,5,11);gem(24,25,3,3);spark(7,8);break;
        case 'ash':
        case 'dust':
            g.polygon([3,26,7,22,8,17,14,15,17,18,22,18,25,23,29,26,25,28,8,28],s);
            g.polygon([6,25,11,19,14,17,18,21,23,21,26,26,9,26],c);
            g.rect(10,21,5,2,l);g.rect(20,24,3,1,l);
            [[8,12],[19,9],[25,15]].forEach(([x,y])=>{if(shape==='dust')spark(x,y);else g.rect(x,y,2,2,'#efaa7b');});break;
        case 'sun_dust':
            g.polygon([7,23,5,20,8,17,11,17,12,13,15,15,17,10,20,14,23,13,25,17,28,19,27,23,23,26,10,26],s);
            g.polygon([8,22,8,19,11,18,13,15,15,18,17,13,19,17,22,15,23,19,26,20,25,23,22,24,11,24],c);
            g.polygon([13,19,15,16,17,18,19,16,21,19,19,21,14,21],l);
            g.rect(9,11,2,2,l);g.rect(24,10,2,2,l);g.rect(19,7,1,2,l);spark(5,10);spark(27,14,'#fff6c4');break;
        case 'flamecore':
            g.polygon([7,24,4,18,8,12,10,16,14,5,19,9,18,13,24,9,27,17,24,26,15,28],s);
            g.polygon([9,24,7,18,13,14,15,8,18,15,22,13,24,18,22,24,15,26],c);
            g.polygon([12,23,11,19,16,14,19,18,19,23,16,25],l);spark(27,5);break;
        case 'starcrystal':
            gem(16,17,6,12);gem(6,23,3,5);gem(26,22,3,5);g.rect(15,10,2,11,'#bfe5ec');spark(5,6);break;
        case 'scale':
            g.polygon([16,4,22,7,27,13,27,19,23,25,16,28,9,25,5,19,5,13,10,7],s);
            g.polygon([16,7,21,9,24,14,24,19,21,23,16,26,11,23,8,19,8,14,11,9],c);
            g.polygon([11,10,15,8,15,22,12,21,9,18,9,14],l);
            g.polygon([17,9,21,11,23,15,20,14,17,16], '#9bc9bd');
            g.line(11,20,16,13,s,2);g.line(16,13,21,18,l);g.rect(15,22,4,1,'#c5e3d1');break;
        case 'broken_core':
            g.polygon([6,9,10,11,13,5,17,10,23,5,25,15,28,19,24,26,17,28,8,24,4,17],s);
            g.polygon([7,13,12,14,14,9,18,14,22,10,22,18,24,21,20,25,11,23,8,19],c);
            gem(16,19,5,5);g.line(23,16,27,13,l);spark(5,5);break;
        case 'seal': {
            g.polygon([10,4,22,4,28,11,28,22,22,28,10,28,4,22,4,11],s);
            g.polygon([10,6,22,6,26,12,26,21,21,26,11,26,6,21,6,12],c);
            g.polygon([11,9,21,9,23,13,23,20,19,23,12,23,9,20,9,13],s);
            g.rect(10,7,11,1,l);g.rect(6,13,1,7,l);
            switch(p.glyph) {
                case 'leaf':g.polygon([12,20,12,14,19,10,21,15,17,21],l);g.line(11,22,19,14,c);break;
                case 'pick':g.polygon([11,13,13,10,20,11,22,16,18,13,14,13],l);g.line(17,13,12,21,l,2);break;
                case 'tree':g.polygon([16,10,21,15,19,15,23,19,9,19,13,15,11,15],l);g.rect(15,19,2,3,l);break;
                case 'wave':g.line(10,15,13,13,l,2);g.line(13,13,18,17,l,2);g.line(18,17,22,14,l,2);g.line(10,20,22,20,l);break;
                case 'flame':g.polygon([11,20,12,15,15,16,16,10,21,17,19,22,14,22],l);break;
                case 'star':g.polygon([16,10,18,14,22,15,19,18,20,22,16,20,12,22,13,18,10,15,14,14],l);break;
            }
            break;
        }
    }
}
