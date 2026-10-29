import bardOutfits from '../../../assets/combat/player-bard-outfits-v1.svg';
import instrumentSheet from '../../../assets/combat/equipment-instruments-v1.svg';
import warriorSheet from '../../../assets/combat/player-warrior-concept-v1.png';
import rangerSheet from '../../../assets/combat/player-ranger-concept-v1.png';
import priestSheet from '../../../assets/combat/player-priest-concept-v1.png';
import mageSheet from '../../../assets/combat/player-mage-concept-v1.png';
import weaponSheet from '../../../assets/combat/player-weapons-concept-v1.png';
import mageStaffIcon from '../../../assets/combat/equipment-mage-staff-v1.svg';
import {playerSheetUrl, playerSheetSize, playerPortraitRegion, crystalStaffRegion} from './playerVisuals';
import type {PlayerArtRegion, PlayerJob} from './playerVisuals';

export type ConceptFamily = 'novice' | 'warrior' | 'mage' | 'ranger' | 'priest' | 'bard';
export interface ConceptArt {url: string; size: {width: number; height: number}; region: PlayerArtRegion}
export interface ProfessionConcept {id: string; name: string; family: ConceptFamily; stage: number; level: number; parent: string; description: string; approved?: boolean; art: ConceptArt}
export interface WeaponConcept {id: string; name: string; description: string; approved?: boolean; art: ConceptArt}
export const familyNames: Record<ConceptFamily, string> = {novice: '新手', warrior: '战士系', mage: '法师系', ranger: '游侠系', priest: '牧师系', bard:'吟游诗人系'};

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
const bards:ProfessionConcept[]=[
    ['bard','吟游诗人',1,'新手','绿褐皮衣、斜襟披肩与竖琴胸扣'],
    ['musician','乐师',2,'吟游诗人','蓝色演奏服、浅色肩领与金色琴徽'],
    ['cursesinger','咒歌者',2,'吟游诗人','紫色错层披肩与暗纹琴徽'],
    ['battleconductor','战歌指挥',3,'乐师','赤金肩饰、指挥绶带与高阶演奏服'],
    ['requiemsinger','镇魂歌者',3,'乐师','深蓝层叠披肩与银色安魂纹饰'],
    ['virtuoso','琴圣',3,'咒歌者','象牙金色演奏服与精细弦纹垂带'],
    ['sonomancer','魔音术士',3,'咒歌者','深紫长襟、棱形咒纹与金边'],
].map(([id,name,stage,parent,description],i)=>({id:`job.${id}`,name:String(name),family:'bard',stage:Number(stage),level:Number(stage)===1?10:Number(stage)===2?30:50,parent:String(parent),description:String(description),art:sheetArt(bardOutfits,2618,190,[i*374,0,374,190])}));
export const professionConcepts = [...approved.slice(0,1), ...warriors, ...approved.slice(1), ...newMages, ...rangers, ...priests, ...bards];
const weaponOutfits = [
    ['sword','长剑','银色直刃、金色护手与青色晶饰。'],
    ['axe','战斧','厚实的双刃钢斧，红色绑带与木柄。'],
    ['bow','长弓','深色木弓与苔绿握把，保留清楚的弓弦。'],
    ['dagger','匕首','短银刃、紫色握柄与小型金护手。'],
    ['holy_staff','晨祷权杖','金色日轮杖头与翠玉，白色缠带。'],
] as const;
const weaponRegions = [[29,165,409,469],[539,188,382,440],[1014,84,251,576],[1375,296,266,338],[1758,115,400,534]];
export const weaponConcepts: WeaponConcept[] = weaponOutfits.map(([id,name,description],i)=>({id:`equip.${id}`,name,description,art:sheetArt(weaponSheet,2172,724,weaponRegions[i])}));
weaponConcepts.splice(4,0,{id:'equip.staff',name:'秘法杖',description:'元素师路线双手水晶杖，青色晶石与深色木柄。',approved:true,art:{url:playerSheetUrl,size:playerSheetSize,region:crystalStaffRegion}});
weaponConcepts.splice(4,0,{id:'equip.mage_staff',name:'法杖',description:'法师路线单手法杖，中轴对齐的紫晶杖头与深色直柄。',approved:true,art:sheetArt(mageStaffIcon,32,56,[0,0,32,56])});

