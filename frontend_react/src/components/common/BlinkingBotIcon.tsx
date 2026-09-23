import React from 'react';

interface BlinkingBotIconProps extends React.SVGProps<SVGSVGElement> {
    className?: string;
}

/**
 * 灵动眨眼小机器人图标
 * - 保持与 Lucide Bot 视觉一致
 * - 眼睛自带 .ai-peeking-eyes 自然眨眼动画（每 4 秒眨眼一次）
 */
export const BlinkingBotIcon: React.FC<BlinkingBotIconProps> = ({
    className = 'w-6 h-6',
    ...props
}) => {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            {/* 倒 L 型天线 */}
            <path d="M12 8V4H8" />
            {/* 脑袋外框 */}
            <rect width="16" height="12" x="4" y="8" rx="3" />
            {/* 左右小耳朵 */}
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            {/* 灵动眨眼眼睛 */}
            <g className="ai-peeking-eyes">
                <line x1="9" y1="13" x2="9" y2="15" strokeWidth="2.5" />
                <line x1="15" y1="13" x2="15" y2="15" strokeWidth="2.5" />
            </g>
        </svg>
    );
};

export default BlinkingBotIcon;
