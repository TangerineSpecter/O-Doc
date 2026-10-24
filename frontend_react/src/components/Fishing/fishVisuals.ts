import type {FishArtProfile} from './fishArtTypes';
import {expansionFishNames, expansionFishProfiles} from './fishExpansionVisuals';
export type {FishArtProfile} from './fishArtTypes';
/** 与药剂一样使用 32×32 像素底图；不同鱼种保留独立的体形、花纹和配色。 */
const profiles: Record<string, FishArtProfile> = {
    ...expansionFishProfiles,
    crucian: {color: '#95aaa0', shadow: '#647f79', light: '#c5d3bd', belly: '#e5e5cb', fin: '#809486', shape: 'round', pattern: 'scales'},
    bitterling: {color: '#95adc8', shadow: '#677e9b', light: '#c6d8df', belly: '#e9b5b0', fin: '#b7788c', shape: 'deep', pattern: 'shine'},
    carp: {color: '#c49a55', shadow: '#927047', light: '#e5cd87', belly: '#f1deb0', fin: '#bb7750', shape: 'carp', pattern: 'scales', whiskers: true},
    snakehead: {color: '#74866a', shadow: '#4c6257', light: '#a8b58a', belly: '#c7cba2', fin: '#627463', shape: 'snakehead', pattern: 'spots'},
    goldencarp: {color: '#e4ae45', shadow: '#b27637', light: '#ffe091', belly: '#fff0bb', fin: '#d58b4a', shape: 'royal_carp', pattern: 'scales', whiskers: true, king: true},
    dace: {color: '#a6c6cd', shadow: '#728fa5', light: '#e0e8db', belly: '#eff0d8', fin: '#93a5b5', shape: 'long', pattern: 'shine'},
    yellowcatfish: {color: '#d4b15a', shadow: '#958249', light: '#ead697', belly: '#f5e4b9', fin: '#a99761', shape: 'catfish', pattern: 'marbled', whiskers: true},
    catfish: {color: '#8594a3', shadow: '#5c6e82', light: '#bbc8cb', belly: '#d4d9cb', fin: '#758698', shape: 'catfish', pattern: 'shine', whiskers: true},
    mandarin: {color: '#b1b47b', shadow: '#727b56', light: '#d8d4a0', belly: '#e9dfb1', fin: '#a69b67', shape: 'mandarin', pattern: 'spots'},
    riverking: {color: '#6eaaac', shadow: '#4c738b', light: '#a8d9cc', belly: '#d6e7ce', fin: '#718ca4', shape: 'royal_catfish', pattern: 'ribbons', whiskers: true, king: true, crest: 'ribbon'},
    silverfish: {color: '#d0e2d9', shadow: '#9ab3ac', light: '#edf4e6', belly: '#fcf6e3', fin: '#b8d2c9', shape: 'noodlefish', pattern: 'shine'},
    bream: {color: '#8eaebc', shadow: '#617f99', light: '#bfd4d0', belly: '#e0e5cb', fin: '#8295aa', shape: 'bream', pattern: 'scales'},
    perch: {color: '#9cac7b', shadow: '#647955', light: '#cdd3a0', belly: '#e9e5bc', fin: '#be9b65', shape: 'bass', pattern: 'stripes'},
    yellowcheek: {color: '#c6b473', shadow: '#8c8251', light: '#e1d69e', belly: '#f6e8bc', fin: '#b68d56', shape: 'pike', pattern: 'scales'},
    moonking: {color: '#a69dce', shadow: '#736a9c', light: '#d4cce9', belly: '#f1e7ef', fin: '#8e9ac3', shape: 'deep', pattern: 'moon', king: true},
};
export const fishArtKey = (id: string) => id.replace(/[_-]/g, '').toLowerCase();
export const getFishArtProfile = (id: string) => profiles[fishArtKey(id)] || profiles.crucian;

// 旧出钓摘要只有鱼名；这里只为内置插图定位，不参与鱼种或结算判定。
const fishArtNames: Record<string, string> = {
    ...expansionFishNames,
    鲫鱼: 'crucian', 彩鳑鲏: 'bitterling', 鲤鱼: 'carp', 乌鳢: 'snakehead', 金鳞鲤王: 'golden_carp',
    白条: 'dace', 黄颡鱼: 'yellow_catfish', 鲶鱼: 'catfish', 鳜鱼: 'mandarin', 苍须河王: 'river_king',
    银鱼: 'silverfish', 鳊鱼: 'bream', 湖鲈: 'perch', 鳡鱼: 'yellowcheek', 镜月鱼王: 'moon_king',
};
export const fishArtIdForName = (name: string) => Object.prototype.hasOwnProperty.call(fishArtNames, name) ? fishArtNames[name] : undefined;
