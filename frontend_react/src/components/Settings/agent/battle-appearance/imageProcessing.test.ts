import assert from 'node:assert/strict';
import test from 'node:test';
import {alphaBounds,applyBrushStroke,removeFlatBackground} from './imageProcessing';
import type {PixelImage} from './imageProcessing';

function canvas(width:number,height:number,color:[number,number,number,number]):PixelImage {
    const data=new Uint8ClampedArray(width*height*4);
    for(let offset=0;offset<data.length;offset+=4)data.set(color,offset);
    return {width,height,data};
}

test('flat background removal only reaches pixels connected to the border',()=>{
    const source=canvas(7,7,[255,0,255,255]);
    for(let y=2;y<=4;y++)for(let x=2;x<=4;x++)source.data.set([210,70,90,255],(y*7+x)*4);
    source.data.set([255,0,255,255],(3*7+3)*4); // Same color as backdrop, enclosed inside the face.
    const result=removeFlatBackground(source,8);
    assert.equal(result.image.data[3],0);
    assert.equal(result.image.data[(3*7+3)*4+3],255);
    assert.equal(result.image.data[(2*7+2)*4+3],255);
});

test('existing alpha is kept and bounds ignore transparent pixels',()=>{
    const source=canvas(4,4,[12,24,36,255]);
    for(let y=0;y<4;y++)for(let x=0;x<4;x++)if(x<1||x>2||y<1||y>2)source.data[(y*4+x)*4+3]=0;
    const result=removeFlatBackground(source);
    assert.equal(result.alreadyTransparent,true);
    assert.deepEqual(alphaBounds(result.image),{x:1,y:1,width:2,height:2});
});

test('brush can erase pixels and restore them from the original image',()=>{
    const original=canvas(5,5,[30,40,50,255]);
    const erased=applyBrushStroke(original,original,[{x:2,y:2}],1,'erase');
    assert.equal(erased.data[(2*5+2)*4+3],0);
    const restored=applyBrushStroke(erased,original,[{x:2,y:2}],1,'restore');
    assert.deepEqual(Array.from(restored.data.slice((2*5+2)*4,(2*5+2)*4+4)),[30,40,50,255]);
});
