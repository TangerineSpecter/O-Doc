import React from 'react';

interface OrangeFruitIconProps {
    className?: string;
    style?: React.CSSProperties;
    animated?: boolean;
}

/**
 * 专属小橘子形象矢量图标 (Rotten Tomatoes 风格)
 * 采用纯矢量层叠排布（饱满果身 + 层次暗部 + 双嫩叶与果蒂 + 晶莹高光），
 * 纯 SVG 矢量绘制，绝非 Emoji，不依赖系统字体，兼具生动性与辨识度。
 */
export function OrangeFruitIcon({
    className = 'w-4 h-4',
    style,
    animated = false,
}: OrangeFruitIconProps) {
    return (
        <svg
            viewBox="0 0 32 32"
            className={`${className} ${animated ? 'transition-transform duration-200 group-hover:scale-125 group-hover:rotate-6' : ''}`}
            style={style}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            {/* 1. 左侧萌芽小副叶 */}
            <path
                d="M15 8.5C13 5.5 10.2 4.5 7.2 5C6.8 8 9 10.2 13.8 9.5"
                fill="#65a30d"
                stroke="#365314"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />

            {/* 2. 右侧饱满嫩主叶 */}
            <path
                d="M16 8.5C18 4.2 21.5 2.5 25.5 3C26 6.8 23.2 10 17.5 9.2"
                fill="#84cc16"
                stroke="#3f6212"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* 叶脉精细线 */}
            <path
                d="M17.8 8C20.2 6.2 22.8 5 25 3.8"
                stroke="#4d7c0f"
                strokeWidth="0.9"
                strokeLinecap="round"
                opacity="0.85"
            />

            {/* 3. 深色小果梗 */}
            <path
                d="M16 9.5V5"
                stroke="#78350f"
                strokeWidth="2"
                strokeLinecap="round"
            />

            {/* 4. 饱满橘子主果身 */}
            <circle
                cx="16"
                cy="19"
                r="11"
                fill="#f97316"
                stroke="#c2410c"
                strokeWidth="1.5"
            />

            {/* 5. 底部月牙形立体暗影弧 (强化果实饱满立体感) */}
            <path
                d="M6.8 22.5C8.8 26.5 12 28.5 16 28.5C20.5 28.5 23.8 26.5 25.2 22.5C23 25.8 19.8 27.2 16 27.2C12 27.2 8.8 25.8 6.8 22.5Z"
                fill="#c2410c"
            />

            {/* 6. 橘皮专属质感微纹点 */}
            <circle cx="21" cy="18" r="0.65" fill="#ea580c" />
            <circle cx="19.5" cy="22" r="0.65" fill="#ea580c" />
            <circle cx="13.5" cy="24.5" r="0.65" fill="#ea580c" />

            {/* 7. 左上方晶莹高光弧 (烂番茄微光感) */}
            <path
                d="M9.5 15C10 11.8 12.2 10.2 15 10"
                stroke="#ffedd5"
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0.9"
            />
            {/* 高光反光点 */}
            <circle cx="10.5" cy="17.5" r="1.1" fill="#ffffff" opacity="0.95" />
        </svg>
    );
}

export default OrangeFruitIcon;
