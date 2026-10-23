import type {Facing, MeadowMotion, MeadowPose} from '../meadowPixels/meadowTypes';
export type CaveKey = 'bat' | 'lizard' | 'beast' | 'king';
export type CaveMonsterId = 'monster.cave_bat' | 'monster.cave_crystal_lizard' | 'monster.moss_beast' | 'monster.moss_king';
export type CaveSkill = 'evasion' | 'guard' | 'strike' | 'crystal';
export type CaveMotion = MeadowMotion | CaveSkill;
export interface CavePose extends Omit<MeadowPose, 'action'> {action: CaveMotion; foreLift?: number}
export interface CaveProfile {key: CaveKey; sourceFacing: Facing; airborne: boolean; colors: readonly string[]; skills: readonly CaveSkill[]}
export const caveProfiles: Record<CaveMonsterId, CaveProfile> = {
 'monster.cave_bat': {key:'bat', sourceFacing:-1, airborne:true, colors:['#ead9fa','#b48bc9','#71518f'], skills:['evasion']},
 'monster.cave_crystal_lizard': {key:'lizard', sourceFacing:-1, airborne:false, colors:['#c5f5f3','#6bbfc6','#448f95'], skills:['crystal']},
 'monster.moss_beast': {key:'beast', sourceFacing:-1, airborne:false, colors:['#e1e8ba','#b3c389','#778f61'], skills:['guard']},
 'monster.moss_king': {key:'king', sourceFacing:-1, airborne:false, colors:['#f2e5b8','#bbd6a3','#759e89'], skills:['strike','guard']},
};
export const caveSkillLabels: Record<CaveSkill,string> = {evasion:'闪身',guard:'护体',strike:'重击',crystal:'晶棘突袭'};
export const caveSkillImpact: Record<CaveSkill,number> = {evasion:.4,guard:.6,strike:.88,crystal:.9};
export const isCaveMonsterId = (id:string): id is CaveMonsterId => Object.prototype.hasOwnProperty.call(caveProfiles,id);
export const caveSize = (key:CaveKey) => key === 'king' ? 1.2 : 1;
export const cavePortraitFrame = {width:160,height:160,ground:140/160,plainScale:1,habitatScale:2.25,shadowX:43,shadowY:6};
