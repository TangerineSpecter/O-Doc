import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {equipmentArtProfile} from '../src/components/Combat/art/equipmentArtProfile.ts';
import {equipmentArtLayers} from '../src/components/Combat/art/equipmentArtDrawing.ts';

const csv=readFileSync(new URL('../../system_settings/agent_world/combat/data/equipment_templates.csv',import.meta.url),'utf8').trim().split(/\r?\n/).map(line=>line.split(','));
const header=csv.shift();
const rows=csv.map(values=>Object.fromEntries(header.map((key,i)=>[key,values[i]])));
const baseLegacyWeapons=new Set(['equip.sword','equip.axe','equip.bow','equip.dagger','equip.mage_staff','equip.staff','equip.holy_staff']);
const legacyPlaceholders=new Set(['equip.body','equip.hands','equip.feet','equip.shield','equip.charm']);
const targets=rows.filter(row=>!row.id.startsWith('equip.boss.')&&!baseLegacyWeapons.has(row.id)&&!legacyPlaceholders.has(row.id));
function raster(id) {
 const output=Array(48*48).fill('');
 for(const layer of equipmentArtLayers(id)||[])for(const key of layer.pixels){const[x,y]=key.split(',').map(Number);assert.ok(Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<48&&y>=0&&y<48);output[y*48+x]=layer.color;}
 return output;
}
test('all 150 pixel-drawn catalog items resolve by stable ID while base Lv.10-30 weapons stay untouched',()=>{
 assert.equal(targets.length,150);
 for(const row of targets)assert.ok(equipmentArtProfile(row.id),row.id);
 for(const id of [...baseLegacyWeapons,'equip.boss.star_rift','custom.plate','instance-123','equip.armor.cloth.body.999','equip.head.20'])assert.equal(equipmentArtProfile(id),undefined,id);
});
test('all revised sprites are unique, centred, transparent and uncropped',()=>{
 const hashes=new Map();
 for(const row of targets){
  const pixels=raster(row.id),occupied=pixels.map((color,i)=>color?i:-1).filter(i=>i>=0);
  assert.ok(occupied.length>150,row.id);
  assert.ok(occupied.every(i=>i%48>0&&i%48<47&&Math.floor(i/48)>0&&Math.floor(i/48)<47),row.id);
  const key=pixels.join(',');
  if(row.id==='equip.instrument.element_low'){
   assert.equal(key,raster('equip.instrument').join(','),'element_low base traveler harp shares Lv.10 base appearance');
   continue;
  }
  assert.equal(hashes.has(key),false,`${row.id} duplicates ${hashes.get(key)}`);hashes.set(key,row.id);
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
 assert.ok(sword[10*48+35]&&sword[40*48+8]);
 // A broad diagonal blade occupies the upper right, with a lower-left grip.
 assert.ok(sword[20*48+34]);
 assert.equal(sword[22*48+23],'','Heel notch stays open');
 assert.equal(sword[8*48+40],'','Hook stays concave');
 assert.ok(sword.filter((c,i)=>c&&i%48<15&&Math.floor(i/48)>32).length>35);
});
test('all five head families have five distinct tier silhouettes and explicit family metadata',()=>{
 const mask=id=>raster(id).map(c=>c?'1':'0').join('');
 const families=['cloth','leather','light','heavy','plate'];
 const idsFor=family=>['','30','50','70','90'].map(t=>`equip.head${family==='cloth'?'':'.'+family}${t?'.'+t:''}`);
 for(const family of families){
  const ids=idsFor(family);
  assert.equal(new Set(ids.map(mask)).size,5,family);
  for(const id of ids)assert.equal(equipmentArtProfile(id).family,family);
 }
 for(let tier=0;tier<5;tier++)assert.equal(new Set(families.map(f=>mask(idsFor(f)[tier]))).size,5,`tier ${tier}`);
});

test('training sword blade, crossguard and handle form one connected silhouette',()=>{
 const pixels=raster('equip.training_sword');
 const occupied=new Set(pixels.flatMap((color,i)=>color?[i]:[]));
 const visited=new Set(),pending=[occupied.values().next().value];
 while(pending.length){
  const at=pending.pop();if(visited.has(at))continue;visited.add(at);
  const x=at%48,y=Math.floor(at/48);
  for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
   const nx=x+dx,ny=y+dy,next=ny*48+nx;
   if(nx>=0&&nx<48&&ny>=0&&ny<48&&occupied.has(next)&&!visited.has(next))pending.push(next);
  }
 }
 assert.equal(visited.size,occupied.size,'No detached grip, guard or stray pixels');
});

test('all 48 redesigned elemental and refined weapons have unique connected silhouettes and solid grip anchors',()=>{
 const redesigned=targets.filter(row=>row.slot==='weapon'&&!['equip.training_sword','equip.two_handed_sword','equip.instrument','equip.instrument.element_low'].includes(row.id));
 assert.equal(redesigned.length,48);
 const silhouettes=new Map();
 const gripOf=id=>id.startsWith('equip.sword.')?[12,35]:id.startsWith('equip.axe.')?[13,34]:id.startsWith('equip.dagger.')?[14,33]:id.startsWith('equip.bow.')?[14,24]:id.startsWith('equip.mage_staff.')?[24,36]:id.startsWith('equip.instrument.')?[14,26]:[13,34];
 for(const row of redesigned){
  const pixels=raster(row.id);
  const occupied=new Set(pixels.flatMap((color,i)=>color?[i]:[]));
  const visited=new Set(),pending=[occupied.values().next().value];
  while(pending.length){
   const at=pending.pop();if(visited.has(at))continue;visited.add(at);
   const x=at%48,y=Math.floor(at/48);
   for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
    const nx=x+dx,ny=y+dy,next=ny*48+nx;
    if(nx>=0&&nx<48&&ny>=0&&ny<48&&occupied.has(next)&&!visited.has(next))pending.push(next);
   }
  }
  assert.equal(visited.size,occupied.size,`${row.id} has disconnected pixels`);
  const mask=pixels.map(c=>c?'1':'0').join('');
  assert.equal(silhouettes.has(mask),false,`${row.id} shares silhouette with ${silhouettes.get(mask)}`);
  silhouettes.set(mask,row.id);
  const [gx,gy]=gripOf(row.id);
  assert.ok(pixels[gy*48+gx],`${row.id} grip (${gx},${gy}) must be a solid handle pixel`);
 }
});
