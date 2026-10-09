interface TeacherAvatarProps {
    size?: 'sm' | 'md' | 'lg';
    isThinking?: boolean;
    showOnlineStatus?: boolean;
    className?: string;
}

export default function TeacherAvatar({
    size = 'md',
    isThinking = false,
    showOnlineStatus = true,
    className = '',
}: TeacherAvatarProps) {
    const sizeMap = {
        sm: {
            container: 'h-7 w-7 rounded-lg',
            status: 'h-2 w-2 -bottom-0.5 -right-0.5',
            statusPing: 'h-2 w-2',
        },
        md: {
            container: 'h-9 w-9 rounded-xl',
            status: 'h-2.5 w-2.5 -bottom-0.5 -right-0.5',
            statusPing: 'h-2.5 w-2.5',
        },
        lg: {
            container: 'h-12 w-12 rounded-2xl',
            status: 'h-3 w-3 -bottom-1 -right-1',
            statusPing: 'h-3 w-3',
        },
    };

    const currentSize = sizeMap[size];

    return (
        <div className={`relative inline-flex shrink-0 select-none ${currentSize.container} ${className}`}>
            {/* 灵动外围微弥散微光 */}
            <div
                className={`absolute -inset-0.5 rounded-[inherit] bg-gradient-to-tr from-orange-500 via-amber-400 to-orange-400 opacity-60 blur-[2px] transition-all duration-500 ${
                    isThinking ? 'scale-110 opacity-90 animate-pulse' : 'hover:opacity-85'
                }`}
            />

            {/* 头像主体：精致现代的 SVG AI 动效核心 */}
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit] border border-orange-200/60 bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 shadow-sm shadow-orange-500/25">
                <svg
                    viewBox="0 0 48 48"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-full w-full p-1"
                >
                    <style>{`
                        @keyframes orbit-cw {
                            from { transform: rotate(0deg); }
                            to { transform: rotate(360deg); }
                        }
                        @keyframes orbit-ccw {
                            from { transform: rotate(360deg); }
                            to { transform: rotate(0deg); }
                        }
                        @keyframes core-pulse {
                            0%, 100% { transform: scale(0.94); opacity: 0.9; }
                            50% { transform: scale(1.06); opacity: 1; }
                        }
                        @keyframes float-cap {
                            0%, 100% { transform: translateY(0); }
                            50% { transform: translateY(-1.2px); }
                        }
                        @keyframes star-spark-1 {
                            0%, 100% { opacity: 0.2; transform: scale(0.7); }
                            50% { opacity: 1; transform: scale(1.2); }
                        }
                        @keyframes star-spark-2 {
                            0%, 100% { opacity: 1; transform: scale(1.2); }
                            50% { opacity: 0.2; transform: scale(0.7); }
                        }
                        .anim-orbit-cw {
                            transform-origin: 24px 24px;
                            animation: orbit-cw ${isThinking ? '3s' : '9s'} linear infinite;
                        }
                        .anim-orbit-ccw {
                            transform-origin: 24px 24px;
                            animation: orbit-ccw ${isThinking ? '4s' : '14s'} linear infinite;
                        }
                        .anim-core {
                            transform-origin: 24px 28px;
                            animation: core-pulse ${isThinking ? '1.2s' : '2.6s'} ease-in-out infinite;
                        }
                        .anim-cap {
                            transform-origin: 24px 17px;
                            animation: float-cap ${isThinking ? '1.5s' : '3.2s'} ease-in-out infinite;
                        }
                        .anim-spark-1 {
                            transform-origin: 35px 23px;
                            animation: star-spark-1 ${isThinking ? '1s' : '2s'} ease-in-out infinite;
                        }
                        .anim-spark-2 {
                            transform-origin: 13px 31px;
                            animation: star-spark-2 ${isThinking ? '1.2s' : '2.4s'} ease-in-out infinite;
                        }
                    `}</style>

                    <defs>
                        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
                            <stop offset="50%" stopColor="#FED7AA" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.1" />
                        </linearGradient>

                        <linearGradient id="coreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#FFFFFF" />
                            <stop offset="45%" stopColor="#FFEDD5" />
                            <stop offset="100%" stopColor="#FDBA74" />
                        </linearGradient>

                        <linearGradient id="capGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#FFFFFF" />
                            <stop offset="100%" stopColor="#E2E8F0" />
                        </linearGradient>
                    </defs>

                    {/* 1. 外层动态逆时针旋转能量环 */}
                    <circle
                        cx="24"
                        cy="24"
                        r="20"
                        stroke="url(#ringGrad)"
                        strokeWidth="1.2"
                        strokeDasharray="6 8"
                        strokeLinecap="round"
                        className="anim-orbit-ccw"
                    />

                    {/* 2. 内层顺时针微动星轨环 */}
                    <circle
                        cx="24"
                        cy="24"
                        r="16.5"
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth="0.9"
                        strokeDasharray="14 12"
                        strokeLinecap="round"
                        className="anim-orbit-cw"
                    />

                    {/* 3. 悬浮的现代学士帽 */}
                    <g className="anim-cap">
                        {/* 顶部菱形帽盘 */}
                        <polygon
                            points="24,10 35,15.5 24,20.5 13,15.5"
                            fill="url(#capGrad)"
                            stroke="rgba(255,255,255,0.9)"
                            strokeWidth="0.8"
                        />
                        {/* 帽身 */}
                        <path
                            d="M18 17.5V20.5C18 22.5 30 22.5 30 20.5V17.5"
                            fill="#F1F5F9"
                            stroke="rgba(255,255,255,0.8)"
                            strokeWidth="0.6"
                        />
                        {/* 金色垂坠流苏 */}
                        <path
                            d="M24 15.5C28 17 33 18.5 34 22"
                            stroke="#FEF08A"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                        />
                        <circle cx="34.2" cy="22.5" r="1.1" fill="#FDE047" />
                    </g>

                    {/* 4. 中心发光 AI 智慧四芒星核 */}
                    <g className="anim-core">
                        {/* 核心光芒晕 */}
                        <circle cx="24" cy="30" r="7" fill="rgba(255,255,255,0.18)" />
                        {/* 晶亮四芒星 */}
                        <path
                            d="M24 23C24 27 20 30 17 30C20 30 24 33 24 37C24 33 28 30 31 30C28 30 24 27 24 23Z"
                            fill="url(#coreGrad)"
                        />
                    </g>

                    {/* 5. 灵动伴随闪烁微星 */}
                    <g className="anim-spark-1">
                        <polygon points="35,21 36.5,23 35,25 33.5,23" fill="#FFFFFF" />
                    </g>
                    <g className="anim-spark-2">
                        <polygon points="13,29.5 14.2,31 13,32.5 11.8,31" fill="#FEF08A" />
                    </g>
                </svg>
            </div>

            {/* 在线状态呼吸光环 */}
            {showOnlineStatus && (
                <span className={`absolute flex items-center justify-center ${currentSize.status}`}>
                    <span
                        className={`absolute inline-flex rounded-full bg-emerald-400 opacity-75 ${
                            currentSize.statusPing
                        } ${isThinking ? 'animate-ping [animation-duration:1.2s]' : 'animate-ping [animation-duration:2.5s]'}`}
                    />
                    <span
                        className={`relative inline-flex rounded-full bg-emerald-500 ring-2 ring-white shadow-2xs ${currentSize.statusPing}`}
                    />
                </span>
            )}
        </div>
    );
}
