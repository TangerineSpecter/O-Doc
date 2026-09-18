export type FloatingMenuStyle = 'classic' | 'companion';

export const FLOATING_MENU_STYLE_OPTIONS: {value: FloatingMenuStyle; label: string; description: string}[] = [
    {value: 'classic', label: '经典小橘子（默认）', description: '小橘子动画与彩色圆形展开菜单'},
    {value: 'companion', label: '橘子妹子', description: '二次元角色动作与手账式菜单'},
];

const STORAGE_KEY = 'o-doc-floating-menu-style';
const CHANGE_EVENT = 'o-doc-floating-menu-style-change';

export function getFloatingMenuStyle(): FloatingMenuStyle {
    if (typeof window === 'undefined') return 'classic';
    try {
        return window.localStorage.getItem(STORAGE_KEY) === 'companion' ? 'companion' : 'classic';
    } catch {
        return 'classic';
    }
}

export function saveFloatingMenuStyle(style: FloatingMenuStyle) {
    window.localStorage.setItem(STORAGE_KEY, style);
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeFloatingMenuStyle(onChange: () => void) {
    const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY || event.key === null) onChange();
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener('storage', onStorage);
    };
}
