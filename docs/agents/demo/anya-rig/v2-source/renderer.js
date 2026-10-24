/* Flat atlas attachments on articulated chains. IK supplies joints; drawing never drives motion. */
window.AnyaRenderer=class {
 constructor(canvas,image){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.image=image;this.parts=AnyaAtlas;}
 sprite(key,x,y,w,h){const r=this.parts[key];this.ctx.drawImage(this.image,r.x,r.y,r.w,r.h,x,y,w,h);}
 joint(name,p,parent){this.joints.push({name,...p,parent});}
 segment(key,a,b,width,pad=8){const c=this.ctx,angle=Math.atan2(b.y-a.y,b.x-a.x),length=Math.hypot(b.x-a.x,b.y-a.y);c.save();c.translate(a.x,a.y);c.rotate(angle-Math.PI/2);this.sprite(key,-width/2,-pad,width,length+pad*2);c.restore();}
 leg(side,hip,foot){const c=this.ctx,sol=AnyaMotion.solve(hip,foot,88,90,-1);this.joint('hip'+side,hip);this.joint('knee'+side,sol.joint,hip);this.joint('ankle'+side,sol.end,sol.joint);this.segment('thigh'+side,hip,sol.joint,37,9);this.segment('shin'+side,sol.joint,sol.end,29,7);c.save();c.translate(sol.end.x,sol.end.y);c.rotate(foot.angle*Math.PI/180);this.sprite('boot',-15,-17,58,37);c.restore();if(sol.clamped)this.clamped++;}
 arm(side,shoulder,target,casting){const c=this.ctx,sol=AnyaMotion.solve(shoulder,target,60,63,side==='N'?-1:1);this.joint('shoulder'+side,shoulder);this.joint('elbow'+side,sol.joint,shoulder);this.joint('wrist'+side,sol.end,sol.joint);this.segment('upper'+side,shoulder,sol.joint,43,11);this.segment('fore'+side,sol.joint,sol.end,34,8);const angle=Math.atan2(sol.end.y-sol.joint.y,sol.end.x-sol.joint.x);c.save();c.translate(sol.end.x,sol.end.y);
 if(casting){c.rotate(-.05);this.sprite('palm',-6,-20,55,31);this.palm={x:sol.end.x+28,y:sol.end.y-18};}
 else {c.rotate(angle);if(side==='N'){// Fist wrist is on the left of its atlas image. Handle passes through curled fingers.
 c.save();c.translate(21,4);c.rotate(-Math.PI/2);this.sprite('sword',-24,-25,170,51);c.restore();}this.sprite('fist',-8,-17,40,34);}
 c.restore();if(sol.clamped)this.clamped++;}
 render(action,time,options={}){const c=this.ctx,W=this.canvas.width,H=this.canvas.height,q=AnyaMotion.pose(action,time),p=time/AnyaMotion.actions[action].duration;this.joints=[];this.clamped=0;this.palm=null;c.resetTransform();c.clearRect(0,0,W,H);const scale=Math.min(W/600,H/650),origin={x:W*.46,y:H*.85};this.scale=scale;this.origin=origin;c.save();c.translate(origin.x,origin.y);c.scale((options.flip?-1:1)*scale,scale);
 // Ground contact is in the same coordinate space as feet, including mirror and scale.
 c.strokeStyle='#a8a39855';c.lineWidth=1;c.beginPath();c.moveTo(-185,2);c.lineTo(250,2);c.stroke();if(action==='move'){for(let i=-5;i<8;i++){const x=i*45-(p*120)%45;c.beginPath();c.moveTo(x,2);c.lineTo(x-8,6);c.stroke();}}
 c.fillStyle='#39352c12';c.beginPath();c.ellipse(8,4,85,9,0,0,7);c.fill();
 const spread=options.spread?55:0,pelvis={x:q.pelvisX,y:q.pelvisY};
 const transform=(x,y)=>{const a=q.lean*Math.PI/180;return{x:pelvis.x+x*Math.cos(a)-y*Math.sin(a),y:pelvis.y+x*Math.sin(a)+y*Math.cos(a)};};
 const nearShoulder=transform(5,-133),farShoulder=transform(24,-135);nearShoulder.x-=spread;farShoulder.x+=spread;
 c.save();c.translate(pelvis.x-20-spread,pelvis.y-140);c.rotate((q.lean+q.cape)*Math.PI/180);this.sprite('cape',-77,0,114,173);c.restore();
 c.save();c.globalAlpha=.83;this.leg('F',{x:pelvis.x-12-spread,y:pelvis.y},{...q.farFoot,x:q.farFoot.x-spread});this.arm('F',farShoulder,{x:q.farHand.x+spread,y:q.farHand.y},q.cast>.1);c.restore();
 this.leg('N',{x:pelvis.x+9+spread,y:pelvis.y},{...q.nearFoot,x:q.nearFoot.x+spread});
 c.save();c.translate(pelvis.x,pelvis.y);c.rotate(q.lean*Math.PI/180);this.sprite('torso',-49,-155-q.breath,105,130+q.breath);this.sprite('skirt',-54,-33,123,77);c.restore();

 const neck=transform(10,-153-spread);this.joint('neck',neck,pelvis);c.save();c.translate(neck.x,neck.y-q.breath);c.rotate((q.head+q.lean*.3)*Math.PI/180);this.sprite('head',-89,-167,182,190);c.restore();
  this.arm('N',nearShoulder,{x:q.nearHand.x-spread,y:q.nearHand.y},false);
 if(options.effects)this.effects(action,p,q);
 if(options.bones){c.strokeStyle='#238b83';c.fillStyle='#fcfff8';c.lineWidth=1.4;for(const j of this.joints){if(j.parent){c.beginPath();c.moveTo(j.parent.x,j.parent.y);c.lineTo(j.x,j.y);c.stroke();}c.beginPath();c.arc(j.x,j.y,3,0,7);c.fill();c.stroke();}for(const f of[q.nearFoot,q.farFoot]){c.fillStyle=f.contact?'#238b83':'#c58b45';c.fillRect(f.x-12,5,32,3);}}
 c.restore();
 }
 effects(action,p,q){const c=this.ctx;if(action==='cast'&&this.palm&&p>.16&&p<.88){const t=Math.max(0,(p-.65)/.23),x=this.palm.x+t*155,y=this.palm.y-t*12,r=22;c.save();c.globalAlpha=Math.min(1,q.cast*1.3);const glow=c.createRadialGradient(x,y,1,x,y,r);glow.addColorStop(0,'#f9ffe1');glow.addColorStop(.3,'#b7eaa5cc');glow.addColorStop(1,'#73b77700');c.fillStyle=glow;c.beginPath();c.arc(x,y,r,0,7);c.fill();for(let i=0;i<6;i++){const a=p*9+i*Math.PI/3;c.fillStyle='#89ab68';c.beginPath();c.arc(x+Math.cos(a)*24,y+Math.sin(a)*16,1.5,0,7);c.fill();}c.restore();}
 if(action==='attack'&&p>.4&&p<.64){c.save();c.globalAlpha=Math.sin((p-.4)/.24*Math.PI)*.5;c.strokeStyle='#bb9a5e';c.lineWidth=3;c.beginPath();c.arc(60,-290,105,-1.4,.7);c.stroke();c.restore();}
 if(action==='hit'&&p<.25){c.save();c.globalAlpha=q.impact*.5;c.strokeStyle='#b26d62';c.lineWidth=2;for(let i=0;i<3;i++){c.beginPath();c.moveTo(65+i*9,-280+i*12);c.lineTo(75+i*9,-287+i*12);c.stroke();}c.restore();}
 }
};
