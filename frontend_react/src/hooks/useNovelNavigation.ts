import {useCallback, useContext, useLayoutEffect, useRef, useState} from 'react';
import {UNSAFE_NavigationContext} from 'react-router-dom';
import {guardNovelNavigation} from '../utils/novelNavigation';

export function useNovelNavigation(dirty: boolean, save: () => Promise<boolean>) {
    const {navigator} = useContext(UNSAFE_NavigationContext);
    const latest = useRef({dirty, save});
    useLayoutEffect(() => {latest.current = {dirty, save};}, [dirty, save]);
    const [pending, setPending] = useState<{proceed: () => void} | null>(null);
    const [saving, setSaving] = useState(false);
    const request = useCallback((proceed: () => void) => {
        if (latest.current.dirty) setPending({proceed});else proceed();
    }, []);
    useLayoutEffect(() => guardNovelNavigation(navigator, () => latest.current.dirty, request), [navigator, request]);
    const cancel = () => {if (!saving) setPending(null);};
    const discard = () => {if (!saving && pending) {setPending(null);pending.proceed();}};
    const saveAndContinue = async () => {
        if (!pending || saving) return;
        setSaving(true);
        try {
            if (await latest.current.save()) {setPending(null);pending.proceed();}
        } finally {setSaving(false);}
    };
    return {pending: !!pending, saving, request, cancel, discard, saveAndContinue};
}
