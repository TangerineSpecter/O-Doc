import {useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject} from 'react';
import warriorHeroImg from '../../assets/combat/loadout-hero-warrior-v1.png';
import mageHeroImg from '../../assets/combat/loadout-hero-mage-v1.png';
import archerHeroImg from '../../assets/combat/loadout-hero-archer-v1.png';
import priestHeroImg from '../../assets/combat/loadout-hero-priest-v1.png';
import {
    LOADOUT_HERO_ANCHORS,
    type LoadoutHeroArchetype,
    type PresentedLoadoutItem,
} from './loadoutPresentation';

interface HeroVisualMeta {
    image: string;
    alt: string;
    aura: string;
    footAura: string;
}

const HERO_VISUAL_META: Record<LoadoutHeroArchetype, HeroVisualMeta> = {
    warrior: {
        image: warriorHeroImg,
        alt: '战士中心立绘',
        aura: 'radial-gradient(circle, rgba(56, 189, 248, 0.22) 0%, rgba(249, 115, 22, 0.08) 55%, transparent 75%)',
        footAura:
            'radial-gradient(ellipse at center, rgba(56, 189, 248, 0.30) 0%, rgba(245, 158, 11, 0.14) 55%, transparent 78%)',
    },
    mage: {
        image: mageHeroImg,
        alt: '法师中心立绘',
        aura: 'radial-gradient(circle, rgba(168, 85, 247, 0.25) 0%, rgba(56, 189, 248, 0.10) 55%, transparent 75%)',
        footAura:
            'radial-gradient(ellipse at center, rgba(168, 85, 247, 0.34) 0%, rgba(56, 189, 248, 0.18) 55%, transparent 78%)',
    },
    archer: {
        image: archerHeroImg,
        alt: '弓手中心立绘',
        aura: 'radial-gradient(circle, rgba(16, 185, 129, 0.24) 0%, rgba(234, 179, 8, 0.08) 55%, transparent 75%)',
        footAura:
            'radial-gradient(ellipse at center, rgba(16, 185, 129, 0.32) 0%, rgba(234, 179, 8, 0.16) 55%, transparent 78%)',
    },
    priest: {
        image: priestHeroImg,
        alt: '牧师中心立绘',
        aura: 'radial-gradient(circle, rgba(251, 191, 36, 0.26) 0%, rgba(244, 114, 182, 0.10) 55%, transparent 75%)',
        footAura:
            'radial-gradient(ellipse at center, rgba(245, 158, 11, 0.34) 0%, rgba(244, 114, 182, 0.18) 55%, transparent 78%)',
    },
};

const ALL_SLOTS = [
    'head',
    'hands',
    'accessory',
    'weapon',
    'body',
    'offhand',
    'ring_1',
    'feet',
    'ring_2',
] as const;

const FALLBACK_SLOT_CENTERS: Record<string, {sx: number; sy: number}> = {
    head: {sx: 230, sy: 44},
    hands: {sx: 52, sy: 104},
    accessory: {sx: 408, sy: 104},
    weapon: {sx: 44, sy: 222},
    body: {sx: 44, sy: 340},
    offhand: {sx: 416, sy: 222},
    feet: {sx: 416, sy: 340},
    ring_1: {sx: 72, sy: 448},
    ring_2: {sx: 388, sy: 448},
};

interface ConduitLineGeometry {
    slot: string;
    sx: number;
    sy: number;
    midX: number;
    tx: number;
    ty: number;
}

function buildFallbackGeometry(archetype: LoadoutHeroArchetype): {
    width: number;
    height: number;
    lines: ConduitLineGeometry[];
} {
    const width = 460;
    const height = 500;
    const heroWidth = 316;
    const heroHeight = 352;
    const heroLeft = (width - heroWidth) / 2;
    const heroTop = 82 + (height - 82 - heroHeight) / 2;
    const anchors = LOADOUT_HERO_ANCHORS[archetype] || LOADOUT_HERO_ANCHORS.warrior;

    const lines = ALL_SLOTS.map(slot => {
        const start = FALLBACK_SLOT_CENTERS[slot] || {sx: width / 2, sy: height / 2};
        const anchor = anchors[slot] || {nx: 0.5, ny: 0.5};
        const tx = heroLeft + heroWidth * anchor.nx;
        const ty = heroTop + heroHeight * anchor.ny;
        const midX = start.sx + (tx - start.sx) * 0.55;
        return {
            slot,
            sx: start.sx,
            sy: start.sy,
            midX,
            tx,
            ty,
        };
    });

    return {width, height, lines};
}

