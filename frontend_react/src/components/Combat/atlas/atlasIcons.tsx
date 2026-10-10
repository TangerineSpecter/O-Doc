import React from 'react';
import {
    Trees,
    Pickaxe,
    CloudFog,
    Waves,
    Flame,
    Orbit,
    Crown,
    Droplets,
    Moon,
    PawPrint,
    Footprints,
    Shield,
    TreePine,
    Skull,
    Swords,
    Sparkles,
    Disc,
    Gem,
    Layers,
    Feather,
    Sword,
    Axe,
    Crosshair,
    Wand2,
    Hand,
    HeartPulse,
    BookOpen,
} from 'lucide-react';

export interface VisualConfig {
    icon: React.ComponentType<{className?: string}>;
    color: string;
    bgGradient: string;
    border: string;
    badgeBg?: string;
    badgeText?: string;
}

/** 地牢视觉外观配置 */
export function getDungeonVisual(id: string): VisualConfig {
    if (id.includes('moss_cave')) {
        return {
            icon: Trees,
            color: 'text-emerald-600',
            bgGradient: 'from-emerald-50 to-teal-50/40',
            border: 'border-emerald-200/80',
            badgeBg: 'bg-emerald-100/90',
            badgeText: 'text-emerald-700',
        };
    }
    if (id.includes('abandoned_mine')) {
        return {
            icon: Pickaxe,
            color: 'text-amber-600',
            bgGradient: 'from-amber-50 to-orange-50/40',
            border: 'border-amber-200/80',
            badgeBg: 'bg-amber-100/90',
            badgeText: 'text-amber-700',
        };
    }
    if (id.includes('mist_forest')) {
        return {
            icon: CloudFog,
            color: 'text-teal-600',
            bgGradient: 'from-teal-50 to-emerald-50/40',
            border: 'border-teal-200/80',
            badgeBg: 'bg-teal-100/90',
            badgeText: 'text-teal-700',
        };
    }
    if (id.includes('sunken_ruins')) {
        return {
            icon: Waves,
            color: 'text-cyan-600',
            bgGradient: 'from-cyan-50 to-blue-50/40',
            border: 'border-cyan-200/80',
            badgeBg: 'bg-cyan-100/90',
            badgeText: 'text-cyan-700',
        };
    }
    if (id.includes('ash_citadel')) {
        return {
            icon: Flame,
            color: 'text-rose-600',
            bgGradient: 'from-rose-50 to-red-50/40',
            border: 'border-rose-200/80',
            badgeBg: 'bg-rose-100/90',
            badgeText: 'text-rose-700',
        };
    }
    if (id.includes('eclipse_rift')) {
        return {
            icon: Orbit,
            color: 'text-purple-600',
            bgGradient: 'from-purple-50 to-indigo-50/40',
            border: 'border-purple-200/80',
            badgeBg: 'bg-purple-100',
            badgeText: 'text-purple-700',
        };
    }
    return {
        icon: Trees,
        color: 'text-slate-600',
        bgGradient: 'from-slate-50 to-slate-100/50',
        border: 'border-slate-200',
        badgeBg: 'bg-slate-100',
        badgeText: 'text-slate-700',
    };
}

/** 怪物视觉外观配置 */
export function getMonsterVisual(id: string, name: string = '', rank: string = 'normal'): VisualConfig {
    const isBoss = rank === 'boss';
    const isElite = rank === 'elite';

    let icon = Swords;
    if (isBoss) {
        icon = Crown;
    } else if (name.includes('软泥') || id.includes('slime')) {
        icon = Droplets;
    } else if (name.includes('蝠') || id.includes('bat')) {
        icon = Moon;
    } else if (name.includes('兽') || name.includes('狼')) {
        icon = PawPrint;
    } else if (name.includes('鼠')) {
        icon = Footprints;
    } else if (name.includes('傀儡') || name.includes('守卫') || name.includes('巨像') || name.includes('魔像')) {
        icon = Shield;
    } else if (name.includes('菇') || name.includes('树')) {
        icon = TreePine;
    } else if (name.includes('骷髅') || name.includes('骑士')) {
        icon = Skull;
    } else if (name.includes('灵') || name.includes('祭司')) {
        icon = Waves;
    } else if (name.includes('灰烬') || name.includes('熔岩') || name.includes('火')) {
        icon = Flame;
    } else if (name.includes('裂隙') || name.includes('星蚀')) {
        icon = Orbit;
    }

    if (isBoss) {
        return {
            icon,
            color: 'text-amber-600',
            bgGradient: 'from-amber-50/80 via-orange-50/40 to-white',
            border: 'border-amber-300',
            badgeBg: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
            badgeText: 'text-white',
        };
    }
    if (isElite) {
        return {
            icon,
            color: 'text-purple-600',
            bgGradient: 'from-purple-50/80 via-indigo-50/40 to-white',
            border: 'border-purple-200/90',
            badgeBg: 'bg-purple-100 text-purple-700',
            badgeText: 'text-purple-700',
        };
    }
    return {
        icon,
        color: 'text-sky-600',
        bgGradient: 'from-slate-50 via-sky-50/30 to-white',
        border: 'border-slate-200',
        badgeBg: 'bg-slate-100 text-slate-600',
        badgeText: 'text-slate-600',
    };
}

