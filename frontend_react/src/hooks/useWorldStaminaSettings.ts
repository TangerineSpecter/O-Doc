import {useEffect, useState} from 'react';
import {getWorldStaminaSettings, saveWorldStaminaSettings} from '../api/worldStamina';
import {useToast} from '../components/common/ToastProvider';

export function useWorldStaminaSettings() {
    const toast = useToast();
    const [rate, setRate] = useState<number | ''>('');
    const [savedRate, setSavedRate] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        getWorldStaminaSettings(controller.signal).then(value => {
            if (!active) return;
            setRate(value.recoveryPerHour);
            setSavedRate(value.recoveryPerHour);
        }).catch(value => {
            if (active) setError(value instanceof Error ? value.message : '体力设置加载失败');
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; controller.abort(); };
    }, [revision]);
    const valid = rate !== '' && Number.isInteger(rate) && rate >= 0 && rate <= 100;
    const save = async () => {
        if (!valid || saving) return;
        setSaving(true);
        setError('');
        try {
            const value = await saveWorldStaminaSettings(rate);
            setRate(value.recoveryPerHour);
            setSavedRate(value.recoveryPerHour);
            toast.success('体力恢复设置已保存');
        } catch (value) {
            const message = value instanceof Error ? value.message : '体力设置保存失败';
            setError(message);
            toast.error(message);
        } finally { setSaving(false); }
    };
    return {rate, setRate, savedRate, loading, saving, error, valid, save,
        retry: () => { setLoading(true); setError(''); setRevision(value => value + 1); }};
}
