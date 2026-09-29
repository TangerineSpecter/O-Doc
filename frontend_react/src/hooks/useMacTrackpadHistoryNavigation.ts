import { useEffect, useLayoutEffect, useRef } from 'react';

export type TrackpadHistoryFeedbackState = {
  direction: 'back' | 'forward';
  distance: number;
  triggered: boolean;
  phase: 'tracking' | 'commit' | 'cancel';
  clientY?: number;
};

type NavigationCallbacks = {
  onBack: () => void;
  onForward: () => void;
  onVisualChange: (state: TrackpadHistoryFeedbackState | null) => void;
  canBack?: () => boolean;
  canForward?: () => boolean;
};

type TrackpadGesture = {
  direction: 'back' | 'forward';
  distance: number;
  maxDistance: number;
  endTimer: ReturnType<typeof setTimeout> | null;
  clientY: number;
  lastTimestamp: number;
};

export const TRACKPAD_HISTORY_GESTURE_THRESHOLD = 80;
const GESTURE_END_DELAY = 280;
const GESTURE_COOLDOWN = 260;
const FEEDBACK_EXIT_DURATION = 160;

function isMacOS(): boolean {
  return typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);
}

function getWheelTarget(event: WheelEvent): Element | null {
  return event.target instanceof Element ? event.target : null;
}

function shouldIgnoreTarget(target: Element | null): boolean {
  if (!target) return false;
  return Boolean(target.closest(
    '[data-disable-swipe-back="true"], input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
  ));
}

function canScrollHorizontally(target: Element | null, deltaX: number): boolean {
  let element = target;

  while (element) {
    const style = window.getComputedStyle(element);
    const isScrollable = ['auto', 'scroll', 'overlay'].includes(style.overflowX);
    const maxScrollLeft = element.scrollWidth - element.clientWidth;

    if (isScrollable && maxScrollLeft > 1) {
      // RTL scrollLeft conventions vary by browser; leave those gestures to the scroller.
      if (style.direction === 'rtl') return true;

      const canMove = deltaX > 0
        ? element.scrollLeft < maxScrollLeft - 1
        : element.scrollLeft > 1;
      if (canMove) return true;
    }

    element = element.parentElement;
  }

  return false;
}

/**
 * Replaces the browser's native Mac history-swipe path with app-router navigation.
 * This lets embedded Chromium browsers handle the same trackpad gesture as Chrome.
 */
