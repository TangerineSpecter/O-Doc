import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createCaveSpriteRenderer} from './caveSprites';
import {createKingDetailRenderer} from './kingDetail';
import {sampleCavePose} from './caveMotion';
import {caveProfiles} from './caveTypes';
import type {CaveMotion,CavePose} from './caveTypes';
import {kingSourcePoint} from './kingDeformation';

// The sprite samplers need only image buffers; no WebGL or production data is involved.
function makeCanvas() {
    const canvas={width:0,height:0,bytes:new Uint8ClampedArray(),getContext:()=>({
        createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),
        putImageData:(image:{data:Uint8ClampedArray})=>{canvas.bytes=image.data.slice();},
    })};return canvas;
}
const documentStub={createElement:makeCanvas};
const source=(name:string)=>readFileSync(new URL(`../../../../../../docs/agents/demo/${name}`,import.meta.url),'utf8');

test('production sprite frames match the approved cave preview, including cyan charge and detailed boss',()=>{
    const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
    Object.defineProperty(globalThis,'document',{configurable:true,value:documentStub});
    try {
        const sandbox=vm.createContext({document:documentStub,window:{},atob});
        for(const file of ['moss-cave/sprite-data.js','moss-cave/king-detail-data.js','moss-cave/characters.js','moss-cave/king-detail.js','sprout-meadow/motion.js','moss-cave/motion.js'])vm.runInContext(source(file),sandbox);
        const pixels=createCaveSpriteRenderer(),detail=createKingDetailRenderer();
        const samples:[CaveMotion,number][]=[['idle',.4],['move',.38],['attack',.46],['hit',.12],['defeat',.21],['strike',.66],['guard',1.2],['crystal',.9],['evasion',.5]];
        for(const {key} of Object.values(caveProfiles))for(const facing of [-1,1] as const)for(const [action,elapsed] of samples){
            const time=elapsed+8,pose=sampleCavePose(key,action,elapsed,time,facing);
            const expectedPose=sandbox.window.MeadowMotion.sample(key,action,elapsed,time,facing,0);
            assert.deepEqual(JSON.parse(JSON.stringify(pose)),JSON.parse(JSON.stringify(expectedPose)),`${key} ${action} pose`);
            const actual=key==='king'?detail.sprite(pose,time):pixels.drawSprite(key,pose,time);
            const expected=key==='king'?sandbox.window.CaveKingDetail.sprite(expectedPose,time):sandbox.window.MeadowCharacters.drawSprite(key,expectedPose,time);
            assert.deepEqual(Array.from((actual as unknown as ReturnType<typeof makeCanvas>).bytes),Array.from(expected.bytes),`${key} ${action} ${facing} pixels`);
        }
    } finally {
        if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');
    }
});

test('all cave creatures keep full-size defeat until the shared shatter boundary; strike resets cleanly',()=>{
    for(const {key} of Object.values(caveProfiles))for(const age of [0,.2,.259,.26,1,60]){
        const p=sampleCavePose(key,'defeat',age,age,-1);
        assert.equal(p.hidden,age>=.26);assert.equal(p.sx,1);assert.equal(p.sy,1);
    }
    const lift=sampleCavePose('king','strike',.65,1,-1);
    assert.ok((lift.foreLift??0)>14);
    const idle=sampleCavePose('king','idle',0,1,-1);
    assert.equal(idle.foreLift,undefined);
    // A continuous body mapping moves the ankle less than the hoof, without cutting a leg out.
    const pose:CavePose={...lift,walk:0};
    assert.ok(kingSourcePoint(44,110,pose,1)[1]-110>kingSourcePoint(44,80,pose,1)[1]-80);
});
