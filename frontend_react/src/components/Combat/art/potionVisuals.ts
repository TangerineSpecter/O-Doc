export interface PotionArtProfile {
    color: string;
    shadow: string;
    light: string;
    cork: string;
    corkLight: string;
}

const healingPalettes: PotionArtProfile[] = [
    {color: '#cf6c76', shadow: '#823f50', light: '#ffc0bd', cork: '#a9794d', corkLight: '#e2b978'},
    {color: '#dc5d72', shadow: '#85364d', light: '#ffc1c8', cork: '#a9794d', corkLight: '#e2b978'},
    {color: '#e17d60', shadow: '#8d4849', light: '#ffd39b', cork: '#a9794d', corkLight: '#e2b978'},
    {color: '#d45f56', shadow: '#793b4b', light: '#ffe0a6', cork: '#a9794d', corkLight: '#e2b978'},
];

const manaPalettes: PotionArtProfile[] = [
    {color: '#66b7d4', shadow: '#34758e', light: '#c0f2f2', cork: '#a9794d', corkLight: '#e2b978'},
    {color: '#4d9ed0', shadow: '#315d8e', light: '#b8e5ff', cork: '#a9794d', corkLight: '#e2b978'},
    {color: '#7d82d4', shadow: '#4b4e92', light: '#ddd3ff', cork: '#a9794d', corkLight: '#e2b978'},
    {color: '#56a8d8', shadow: '#345b91', light: '#d1f1ff', cork: '#a9794d', corkLight: '#e2b978'},
];

export function getPotionArtProfile(id: string): PotionArtProfile | undefined {
    const match = /^potion\.(heal|mana)\.(\d+)$/.exec(id);
    if (!match) return undefined;
    const palettes = match[1] === 'heal' ? healingPalettes : manaPalettes;
    return palettes[Number(match[2]) - 1] || palettes[0];
}
