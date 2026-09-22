/**
 * 移动端禁止缩放交互工具
 * 针对移动端浏览器（特别是 iOS Safari 与 Android 各浏览器）视口缩放行为：
 * 1. 阻止双指捏合缩放（iOS gesturestart/gesturechange 及多点触控 touchstart/touchmove）
 * 2. 阻止触控板或外接触控设备的缩放（wheel + ctrlKey）
 */

export function shouldPreventTouchScale(touchCount: number): boolean {
  return touchCount > 1;
}

export function shouldPreventWheelScale(ctrlKey: boolean): boolean {
  return ctrlKey;
}

export function setupPreventZoom(target: EventTarget = document): () => void {
  const onGesture = (e: Event) => {
    e.preventDefault();
  };

  const onTouch = (e: Event) => {
    const touchEvent = e as TouchEvent;
    if (touchEvent.touches && shouldPreventTouchScale(touchEvent.touches.length)) {
      touchEvent.preventDefault();
    }
  };

  const onWheel = (e: Event) => {
    const wheelEvent = e as WheelEvent;
    if (shouldPreventWheelScale(wheelEvent.ctrlKey)) {
      wheelEvent.preventDefault();
    }
  };

  target.addEventListener('gesturestart', onGesture);
  target.addEventListener('gesturechange', onGesture);
  target.addEventListener('gestureend', onGesture);
  target.addEventListener('touchstart', onTouch, { passive: false });
  target.addEventListener('touchmove', onTouch, { passive: false });
  target.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    target.removeEventListener('gesturestart', onGesture);
    target.removeEventListener('gesturechange', onGesture);
    target.removeEventListener('gestureend', onGesture);
    target.removeEventListener('touchstart', onTouch);
    target.removeEventListener('touchmove', onTouch);
    target.removeEventListener('wheel', onWheel);
  };
}
