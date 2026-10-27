import crab from '../../../assets/combat/element-preview/bubble-hermit-crab-concept-v1.png';
import spirit from '../../../assets/combat/element-preview/little-tide-spirit-concept-v1.png';
import reef from '../../../assets/combat/element-preview/reef-guardian-concept-v1.png';
import tideBoss from '../../../assets/combat/element-preview/tide-crown-beast-concept-v1.png';
import mole from '../../../assets/combat/element-preview/sand-crystal-mole-v1.png';
import snail from '../../../assets/combat/element-preview/rockbud-snail-v1.png';
import amber from '../../../assets/combat/element-preview/amber-armor-beast-v1.png';
import dragon from '../../../assets/combat/element-preview/crystal-spine-dragon-v1.png';
import bird from '../../../assets/combat/element-preview/cloud-fluff-bird-v1.png';
import bell from '../../../assets/combat/element-preview/wind-chime-spirit-v1.png';
import falcon from '../../../assets/combat/element-preview/gale-falcon-v1.png';
import gryphon from '../../../assets/combat/element-preview/cloud-gryphon-v1.png';
import lizard from '../../../assets/combat/element-preview/ember-lizard-v1.png';
import turtle from '../../../assets/combat/element-preview/charcoal-turtle-v1.png';
import horn from '../../../assets/combat/element-preview/molten-horn-v1.png';
import firebird from '../../../assets/combat/element-preview/flame-firebird-v3.png';

/** Each entry is an individually approved independent preview, keyed by catalog identity. */
export const elementMonsterArt: Readonly<Record<string, {src: string; status: 'approved'}>> = {
    'monster.element.water.bubble_crab': {src: crab, status: 'approved'},
    'monster.element.water.little_spirit': {src: spirit, status: 'approved'},
    'monster.element.water.reef_guard': {src: reef, status: 'approved'},
    'monster.element.water.tide_crown': {src: tideBoss, status: 'approved'},
    'monster.element.earth.mole': {src: mole, status: 'approved'},
    'monster.element.earth.snail': {src: snail, status: 'approved'},
    'monster.element.earth.armored': {src: amber, status: 'approved'},
    'monster.element.earth.dragon': {src: dragon, status: 'approved'},
    'monster.element.wind.cloudbird': {src: bird, status: 'approved'},
    'monster.element.wind.bell': {src: bell, status: 'approved'},
    'monster.element.wind.falcon': {src: falcon, status: 'approved'},
    'monster.element.wind.griffin': {src: gryphon, status: 'approved'},
    'monster.element.fire.lizard': {src: lizard, status: 'approved'},
    'monster.element.fire.turtle': {src: turtle, status: 'approved'},
    'monster.element.fire.horn': {src: horn, status: 'approved'},
    'monster.element.fire.firebird': {src: firebird, status: 'approved'},
};
