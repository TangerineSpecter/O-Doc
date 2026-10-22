import {drawArena,drawDamage,drawDummy} from './arenaDrawing';
import {drawHero} from './characterDrawing';
import {BattleSimulation} from './BattleSimulation';
import {getWeapon,GROUND,HEIGHT,WIDTH} from './catalog';
import {drawFireAura,drawMageAttack,drawPyroSkill} from './pyroEffects';
import {heroPose} from './pose';
import {drawBladeSkill,drawSwordAttack,drawSwordAura} from './swordEffects';
import type {BattleArt,BattleCommand,BattleSnapshot,Point} from './types';

export class BattleScene {
    private sim=new BattleSimulation();private canvas:HTMLCanvasElement;private g:CanvasRenderingContext2D;
    private request=0;private last=0;private publishAt=0;private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    private origin:Point|null=null;private previousAge=0;
    constructor(host:HTMLElement,private art:BattleArt,private onSnapshot:(snapshot:BattleSnapshot)=>void){
        this.canvas=document.createElement('canvas');this.canvas.width=WIDTH;this.canvas.height=HEIGHT;this.canvas.tabIndex=0;this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','可莉横版精灵战斗画布，点击释放当前职业技能');this.g=this.canvas.getContext('2d')!;this.g.imageSmoothingEnabled=false;host.append(this.canvas);
        if(this.reduced)this.sim.automatic=false;
        this.canvas.addEventListener('click',this.cast);window.addEventListener('keydown',this.key);this.request=requestAnimationFrame(this.loop);
    }
    command(command:BattleCommand){this.sim.command(command);this.onSnapshot(this.sim.snapshot());}
    dispose(){cancelAnimationFrame(this.request);window.removeEventListener('keydown',this.key);this.canvas.remove();}
    private cast=()=>this.command({type:'skill'});
    private key=(event:KeyboardEvent)=>{
        if((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]'))return;
        if(event.repeat)return;
        if(event.code==='Digit1'){event.preventDefault();this.command({type:'attack'});}
        if(event.code==='Digit2'){event.preventDefault();this.command({type:'skill'});}
        if(event.code==='Space'&&!((event.target as HTMLElement).closest('button,a'))){event.preventDefault();this.command({type:'pause'});}
    };
    private loop=(now:number)=>{
        const dt=this.last?Math.min((now-this.last)/1000,.08):0;this.last=now;
        if(!document.hidden)this.sim.tick(dt);
        const s=this.sim.snapshot();this.paint(s);
        if(now-this.publishAt>85){this.publishAt=now;this.onSnapshot(s);this.canvas.dataset.battle=JSON.stringify({...s,origin:this.origin,hero:heroPose(s)});}
        this.request=requestAnimationFrame(this.loop);
    };
    private paint(s:BattleSnapshot){
        const g=this.g,pose=heroPose(s),active=s.action.kind!=='idle',profession=active?s.action.profession:s.loadout.profession;
        g.clearRect(0,0,WIDTH,HEIGHT);g.save();
        const latest=s.events[0],age=latest?s.time-latest.at:99;
        if(latest?.critical&&age<.25&&!this.reduced)g.translate(Math.sin(age*80)*4*(1-age/.25),Math.cos(age*64)*2*(1-age/.25));
        drawArena(g,this.art,s);
        if(profession==='pyromancer')drawFireAura(g,pose,s);else drawSwordAura(g,this.art,pose,s);
        drawDummy(g,this.art,s);const tip=drawHero(g,this.art,s,pose);
        if(!active||s.action.age<this.previousAge)this.origin=null;
        this.previousAge=s.action.age;
        const launch=s.action.kind==='attack'?.35:.9;
        if(active&&s.action.age<launch)this.origin=tip;
        const origin=this.origin??tip;
        if(s.action.kind==='attack'){
            if(getWeapon(s.action.weapon).kind==='sword')drawSwordAttack(g,s,pose);else drawMageAttack(g,s,origin);
        }else if(s.action.kind==='skill'){
            if(s.action.profession==='pyromancer')drawPyroSkill(g,s,origin);else drawBladeSkill(g,this.art,s,pose);
        }
        drawDamage(g,s);
        g.font='12px MiSans, sans-serif';g.fillStyle='#d9dcdaaa';g.textAlign='center';g.fillText('可莉',pose.x,GROUND+28);g.textAlign='left';
        if(latest?.critical&&age<.12){g.fillStyle=`rgba(255,236,187,${(1-age/.12)*.11})`;g.fillRect(0,0,WIDTH,HEIGHT);}
        g.restore();
    }
}
