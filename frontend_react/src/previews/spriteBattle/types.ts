export type ProfessionId='pyromancer'|'blademaster';
export type OutfitId='spark'|'scholar'|'blade';
export type WeaponId='moon'|'inferno'|'katana';
export type ActionKind='idle'|'attack'|'skill';
export interface Point {x:number;y:number}
export interface Loadout {profession:ProfessionId;outfit:OutfitId;weapon:WeaponId}
export interface WeaponDefinition {id:WeaponId;name:string;shortName:string;kind:'staff'|'sword';grip:Point;tip:Point;scale:number;angle:number;color:string;description:string}
export interface OutfitDefinition {id:OutfitId;name:string;row:number;color:string;description:string}
export interface ProfessionDefinition {id:ProfessionId;name:string;english:string;color:string;skill:string;passive:string;description:string;phases:string[]}
export interface BattleAction {kind:ActionKind;profession:ProfessionId;weapon:WeaponId;age:number;duration:number;hitKeys:string[]}
export interface HitEvent {id:number;at:number;damage:number;label:string;color:string;critical:boolean}
export interface BattleSnapshot {time:number;loadout:Loadout;action:BattleAction;paused:boolean;automatic:boolean;speed:number;hp:number;maxHp:number;hits:number;damage:number;embers:number;events:HitEvent[];breakAt:number|null;phase:string}
export type BattleCommand={type:'attack'|'skill'|'pause'|'automatic'|'speed'|'reset'}|{type:'profession';id:ProfessionId}|{type:'outfit';id:OutfitId}|{type:'weapon';id:WeaponId}|{type:'preset';id:ProfessionId};
export interface SpriteFrame {canvas:HTMLCanvasElement;hand:Point}
export interface BattleArt {background:HTMLImageElement;frames:Record<OutfitId,SpriteFrame[]>;weapons:Record<WeaponId,HTMLImageElement>;dummy:HTMLCanvasElement;dummyFlash:HTMLCanvasElement}
export interface HeroPose extends Point {frame:number;rotation:number;weaponRotation:number;scale:number}
