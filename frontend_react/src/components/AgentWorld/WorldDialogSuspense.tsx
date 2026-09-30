import {Suspense, useCallback, useMemo, useState, type ReactNode} from 'react';
import WorldDialog, {type WorldDialogProps} from './WorldDialog';
import {WorldDialogContext, type DialogAppearance} from './WorldDialogContext';

/** 模块加载只替换内容，保留遮罩、卡片和焦点生命周期。 */
export default function WorldDialogSuspense({fallback, children, ...props}: Omit<WorldDialogProps, 'children'> & {fallback: ReactNode; children: ReactNode}) {
    const [appearance, setAppearance] = useState<DialogAppearance>(() => ({title: props.title, description: props.description, size: props.size, fixedHeight: props.fixedHeight}));
    const update = useCallback((value: DialogAppearance) => setAppearance(value), []);
    const scope = useMemo(() => ({title: props.title, update}), [props.title, update]);
    return <WorldDialog {...props} {...appearance}>
        <WorldDialogContext.Provider value={scope}><Suspense fallback={fallback}>{children}</Suspense></WorldDialogContext.Provider>
    </WorldDialog>;
}
