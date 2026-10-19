import {useId} from 'react';

/**
 * 对应人体纸娃娃的 9 个解剖学部位锚点坐标 (在 320 x 420 视口坐标系下)
 */
const ANATOMY_ANCHORS: Record<string, {x: number; y: number; label: string}> = {
    head: {x: 160, y: 56, label: '头部'},
    hands: {x: 114, y: 132, label: '护手'},
    accessory: {x: 172, y: 92, label: '吊坠'},
    weapon: {x: 104, y: 198, label: '主武器'},
    body: {x: 160, y: 148, label: '护甲'},
    offhand: {x: 216, y: 198, label: '副手'},
    ring_1: {x: 120, y: 268, label: '左戒'},
    ring_2: {x: 200, y: 268, label: '右戒'},
    feet: {x: 160, y: 356, label: '战靴'},
};

/**
 * 极简高级浅色主题：空灵水润的冒险者星盘水印纸娃娃
 * 采用极淡雅的剪影质感 (不喧宾夺主)、优美端庄的自然站姿、与高精度的魔导星盘刻度环
 */
export function DiabloHumanSilhouette({
    activeSlot,
    className = '',
}: {
    activeSlot?: string | null;
    className?: string;
}) {
    const rawId = useId();
    const maskId = `paperdoll-${rawId.replace(/[:]/g, '')}`;

    return (
        <svg
            viewBox="0 0 320 420"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`pointer-events-none select-none ${className}`}
            aria-hidden="true"
        >
            <defs>
                {/* 舞台中心极淡暖色微光 */}
                <radialGradient id={`${maskId}-center-glow`} cx="50%" cy="45%" r="48%">
                    <stop offset="0%" stopColor="#ffedd5" stopOpacity="0.35" />
                    <stop offset="60%" stopColor="#f8fafc" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>

                {/* 空灵淡雅的人形渐变 (透明度极低，作为安静的解剖底衬) */}
                <linearGradient id={`${maskId}-figure-gradient`} x1="160" y1="35" x2="160" y2="375" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.22" />
                    <stop offset="50%" stopColor="#94a3b8" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#cbd5e1" stopOpacity="0.1" />
                </linearGradient>

                {/* 激活部位的柔光脉冲 */}
                <radialGradient id={`${maskId}-active-pulse`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#f97316" stopOpacity="0.9" />
                    <stop offset="50%" stopColor="#fb923c" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* 1. 中心柔和光晕 */}
            <circle cx="160" cy="180" r="140" fill={`url(#${maskId}-center-glow)`} />

            {/* 2. 精致高级的魔导星盘刻度几何环 (带来现代高精游戏 UI 仪式感) */}
            <g opacity="0.45">
                {/* 外层大星盘刻度环 */}
                <circle cx="160" cy="180" r="132" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="3 8" />
                <circle cx="160" cy="180" r="118" stroke="#cbd5e1" strokeWidth="0.6" strokeDasharray="1 5" />
                <circle cx="160" cy="180" r="88" stroke="#e2e8f0" strokeWidth="0.8" />

                {/* 经纬四象刻度微线与十字星标 */}
                <line x1="160" y1="36" x2="160" y2="44" stroke="#94a3b8" strokeWidth="1" />
                <line x1="160" y1="316" x2="160" y2="324" stroke="#94a3b8" strokeWidth="1" />
                <line x1="16" y1="180" x2="24" y2="180" stroke="#94a3b8" strokeWidth="1" />
                <line x1="296" y1="180" x2="304" y2="180" stroke="#94a3b8" strokeWidth="1" />

                {/* 脚底微透视召唤同心圆 */}
                <ellipse cx="160" cy="370" rx="88" ry="18" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                <ellipse cx="160" cy="370" rx="58" ry="12" stroke="#e2e8f0" strokeWidth="0.8" />
                <ellipse cx="160" cy="370" rx="28" ry="6" stroke="#fdba74" strokeWidth="1" strokeOpacity="0.5" />
            </g>

            {/* 3. 比例匀称自然的英姿冒险者全身立体立绘剪影 (极淡空灵，绝不突兀扎眼) */}
            <g opacity="0.85">
                {/* 优雅冒险者身姿主路径：圆润头部、微立领、匀称双肩、自然收拢腰际的双手、修长双腿 */}
                <path
                    d="
                    M160,36
                    C170,36 177,44 177,55
                    C177,65 171,73 165,76
                    C162,77 158,77 155,76
                    C149,73 143,65 143,55
                    C143,44 150,36 160,36 Z

                    M154,77
                    C154,82 150,86 142,91
                    C132,97 124,106 120,118
                    C116,130 114,146 112,166
                    L108,198
                    C107,208 111,212 116,211
                    C120,210 122,202 124,190
                    L127,160
                    C129,148 135,140 142,136
                    C144,146 144,166 145,188
                    C145,210 146,226 146,236
                    L158,236
                    L158,196
                    L162,196
                    L162,236
                    L174,236
                    C174,226 175,210 175,188
                    C176,166 176,146 178,136
                    C185,140 191,148 193,160
                    L196,190
                    C198,202 200,210 204,211
                    C209,212 213,208 212,198
                    L208,166
                    C206,146 204,130 200,118
                    C196,106 188,97 178,91
                    C170,86 166,82 166,77 Z

                    M146,236
                    C144,256 143,284 144,310
                    C144,328 143,344 140,355
                    C139,359 142,362 147,363
                    C152,364 156,361 157,356
                    C158,348 157,328 156,308
                    C155,288 156,262 156,236 Z

                    M174,236
                    C176,256 177,284 176,310
                    C176,328 177,344 180,355
                    C181,359 178,362 173,363
                    C168,364 164,361 163,356
                    C162,348 163,328 164,308
                    C165,288 164,262 164,236 Z
                    "
                    fill={`url(#${maskId}-figure-gradient)`}
                    stroke="#94a3b8"
                    strokeWidth="0.8"
                    strokeOpacity="0.4"
                />

                {/* 极简优雅的衣领与腰饰微弧线 */}
                <path d="M152,88 Q160,92 168,88" stroke="#94a3b8" strokeWidth="0.8" strokeOpacity="0.35" fill="none" />
                <path d="M146,176 Q160,180 174,176" stroke="#94a3b8" strokeWidth="0.8" strokeOpacity="0.3" fill="none" />
            </g>

            {/* 4. 各部位解剖共鸣点 (悬停时在对应身体部位绽放优雅光晕，干净利落) */}
            {Object.entries(ANATOMY_ANCHORS).map(([slotKey, pt]) => {
                const isActive = activeSlot === slotKey;
                return (
                    <g key={slotKey} className="transition-all duration-300">
                        {/* 基础极淡点 (平时轻盈不抢眼) */}
                        <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={isActive ? 5.5 : 2}
                            fill={isActive ? `url(#${maskId}-active-pulse)` : '#cbd5e1'}
                            fillOpacity={isActive ? 1 : 0.35}
                            stroke={isActive ? '#ffffff' : 'none'}
                            strokeWidth={isActive ? 1.5 : 0}
                            className={isActive ? 'animate-pulse' : ''}
                        />

                        {/* 激活时的柔和扩散光环 */}
                        {isActive && (
                            <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={12}
                                stroke="#f97316"
                                strokeWidth="1"
                                strokeOpacity="0.75"
                                strokeDasharray="2 2"
                                className="animate-ping"
                            />
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
