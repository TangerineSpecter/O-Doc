import type {BiographyMap} from '../types/bookAnalysis';

export type Theme = BiographyMap['themes'][number];
export type PlacedTheme = {theme: Theme; index: number; side: 'left' | 'right'; x: number; y: number; leaves: {title: string; summary: string; chapters: number[]; x: number; y: number}[]};

export const mapWidth = 1720;
export const rootX = mapWidth / 2;
const themeX = {left: 545, right: 1175};
const leafX = {left: 225, right: 1495};
const leafGap = 84;
const groupGap = 42;

export function layoutThemes(themes: Theme[]): {items: PlacedTheme[]; height: number; rootY: number} {
    const groups = {left: themes.map((theme, index) => ({theme, index})).filter(item => item.index % 2 === 0), right: themes.map((theme, index) => ({theme, index})).filter(item => item.index % 2 === 1)};
    const groupHeight = (theme: Theme) => Math.max(154, (theme.branches.length - 1) * leafGap + 90);
    const sideHeight = (side: 'left' | 'right') => groups[side].reduce((sum, item) => sum + groupHeight(item.theme), 0) + Math.max(0, groups[side].length - 1) * groupGap;
    const height = Math.max(620, Math.max(sideHeight('left'), sideHeight('right')) + 120);
    const items: PlacedTheme[] = [];
    for (const side of ['left', 'right'] as const) {
        let top = (height - sideHeight(side)) / 2;
        for (const {theme, index} of groups[side]) {
            const blockHeight = groupHeight(theme);
            const y = top + blockHeight / 2;
            items.push({theme, index, side, x: themeX[side], y, leaves: theme.branches.map((branch, branchIndex) => ({...branch, x: leafX[side], y: y + (branchIndex - (theme.branches.length - 1) / 2) * leafGap}))});
            top += blockHeight + groupGap;
        }
    }
    return {items, height, rootY: height / 2};
}

export function connector(fromX: number, fromY: number, toX: number, toY: number) {
    const bend = (toX - fromX) * .5;
    return `M ${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${toX - bend} ${toY}, ${toX} ${toY}`;
}