/** 材料视觉外观配置 */
export function getMaterialVisual(id: string, name: string = ''): VisualConfig {
    let icon = Gem;
    let color = 'text-amber-600';
    let bgGradient = 'from-amber-50 to-orange-50/30';
    let border = 'border-amber-200/70';

    if (name.includes('印记') || id.includes('mark')) {
        icon = Disc;
        color = 'text-indigo-600';
        bgGradient = 'from-indigo-50 to-purple-50/30';
        border = 'border-indigo-200/70';
    } else if (name.includes('核心') || name.includes('残核') || name.includes('精华')) {
        icon = Sparkles;
        color = 'text-purple-600';
        bgGradient = 'from-purple-50 to-fuchsia-50/30';
        border = 'border-purple-200/70';
    } else if (name.includes('黏液') || name.includes('树脂')) {
        icon = Droplets;
        color = 'text-emerald-600';
        bgGradient = 'from-emerald-50 to-teal-50/30';
        border = 'border-emerald-200/70';
    } else if (name.includes('翼') || name.includes('皮') || name.includes('毛')) {
        icon = Feather;
        color = 'text-sky-600';
        bgGradient = 'from-sky-50 to-blue-50/30';
        border = 'border-sky-200/70';
    } else if (name.includes('灰') || name.includes('粉') || name.includes('熔岩')) {
        icon = Flame;
        color = 'text-rose-600';
        bgGradient = 'from-rose-50 to-red-50/30';
        border = 'border-rose-200/70';
    } else if (name.includes('矿') || name.includes('晶') || name.includes('碎片') || name.includes('骨')) {
        icon = Layers;
        color = 'text-amber-600';
        bgGradient = 'from-amber-50 to-yellow-50/30';
        border = 'border-amber-200/70';
    }

    return {
        icon,
        color,
        bgGradient,
        border,
        badgeBg: 'bg-slate-100',
        badgeText: 'text-slate-600',
    };
}

/** 装备视觉外观配置 */
export function getEquipmentVisual(slot: string, name: string = '', isBossOnly = false): VisualConfig {
    let icon = Shield;
    if (slot === 'weapon') {
        if (name.includes('斧')) icon = Axe;
        else if (name.includes('弓')) icon = Crosshair;
        else if (name.includes('杖')) icon = Wand2;
        else icon = Sword;
    } else if (slot === 'head') {
        icon = Crown;
    } else if (slot === 'body') {
        icon = Shield;
    } else if (slot === 'hands') {
        icon = Hand;
    } else if (slot === 'feet') {
        icon = Footprints;
    } else if (slot === 'accessory') {
        icon = Gem;
    }

    if (isBossOnly) {
        return {
            icon,
            color: 'text-amber-600',
            bgGradient: 'from-amber-50 via-amber-50/40 to-white',
            border: 'border-amber-300',
            badgeBg: 'bg-amber-100 text-amber-700',
            badgeText: 'text-amber-700',
        };
    }

    return {
        icon,
        color: 'text-slate-700',
        bgGradient: 'from-slate-50 via-slate-50/50 to-white',
        border: 'border-slate-200',
        badgeBg: 'bg-slate-100 text-slate-600',
        badgeText: 'text-slate-600',
    };
}

/** 职业视觉外观配置 */
export function getProfessionVisual(id: string, _name: string = '', _parentId: string = '', stage: number | string = 0): VisualConfig {
    const stageNum = Number(stage);
    let icon = Sparkles;
    let color = 'text-violet-600';
    let bgGradient = 'from-violet-50 to-purple-50/30';
    let border = 'border-violet-200';

    if (id === 'job.novice' || stageNum === 0) {
        icon = BookOpen;
        color = 'text-slate-600';
        bgGradient = 'from-slate-50 to-slate-100/40';
        border = 'border-slate-200';
    } else if (id.includes('warrior') || id.includes('swordsman') || id.includes('guardian') || id.includes('swordmaster') || id.includes('spellblade') || id.includes('paladin') || id.includes('berserker')) {
        icon = Swords;
        color = 'text-orange-600';
        bgGradient = 'from-orange-50 to-red-50/30';
        border = 'border-orange-200';
    } else if (id.includes('mage') || id.includes('elementalist') || id.includes('occultist') || id.includes('pyromancer') || id.includes('cryomancer') || id.includes('warlock') || id.includes('summoner')) {
        icon = Wand2;
        color = 'text-indigo-600';
        bgGradient = 'from-indigo-50 to-purple-50/30';
        border = 'border-indigo-200';
    } else if (id.includes('ranger') || id.includes('archer') || id.includes('assassin') || id.includes('sharpshooter') || id.includes('hunter') || id.includes('shadowdancer') || id.includes('trickster')) {
        icon = Crosshair;
        color = 'text-emerald-600';
        bgGradient = 'from-emerald-50 to-teal-50/30';
        border = 'border-emerald-200';
    } else if (id.includes('priest') || id.includes('cleric') || id.includes('naturalist') || id.includes('highpriest') || id.includes('inquisitor') || id.includes('druid') || id.includes('warden')) {
        icon = HeartPulse;
        color = 'text-cyan-600';
        bgGradient = 'from-cyan-50 to-sky-50/30';
        border = 'border-cyan-200';
    }

    return {
        icon,
        color,
        bgGradient,
        border,
        badgeBg: 'bg-violet-100',
        badgeText: 'text-violet-700',
    };
}
