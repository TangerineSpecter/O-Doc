import {lazy, Suspense} from 'react';
import {useMatch} from 'react-router-dom';
import {useFloatingMenuStyle} from '../hooks/useFloatingMenuStyle';
import ClassicFloatingMenu from './FloatingMenu/ClassicFloatingMenu';

const CompanionFloatingMenu = lazy(() => import('./FloatingMenu/CompanionFloatingMenu'));

export default function FloatingActionMenu() {
    const style = useFloatingMenuStyle();
    const articleRoute = useMatch('/article/:collId/*');
    // Articles and Agent posts share this detail route. Keep collection lists navigable.
    if (articleRoute?.params['*']) return null;
    if (style === 'classic') return <ClassicFloatingMenu/>;
    return <Suspense fallback={null}><CompanionFloatingMenu/></Suspense>;
}
