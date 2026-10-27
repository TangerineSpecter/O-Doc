import type {Graphics} from 'pixi.js';

export interface ElementSkillVisual {name: string; element: 'water' | 'earth' | 'wind' | 'fire'; defensive?: boolean}
const skills: Readonly<Record<string, ElementSkillVisual>> = {
    'monster.element.water.bubble_crab': {name:'泡泡撞击',element:'water'},
    'monster.element.water.little_spirit': {name:'回流波',element:'water'},
    'monster.element.water.reef_guard': {name:'珊瑚护壳',element:'water',defensive:true},
    'monster.element.water.tide_crown': {name:'潮涌',element:'water'},
    'monster.element.earth.mole': {name:'晶砂扑击',element:'earth'},
    'monster.element.earth.snail': {name:'岩壳收缩',element:'earth',defensive:true},
    'monster.element.earth.armored': {name:'砂岩碎甲',element:'earth'},
    'monster.element.earth.dragon': {name:'晶脊震荡',element:'earth'},
    'monster.element.wind.cloudbird': {name:'旋羽',element:'wind'},
    'monster.element.wind.bell': {name:'风铃回旋',element:'wind'},
    'monster.element.wind.falcon': {name:'掠风',element:'wind'},
    'monster.element.wind.griffin': {name:'云环切',element:'wind'},
    'monster.element.fire.lizard': {name:'火星吐息',element:'fire'},
    'monster.element.fire.turtle': {name:'炭壳余温',element:'fire'},
    'monster.element.fire.horn': {name:'熔角灼痕',element:'fire'},
    'monster.element.fire.firebird': {name:'焰羽迸落',element:'fire'},
};
const extraSkills: Readonly<Record<string, ElementSkillVisual[]>> = {
    'monster.element.water.tide_crown': [{name:'泡沫屏障',element:'water',defensive:true}],
    'monster.element.earth.dragon': [{name:'琥岩护体',element:'earth',defensive:true}],
    'monster.element.wind.griffin': [{name:'顺风',element:'wind',defensive:true}],
    'monster.element.fire.firebird': [{name:'灰烬护羽',element:'fire',defensive:true}],
};
const palette = {water:0x69d5e2,earth:0xe2b26d,wind:0xc0e8ef,fire:0xf39b55};
export const elementSkillsFor = (id: string): readonly ElementSkillVisual[] =>
    skills[id] ? [skills[id], ...(extraSkills[id] || [])] : [];

/** Illustrative local animation only: never derives or applies combat outcomes. */
export function drawElementSkill(g: Graphics, skill: ElementSkillVisual, age: number, from: number, to: number, offsetY=0) {
    if (age < .2 || age > 1.25) return;
    const progress = Math.max(0, Math.min(1, (age - .2) / .85));
    const alpha = Math.min(1, (1.25 - age) * 4);
    const color = palette[skill.element];
    if (skill.defensive) {
        g.roundRect(from - 65, offsetY - 170, 130, 160, 45).stroke({color, width:6, alpha:.65 * alpha});
        g.roundRect(from - 52, offsetY - 160, 104, 140, 35).fill({color, alpha:.13 * alpha});
        return;
    }
    const x = from + (to - from) * progress;
    const y = offsetY - 105 - Math.sin(progress * Math.PI) * 20;
    if (skill.element === 'water') {
        g.circle(x, y, 17).fill({color, alpha:.55 * alpha}).stroke({color:0xe4ffff, width:4, alpha});
        g.circle(x - 6, y - 6, 3).fill({color:0xffffff, alpha});
    } else if (skill.element === 'earth') {
        g.poly([x-18,y+10,x-10,y-11,x,y-20,x+14,y-8,x+18,y+11,x+2,y+18]).fill({color, alpha});
    } else if (skill.element === 'wind') {
        g.circle(x, y, 20).stroke({color, width:5, alpha});
        g.circle(x+8, y, 11).stroke({color:0xf5ffff, width:3, alpha});
    } else {
        g.poly([x-14,y+13,x-8,y-8,x,y-21,x+5,y-4,x+15,y+7,x+8,y+17]).fill({color, alpha});
        g.circle(x, y+4, 6).fill({color:0xffe9ad, alpha});
    }
}
