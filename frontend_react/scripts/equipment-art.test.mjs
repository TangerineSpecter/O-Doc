import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {equipmentArtProfile} from '../src/components/Combat/art/equipmentArtProfile.ts';
import {equipmentArtLayers} from '../src/components/Combat/art/equipmentArtDrawing.ts';

const csv=readFileSync(new URL('../../system_settings/agent_world/combat/data/equipment_templates.csv',import.meta.url),'utf8').trim().split(/\r?\n/).map(line=>line.split(','));
const header=csv.shift();
const rows=csv.map(values=>Object.fromEntries(header.map((key,i)=>[key,values[i]])));
const targets=rows.filter(row=>/^equip\.(armor\.|head(?:\.|$)|ring$|offhand\.|two_handed_sword$)/.test(row.id));
function raster(id) {
 const output=Array(48*48).fill('');
 for(const layer of equipmentArtLayers(id)||[])for(const key of layer.pixels){const[x,y]=key.split(',').map(Number);assert.ok(Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<48&&y>=0&&y<48);output[y*48+x]=layer.color;}
 return output;
}
test('all 79 requested catalog items resolve by stable ID with no snapshot metadata',()=>{
 assert.equal(targets.length,79);
 for(const row of targets)assert.ok(equipmentArtProfile(row.id),row.id);
 for(const id of ['equip.sword','equip.boss.star_rift','custom.plate','instance-123','equip.armor.cloth.body.999','equip.head.20'])assert.equal(equipmentArtProfile(id),undefined,id);
});
test('all revised sprites are unique, centred, transparent and uncropped',()=>{
 const hashes=new Map();
 for(const row of targets){
  const pixels=raster(row.id),occupied=pixels.map((color,i)=>color?i:-1).filter(i=>i>=0);
  assert.ok(occupied.length>150,row.id);
  assert.ok(occupied.every(i=>i%48>0&&i%48<47&&Math.floor(i/48)>0&&Math.floor(i/48)<47),row.id);
  const key=pixels.join(',');assert.equal(hashes.has(key),false,`${row.id} duplicates ${hashes.get(key)}`);hashes.set(key,row.id);
 }
});
test('five armour families, three shields and five headpieces have separate silhouettes',()=>{
 const mask=id=>raster(id).map(c=>c?'1':'0').join('');
 for(const ids of [
  ['cloth','leather','light','plate','heavy'].map(f=>`equip.armor.${f}.body`),
  ['magic','small','large'].map(f=>`equip.offhand.${f}_shield`),
  ['','30','50','70','90'].map(s=>`equip.head${s?'.'+s:''}`),
 ])assert.equal(new Set(ids.map(mask)).size,ids.length);
});
test('ring keeps an open centre and greatsword has a separate blade and long grip',()=>{
 const ring=raster('equip.ring');assert.equal(ring[28*48+23],'');
 const sword=raster('equip.two_handed_sword');
 assert.ok(sword[9*48+35]);assert.ok(sword[40*48+7]);
 assert.ok(sword.filter((c,i)=>c&&i%48<15&&Math.floor(i/48)>32).length>35);
});
