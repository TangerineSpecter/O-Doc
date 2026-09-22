import assert from 'node:assert/strict';
import test from 'node:test';

import {
  setupPreventZoom,
  shouldPreventTouchScale,
  shouldPreventWheelScale,
} from './preventZoom.ts';

test('prevents touch scaling when multiple touches are present', () => {
  assert.equal(shouldPreventTouchScale(0), false);
  assert.equal(shouldPreventTouchScale(1), false);
  assert.equal(shouldPreventTouchScale(2), true);
  assert.equal(shouldPreventTouchScale(3), true);
});

test('prevents wheel scaling when ctrlKey is pressed', () => {
  assert.equal(shouldPreventWheelScale(false), false);
  assert.equal(shouldPreventWheelScale(true), true);
});

test('setupPreventZoom binds and cleans up listeners correctly', () => {
  const listeners: Record<string, ((e: Event) => void)[]> = {};

  const fakeTarget: EventTarget = {
    addEventListener(type: string, listener: any) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(listener);
    },
    removeEventListener(type: string, listener: any) {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((l) => l !== listener);
      }
    },
    dispatchEvent() {
      return true;
    },
  };

  const cleanup = setupPreventZoom(fakeTarget);

  assert.equal(typeof listeners.gesturestart?.[0], 'function');
  assert.equal(typeof listeners.touchstart?.[0], 'function');
  assert.equal(typeof listeners.touchmove?.[0], 'function');
  assert.equal(typeof listeners.wheel?.[0], 'function');

  // Test gesturestart preventDefault
  let prevented = false;
  listeners.gesturestart[0]({
    preventDefault() {
      prevented = true;
    },
  } as unknown as Event);
  assert.equal(prevented, true);

  // Test touchstart with single touch does not preventDefault
  let touchPrevented = false;
  listeners.touchstart[0]({
    touches: [{ identifier: 1 }],
    preventDefault() {
      touchPrevented = true;
    },
  } as unknown as Event);
  assert.equal(touchPrevented, false);

  // Test touchstart with multi touch triggers preventDefault
  listeners.touchstart[0]({
    touches: [{ identifier: 1 }, { identifier: 2 }],
    preventDefault() {
      touchPrevented = true;
    },
  } as unknown as Event);
  assert.equal(touchPrevented, true);

  // Test wheel with ctrlKey triggers preventDefault
  let wheelPrevented = false;
  listeners.wheel[0]({
    ctrlKey: false,
    preventDefault() {
      wheelPrevented = true;
    },
  } as unknown as Event);
  assert.equal(wheelPrevented, false);

  listeners.wheel[0]({
    ctrlKey: true,
    preventDefault() {
      wheelPrevented = true;
    },
  } as unknown as Event);
  assert.equal(wheelPrevented, true);

  // Cleanup
  cleanup();
  assert.equal(listeners.gesturestart.length, 0);
  assert.equal(listeners.touchstart.length, 0);
  assert.equal(listeners.touchmove.length, 0);
  assert.equal(listeners.wheel.length, 0);
});
