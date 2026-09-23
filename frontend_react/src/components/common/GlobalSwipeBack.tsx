import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { triggerSwipeBackInterceptors } from '../../utils/swipeBackRegistry';

const DEFAULT_TAB_PATHS = ['/memos', '/prompts', '/resources', '/stats'];
const MIN_SWIPE_DISTANCE = 55; // 触发返回所需最小水平位移 px

interface SwipeVisualState {
    active: boolean;
    deltaX: number;
    clientY: number;
    triggered: boolean;
    exiting: boolean;
}

/**
 * 全局移动端右滑返回指示器与手势调度组件
 * - 覆盖全站所有路由（包括全屏文章编辑器 /editor、登录页 /login、白板 /whiteboard 及常规 Layout 页面）
 * - 方案 C：边缘流体水滴弧形拉伸动效 (Fluid Edge Ripple)
 * - 浮层优先拦截（通过 swipeBackRegistry 统一调度）
 * - 编辑器与白板页面精准收窄起手安全区，消除打字与画板平移误触
 */
export default function GlobalSwipeBack() {
    const location = useLocation();
    const navigate = useNavigate();

    const [swipeState, setSwipeState] = useState<SwipeVisualState | null>(null);

    // 手势记录 Ref
    const gestureRef = useRef<{
        startX: number;
        startY: number;
        startTime: number;
        valid: boolean;
        vibrated: boolean;
    } | null>(null);

    const pathname = location.pathname;

    useEffect(() => {
        const isEditorPage = pathname === '/editor' || pathname.startsWith('/editor/');
        const isWhiteboardPage = pathname === '/whiteboard' || pathname.startsWith('/whiteboard/');

        // 编辑器与白板：极窄边缘防误触 (28px)；普通页面：宽边缘起手 (70px~100px)
        const edgeThreshold = isEditorPage || isWhiteboardPage
            ? 28
            : (typeof window !== 'undefined' ? Math.max(70, Math.min(window.innerWidth * 0.22, 100)) : 80);

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length !== 1) {
                gestureRef.current = null;
                setSwipeState(null);
                return;
            }

            const touch = e.touches[0];
            const startX = touch.clientX;
            const startY = touch.clientY;

            // 检查起始元素黑名单
            const target = e.target as HTMLElement | null;
            if (target) {
                // 显式声明禁用的容器（例如全屏大图预览器）
                if (target.closest('[data-disable-swipe-back="true"]')) {
                    gestureRef.current = null;
                    return;
                }

                const tagName = target.tagName.toUpperCase();
                const isFormInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target.isContentEditable;
                // 如果是在表单/富文本输入框内，且非极窄边缘，杜绝误触
                if (isFormInput && startX > 25) {
                    gestureRef.current = null;
                    return;
                }
            }

            // 起手边缘判定
            if (startX > edgeThreshold) {
                gestureRef.current = null;
                return;
            }

            gestureRef.current = {
                startX,
                startY,
                startTime: Date.now(),
                valid: true,
                vibrated: false,
            };

            setSwipeState({
                active: true,
                deltaX: 0,
                clientY: startY,
                triggered: false,
                exiting: false,
            });
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (!gestureRef.current || !gestureRef.current.valid) return;

            const touch = e.touches[0];
            const deltaX = Math.max(0, touch.clientX - gestureRef.current.startX);
            const deltaY = touch.clientY - gestureRef.current.startY;

            // 纵向滚动防冲突：如果垂直位移明显偏大，判定为页面正常上下滚动，取消本次返回手势
            if (Math.abs(deltaY) > deltaX && Math.abs(deltaY) > 20) {
                gestureRef.current.valid = false;
                setSwipeState(null);
                return;
            }

            const isTriggered = deltaX >= MIN_SWIPE_DISTANCE;

            // 跨过触发阈值时，触发一次轻微触感振动反馈
            if (isTriggered && !gestureRef.current.vibrated) {
                gestureRef.current.vibrated = true;
                if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                    try {
                        navigator.vibrate(12);
                    } catch {
                        // ignore
                    }
                }
            } else if (!isTriggered && gestureRef.current.vibrated) {
                // 若滑回阈值以内，重置振动状态以允许再次激活
                gestureRef.current.vibrated = false;
            }

            setSwipeState({
                active: true,
                deltaX,
                clientY: touch.clientY,
                triggered: isTriggered,
                exiting: false,
            });
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (!gestureRef.current || !gestureRef.current.valid) {
                gestureRef.current = null;
                setSwipeState(null);
                return;
            }

            const touch = e.changedTouches[0];
            const deltaX = Math.max(0, touch.clientX - gestureRef.current.startX);
            const deltaY = touch.clientY - gestureRef.current.startY;
            const duration = Date.now() - gestureRef.current.startTime;

            gestureRef.current = null;

            const isValidSwipe = deltaX >= MIN_SWIPE_DISTANCE &&
                deltaX > Math.abs(deltaY) * 1.1 &&
                duration < 750;

            if (isValidSwipe) {
                // 标记为成功退出动画状态（水滴向前轻弹并淡出）
                setSwipeState((prev) => prev ? { ...prev, exiting: true, triggered: true } : null);

                setTimeout(() => {
                    setSwipeState(null);

                    // 1. 优先执行全局注册的弹窗/浮层拦截器
                    const intercepted = triggerSwipeBackInterceptors();
                    if (intercepted) {
                        return;
                    }

                    // 2. 如果已经在首页，不执行返回
                    if (pathname === '/' || pathname === '/home') {
                        return;
                    }

                    // 3. 核心 Tab 页面返回首页，其他子页面返回上一页
                    const isTab = DEFAULT_TAB_PATHS.some(
                        (p) => pathname === p || pathname.startsWith(`${p}/`)
                    );

                    if (isTab) {
                        navigate('/');
                    } else {
                        navigate(-1);
                    }
                }, 180);
            } else {
                // 未达标或被取消：水滴平滑缩回左边缘并隐藏
                setSwipeState((prev) => prev ? { ...prev, active: false, deltaX: 0 } : null);
                setTimeout(() => {
                    setSwipeState(null);
                }, 200);
            }
        };

        const handleTouchCancel = () => {
            gestureRef.current = null;
            setSwipeState(null);
        };

        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('touchend', handleTouchEnd, { passive: true });
        window.addEventListener('touchcancel', handleTouchCancel);

        return () => {
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
            window.removeEventListener('touchcancel', handleTouchCancel);
        };
    }, [pathname, navigate]);

    if (!swipeState) {
        return null;
    }

    const { deltaX, clientY, triggered, exiting, active } = swipeState;

    // 获取视口尺寸
    const windowH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const clampedY = Math.max(70, Math.min(windowH - 70, clientY));

    // 计算水滴向右拉伸距离（带阻尼）
    const pullX = exiting
        ? 68
        : active
            ? Math.min(deltaX * 0.72, 60)
            : 0;

    // 动态生成水滴贝塞尔曲线路径
    // 水滴弧高在手指 Y 轴上下各展开约 95px，曲线与左侧边缘完美相切
    const topArcY = Math.max(0, clampedY - 95);
    const bottomArcY = Math.min(windowH, clampedY + 95);
    const pathD = `M 0 0 L 0 ${topArcY} C 0 ${clampedY - 50}, ${pullX} ${clampedY - 40}, ${pullX} ${clampedY} C ${pullX} ${clampedY + 40}, 0 ${clampedY + 50}, 0 ${bottomArcY} L 0 ${windowH} Z`;

    // 居中箭头计算
    const arrowX = Math.max(14, pullX * 0.58);
    const arrowOpacity = deltaX < 15 ? 0 : Math.min(1, (deltaX - 15) / 32);

    return (
        <aside
            aria-hidden="true"
            className="fixed inset-y-0 left-0 w-36 pointer-events-none select-none z-[9999] overflow-visible"
            style={{
                opacity: exiting ? 0 : active ? 1 : 0,
                transition: exiting
                    ? 'opacity 0.2s ease-out'
                    : active
                        ? 'none'
                        : 'opacity 0.2s ease-out',
            }}
        >
            <svg
                className="w-full h-full overflow-visible"
                viewBox={`0 0 144 ${windowH}`}
                preserveAspectRatio="none"
            >
                <defs>
                    {/* 未触发状态的小橘流体渐变 */}
                    <linearGradient id="globalSwipeGradNormal" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f97316" stopOpacity="0.82" />
                        <stop offset="100%" stopColor="#ea580c" stopOpacity="0.92" />
                    </linearGradient>

                    {/* 达到触发阈值后的高亮饱和渐变 */}
                    <linearGradient id="globalSwipeGradTriggered" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#ff7a00" stopOpacity="0.96" />
                        <stop offset="100%" stopColor="#ea580c" stopOpacity="1" />
                    </linearGradient>

                    {/* 边缘微光阴影滤镜 */}
                    <filter id="globalSwipeGlow" x="-20%" y="-20%" width="160%" height="140%">
                        <feDropShadow
                            dx="3"
                            dy="0"
                            stdDeviation={triggered ? 6 : 4}
                            floodColor="#ea580c"
                            floodOpacity={triggered ? 0.45 : 0.25}
                        />
                    </filter>
                </defs>

                {/* 动态水滴弧形路径 */}
                <path
                    d={pathD}
                    fill={triggered ? 'url(#globalSwipeGradTriggered)' : 'url(#globalSwipeGradNormal)'}
                    filter="url(#globalSwipeGlow)"
                    style={{
                        transition: exiting
                            ? 'all 0.2s cubic-bezier(0.2, 0.9, 0.3, 1)'
                            : active
                                ? 'none'
                                : 'd 0.2s ease-out',
                    }}
                />

                {/* 居中浮现的小橘后退箭头 */}
                <g
                    transform={`translate(${arrowX}, ${clampedY})`}
                    opacity={arrowOpacity}
                    style={{
                        transition: exiting
                            ? 'transform 0.2s ease-out, opacity 0.2s ease-out'
                            : active
                                ? 'none'
                                : 'opacity 0.2s ease-out',
                    }}
                >
                    {/* 底衬白色磨砂圆 */}
                    <circle
                        cx="0"
                        cy="0"
                        r={triggered ? 15 : 13}
                        fill="white"
                        fillOpacity={triggered ? 1 : 0.92}
                        className="transition-all duration-150"
                        style={{
                            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))',
                        }}
                    />

                    {/* 向左返回箭头 */}
                    <path
                        d="M 3 -5.5 L -3.5 0 L 3 5.5"
                        stroke="#ea580c"
                        strokeWidth={triggered ? 3 : 2.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        style={{
                            transform: triggered ? 'translateX(-1.5px) scale(1.1)' : 'none',
                            transition: 'transform 0.15s ease-out',
                        }}
                    />
                </g>
            </svg>
        </aside>
    );
}