function resolveLineColor(isActive: boolean, quality?: string): string {
    if (isActive) return '#f97316';
    if (quality === 'gold') return '#f59e0b';
    if (quality === 'blue') return '#38bdf8';
    if (quality === 'white') return '#94a3b8';
    return '#94a3b8';
}

export function DiabloHumanSilhouette({
    activeSlot,
    archetype = 'warrior',
    equippedSlots,
    stageRef,
    className = '',
}: {
    activeSlot?: string | null;
    archetype?: LoadoutHeroArchetype;
    equippedSlots?: Map<string, PresentedLoadoutItem>;
    stageRef?: RefObject<HTMLDivElement | null>;
    className?: string;
}) {
    const heroImgRef = useRef<HTMLImageElement | null>(null);
    const [geometry, setGeometry] = useState(() => buildFallbackGeometry(archetype));

    const measureConduits = useCallback(() => {
        const stageEl = stageRef?.current;
        const heroEl = heroImgRef.current;
        if (!stageEl || !heroEl) {
            setGeometry(buildFallbackGeometry(archetype));
            return;
        }

        const stageRect = stageEl.getBoundingClientRect();
        const heroRect = heroEl.getBoundingClientRect();
        if (stageRect.width <= 0 || stageRect.height <= 0 || heroRect.width <= 0 || heroRect.height <= 0) {
            setGeometry(buildFallbackGeometry(archetype));
            return;
        }

        const anchors = LOADOUT_HERO_ANCHORS[archetype] || LOADOUT_HERO_ANCHORS.warrior;
        const lines: ConduitLineGeometry[] = ALL_SLOTS.map(slot => {
            const slotBoxEl = stageEl.querySelector<HTMLElement>(`[data-loadout-slot-box="${slot}"]`);
            const fallbackStart = FALLBACK_SLOT_CENTERS[slot] || {
                sx: stageRect.width / 2,
                sy: stageRect.height / 2,
            };
            let sx = fallbackStart.sx;
            let sy = fallbackStart.sy;
            if (slotBoxEl) {
                const rect = slotBoxEl.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    sx = rect.left - stageRect.left + rect.width / 2;
                    sy = rect.top - stageRect.top + rect.height / 2;
                }
            }

            const anchor = anchors[slot] || {nx: 0.5, ny: 0.5};
            const tx = heroRect.left - stageRect.left + heroRect.width * anchor.nx;
            const ty = heroRect.top - stageRect.top + heroRect.height * anchor.ny;
            const midX = sx + (tx - sx) * 0.55;

            return {slot, sx, sy, midX, tx, ty};
        });

        setGeometry({
            width: stageRect.width,
            height: stageRect.height,
            lines,
        });
    }, [archetype, stageRef]);

    useLayoutEffect(() => {
        measureConduits();
    }, [measureConduits]);

    useEffect(() => {
        const stageEl = stageRef?.current;
        if (!stageEl) return;

        const handleResize = () => {
            measureConduits();
        };
        window.addEventListener('resize', handleResize);

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => {
                measureConduits();
            });
            observer.observe(stageEl);
            if (heroImgRef.current) {
                observer.observe(heroImgRef.current);
            }
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            observer?.disconnect();
        };
    }, [measureConduits, stageRef]);

    const visual = HERO_VISUAL_META[archetype] || HERO_VISUAL_META.warrior;

    return (
        <div
            className={`relative flex h-full w-full items-center justify-center pointer-events-none select-none ${className}`}
            aria-hidden="true"
        >
            <style>{`
                @keyframes loadoutOrbitSpinSlow {
                    from { transform: translate(-50%, -50%) rotate(0deg); }
                    to { transform: translate(-50%, -50%) rotate(360deg); }
                }
                @keyframes loadoutOrbitSpinReverse {
                    from { transform: translate(-50%, -50%) rotate(360deg); }
                    to { transform: translate(-50%, -50%) rotate(0deg); }
                }
                @keyframes loadoutHeroBreathe {
                    0%, 100% { transform: translateY(0px) scale(1); }
                    50% { transform: translateY(-3px) scale(1.008); }
                }
                @keyframes loadoutConduitDash {
                    to { stroke-dashoffset: -24; }
                }
            `}</style>

            {/* 1. 职业专属中心柔和背景光晕 */}
            <div
                className="absolute left-1/2 top-[54%] -translate-x-1/2 -translate-y-1/2 w-[250px] h-[340px] rounded-full blur-2xl opacity-65 transition-all duration-500"
                style={{background: visual.aura}}
            />

            {/* 2. 双层微旋奥术星盘环 */}
            <div
                className="absolute left-1/2 top-[54%] w-[310px] h-[310px] sm:w-[360px] sm:h-[360px] rounded-full border border-dashed border-slate-400/25 opacity-60"
                style={{animation: 'loadoutOrbitSpinSlow 56s linear infinite'}}
            />
            <div
                className="absolute left-1/2 top-[54%] w-[220px] h-[220px] sm:w-[255px] sm:h-[255px] rounded-full border border-slate-400/20 opacity-50"
                style={{animation: 'loadoutOrbitSpinReverse 38s linear infinite'}}
            />

            {/* 3. 职业脚底光环柔光底衬 */}
            <div
                className="absolute left-1/2 top-[84%] -translate-x-1/2 -translate-y-1/2 w-[250px] h-[66px] rounded-full blur-xl opacity-75 transition-all duration-500"
                style={{background: visual.footAura}}
            />

            {/* 4. 紧凑比例一转职业立绘 (带专属透视脚底光环，避开顶部头饰遮挡) */}
            <div
                className="relative z-0 flex items-center justify-center mt-[74px] sm:mt-[80px] w-[284px] h-[316px] sm:w-[316px] sm:h-[352px] transition-all duration-300"
                style={{
                    opacity: 0.9,
                    animation: 'loadoutHeroBreathe 4.2s ease-in-out infinite',
                }}
            >
                <img
                    ref={heroImgRef}
                    data-loadout-hero-img={archetype}
                    src={visual.image}
                    alt={visual.alt}
                    onLoad={measureConduits}
                    className="w-full h-full object-contain select-none"
                />
            </div>

            {/* 5. 解剖对位折线引线与靶心锚点 SVG 叠层 */}
            <svg
                viewBox={`0 0 ${geometry.width} ${geometry.height}`}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute inset-0 w-full h-full z-0"
            >
                {geometry.lines.map(line => {
                    const isActive = activeSlot === line.slot;
                    const equipped = equippedSlots?.get(line.slot);
                    const quality = equipped?.item.snapshot.quality;
                    const strokeColor = resolveLineColor(isActive, quality);
                    const strokeOpacity = isActive ? 0.95 : equipped ? 0.52 : 0.32;
                    const strokeWidth = isActive ? 2.2 : 1.3;

                    return (
                        <g key={line.slot} opacity={strokeOpacity}>
                            <polyline
                                points={`${line.sx.toFixed(1)},${line.sy.toFixed(1)} ${line.midX.toFixed(1)},${line.ty.toFixed(1)} ${line.tx.toFixed(1)},${line.ty.toFixed(1)}`}
                                stroke={strokeColor}
                                strokeWidth={strokeWidth}
                                strokeDasharray={isActive ? '5 3' : '3 3'}
                                fill="none"
                                style={
                                    isActive
                                        ? {animation: 'loadoutConduitDash 0.9s linear infinite'}
                                        : undefined
                                }
                            />
                            <circle
                                cx={line.tx}
                                cy={line.ty}
                                r={isActive ? 4.5 : 3}
                                fill={strokeColor}
                            />
                            {isActive && (
                                <circle
                                    cx={line.tx}
                                    cy={line.ty}
                                    r={8}
                                    stroke={strokeColor}
                                    strokeWidth="1.2"
                                    fill="none"
                                />
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
