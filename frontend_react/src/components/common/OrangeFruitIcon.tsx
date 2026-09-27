import React from 'react';

interface OrangeFruitIconProps {
    className?: string;
    style?: React.CSSProperties;
    animated?: boolean;
}

/**
 * 小橘文档官方品牌小橘子矢量图标
 * 100% 契合系统主 Logo（Navbar）的极简清新矢量形象
 */
export function OrangeFruitIcon({
    className = 'w-4 h-4',
    style,
    animated = false,
}: OrangeFruitIconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={`${className} ${animated ? 'transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6' : ''}`}
            style={style}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            {/* 果梗小枝 */}
            <path
                d="M12 3.5V6.5"
                stroke="#9a3412"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
            {/* 橙色主果身 */}
            <circle
                cx="12"
                cy="14"
                r="8.5"
                className="fill-orange-500"
            />
            {/* 青绿嫩叶 */}
            <path
                d="M12 6.5C12 6.5 10 1 5 3C1 5 4 10 12 6.5Z"
                className="fill-lime-500"
            />
        </svg>
    );
}

export default OrangeFruitIcon;
