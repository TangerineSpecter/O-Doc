export interface AtlasSkillProfile {
    id:string;name:string;shape:string;target:'enemy'|'self';weapon:string;
    color:string;light:string;tier:number;release:number;impact:number;duration:number;
    motion:'slash'|'shot'|'cast'|'dash';
}
function profile(n:number,name:string,shape:string,tier:number,weapon:string,color:string,light:string,
    target:AtlasSkillProfile['target']='enemy',motion:AtlasSkillProfile['motion']='cast'):AtlasSkillProfile {
    const release=tier===3?.8:.45;
    return {id:`skill.player.${String(n).padStart(3,'0')}`,name,shape,tier,weapon:`equip.${weapon}`,color,light,target,motion,
        release,impact:target==='enemy'?release+.3:Infinity,duration:tier===3?2.8:2.3};
}
export const atlasSkillProfiles:AtlasSkillProfile[]=[
    {...profile(0,'基础攻击','strike',0,'sword','#bdd5de','#f1fcff','enemy','slash'),id:'preview.novice.strike'},
    profile(1,'重斩','heavy',1,'sword','#e4ac6c','#fff2c9','enemy','slash'),
    profile(2,'护体','armor',1,'sword','#99b8bf','#e1f5ef','self'),
    {...profile(4,'魔力弹','bolt',1,'staff','#82cbe7','#e2ffff'),release:.5,impact:.95,duration:1.7},
    {...profile(5,'魔法屏障','barrier',1,'staff','#a5eff3','#f0fff7','self'),release:.6,duration:3},
    profile(7,'精准射击','aim',1,'bow','#a8c987','#eff3c7','enemy','shot'),
    profile(8,'闪身','evade',1,'bow','#bddce0','#f0ffff','self','dash'),
    profile(10,'治愈术','heal',1,'holy_staff','#a6d69b','#f0ffd4','self'),
    profile(11,'圣光','holybolt',1,'holy_staff','#e9c983','#fff7da'),
    profile(13,'连斩','combo',2,'sword','#91c5d7','#effbff','enemy','slash'),
    profile(15,'盾击','bash',2,'sword','#9aaeb5','#e6f4eb','enemy','slash'),
    {...profile(17,'灼烧术','burn',2,'staff','#ff9b3f','#fff4c5'),release:.55,impact:.8,duration:3.75},
    profile(19,'虚弱咒','weaken',2,'staff','#b094d1','#eaddff'),
    profile(21,'蓄力箭','chargedarrow',2,'bow','#cfbb77','#fff5c9','enemy','shot'),
    profile(23,'背刺','backstab',2,'dagger','#a697c4','#ece0ff','enemy','dash'),
    profile(25,'恢复祷言','prayer',2,'holy_staff','#e0c78e','#fff6d8','self'),
    profile(27,'荆棘术','thorns',2,'holy_staff','#7ebd90','#ddf2b4'),
    profile(29,'破甲斩','break',3,'sword','#e9c774','#fff6ce','enemy','slash'),
    {...profile(31,'盾墙','barrier',3,'sword','#8298a4','#e3f5f3','self'),duration:3},
    profile(33,'圣盾 (Holy Aegis)','holyshield',3,'sword','#e5c67c','#fffadc','self'),
    profile(35,'狂怒击','rage',3,'axe','#df7152','#ffdca6','enemy','slash'),
    {...profile(37,'炎爆','burst',3,'staff','#ff923f','#fff4c5'),release:1.05,impact:1.35,duration:3},
    profile(39,'暴风雪','freeze',3,'staff','#84cce9','#e7ffff'),
    profile(41,'衰败咒','decay',3,'staff','#a576bd','#ead6f6'),
    {...profile(43,'魔灵契约 (Spirit Pact)','summon',3,'staff','#9fa1e4','#dcecff'),impact:1.55},
    profile(45,'穿透箭','pierce',3,'bow','#9bd5e3','#f2ffff','enemy','shot'),
    profile(47,'猎杀标记','mark',3,'bow','#ccbb7f','#fff2c7'),
    profile(49,'影袭','shadow',3,'dagger','#9e8ccf','#e5dcff','enemy','dash'),
    profile(51,'毒刃','poison',3,'dagger','#a3bd79','#ebffd1','enemy','slash'),
    profile(53,'大治愈术','greatheal',3,'holy_staff','#e7cf8e','#fffcdd','self'),
    profile(75,'复活术','greatheal',3,'holy_staff','#e7cf8e','#fffcdd','self'),
    profile(55,'审判之光','judgment',3,'holy_staff','#e5bf75','#fffcdf'),
    profile(57,'回春术','renew',3,'holy_staff','#a8ce7b','#f0f8c9','self'),
    profile(59,'森林结界','forest',3,'holy_staff','#7bbf9c','#e4f8c5','self'),
    profile(76,'音刃','music',1,'instrument','#9cd6ca','#effff4'),
    profile(77,'鼓舞小调','music',1,'instrument','#d8c58b','#fff8d7','self'),
    profile(81,'奋进乐章','music',2,'instrument','#d3ae70','#fff3ce','self'),
    profile(82,'宁静乐章','music',2,'instrument','#8fc6c0','#e6fff4','self'),
    profile(84,'蚀心音波','music',2,'instrument','#ae85bf','#f0d9f6'),
    profile(85,'破音','music',2,'instrument','#8ac7ce','#e2fff5'),
    profile(87,'英雄战歌','music',3,'instrument','#e2b877','#fff6d5','self'),
    profile(89,'凯旋终章','music',3,'instrument','#e4d49a','#ffffe4'),
    profile(90,'镇魂曲','music',3,'instrument','#8ab7c0','#e0f6ee'),
    profile(92,'封声乐句','music',3,'instrument','#91c9c5','#e5fff0'),
    {...profile(93,'回旋琴音','music',3,'instrument','#bbd4b5','#f4ffe9'),duration:3.1},
    profile(95,'华彩乐章','music',3,'instrument','#ead5a0','#fffbea'),
    profile(96,'共鸣音爆','music',3,'instrument','#b088c7','#f3ddff'),
    profile(98,'毁灭终曲','music',3,'instrument','#c083cc','#ffe0ff'),
];
export const getAtlasSkill=(id:string)=>atlasSkillProfiles.find(skill=>skill.id===id);
export function sampleAtlasSkillHit(skill:AtlasSkillProfile,time:number) {
    if(skill.target==='self')return undefined;
    const elapsed=time-skill.impact;
    if(elapsed>=0&&elapsed<.45)return elapsed;
    if(skill.shape==='burn'&&elapsed>=0&&elapsed<2.4&&elapsed%.8<.16)return elapsed%.8;
    if(skill.shape==='combo'&&elapsed>.23&&elapsed<.7)return elapsed%.24;
    if(skill.shape==='shadow'&&elapsed>.2&&elapsed<.85)return elapsed%.28;
}
