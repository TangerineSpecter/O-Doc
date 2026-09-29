import {
  TRACKPAD_HISTORY_GESTURE_THRESHOLD,
  type TrackpadHistoryFeedbackState,
} from '../../hooks/useMacTrackpadHistoryNavigation';

interface TrackpadHistoryFeedbackProps {
  gesture: TrackpadHistoryFeedbackState | null;
}

/**
 * PC 端触控板历史导航反馈组件（呼吸光柱 + 极简微箭头）
 * - 去除大面积刺眼橙斑与冗余文字卡片
 * - 保持页面及固定浮层的视口定位，只动画边缘反馈
 * - 边缘提供深度层级阴影与纤细发光胶囊刻度条
 * - 垂直坐标动态跟随光标当前 clientY
 */
export default function TrackpadHistoryFeedback({ gesture }: TrackpadHistoryFeedbackProps) {
  const isBack = gesture?.direction === 'back';
  const progress = gesture
    ? Math.max(0, Math.min(gesture.distance / TRACKPAD_HISTORY_GESTURE_THRESHOLD, 1))
    : 0;

  if (!gesture) return null;

  const isTracking = gesture.phase === 'tracking';
  const isLeaving = gesture.phase !== 'tracking';
  const isCommit = gesture.phase === 'commit';
  const isTriggered = gesture.triggered;

  const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const clampedY = gesture.clientY
    ? Math.max(80, Math.min(windowHeight - 80, gesture.clientY))
    : windowHeight / 2;

  return (
    <aside aria-hidden="true" className="pointer-events-none fixed inset-0 z-[10000] select-none overflow-hidden">
      {/* 边缘层级深度微阴影，营造页面拉伸抽屉感 */}
      <div
        className="absolute inset-y-0 w-24"
        style={{
          ...(isBack ? { left: 0 } : { right: 0 }),
          opacity: isLeaving ? 0 : progress * 0.7,
          background: isBack
            ? 'linear-gradient(to right, rgba(15, 23, 42, 0.08), transparent)'
            : 'linear-gradient(to left, rgba(15, 23, 42, 0.08), transparent)',
          transition: isTracking ? 'none' : 'opacity 180ms ease-out',
        }}
      />

      {/* 边缘微型指示组件 (纤细呼吸光柱 + 极简微箭头) */}
      <div
        className="absolute flex items-center -translate-y-1/2"
        style={{
          top: clampedY,
          ...(isBack ? { left: 6, flexDirection: 'row' } : { right: 6, flexDirection: 'row-reverse' }),
          opacity: isLeaving ? 0 : Math.min(1, progress * 1.6),
          transition: isTracking
            ? 'none'
            : 'opacity 180ms ease-out, transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
          transform: isLeaving
            ? `scale(${isCommit ? 1.15 : 0.95})`
            : 'scale(1)',
        }}
      >
        {/* 纤细呼吸刻度光柱 */}
        <div
          className="w-1 rounded-full transition-all duration-150"
          style={{
            height: `${32 + progress * 24}px`,
            backgroundColor: isTriggered ? '#f97316' : '#cbd5e1',
            boxShadow: isTriggered
              ? '0 0 12px rgba(249, 115, 22, 0.7), 0 0 3px rgba(249, 115, 22, 0.9)'
              : 'none',
          }}
        />

        {/* 极简跟随微箭头 */}
        <div
          className="flex items-center justify-center w-7 h-7 rounded-full bg-white/95 backdrop-blur-sm border shadow-xs transition-all duration-150"
          style={{
            marginLeft: isBack ? 8 : 0,
            marginRight: isBack ? 0 : 8,
            borderColor: isTriggered ? 'rgba(249, 115, 22, 0.4)' : 'rgba(226, 232, 240, 0.8)',
            transform: isTriggered
              ? `scale(1.12) translate3d(${isBack ? -1.5 : 1.5}px, 0, 0)`
              : `scale(0.92) translate3d(${isBack ? -6 * (1 - progress) : 6 * (1 - progress)}px, 0, 0)`,
            opacity: progress > 0.2 ? Math.min(1, (progress - 0.2) / 0.6) : 0,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isTriggered ? 'text-orange-600' : 'text-slate-400'}
          >
            {isBack
              ? <path d="M15 19l-7-7 7-7" />
              : <path d="M9 5l7 7-7 7" />}
          </svg>
        </div>
      </div>
    </aside>
  );
}

