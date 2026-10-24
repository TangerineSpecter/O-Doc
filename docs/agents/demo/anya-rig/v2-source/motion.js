/* Pose targets in character coordinates. Feet and wrists drive two-bone chains. */
window.AnyaMotion=(()=>{
 const actions={
 idle:{name:'待机',detail:'稳定支撑与呼吸',duration:3.2,description:'双脚落地，呼吸只带动躯干与头部。手腕、武器和肘部保持连贯。'},
 move:{name:'移动',detail:'支撑、离地、摆腿、落脚',duration:1.4,description:'朝右原地行走。脚沿地面向后支撑，再抬脚向前摆动；膝盖向前弯曲，脚掌独立保持朝向。地面刻线表示前进速度。'},
 attack:{name:'攻击',detail:'预备、举剑、下劈、回收',duration:1.8,description:'前后脚固定支撑，重心前移。肩、肘、腕带动剑刃完成举剑和下劈，握拳与剑柄共用握点。'},
 cast:{name:'施法',detail:'抬前臂、托掌、释放',duration:2.6,description:'上臂保持靠近身体，前臂抬起，切换独立托掌姿势；魔法从掌心向前释放。'},
 hit:{name:'受击',detail:'屈膝吸收与重心恢复',duration:1.2,description:'双脚保持支撑，骨盆后移下沉，膝盖弯曲吸收冲击。躯干后仰后恢复，不把整个人悬空平移。'}
 };
 const ease=t=>t*t*(3-2*t);
 function curve(t,keys){for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const a=keys[i-1],b=keys[i];return a[1]+(b[1]-a[1])*ease((t-a[0])/(b[0]-a[0]));}return keys.at(-1)[1];}
 const mix=(a,b,t)=>a+(b-a)*t;
 function step(p){p=(p+1)%1;if(p<.6)return{x:mix(36,-36,p/.6),y:-18,angle:0,contact:true};const t=(p-.6)/.4;return{x:mix(-36,36,ease(t)),y:-18-29*Math.sin(Math.PI*t),angle:-12*Math.sin(Math.PI*t),contact:false};}
 function pose(action,time){const p=Math.min(1,time/actions[action].duration),wave=Math.sin(p*Math.PI*2);const q={pelvisX:0,pelvisY:-192,lean:0,head:wave*.7,cape:wave*1.4,breath:wave*1.2,nearFoot:{x:24,y:-18,angle:0,contact:true},farFoot:{x:-23,y:-18,angle:0,contact:true},nearHand:{x:42,y:-222},farHand:{x:25,y:-230},cast:0,impact:0,walk:0};
 if(action==='move'){q.walk=p;q.nearFoot=step(p);q.farFoot=step(p+.5);q.pelvisY+=5+2*Math.cos(p*Math.PI*4);q.lean=3;q.nearHand.x=30+18*wave;q.nearHand.y=-225+3*Math.cos(p*Math.PI*2);q.farHand.x=30-18*wave;q.cape=-4+3*Math.sin(p*Math.PI*2-.5);}
 if(action==='attack'){q.nearFoot.x=32;q.farFoot.x=-32;const wind=curve(p,[[0,0],[.27,1],[.4,1],[.57,0],[1,0]]),swing=curve(p,[[0,0],[.4,0],[.56,1],[.7,.8],[1,0]]);q.pelvisX=-8*wind+15*swing;q.pelvisY+=5*swing;q.lean=-5*wind+10*swing;q.nearHand.x=42+58*wind+48*swing;q.nearHand.y=-222-118*wind-4*swing;q.farHand.x=25-20*swing;q.cape=-q.lean*.7;q.head=-q.lean*.35;}
 if(action==='cast'){q.cast=curve(p,[[0,0],[.26,1],[.7,1],[1,0]]);q.farHand.x=25+75*q.cast;q.farHand.y=-230-50*q.cast;q.lean=-2*q.cast;q.head=3*q.cast;}
 if(action==='hit'){q.impact=curve(p,[[0,0],[.12,1],[.32,.7],[1,0]]);q.pelvisX=-15*q.impact;q.pelvisY+=15*q.impact;q.lean=-9*q.impact;q.head=-4*q.impact;q.nearHand.x=42-15*q.impact;q.nearHand.y=-222-12*q.impact;q.cape=5*q.impact;}
 return q;}
 // Anatomical hinge: branch -1 puts knees forward in a right-facing profile.
 function solve(a,b,l1,l2,branch=-1){let dx=b.x-a.x,dy=b.y-a.y;const raw=Math.hypot(dx,dy),d=Math.max(.01,Math.min(raw,l1+l2-.01)),ux=dx/(raw||1),uy=dy/(raw||1);const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));const joint={x:a.x+ux*along-uy*height*branch,y:a.y+uy*along+ux*height*branch};const end={x:a.x+ux*d,y:a.y+uy*d};return{joint,end,clamped:raw>d+.1};}
 return{actions,pose,solve};
})();
