import {useSyncExternalStore} from 'react';
import {getFloatingMenuStyle, subscribeFloatingMenuStyle} from '../config/floatingMenu';

export function useFloatingMenuStyle() {
    return useSyncExternalStore(subscribeFloatingMenuStyle, getFloatingMenuStyle, () => 'classic' as const);
}
