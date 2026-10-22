import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';
import { guardNovelNavigation } from '../utils/novelNavigation';

export interface QuantDraft {
    dirty: boolean;
    save: () => Promise<boolean>;
    discard?: () => void;
}
export type QuantRegisterDraft = (key: string, draft: QuantDraft | null) => void;

/** Share the app's capture-phase BrowserRouter guard (also used by novel editing). */
export function useQuantNavigation() {
    const { navigator } = useContext(UNSAFE_NavigationContext);
    const drafts = useRef(new Map<string, QuantDraft>());
    const [dirty, setDirty] = useState(false);
    const [resetEpoch, setResetEpoch] = useState(0);
    const [pending, setPending] = useState<{ proceed: () => void } | null>(null);
    const [saving, setSaving] = useState(false);
    const register: QuantRegisterDraft = useCallback((key, draft) => {
        if (draft) drafts.current.set(key, draft);
        else drafts.current.delete(key);
        setDirty([...drafts.current.values()].some((value) => value.dirty));
    }, []);
    const request = useCallback((proceed: () => void) => {
        if ([...drafts.current.values()].some((value) => value.dirty)) setPending({ proceed });
        else proceed();
    }, []);
    useLayoutEffect(
        () => guardNovelNavigation(navigator, () => [...drafts.current.values()].some((value) => value.dirty), request),
        [navigator, request],
    );
    const discard = () => {
        if (!saving && pending) {
            for (const draft of drafts.current.values()) if (draft.dirty) draft.discard?.();
            drafts.current.clear();
            setDirty(false);
            setPending(null);
            pending.proceed();
        }
    };
    const saveAndContinue = async () => {
        if (!pending || saving) return;
        setSaving(true);
        try {
            for (const draft of drafts.current.values()) if (draft.dirty && !(await draft.save())) return;
            drafts.current.clear();
            setDirty(false);
            setPending(null);
            pending.proceed();
        } finally {
            setSaving(false);
        }
    };
    return {
        dirty,
        resetEpoch,
        resetEditors: () => setResetEpoch((value) => value + 1),
        pending: !!pending,
        saving,
        register,
        request,
        discard,
        saveAndContinue,
        cancel: () => {
            if (!saving) setPending(null);
        },
    };
}

export function useQuantDraftRegistration(
    key: string,
    dirty: boolean,
    save: () => Promise<boolean>,
    register: QuantRegisterDraft,
    discard?: () => void,
) {
    useEffect(() => {
        register(key, { dirty, save, discard });
    }, [key, dirty, save, discard, register]);
    useEffect(() => () => register(key, null), [key, register]);
}
