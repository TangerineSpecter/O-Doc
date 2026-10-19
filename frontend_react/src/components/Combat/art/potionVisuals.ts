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

const elixirPalettes: Record<string, PotionArtProfile> = {
    healing: {color: '#e0707b', shadow: '#8a3f4d', light: '#ffd2c8', cork: '#a9794d', corkLight: '#e2b978'},
    focus: {color: '#5fa8dc', shadow: '#335f88', light: '#c8ecff', cork: '#a9794d', corkLight: '#e2b978'},
    iron: {color: '#8b9bb4', shadow: '#4b5668', light: '#dbe6f2', cork: '#6f6a63', corkLight: '#b8b2a8'},
    fury: {color: '#e2704a', shadow: '#8d3c35', light: '#ffd0a8', cork: '#a9794d', corkLight: '#e2b978'},
    regen: {color: '#58b98a', shadow: '#2f6e52', light: '#c9f4d8', cork: '#8d6b45', corkLight: '#d9b985'},
    arcane: {color: '#8b6fdc', shadow: '#4c3b8a', light: '#e2d6ff', cork: '#8a6b9c', corkLight: '#d3bce0'},
    ember: {color: '#e88a3c', shadow: '#8f4a24', light: '#ffe0a3', cork: '#7d5836', corkLight: '#cba46f'},
    aegis: {color: '#d9b45c', shadow: '#8a6a2c', light: '#fff0c2', cork: '#7a6a4f', corkLight: '#c8b893'},
    star: {color: '#6f7fe0', shadow: '#3c478c', light: '#d9e2ff', cork: '#5c608f', corkLight: '#aab2da'},
    purify: {color: '#7fd6c8', shadow: '#3d7f7a', light: '#e2fffa', cork: '#8f8a7a', corkLight: '#d6d0bf'},
};

export function getPotionArtProfile(id: string): PotionArtProfile | undefined {
    const elixir = /^elixir\.([a-z_]+)$/.exec(id);
    if (elixir) return elixirPalettes[elixir[1]];
    const match = /^potion\.(heal|mana)\.(\d+)$/.exec(id);
    if (!match) return undefined;
    const palettes = match[1] === 'heal' ? healingPalettes : manaPalettes;
    return palettes[Number(match[2]) - 1] || palettes[0];
}
