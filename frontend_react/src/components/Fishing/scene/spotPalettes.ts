import type {FishingSpot} from '../spotVisuals';

export interface SpotPalette {water: string; deep: string; light: string; grass: string; dark: string; sand: string}
export const palettes: Record<FishingSpot, SpotPalette> = {
    pond: {water: '#66a7ab', deep: '#55979e', light: '#9dced0', grass: '#b9cd83', dark: '#94ad6b', sand: '#e0d29b'},
    river: {water: '#73b1c3', deep: '#5999b4', light: '#b4dce1', grass: '#b6cf94', dark: '#8cae7c', sand: '#d8d3ae'},
    lake: {water: '#819bb6', deep: '#6f86a7', light: '#c0d2df', grass: '#b5c1a0', dark: '#8caa91', sand: '#d9d4bc'},
    stream: {water: '#66b9af', deep: '#438d8b', light: '#b8e1d2', grass: '#94ac75', dark: '#688360', sand: '#c4c1a1'},
    wetland: {water: '#7d9b8e', deep: '#5b7972', light: '#b8ccc1', grass: '#939e70', dark: '#637651', sand: '#b3ac82'},
    bay: {water: '#63a8bd', deep: '#47869f', light: '#b4dfdf', grass: '#dbcd9e', dark: '#b4a878', sand: '#efdfb1'},
    reef: {water: '#6fc9bf', deep: '#4da9a9', light: '#c8eee0', grass: '#e6ddbb', dark: '#beb996', sand: '#f5ebcc'},
    frost_lake: {water: '#6d90b2', deep: '#4e729a', light: '#c6e1e6', grass: '#d8e2dc', dark: '#a8bdc3', sand: '#b4c9ce'},
    hot_spring: {water: '#79b7ad', deep: '#548e89', light: '#c0dfcd', grass: '#b3836d', dark: '#815c55', sand: '#d5b58c'},
    trench: {water: '#455e82', deep: '#2f446b', light: '#80aabb', grass: '#7d8996', dark: '#536477', sand: '#a5afb3'},
};
