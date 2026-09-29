import {useEffect, useState} from 'react';
import {getMarketConfig, saveMarketConfig} from '../api/market';

export function useMarketConfig() {
    const [count, setCount] = useState('8');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const abort = new AbortController();
        void getMarketConfig(abort.signal).then(config => {
            if (abort.signal.aborted) return;
            setCount(String(config.slotCount));
            setLoaded(true);
            setError('');
        }).catch(() => {
            if (!abort.signal.aborted) setError('市场配置加载失败，请重试');
        }).finally(() => {
            if (!abort.signal.aborted) setLoading(false);
        });
        return () => abort.abort();
    }, [retry]);
    const save = async () => {
        if (!loaded || busy) return false;
        const value = Number(count);
        if (!Number.isInteger(value) || value < 1 || value > 1000) {
            setError('请输入1至1000的整数');
            return false;
        }
        setBusy(true);
        setError('');
        try {
            await saveMarketConfig(value);
            return true;
        } catch {
            setError('保存失败，请重试');
            return false;
        } finally {
            setBusy(false);
        }
    };
    const reload = () => {setLoading(true); setRetry(v => v+1);};
    return {count, setCount, loading, busy, error, loaded, save, reload};
}