for(const [i,level] of [10,30,50].entries())weaponConcepts.push({id:`equip.instrument${level===10?'':'.'+level}`,name:['旅人竖琴','吟风竖琴','月弦竖琴'][i],description:'双手持握的独立竖琴，琴弦与中空琴身清晰可见。',art:sheetArt(instrumentSheet,2544,48,[i*48,0,48,48])});
const extraSheetWeapons: readonly (readonly [string, string, number, string])[] = [
    ['equip.training_sword','训练木剑',5,'收尖直刃、木护手与缠带木柄的训练木剑。'],
    ['equip.two_handed_sword','双手剑',6,'钩尖、锯齿背与单侧宽刃的重型双手巨剑。'],
    ['equip.sword.30','精制长剑',7,'精钢宽刃、黄金中脊血槽与展翅鹰翼护手。'],
    ['equip.axe.30','精制战斧',8,'精钢新月宽刃、破甲尖喙与冲锋枪尖戟斧。'],
    ['equip.bow.30','精制长弓',9,'精钢镶金复合反曲弓翼与金鹰卷梢长弓。'],
    ['equip.dagger.30','精制猎手短刃',10,'锯背双血槽精钢猎刃与指环柄尾。'],
    ['equip.mage_staff.30','精制法杖',11,'黄金星轨圆环、银翼护耳与八面奥术主晶法杖。'],
    ['equip.sword.element.water','潮汐长剑',12,'三道波浪潮汐齿刃、海浪珊瑚护手与海螺剑首。'],
    ['equip.axe.element.water','潮汐战斧',13,'翻涌巨浪扇贝斧刃、珊瑚分叉后刺与深海珍珠核心。'],
    ['equip.bow.element.water','潮汐长弓',14,'跃浪海豚水弓、外侧水鳍与浪花漩涡弓梢。'],
    ['equip.dagger.element.water','潮汐猎手短刃',15,'游鱼背鳍曲刃、双尾鳍护手与水滴珍珠柄尾。'],
    ['equip.mage_staff.element.water','潮汐法杖',16,'碧蓝巨浪新月托座、珊瑚金枝与深海珍珠法杖。'],
    ['equip.instrument.element.water','潮汐旅人竖琴',17,'螺旋海螺共鸣箱、卷浪音柱与珊瑚珍珠竖琴。'],
    ['equip.sword.element.earth','琥岩长剑',18,'厚重玄武岩宽刃与破岩而出的原石琥珀晶簇。'],
    ['equip.axe.element.earth','琥岩战斧',19,'玄武岩镶琥珀锯齿宽刃与矿晶碎石锤背。'],
    ['equip.bow.element.earth','琥岩长弓',20,'石化岩木弓身与外侧生长的琥珀矿晶芽。'],
    ['equip.dagger.element.earth','琥岩猎手短刃',21,'折角玄岩刀背与橙黄琥珀结晶切割刃口。'],
    ['equip.mage_staff.element.earth','琥岩法杖',22,'玄武黑岩兽爪托起的三叉原石琥珀晶簇法杖。'],
    ['equip.staff.element.earth','琥岩秘法杖',23,'黑金地龙巨爪盘绕的三连巨型琥珀晶柱秘法杖。'],
    ['equip.holy_staff.element.earth','琥岩晨祷权杖',24,'黄金四方大地十字圣轮与暖金琥珀圣石权杖。'],
    ['equip.instrument.element_low.element.earth','琥岩旅人竖琴',25,'玄武岩石雕方框与原石琥珀晶簇竖琴。'],
    ['equip.instrument.30.element.earth','琥岩吟风竖琴',26,'黑金重铠共鸣箱与四重地龙琥珀晶脊竖琴。'],
    ['equip.sword.30.element.earth','琥岩精制长剑',27,'多面切割琥珀晶脊大剑与双角地龙晶牙护手。'],
    ['equip.axe.30.element.earth','琥岩精制战斧',28,'对称巨型琥珀晶翼重斧与三叉晶冠。'],
    ['equip.bow.30.element.earth','琥岩精制长弓',29,'地龙琥珀背脊晶刺重弓与龙角弓梢。'],
    ['equip.dagger.30.element.earth','琥岩精制猎手短刃',30,'双叉琥珀晶牙刺刃与三枚刀背晶刺。'],
    ['equip.mage_staff.30.element.earth','琥岩精制法杖',31,'黑金六角大地圣环与巨型八面体琥珀核心法杖。'],
    ['equip.sword.element.wind','岚羽长剑',32,'轻灵青白流线细刃、单层翠青羽翼护手与金风铃剑首。'],
    ['equip.axe.element.wind','岚羽战斧',33,'弯月青白轻风刃与飘扬尾羽后饰战斧。'],
    ['equip.bow.element.wind','岚羽长弓',34,'贴合顺滑青白长翎羽的流线青木猎弓。'],
    ['equip.dagger.element.wind','岚羽猎手短刃',35,'青白鹰翎窄匕与单侧飞羽护手。'],
    ['equip.mage_staff.element.wind','岚羽法杖',36,'青白双羽托座、翠绿风球与黄金小风铃法杖。'],
    ['equip.staff.element.wind','岚羽秘法杖',37,'舒展白青双翼风冠、旋风翠晶与破风金铃秘法杖。'],
    ['equip.holy_staff.element.wind','岚羽晨祷权杖',38,'天使纯白双翼圣环、十字风芒星与翠玉权杖。'],
    ['equip.instrument.30.element.wind','岚羽吟风竖琴',39,'四层纯白翠青天鹅大羽翼与破风金铃竖琴。'],
    ['equip.sword.30.element.wind','岚羽精制长剑',40,'燕尾分叉苍岚圣剑与三层白青大羽翼护手。'],
    ['equip.axe.30.element.wind','岚羽精制战斧',41,'猎隼双翼三段羽翎巨斧与黄金风冠。'],
    ['equip.bow.30.element.wind','岚羽精制长弓',42,'三层舒展天鹅大羽翼弓与黄金风铃握把。'],
    ['equip.dagger.30.element.wind','岚羽精制猎手短刃',43,'燕尾分叉疾风曲刃与双层白青飞翼护手。'],
    ['equip.mage_staff.30.element.wind','岚羽精制法杖',44,'四翼白青大羽冠、旋风金环与翠玉核心法杖。'],
    ['equip.staff.element.fire','熔羽秘法杖',45,'展翅炎鸟双翼杖冠与炽白烈阳火核秘法杖。'],
    ['equip.holy_staff.element.fire','熔羽晨祷权杖',46,'八芒黄金烈阳圣徽、赤金火翼与圣火晶权杖。'],
    ['equip.instrument.30.element.fire','熔羽吟风竖琴',47,'朱雀四重赤橙黄烈焰羽翼与黑曜火核竖琴。'],
    ['equip.sword.30.element.fire','熔羽精制长剑',48,'三对火焰羽刺波形大剑、熔岩流槽与凤凰火翼护手。'],
    ['equip.axe.30.element.fire','熔羽精制战斧',49,'浴火凤凰双翼巨斧、飞扬火刺与熔岩火冠。'],
    ['equip.bow.30.element.fire','熔羽精制长弓',50,'燃烧赤金双火翼大弓与翻腾火翎弓臂。'],
    ['equip.dagger.30.element.fire','熔羽精制猎手短刃',51,'蛇形赤金曲焰刃、双火羽刺与火翼护手。'],
    ['equip.mage_staff.30.element.fire','熔羽精制法杖',52,'黑曜赤金火羽王冠托座与三尖升腾烈焰核心法杖。'],
    ['equip.instrument.element_low','旅人竖琴',0,'双手持握的独立竖琴，琴弦与中空琴身清晰可见。'],
];
for(const [id,name,frame,description] of extraSheetWeapons)weaponConcepts.push({id,name,description,art:sheetArt(instrumentSheet,2544,48,[frame*48,0,48,48])});
