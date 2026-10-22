import type {FrameName} from '../campWorld/art';
import {footBounds, stopBeforeObstacle} from './placement';
import {getTemplate, TILE} from './templates';
import type {ActorView, Placement} from './types';

interface Actor extends ActorView {goal:number; until:number; walking:boolean; previousX:number; approach:number; counter:number}
export class StudioActors {
    actors:Actor[]=[];
    time=0;
    reset() {
        this.time=0;
        this.actors=[
            {id:'klee',x:648,previousX:648,goal:648,approach:648,pose:'wave',facing:1,text:'可莉的新营地，开张啦！',target:null,until:4,walking:false,counter:0},
            {id:'anya',x:824,previousX:824,goal:824,approach:824,pose:'happy',facing:-1,text:'阿尼亚，想坐新椅子。',target:null,until:6,walking:false,counter:0},
        ];
    }
    interact(id:string,items:Placement[]) {
        const target=items.find(i=>i.id===id);if(!target)return;
        const actor=this.actors.reduce((a,b)=>Math.abs(a.x-target.col*TILE)<Math.abs(b.x-target.col*TILE)?a:b);
        this.go(actor,target,items);
    }
    private go(a:Actor,target:Placement,items:Placement[]) {
        if(a.pose==='sit')a.x=a.approach;
        const t=getTemplate(target.templateId),center=(target.col+t.width/2)*TILE;
        const b=footBounds(target);
        const near=target.solid?(a.x<center?b.left-15:b.right+15):center;
        a.goal=stopBeforeObstacle(a.x,near,items);a.target=target.id;a.walking=true;a.until=this.time+22;
        a.approach=a.goal;a.pose='walk0';a.text=`${a.id==='klee'?'可莉':'阿尼亚'}去${t.action}。`;
    }
    update(dt:number,items:Placement[]) {
        const interactions:string[]=[];
        this.time+=dt;
        for(const a of this.actors){
            // Layout edits may place a new base under an actor; push to its nearest free edge.
            if(a.pose!=='sit')for(const item of items.filter(i=>i.solid)){
                const b=footBounds(item);if(a.x>b.left-9&&a.x<b.right+9){a.x=a.x<(b.left+b.right)/2?b.left-10:b.right+10;a.goal=a.x;a.walking=false;a.until=this.time+1;}
            }
            if(a.walking){
                const distance=a.goal-a.x;a.facing=distance>=0?1:-1;
                const next=a.x+Math.sign(distance)*Math.min(Math.abs(distance),dt*(a.id==='klee'?41:33));
                const permitted=stopBeforeObstacle(a.x,next,items);
                const arrived=Math.abs(a.goal-permitted)<.5||Math.abs(permitted-a.x)<.001;
                a.x=permitted;a.pose=(['walk0','walk1','walk2','walk1'] as FrameName[])[Math.floor(this.time*7)%4];
                if(arrived){
                    a.walking=false;const target=items.find(i=>i.id===a.target);
                    if(target&&Math.abs((target.col+getTemplate(target.templateId).width/2)*TILE-a.x)<100){
                        const t=getTemplate(target.templateId);a.pose=t.pose;a.until=this.time+6;interactions.push(target.id);
                        const lines:Record<string,[string,string]>={lamp:['灯亮了！天黑也不怕！','这盏灯，有一点温柔。'],bench:['冒险家也要休息一下。','坐好，开始观察人类。'],picnic:['热可可，甜甜的！','桌上怎么没有花生？'],cabin:['有人在家吗？可莉来啦！','秘密基地，确认。'],tree:['许愿明天也是晴天！','阿尼亚听见树叶在说话。'],fire:['棉花糖不可以烤糊哦！','阿尼亚不是在偷吃。'],rock:['这里藏着小宝藏吗？','这颗石头，沉默寡言。']};
                        a.text=lines[target.templateId][a.id==='klee'?0:1];
                    }else{a.pose='idle';a.text='前面有东西，先在这里等一会。';a.until=this.time+3;}
                }
            }else if(this.time>a.until){
                const reachable=items.filter(item=>{
                    const t=getTemplate(item.templateId),b=footBounds(item),center=(item.col+t.width/2)*TILE;
                    const to=item.solid?(a.x<center?b.left-15:b.right+15):center;
                    return Math.abs(stopBeforeObstacle(a.x,to,items)-to)<1;
                });
                if(reachable.length){const next=reachable[(a.counter+++(a.id==='anya'?2:0))%reachable.length];this.go(a,next,items);}
                else{a.pose='wave';a.text='这里的风景，也不错！';a.until=this.time+7;}
            }
        }
        return interactions;
    }
}
