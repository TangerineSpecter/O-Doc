import assert from 'node:assert/strict';
import test from 'node:test';
import {alphaBounds,applyBrushStroke,characterFramePlacement,groundCharacterPlacement,removeColorRegion,removeFlatBackground} from './imageProcessing';
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

test('clicked background pocket is removed without deleting disconnected same-color details',()=>{
    const source=canvas(7,7,[110,35,40,255]);
    for(const [x,y] of [[2,2],[2,3],[3,3],[5,5]])source.data.set([255,0,255,255],(y*7+x)*4);
    const cleaned=removeColorRegion(source,{x:2,y:2},8);
    for(const [x,y] of [[2,2],[2,3],[3,3]])assert.equal(cleaned.data[(y*7+x)*4+3],0);
    assert.equal(cleaned.data[(5*7+5)*4+3],255);
    assert.equal(cleaned.data[(2*7+3)*4+3],255);
    assert.equal(source.data[(2*7+2)*4+3],255);
    assert.deepEqual(removeColorRegion(source,{x:2,y:2},8).data,cleaned.data);
});

test('color region tolerance clears fringe pixels and stops at transparent gaps',()=>{
    const source=canvas(5,1,[255,0,255,255]);
    source.data.set([238,8,246,255],4);
    source.data[11]=0;
    const cleaned=removeColorRegion(source,{x:0,y:0},20);
    assert.equal(cleaned.data[7],0);
    assert.equal(cleaned.data[15],255);
    assert.equal(removeColorRegion(source,{x:0,y:0},4).data[7],255);
    assert.strictEqual(removeColorRegion(source,{x:2,y:0}),source);
});

test('partly transparent source keeps its alpha instead of treating it as a flat backdrop',()=>{
    const source=canvas(3,3,[180,0,220,255]);source.data[3]=128;
    const result=removeFlatBackground(source);
    assert.equal(result.alreadyTransparent,true);
    assert.deepEqual(result.image.data,source.data);
});

test('large accepted artwork fits fully without clamping scale above the fitted value', async()=>{
    const {autoCharacterTransform,characterFramePlacement,BATTLE_CHARACTER_MIN_SCALE}=await import('./imageProcessing');
    for(const bounds of [{x:0,y:0,width:3900,height:1950},{x:0,y:0,width:16384,height:400},{x:0,y:0,width:400,height:16384}]){
        const transform=autoCharacterTransform(bounds);
        assert.ok(transform.scale>=BATTLE_CHARACTER_MIN_SCALE);
        assert.ok(transform.scale<.1);
        assert.equal(characterFramePlacement(bounds,transform).clipped,false);
    }
});

test('transparent padding outside the canvas does not block saving, visible shoes do',()=>{
    const crop={x:0,y:0,width:374,height:528};
    const content={x:100,y:40,width:174,height:450};
    assert.equal(characterFramePlacement(crop,{x:0,y:38,scale:1},content).clipped,false);
    assert.equal(characterFramePlacement(crop,{x:0,y:39,scale:1},content).clipped,true);
    assert.equal(characterFramePlacement(crop,{x:-100,y:0,scale:1},content).clipped,false);
    assert.equal(characterFramePlacement(crop,{x:-101,y:0,scale:1},content).clipped,true);
    assert.equal(characterFramePlacement(crop,{x:0,y:-41,scale:1},content).clipped,true);
    assert.equal(characterFramePlacement(crop,{x:101,y:0,scale:1},content).clipped,true);
});

test('ground alignment trims selected transparent padding and keeps every shoe pixel in frame',()=>{
    const image=canvas(400,600,[0,0,0,0]);
    for(let y=50;y<550;y++)for(let x=100;x<300;x++)image.data[(y*400+x)*4+3]=255;
    // A separate visible region outside the selection must not affect its feet.
    image.data[(599*400+399)*4+3]=255;
    const selected={x:50,y:0,width:300,height:580};
    const aligned=groundCharacterPlacement(image,selected,{x:4,y:36,scale:.8})!;
    assert.deepEqual(aligned.crop,{x:100,y:50,width:200,height:500});
    assert.deepEqual(aligned.transform,{x:4,y:0,scale:.8});
    const placement=characterFramePlacement(aligned.crop,aligned.transform);
    assert.equal(placement.clipped,false);
    assert.equal(placement.y+placement.height,528);
    assert.deepEqual(groundCharacterPlacement(image,aligned.crop,aligned.transform),aligned);
    const fitted=groundCharacterPlacement(image,selected,{x:999,y:99,scale:4})!;
    assert.equal(characterFramePlacement(fitted.crop,fitted.transform).clipped,false);
    assert.equal(groundCharacterPlacement(canvas(2,2,[0,0,0,0]),{x:0,y:0,width:2,height:2},{x:0,y:0,scale:1}),null);
});
