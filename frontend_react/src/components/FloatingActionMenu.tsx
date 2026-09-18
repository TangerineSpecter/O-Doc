import {lazy, Suspense} from 'react';
import {useFloatingMenuStyle} from '../hooks/useFloatingMenuStyle';
import ClassicFloatingMenu from './FloatingMenu/ClassicFloatingMenu';

const CompanionFloatingMenu = lazy(() => import('./FloatingMenu/CompanionFloatingMenu'));

export default function FloatingActionMenu() {
    const style = useFloatingMenuStyle();
    if (style === 'classic') return <ClassicFloatingMenu/>;
    return <Suspense fallback={null}><CompanionFloatingMenu/></Suspense>;
}
