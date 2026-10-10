const modalSelector = '[data-modal-scroll-lock]';
const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/** Direction-aware check: a modal at its scroll boundary must not scroll its parent. */
export function canScrollInDirection(position: number, extent: number, viewport: number, delta: number): boolean {
    return delta < 0 ? position > 0 : delta > 0 && position + viewport < extent - 1;
}

function isVisibleModal(element: HTMLElement): boolean {
    const style = getComputedStyle(element);
    // Responsive drawers become ordinary inline panels on desktop.
    return style.position === 'fixed' && style.display !== 'none'
        && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function getTopModal(): HTMLElement | undefined {
    const roots = Array.from(document.querySelectorAll<HTMLElement>(modalSelector)).filter(isVisibleModal);
    roots.sort((a, b) => {
        if (a.contains(b)) return -1;
        if (b.contains(a)) return 1;
        return (Number.parseInt(getComputedStyle(a).zIndex) || 0)
            - (Number.parseInt(getComputedStyle(b).zIndex) || 0);
    });
    return roots[roots.length - 1];
}

function allowedRoot(target: EventTarget | null, modal: HTMLElement): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    if (modal.contains(target)) return modal;
    // Select/date menus rendered into document.body still belong to their modal.
    for (const controller of modal.querySelectorAll<HTMLElement>('[aria-controls]')) {
        for (const id of (controller.getAttribute('aria-controls') || '').split(/\s+/)) {
            const menu = document.getElementById(id);
            if (menu?.contains(target)) return menu;
        }
    }
    return null;
}

function canConsumeScroll(target: EventTarget | null, root: HTMLElement, deltaX: number, deltaY: number): boolean {
    if (!(target instanceof Element)) return false;
    const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
    for (let element: Element | null = target; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        const overflow = horizontal ? style.overflowX : style.overflowY;
        if (['auto', 'scroll', 'overlay'].includes(overflow) && canScrollInDirection(
            horizontal ? element.scrollLeft : element.scrollTop,
            horizontal ? element.scrollWidth : element.scrollHeight,
            horizontal ? element.clientWidth : element.clientHeight,
            horizontal ? deltaX : deltaY,
        )) return true;
        if (element === root) break;
    }
    return false;
}

/** One owner for all modal roots, including portals, nesting and exit animations. */
export function installModalScrollLock(): () => void {
    let restore: (() => void) | undefined;
    let touchPoint: {x: number; y: number} | undefined;

    const sync = () => {
        const modal = getTopModal();
        if (modal && !restore) {
            const elements = [document.documentElement, document.body];
            const previous = elements.flatMap(element => ['overflow-x', 'overflow-y'].map(property => ({
                element,
                property,
                overflow: element.style.getPropertyValue(property),
                priority: element.style.getPropertyPriority(property),
            })));
            const padding = document.body.style.getPropertyValue('padding-right');
            const paddingPriority = document.body.style.getPropertyPriority('padding-right');
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            if (scrollbarWidth > 0) {
                document.body.style.setProperty('padding-right', `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbarWidth}px`);
            }
            for (const {element, property} of previous) element.style.setProperty(property, 'hidden', 'important');
            restore = () => {
                for (const {element, property, overflow, priority} of previous) {
                    if (overflow) element.style.setProperty(property, overflow, priority);
                    else element.style.removeProperty(property);
                }
                if (padding) document.body.style.setProperty('padding-right', padding, paddingPriority);
                else document.body.style.removeProperty('padding-right');
            };
        } else if (!modal && restore) {
            restore();
            restore = undefined;
            touchPoint = undefined;
        }
    };

    const preventScrollThrough = (event: WheelEvent | TouchEvent, deltaX: number, deltaY: number) => {
        const modal = getTopModal();
        if (!modal) return;
        const root = allowedRoot(event.target, modal);
        if (!root || !canConsumeScroll(event.target, root, deltaX, deltaY)) event.preventDefault();
    };
    const wheel = (event: WheelEvent) => preventScrollThrough(event, event.deltaX, event.deltaY);
    const touchStart = (event: TouchEvent) => {
        const touch = event.touches[0];
        touchPoint = event.touches.length === 1 ? {x: touch.clientX, y: touch.clientY} : undefined;
    };
    const touchMove = (event: TouchEvent) => {
        if (!touchPoint || event.touches.length !== 1) return;
        const touch = event.touches[0];
        preventScrollThrough(event, touchPoint.x - touch.clientX, touchPoint.y - touch.clientY);
        touchPoint = {x: touch.clientX, y: touch.clientY};
    };
    const keyDown = (event: KeyboardEvent) => {
        if (!scrollKeys.has(event.key) || event.metaKey || event.ctrlKey || event.altKey) return;
        const modal = getTopModal();
        if (!modal) return;
        const root = allowedRoot(event.target, modal);
        const target = event.target instanceof Element ? event.target : null;
        if (root && target?.closest('input, textarea, [contenteditable="true"], [role="textbox"], button, [role="listbox"]')) return;
        const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
        const backwards = ['ArrowUp', 'ArrowLeft', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey);
        const delta = backwards ? -1 : 1;
        if (!root || !canConsumeScroll(event.target, root, horizontal ? delta : 0, horizontal ? 0 : delta)) event.preventDefault();
    };

    // Explicit markers avoid guessing whether arbitrary fixed cards are modal.
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-modal-scroll-lock']});
    window.addEventListener('resize', sync);
    document.addEventListener('wheel', wheel, {passive: false, capture: true});
    document.addEventListener('touchstart', touchStart, {passive: true, capture: true});
    document.addEventListener('touchmove', touchMove, {passive: false, capture: true});
    document.addEventListener('keydown', keyDown, true);
    sync();

    return () => {
        observer.disconnect();
        window.removeEventListener('resize', sync);
        document.removeEventListener('wheel', wheel, true);
        document.removeEventListener('touchstart', touchStart, true);
        document.removeEventListener('touchmove', touchMove, true);
        document.removeEventListener('keydown', keyDown, true);
        restore?.();
    };
}
