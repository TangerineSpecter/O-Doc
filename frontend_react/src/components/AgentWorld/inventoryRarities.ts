export interface InventoryRarityDef {
    label: string;
    subLabel: string;
    color: string;
    accentColor: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    glow: string;
}

export const inventoryRarities: Record<string, InventoryRarityDef> = {
    common: {
        label: '普通',
        subLabel: 'COMMON',
        color: '#b0a693',
        accentColor: '#8a7d68',
        badgeBg: 'linear-gradient(135deg, #ede7db, #d8cebe)',
        badgeText: '#4c4233',
        badgeBorder: '#baa892',
        glow: 'rgba(176, 166, 147, 0.35)',
    },
    uncommon: {
        label: '精良',
        subLabel: 'UNCOMMON',
        color: '#4fa35b',
        accentColor: '#367c40',
        badgeBg: 'linear-gradient(135deg, #dcf3df, #bee3c3)',
        badgeText: '#184d23',
        badgeBorder: '#6ebb7a',
        glow: 'rgba(79, 163, 91, 0.38)',
    },
    rare: {
        label: '稀有',
        subLabel: 'RARE',
        color: '#3b86cb',
        accentColor: '#23619a',
        badgeBg: 'linear-gradient(135deg, #dff0fd, #bcdbfa)',
        badgeText: '#12416b',
        badgeBorder: '#6fa5db',
        glow: 'rgba(59, 134, 203, 0.4)',
    },
    epic: {
        label: '史诗',
        subLabel: 'EPIC',
        color: '#a05ce0',
        accentColor: '#7b3db8',
        badgeBg: 'linear-gradient(135deg, #f3e6ff, #dcbcfb)',
        badgeText: '#521d84',
        badgeBorder: '#bc8cf2',
        glow: 'rgba(160, 92, 224, 0.42)',
    },
    legendary: {
        label: '传说',
        subLabel: 'LEGENDARY',
        color: '#e59616',
        accentColor: '#b87103',
        badgeBg: 'linear-gradient(135deg, #fff3d4, #fada8b)',
        badgeText: '#734400',
        badgeBorder: '#e8aa3d',
        glow: 'rgba(229, 150, 22, 0.45)',
    },
};
