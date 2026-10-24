const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const scope = {window:{}};
vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname,'motion.js'),'utf8'),scope);
const {pose,solve,actions} = scope.window.AnyaMotion;
let poses=0,chains=0,maxLengthError=0;
for (const [action,meta] of Object.entries(actions)) {
 for(let i=0;i<=200;i++) {
  const q=pose(action,meta.duration*i/200);
  const a=q.lean*Math.PI/180;
  const shoulder=(x,y)=>({x:q.pelvisX+x*Math.cos(a)-y*Math.sin(a),y:q.pelvisY+x*Math.sin(a)+y*Math.cos(a)});
  const limbs=[
   [{x:q.pelvisX+9,y:q.pelvisY},q.nearFoot,88,90,-1],
   [{x:q.pelvisX-12,y:q.pelvisY},q.farFoot,88,90,-1],
   [shoulder(5,-133),q.nearHand,60,63,-1],
   [shoulder(24,-135),q.farHand,60,63,1]
  ];
  for(const [start,target,first,second,branch] of limbs) {
   const {joint,end,clamped}=solve(start,target,first,second,branch);
   assert.ok(!clamped,`${action} ${i}: unreachable target`);
   const error=Math.max(Math.abs(Math.hypot(joint.x-start.x,joint.y-start.y)-first),Math.abs(Math.hypot(end.x-joint.x,end.y-joint.y)-second));
   assert.ok(Number.isFinite(error)&&error<1e-7,'bone length changed');
   maxLengthError=Math.max(maxLengthError,error);chains++;
  }
  for(const foot of [q.nearFoot,q.farFoot])if(foot.contact){assert.equal(foot.y,-18);assert.equal(foot.angle,0);}
  poses++;
 }
}
console.log(JSON.stringify({poses,chains,maxLengthError,unreachableTargets:0,contactHeight:'constant'}));
