import warriorSheet from '../../../assets/combat/player-warrior-concept-v1.png';
import rangerSheet from '../../../assets/combat/player-ranger-concept-v1.png';
import priestSheet from '../../../assets/combat/player-priest-concept-v1.png';
import mageSheet from '../../../assets/combat/player-mage-concept-v1.png';
import weaponSheet from '../../../assets/combat/player-weapons-concept-v1.png';
import {playerSheetUrl, playerSheetSize, playerPortraitRegion, crystalStaffRegion} from './playerVisuals';
import type {PlayerArtRegion, PlayerJob} from './playerVisuals';

export type ConceptFamily = 'novice' | 'warrior' | 'mage' | 'ranger' | 'priest';
export interface ConceptArt {url: string; size: {width: number; height: number}; region: PlayerArtRegion}
export interface ProfessionConcept {id: string; name: string; family: ConceptFamily; stage: number; level: number; parent: string; description: string; approved?: boolean; art: ConceptArt}
export interface WeaponConcept {id: string; name: string; description: string; approved?: boolean; art: ConceptArt}
export const familyNames: Record<ConceptFamily, string> = {novice: '新手', warrior: '战士系', mage: '法师系', ranger: '游侠系', priest: '牧师系'};

function sheetArt(url: string, width: number, height: number, region: readonly number[]): ConceptArt {
    const [x, y, regionWidth, regionHeight] = region;
    return {url, size: {width, height}, region: {x, y, width: regionWidth, height: regionHeight}};
}
function approvedArt(id: PlayerJob): ConceptArt {return {url: playerSheetUrl, size: playerSheetSize, region: playerPortraitRegion(id)};}
type Outfit = readonly [id: string, name: string, stage: number, parent: string, description: string];
function familyConcepts(family: ConceptFamily, url: string, dimensions: readonly [number, number], outfits: readonly Outfit[], regions: readonly (readonly number[])[]): ProfessionConcept[] {
    return outfits.map(([id, name, stage, parent, description], index) => ({id: `job.${id}`, name, family, stage, level: stage === 1 ? 10 : stage === 2 ? 30 : 70, parent, description, art: sheetArt(url, ...dimensions, regions[index])}));
}
const warriors = familyConcepts('warrior', warriorSheet, [1536, 1024], [
    ['warrior', '战士', 1, '新手', '赤色短战衣与轻钢护肩，朴素的近战起点。'],
    ['swordsman', '剑士', 2, '战士', '钴蓝战衣、轻银肩甲与白色腰带，轮廓更轻巧。'],
    ['guardian', '守卫', 2, '战士', '宽厚的方形肩甲与层叠钢甲，站姿显得结实。'],
    ['swordmaster', '剑圣', 3, '剑士', '象牙白战衣、单侧银肩甲与深蓝披风。'],
    ['spellblade', '盾卫', 3, '守卫', '板甲与巨盾构成的守卫高阶路线。'],
    ['paladin', '圣骑士', 3, '守卫', '白金板甲、十字胸饰与酒红披风，庄重明亮。'],
    ['berserker', '狂战士', 3, '剑士', '铜色护甲与红色毛领，肩部体积更强。'],
], [[30,40,320,474],[414,40,320,474],[798,40,320,474],[1182,40,320,474],[798,40,320,474],[400,527,334,479],[798,527,320,479]]);
const rangers = familyConcepts('ranger', rangerSheet, [1536, 1024], [
    ['ranger', '游侠', 1, '新手', '苔绿短披肩与皮革背心，轻装冒险的起点。'],
    ['archer', '弓手', 2, '游侠', '森林绿轻装、皮质护腕与一枚橙羽肩饰。'],
    ['assassin', '刺客', 2, '游侠', '暗紫围巾与贴身轻甲，脸部保持清楚。'],
    ['sharpshooter', '神射手', 3, '弓手', '青蓝轻装、白羽肩饰与金扣，更利落精致。'],
    ['hunter', '猎人', 3, '弓手', '赭色皮衣、橄榄披风与毛领，偏野外生存。'],
    ['shadowdancer', '影舞者', 3, '刺客', '深蓝紫短披风、月牙扣与错层披肩。'],
    ['trickster', '诡术师', 3, '刺客', '酒紫双角领、菱形布饰与金扣，带一点狡黠。'],
], [[29,68,318,454],[407,68,319,454],[800,68,320,454],[1181,68,317,454],[30,546,317,454],[407,546,319,454],[791,546,320,454]]);
const priests = familyConcepts('priest', priestSheet, [1536, 1024], [
    ['priest', '牧师', 1, '新手', '浅蓝披肩与奶油白短袍，温和清爽。'],
    ['cleric', '祭司', 2, '牧师', '深蓝肩领、白色垂带与简洁十字胸饰。'],
    ['naturalist', '自然使', 2, '牧师', '叶片披肩与木纹胸扣，衣摆延续自然形状。'],
    ['highpriest', '神官', 3, '祭司', '白金层叠祭服与日轮胸饰，更庄严醒目。'],
    ['inquisitor', '审判者', 3, '祭司', '暗蓝银甲与红十字白垂带，偏战斗祭服。'],
    ['druid', '德鲁伊', 3, '自然使', '绿袍、毛领与翠玉木饰，突出荒野气息。'],
    ['warden', '守望者', 3, '自然使', '青绿甲袍、象牙色护肩与叶形胸扣。'],
], [[23,69,318,466],[406,69,318,466],[790,69,318,466],[1174,69,318,466],[23,546,318,460],[407,546,318,461],[791,546,318,461]]);
const newMages = familyConcepts('mage', mageSheet, [1774, 887], [
    ['occultist', '秘术师', 2, '法师', '紫色层叠披肩与银色三角扣，沉静神秘。'],
    ['cryomancer', '冰术师', 3, '元素师', '冰蓝白短袍、棱角肩领与蓝晶胸扣。'],
    ['warlock', '咒术师', 3, '秘术师', '酒红紫不对称斗篷与符纹布饰。'],
    ['summoner', '召唤师', 3, '秘术师', '象牙白紫袍、翠玉胸扣与双侧小腰包。'],
], [[20,144,388,628],[465,144,387,628],[908,143,387,629],[1351,144,388,628]]);
const approved: ProfessionConcept[] = [
    {id:'job.novice',name:'新手',family:'novice',stage:0,level:1,parent:'冒险起点',description:'已确认的冒险者基准形象。',approved:true,art:approvedArt('job.novice')},
    {id:'job.mage',name:'法师',family:'mage',stage:1,level:10,parent:'新手',description:'已确认的蓝白法师短袍。',approved:true,art:approvedArt('job.mage')},
    {id:'job.elementalist',name:'元素师',family:'mage',stage:2,level:30,parent:'法师',description:'已确认的青绿分层披肩与元素胸扣。',approved:true,art:approvedArt('job.elementalist')},
    {id:'job.pyromancer',name:'炎术师',family:'mage',stage:3,level:70,parent:'元素师',description:'已确认的赤红短袍与火焰形披风。',approved:true,art:approvedArt('job.pyromancer')},
];
export const professionConcepts = [...approved.slice(0,1), ...warriors, ...approved.slice(1), ...newMages, ...rangers, ...priests];
const weaponOutfits = [
    ['sword','长剑','银色直刃、金色护手与青色晶饰。'],
    ['axe','战斧','厚实的双刃钢斧，红色绑带与木柄。'],
    ['bow','长弓','深色木弓与苔绿握把，保留清楚的弓弦。'],
    ['dagger','匕首','短银刃、紫色握柄与小型金护手。'],
    ['holy_staff','圣杖','金色日轮杖头与翠玉，白色缠带。'],
] as const;
const weaponRegions = [[29,165,409,469],[539,188,382,440],[1014,84,251,576],[1375,296,266,338],[1758,115,400,534]];
export const weaponConcepts: WeaponConcept[] = weaponOutfits.map(([id,name,description],i)=>({id:`equip.${id}`,name,description,art:sheetArt(weaponSheet,2172,724,weaponRegions[i])}));
weaponConcepts.splice(4,0,{id:'equip.staff',name:'双手杖',description:'已确认的青色水晶双手杖，沿用原素材。',approved:true,art:{url:playerSheetUrl,size:playerSheetSize,region:crystalStaffRegion}});
weaponConcepts.splice(4,0,{id:'equip.mage_staff',name:'法杖',description:'法师路线单手法杖，沿用青色水晶杖素材。',approved:true,art:{url:playerSheetUrl,size:playerSheetSize,region:crystalStaffRegion}});
