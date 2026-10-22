import assert from 'node:assert/strict';
import test from 'node:test';
import {BattleSimulation} from './BattleSimulation';
import {heroPose,weaponTransform} from './pose';
import {getWeapon} from './catalog';

function advance(sim:BattleSimulation,seconds:number){for(let i=0;i<Math.ceil(seconds*60);i++)sim.tick(1/60);}
function manual(){const sim=new BattleSimulation();sim.command({type:'automatic'});return sim;}
test('default is spark Klee with pyromancer and moon staff; damage waits for visual impact',()=>{
    const sim=manual();assert.deepEqual(sim.loadout,{profession:'pyromancer',outfit:'spark',weapon:'moon'});
    sim.command({type:'attack'});advance(sim,.84);assert.equal(sim.hits,0);advance(sim,.08);assert.equal(sim.hits,1);assert.equal(sim.damage,124);
});
test('changing clothing and weapon preserves profession and the active animation clock',()=>{
    const sim=manual();sim.command({type:'skill'});advance(sim,.5);const age=sim.action.age;
    sim.command({type:'outfit',id:'scholar'});sim.command({type:'weapon',id:'katana'});
    assert.equal(sim.action.age,age);assert.equal(sim.action.profession,'pyromancer');assert.equal(sim.loadout.profession,'pyromancer');
    advance(sim,1.7);assert.equal(sim.events.some(e=>e.label==='星陨花火'),true);
});
test('blade skill produces exactly 24 distinct sword impacts followed by one judgment hit',()=>{
    const sim=manual();sim.command({type:'preset',id:'blademaster'});sim.command({type:'skill'});advance(sim,1.45);assert.equal(sim.hits,0);
    advance(sim,1.65);assert.equal(sim.hits,24);assert.equal(sim.events.some(e=>e.label==='神裁天剑'),false);
    advance(sim,1.1);assert.equal(sim.hits,25);assert.equal(sim.events[0].label,'神裁天剑');advance(sim,2);assert.equal(sim.hits,25);
});
test('three pyromancer attacks trigger one ember follow-up and pause freezes the complete simulation',()=>{
    const sim=manual();for(let i=0;i<3;i++){sim.command({type:'attack'});advance(sim,1.5);}
    assert.equal(sim.hits,4);assert.equal(sim.events.filter(e=>e.label==='余烬追击').length,1);
    sim.command({type:'pause'});const before=sim.snapshot();advance(sim,3);assert.deepEqual(sim.snapshot(),before);
});
test('dummy breaks once, recovers, and reset clears pending follow-up hits',()=>{
    const sim=manual();sim.hp=100;sim.command({type:'attack'});advance(sim,1);assert.equal(sim.hp,0);assert.notEqual(sim.breakAt,null);
    advance(sim,3);assert.equal(sim.hp,sim.maxHp);assert.equal(sim.breakAt,null);
    sim.command({type:'reset'});assert.equal(sim.hits,0);advance(sim,2);assert.equal(sim.damage,0);
});
test('weapon emission uses the configured tip, scale and hand anchor',()=>{
    const sim=manual(),pose=heroPose(sim.snapshot()),weapon=getWeapon('moon'),hand={x:71,y:100};
    const point=weaponTransform(pose,hand,weapon.grip,weapon.tip,weapon.scale,weapon.angle);
    const alternate=weaponTransform(pose,hand,weapon.grip,weapon.tip,weapon.scale,weapon.angle+Math.PI/2);
    assert.ok(point.x>pose.x);assert.ok(point.y<pose.y-70);assert.notDeepEqual(point,alternate);
});
