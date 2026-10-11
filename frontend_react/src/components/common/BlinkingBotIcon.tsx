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
        <span className={`ai-peeking-bot ${className}`}>
            <svg
                className="ai-peeking-bot__drawing"
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
            </svg>
            {/* 保留原 SVG 笔画，让 HTML 层执行同一眨眼动画，避免逐帧更新 SVG。 */}
            <span className="ai-peeking-eyes" aria-hidden="true">
                <svg
                    className="ai-peeking-bot__drawing"
                    viewBox={props.viewBox ?? '0 0 24 24'}
                    fill="none"
                    stroke={props.stroke ?? 'currentColor'}
                    strokeLinecap={props.strokeLinecap ?? 'round'}
                >
                    <line x1="9" y1="13" x2="9" y2="15" strokeWidth="2.5" />
                    <line x1="15" y1="13" x2="15" y2="15" strokeWidth="2.5" />
                </svg>
            </span>
        </span>
    );
};

export default BlinkingBotIcon;
