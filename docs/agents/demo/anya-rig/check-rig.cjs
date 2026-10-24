// Geometry guards only. These do not establish visual or artistic correctness.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const scope = {};
scope.window = scope;
vm.createContext(scope);
for (const file of ['atlas.js', 'motion.js', 'character-art.js', 'renderer.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), scope);
}
const ctx = new Proxy({}, {get: (target, key) => target[key] ?? (() => ({addColorStop(){}}))});
const renderer = new scope.AnyaRenderer({width:1000,height:800,getContext:()=>ctx}, {});
const {pose, actions, radians} = scope.AnyaMotion;
let poses = 0, chains = 0, maxLengthError = 0, groundedFeet = 0;
for (const [action, meta] of Object.entries(actions)) {
  const endpoints = [];
  for (let i=0;i<=200;i++) {
    const time = meta.duration*i/200;
    renderer.render(action,time,{effects:true});
    assert.equal(renderer.clamped,0,`${action} ${i}: unreachable leg target`);
    for (const joint of renderer.joints) {
      if (!joint.parent || joint.name === 'spine') continue;
      const length = joint.name.startsWith('elbow') ? 48 : joint.name.startsWith('hand') ? 44 : 66;
      const error = Math.abs(Math.hypot(joint.x-joint.parent.x,joint.y-joint.parent.y)-length);
      assert.ok(Number.isFinite(error) && error<1e-7,`${action}: bone length changed`);
      maxLengthError = Math.max(maxLengthError,error); chains++;
    }
    for (const foot of [pose(action,time).nearFoot,pose(action,time).farFoot]) {
      const a=radians(foot.angle), sole=foot.y+Math.max(...[[-15,10],[-6,12],[0,15],[14,17],[30,14],[34,10]].map(([x,y])=>x*Math.sin(a)+y*Math.cos(a)));
      assert.ok(sole<1e-7,`${action}: foot below ground`);
      if (foot.contact) {assert.ok(Math.abs(sole)<1e-7); groundedFeet++;}
    }
    if (i===0 || i===200) endpoints.push(renderer.joints.map(j=>({x:j.x,y:j.y})));
    poses++;
  }
  endpoints[0].forEach((joint,i)=>assert.ok(Math.hypot(joint.x-endpoints[1][i].x,joint.y-endpoints[1][i].y)<1e-6,`${action}: discontinuous loop`));
}
console.log(JSON.stringify({poses,segments:chains,maxLengthError,groundedFeet,unreachableTargets:0,loopSeams:0,note:'Geometry only; browser screenshots are separately inspected.'},null,2));
