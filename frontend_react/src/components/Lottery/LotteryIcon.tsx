import type {SVGProps} from 'react';

/**
 * 居民彩票站专属幸运奖券图标
 * 替代 Lucide 默认的生硬狗骨头/抵用券 Ticket，加入精美撕票虚线、璀璨幸运星与灵动微光
 */
export function LotteryIcon({className = 'h-5 w-5', ...props}: SVGProps<SVGSVGElement>) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            {...props}
        >
            {/* 票身主体：平滑大圆角 + 轻盈金橙底色 + 柔和边缘缺口 */}
            <path
                d="M3 8.5C3 7.67 3.67 7 4.5 7H19.5C20.33 7 21 7.67 21 8.5V10.2C20.2 10.4 19.6 11.1 19.6 12C19.6 12.9 20.2 13.6 21 13.8V15.5C21 16.33 20.33 17 19.5 17H4.5C3.67 17 3 16.33 3 15.5V13.8C3.8 13.6 4.4 12.9 4.4 12C4.4 11.1 3.8 10.4 3 10.2V8.5Z"
                fill="currentColor"
                fillOpacity="0.18"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
            />
            {/* 票根打孔撕裂线 */}
            <path
                d="M8.5 7.5V16.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="2 2"
                strokeLinecap="round"
            />
            {/* 彩票核心：闪耀四角幸运星 */}
            <path
                d="M15 9.5C15 11.1 13.7 12 13.7 12C13.7 12 15 12.9 15 14.5C15 12.9 16.3 12 16.3 12C16.3 12 15 11.1 15 9.5Z"
                fill="currentColor"
            />
            {/* 右上角灵动漂浮微光星 */}
            <path
                d="M19.4 3.8C19.4 4.7 18.6 5.2 18.6 5.2C18.6 5.2 19.4 5.7 19.4 6.6C19.4 5.7 20.2 5.2 20.2 5.2C20.2 5.2 19.4 4.7 19.4 3.8Z"
                fill="currentColor"
            />
        </svg>
    );
}
