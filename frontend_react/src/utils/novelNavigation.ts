import type {Navigator} from 'react-router-dom';

const windows = new WeakMap<Window, {pop?: (event: PopStateEvent) => void}>();

/** Register before BrowserRouter mounts: its history listener can synchronously
 * unmount the editor during popstate, removing a listener installed afterwards. */
export function initializeNovelNavigation() {
    if (typeof window === 'undefined') return;
    let slot = windows.get(window);
    if (!slot) {
        slot = {};
        windows.set(window, slot);
        const active = slot;
        window.addEventListener('popstate', event => active.pop?.(event), true);
    }
    return slot;
}

/** BrowserRouter has no data-router blocker. Keep its history at the current
 * entry until the author explicitly saves or discards the local manuscript. */
export function guardNovelNavigation(navigator: Navigator, dirty: () => boolean, ask: (proceed: () => void) => void) {
    const slot = initializeNovelNavigation()!;
    const originalPush = navigator.push, originalReplace = navigator.replace;
    const index = () => window.history.state?.idx as number | undefined;
    let current = index();
    let restoring: number | undefined;
    let accepted: number | undefined;
    let replaying: number | undefined;
    const push: Navigator['push'] = (...args) => {
        const proceed = () => {originalPush.apply(navigator, args);current = index();};
        if (dirty()) ask(proceed); else proceed();
    };
    const replace: Navigator['replace'] = (...args) => {
        const proceed = () => {originalReplace.apply(navigator, args);current = index();};
        if (dirty()) ask(proceed); else proceed();
    };
    const replay = (destination: number) => {
        replaying = destination;
        window.history.go(destination - current!);
    };
    const pop = (event: PopStateEvent) => {
        const next = index();
        if (restoring !== undefined && next !== undefined) {
            event.stopImmediatePropagation();
            if (next !== restoring) {window.history.go(restoring - next);return;}
            current = next;
            restoring = undefined;
            if (accepted !== undefined) {const destination = accepted;accepted = undefined;replay(destination);}
            return;
        }
        if (next === replaying && replaying !== undefined) {
            current = next;replaying = undefined;return;
        }
        if (!dirty() || current === undefined || next === undefined || next === current) {current = next;return;}
        // Capture before BrowserRouter's listener so it cannot unmount the editor.
        event.stopImmediatePropagation();
        const destination = next;
        restoring = current;
        window.history.go(current - next);
        ask(() => {if (restoring !== undefined) accepted = destination;else replay(destination);});
    };
    const unload = (event: BeforeUnloadEvent) => {
        if (!dirty()) return;
        event.preventDefault();
        event.returnValue = '';
    };
    navigator.push = push;
    navigator.replace = replace;
    slot.pop = pop;
    window.addEventListener('beforeunload', unload);
    return () => {
        if (navigator.push === push) navigator.push = originalPush;
        if (navigator.replace === replace) navigator.replace = originalReplace;
        if (slot.pop === pop) slot.pop = undefined;
        window.removeEventListener('beforeunload', unload);
    };
}
