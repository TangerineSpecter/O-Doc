export function makeDummy():HTMLCanvasElement {
    const canvas=document.createElement('canvas');canvas.width=92;canvas.height=148;
    const g=canvas.getContext('2d')!;
    g.fillStyle='#322f35';g.fillRect(38,7,18,133);g.fillStyle='#ac8154';g.fillRect(40,9,14,128);g.fillStyle='#c39b66';g.fillRect(41,10,3,124);
    g.fillStyle='#49362e';g.fillRect(1,48,90,13);g.fillStyle='#ad7d4c';g.fillRect(3,49,86,8);g.fillStyle='#d0a16b';g.fillRect(3,49,85,2);
    g.fillStyle='#46392f';g.fillRect(16,26,61,85);g.fillStyle='#cf9d66';g.fillRect(18,28,57,79);
    g.fillStyle='#b78650';g.fillRect(18,90,57,17);g.fillStyle='#e5bb7c';g.fillRect(20,29,4,61);
    for(let i=0;i<10;i++){g.fillStyle=i%2?'#b0814e':'#e0b77c';g.fillRect(26+(i*13)%42,33+i*7,12+i%6,1);}
    for(let y=0;y<46;y++)for(let x=0;x<46;x++){
        const d=Math.hypot(x-22.5,y-22.5);if(d>22)continue;
        g.fillStyle=d<6?'#ebd3a0':d<11?'#b5594c':d<16?'#ecd6a4':d<21?'#b5594c':'#8e4e40';g.fillRect(24+x,44+y,1,1);
    }
    g.fillStyle='#575765';for(const y of [30,99])for(const x of [20,70]){g.fillRect(x,y,3,3);g.fillStyle='#b4a98c';g.fillRect(x,y,1,1);g.fillStyle='#575765';}
    g.fillStyle='#403831';g.fillRect(13,136,69,7);g.fillRect(7,143,81,5);g.fillStyle='#a47b50';g.fillRect(15,136,65,3);g.fillStyle='#caa46d';g.fillRect(15,136,65,1);
    return canvas;
}
export function whiteMask(source:HTMLCanvasElement):HTMLCanvasElement {
    const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
    const g=canvas.getContext('2d')!;g.drawImage(source,0,0);g.globalCompositeOperation='source-in';g.fillStyle='#fff9d9';g.fillRect(0,0,canvas.width,canvas.height);return canvas;
}
