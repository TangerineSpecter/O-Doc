import {getProfession,getWeapon} from './catalog';
import type {BattleAction,BattleCommand,BattleSnapshot,HitEvent,Loadout} from './types';

const idle=():BattleAction=>({kind:'idle',profession:'pyromancer',weapon:'moon',age:0,duration:1,hitKeys:[]});
export class BattleSimulation {
    time=0;
    loadout:Loadout={profession:'pyromancer',weapon:'moon',outfit:'spark'};
    action=idle();paused=false;automatic=true;speed=1;hp=12000;maxHp=12000;hits=0;damage=0;embers=0;
    events:HitEvent[]=[];breakAt:number|null=null;
    private serial=0;private nextAutomatic=1.5;private attacks=0;private followAt:number|null=null;
    command(command:BattleCommand) {
        switch(command.type){
            case 'attack':case 'skill':this.start(command.type);break;
            case 'pause':this.paused=!this.paused;break;
            case 'automatic':this.automatic=!this.automatic;this.nextAutomatic=this.time+1;break;
            case 'speed':this.speed=this.speed===1?.5:this.speed===.5?1.5:1;break;
            case 'reset':this.hp=this.maxHp;this.hits=0;this.damage=0;this.events=[];this.breakAt=null;this.action=idle();this.embers=0;this.followAt=null;this.nextAutomatic=this.time+2;break;
            case 'profession':this.loadout={...this.loadout,profession:command.id};this.embers=0;break;
            case 'outfit':this.loadout={...this.loadout,outfit:command.id};break;
            case 'weapon':this.loadout={...this.loadout,weapon:command.id};break;
            case 'preset':this.loadout=command.id==='blademaster'?{profession:'blademaster',outfit:'blade',weapon:'katana'}:{profession:'pyromancer',outfit:'spark',weapon:'moon'};this.embers=0;break;
        }
    }
    private start(kind:'attack'|'skill') {
        if(this.action.kind!=='idle'||this.breakAt!==null)return;
        this.action={kind,profession:this.loadout.profession,weapon:this.loadout.weapon,age:0,duration:kind==='attack'?1.4:this.loadout.profession==='pyromancer'?4.2:5.6,hitKeys:[]};
    }
    private hit(key:string,at:number,damage:number,label:string,color:string,critical=false){
        if(this.action.age<at||this.action.hitKeys.includes(key)||this.breakAt!==null)return;
        this.action.hitKeys.push(key);this.applyHit(damage,label,color,critical);
    }
    private applyHit(damage:number,label:string,color:string,critical:boolean){
        this.hp=Math.max(0,this.hp-damage);this.damage+=damage;this.hits++;
        this.events.unshift({id:++this.serial,at:this.time,damage,label,color,critical});this.events=this.events.slice(0,50);
        if(this.hp===0)this.breakAt=this.time;
    }
    tick(rawDt:number){
        if(this.paused)return;const dt=Math.max(0,Math.min(rawDt,.1))*this.speed;this.time+=dt;
        if(this.breakAt!==null&&this.time-this.breakAt>2.6){this.hp=this.maxHp;this.breakAt=null;this.nextAutomatic=this.time+1;}
        const a=this.action;
        if(a.kind!=='idle'){
            a.age+=dt;
            if(a.kind==='attack'){
                const sword=getWeapon(a.weapon).kind==='sword',before=a.hitKeys.length;
                this.hit('normal',sword?.57:.88,sword?186:124,sword?'一闪斩':'星芒命中',getProfession(a.profession).color);
                if(a.profession==='pyromancer'&&a.hitKeys.length>before){this.embers=(this.embers+1)%3;if(this.embers===0)this.followAt=this.time+.24;}
            }else if(a.profession==='pyromancer'){
                this.hit('fire-core',1.68,520,'星陨花火','#ffd5a1',true);
                for(let i=0;i<5;i++)this.hit(`fire-petal-${i}`,1.82+i*.14,68,'四叶焰','#ffb881');
            }else{
                for(let i=0;i<24;i++)this.hit(`sword-${i}`,1.48+i*.061,42+i%4*7,'飞剑追击','#b1eced');
                this.hit('judgment',4.05,980,'神裁天剑','#ffe3a1',true);
            }
            if(a.age>=a.duration){this.action={...idle(),profession:this.loadout.profession,weapon:this.loadout.weapon};this.nextAutomatic=this.time+.7;}
        }else if(this.automatic&&this.time>=this.nextAutomatic&&this.breakAt===null){
            this.start(this.attacks++%4===3?'skill':'attack');
        }
        if(this.followAt!==null&&this.time>=this.followAt){if(this.breakAt===null)this.applyHit(96,'余烬追击','#ffc49a',false);this.followAt=null;}
    }
    snapshot():BattleSnapshot{
        const a=this.action,skill=getProfession(a.profession);
        const phaseIndex=a.profession==='pyromancer'?(a.age<.9?0:a.age<1.68?1:a.age<2.8?2:3):(a.age<.85?0:a.age<3.3?1:a.age<4.5?2:3);
        const phase=a.kind==='idle'?'待机':a.kind==='attack'?(a.age<.45?'准备':a.age<1?'命中':'收势'):skill.phases[phaseIndex];
        return {time:this.time,loadout:{...this.loadout},action:{...a,hitKeys:[...a.hitKeys]},paused:this.paused,automatic:this.automatic,speed:this.speed,hp:this.hp,maxHp:this.maxHp,hits:this.hits,damage:this.damage,embers:this.embers,events:this.events.map(e=>({...e})),breakAt:this.breakAt,phase};
    }
}