export function useMacTrackpadHistoryNavigation(
  onBack: () => void,
  onForward: () => void,
  onVisualChange: (state: TrackpadHistoryFeedbackState | null) => void,
  canBack?: () => boolean,
  canForward?: () => boolean,
): void {
  const callbacksRef = useRef<NavigationCallbacks>({ onBack, onForward, onVisualChange, canBack, canForward });

  useLayoutEffect(() => {
    callbacksRef.current = { onBack, onForward, onVisualChange, canBack, canForward };
  }, [onBack, onForward, onVisualChange, canBack, canForward]);

  useEffect(() => {
    if (!isMacOS()) return;

    const root = document.documentElement;
    root.classList.add('mac-trackpad-history-navigation');

    let gesture: TrackpadGesture | null = null;
    let isCoolingDown = false;
    let cooldownTimer: ReturnType<typeof setTimeout> | null = null;
    let visualTimer: ReturnType<typeof setTimeout> | null = null;
    let completionTimer: ReturnType<typeof setTimeout> | null = null;
    let scrollOwnsGesture = false;
    let scrollEndTimer: ReturnType<typeof setTimeout> | null = null;

    const retainScrollGesture = () => {
      scrollOwnsGesture = true;
      if (scrollEndTimer) clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(() => {
        scrollOwnsGesture = false;
        scrollEndTimer = null;
      }, GESTURE_END_DELAY);
    };

    const updateVisual = (state: TrackpadHistoryFeedbackState | null) => {
      if (visualTimer) clearTimeout(visualTimer);
      visualTimer = null;
      callbacksRef.current.onVisualChange(state);
    };

    const retractVisual = (cancelled: TrackpadGesture | null) => {
      if (!cancelled) return;
      updateVisual({
        direction: cancelled.direction,
        distance: cancelled.distance,
        triggered: false,
        phase: 'cancel',
        clientY: cancelled.clientY,
      });
      visualTimer = setTimeout(() => {
        callbacksRef.current.onVisualChange(null);
        visualTimer = null;
      }, FEEDBACK_EXIT_DURATION);
    };

    const clearGesture = () => {
      const cancelled = gesture;
      if (cancelled?.endTimer) clearTimeout(cancelled.endTimer);
      gesture = null;
      retractVisual(cancelled);
    };

    const finishGesture = () => {
      const completed = gesture;
      gesture = null;
      if (completed?.endTimer) clearTimeout(completed.endTimer);
      if (!completed) return;

      // 判定是否取消：
      // 1. 最终距离未达到阈值（80px）
      // 2. 或者用户从最远峰值明显往回缩了超过 14px（表明用户在主动反向拖拽进行撤回取消）
      const isCancelled = completed.distance < TRACKPAD_HISTORY_GESTURE_THRESHOLD ||
                          completed.distance < completed.maxDistance - 14;

      if (isCancelled) {
        retractVisual(completed);
        return;
      }

      // 达到极限且松手（无明显回退意图）：正式提交导航跳转
      isCoolingDown = true;
      if (cooldownTimer) clearTimeout(cooldownTimer);
      cooldownTimer = setTimeout(() => {
        isCoolingDown = false;
        cooldownTimer = null;
      }, GESTURE_COOLDOWN);

      updateVisual({
        direction: completed.direction,
        distance: completed.distance,
        triggered: true,
        phase: 'commit',
        clientY: completed.clientY,
      });
      completionTimer = setTimeout(() => {
        callbacksRef.current.onVisualChange(null);
        completionTimer = null;
        if (completed.direction === 'back') callbacksRef.current.onBack();
        else callbacksRef.current.onForward();
      }, FEEDBACK_EXIT_DURATION);
    };

    const handleWheel = (event: WheelEvent) => {
      // Once a scroller owns a wheel sequence, its edge and momentum events
      // remain scrolling until the sequence has stopped.
      if (scrollOwnsGesture) {
        retainScrollGesture();
        return;
      }
      if (isCoolingDown) {
        if (cooldownTimer) clearTimeout(cooldownTimer);
        cooldownTimer = setTimeout(() => {
          isCoolingDown = false;
          cooldownTimer = null;
        }, GESTURE_COOLDOWN);
        return;
      }

      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey) {
        clearGesture();
        return;
      }
      // Pixel deltas identify precise trackpad or Magic Mouse scrolling, not a stepped wheel.
      if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
        clearGesture();
        return;
      }

      const { deltaX, deltaY } = event;
      if (Math.abs(deltaX) < 1 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) {
        if (gesture && Math.abs(deltaY) > Math.abs(deltaX) * 1.25) clearGesture();
        return;
      }

      const target = getWheelTarget(event);
      if (shouldIgnoreTarget(target) || canScrollHorizontally(target, deltaX)) {
        clearGesture();
        retainScrollGesture();
        return;
      }

      const now = event.timeStamp || Date.now();

      // 手势尚未建立时，判断初始滑动方向并校验是否允许导航
      if (!gesture) {
        const initialDirection = deltaX < 0 ? 'back' : 'forward';
        if (initialDirection === 'back') {
          const permitted = callbacksRef.current.canBack ? callbacksRef.current.canBack() : true;
          if (!permitted) return;
        } else {
          const permitted = callbacksRef.current.canForward
            ? callbacksRef.current.canForward()
            : (typeof window !== 'undefined' && (window as unknown as { navigation?: { canGoForward?: boolean } }).navigation
                ? Boolean((window as unknown as { navigation?: { canGoForward?: boolean } }).navigation?.canGoForward)
                : true);
          if (!permitted) return;
        }

        gesture = {
          direction: initialDirection,
          distance: 0,
          maxDistance: 0,
          endTimer: null,
          clientY: event.clientY,
          lastTimestamp: now,
        };
      } else {
        gesture.clientY = event.clientY;
      }

      // 计算沿手势方向的位移量：
      // direction === 'back': deltaX < 0 为推进返回，deltaX > 0 为反向回缩
      // direction === 'forward': deltaX > 0 为推进前进，deltaX < 0 为反向回缩
      const step = gesture.direction === 'back' ? -deltaX : deltaX;

      // 超过阈值后应用弹性阻尼，上限锁定在 106px；反向滑动时 1:1 即时响应撤销
      let effectiveStep = step;
      if (step > 0 && gesture.distance >= TRACKPAD_HISTORY_GESTURE_THRESHOLD) {
        const overshot = gesture.distance - TRACKPAD_HISTORY_GESTURE_THRESHOLD;
        const damping = Math.max(0.12, 1 - overshot / 28);
        effectiveStep = step * damping * 0.35;
      }

      // 实时增减距离：用户反向滑动时平滑减少，支持双指自由左右来回试探
      gesture.distance = Math.max(0, Math.min(106, gesture.distance + effectiveStep));
      gesture.maxDistance = Math.max(gesture.maxDistance, gesture.distance);

      // 若完全滑回原点（0）且继续反向，平滑清理本次手势
      if (gesture.distance === 0 && step < 0) {
        clearGesture();
        return;
      }

      updateVisual({
        direction: gesture.direction,
        distance: gesture.distance,
        triggered: gesture.distance >= TRACKPAD_HISTORY_GESTURE_THRESHOLD,
        phase: 'tracking',
        clientY: gesture.clientY,
      });

      if (gesture.endTimer) clearTimeout(gesture.endTimer);
      gesture.endTimer = setTimeout(finishGesture, GESTURE_END_DELAY);
    };

    window.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      window.removeEventListener('wheel', handleWheel);
      if (gesture?.endTimer) clearTimeout(gesture.endTimer);
      gesture = null;
      if (cooldownTimer) clearTimeout(cooldownTimer);
      if (visualTimer) clearTimeout(visualTimer);
      if (completionTimer) clearTimeout(completionTimer);
      if (scrollEndTimer) clearTimeout(scrollEndTimer);
      root.classList.remove('mac-trackpad-history-navigation');
    };
  }, []);
}
