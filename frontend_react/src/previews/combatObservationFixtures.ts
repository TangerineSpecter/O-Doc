import type {CombatEvent,CombatReward} from '../types/api/combat';

/** Review data only; never submitted to an API or inventory. */
export const observationPreviewRewards:CombatReward[]=[
    {id:'preview.slime',kind:'material',item:{id:'material.moss_cave.1',name:'黏液',level:'1',salePrice:'4'},quantity:3,elapsedSeconds:15},
    {id:'preview.wing',kind:'material',item:{id:'material.moss_cave.2',name:'蝠翼',level:'3',salePrice:'8'},quantity:2,elapsedSeconds:30},
    {id:'preview.stone',kind:'material',item:{id:'material.moss_cave.3',name:'苔石',level:'5',salePrice:'12'},quantity:1,elapsedSeconds:45},
    {id:'preview.staff',kind:'equipment',equipmentId:'preview.gear',item:{templateId:'equip.staff',name:'水晶法杖',slot:'weapon',level:10,quality:'blue',value:'48',stats:{magicAttack:28},affixes:[{id:'preview.affix',stat:'intelligence',value:3}]},elapsedSeconds:45},
    {id:'preview.slime.extra',kind:'material',item:{id:'material.moss_cave.1',name:'黏液',level:'1',salePrice:'4'},quantity:1,elapsedSeconds:60},
];
export function observationPreviewEvents(enemy:{id:string;name:string},skills:boolean):CombatEvent[] {
    return [
        {id:'preview.depart',sequence:1,kind:'depart',elapsedSeconds:0,payload:{},createdAt:''},
        {id:'preview.round1',sequence:2,kind:'round',elapsedSeconds:15,createdAt:'',payload:{events:[
            {kind:'encounter',name:'软泥怪'},
            {kind:'attack',actor:'猫猫',target:'软泥怪',action:skills?'魔力弹':'普通攻击',damage:32,hit:true},
            {kind:'kill',monster:{id:'monster.slime',name:'软泥怪',level:3,rank:'normal'},experience:12,rewards:[
                {id:'preview.loot.1',kind:'material',item:{name:'黏液'},quantity:2,elapsedSeconds:15}
            ]},
        ]}},
        {id:'preview.round2',sequence:3,kind:'round',elapsedSeconds:30,createdAt:'',payload:{events:[
            {kind:'attack',actor:'猫猫',target:'洞穴蝙蝠',action:'普通攻击',damage:46,hit:true,critical:true},
            {kind:'kill',monster:{id:'monster.cave_bat',name:'洞穴蝙蝠',level:5,rank:'normal'},experience:16,rewards:[
                {id:'preview.loot.2',kind:'material',item:{name:'蝠翼'},quantity:1,elapsedSeconds:30}
            ]},
        ]}},
        {id:'preview.round3',sequence:4,kind:'round',elapsedSeconds:45,createdAt:'',payload:{events:[
            {kind:'encounter',name:enemy.name},
            {kind:'attack',actor:'猫猫',target:enemy.name,action:skills?'魔力弹':'普通攻击',damage:45,hit:true},
            {kind:'attack',actor:enemy.name,target:'猫猫',action:'普通攻击',damage:7,hit:true},
        ]}},
        {id:'preview.round4',sequence:5,kind:'round',elapsedSeconds:60,createdAt:'',payload:{
            report:'猫猫探索18分钟，击败11只怪物，获得161经验；消耗18体力。已到预计返回时间；暂停期间不计探索成果 收获：蝠翼x3、黏液x2。消耗药剂 1 瓶，返回 Lv.1。'
        }},
    ];
}
