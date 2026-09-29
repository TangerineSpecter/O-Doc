import {useEffect, useState} from 'react';
import {getWorldRunner, setWorldRunner} from '../api/setting';
import {getLifeConfig, saveLifeConfig, pauseLifeAgent} from '../api/agentLife';
import type {LifeConfig, LifeSettings} from '../types/api/agentLife';

export function useWorldLifeConfig() {
    const [enabled, setEnabled] = useState(false);
    const [config, setConfig] = useState<LifeConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const refresh = () => setRevision(value => value + 1);

    useEffect(() => {
        let live = true;
        setLoading(true);
        Promise.all([getWorldRunner(), getLifeConfig()])
            .then(([runner, value]) => {if (live) {setEnabled(runner.enabled); setConfig(value); setError('');}})
            .catch(value => {if (live) setError(value instanceof Error ? value.message : '生活配置加载失败');})
            .finally(() => {if (live) setLoading(false);});
        return () => {live = false;};
    }, [revision]);

    const update = async (action: () => Promise<unknown>) => {
        setLoading(true);
        setError('');
        try {await action(); refresh(); return true;}
        catch (value) {setError(value instanceof Error ? value.message : '保存失败'); return false;}
        finally {setLoading(false);}
    };
    const field = <K extends keyof LifeSettings>(key: K, value: LifeSettings[K]) => {
        setConfig(current => current ? {...current, settings: {...current.settings, [key]: value}} : current);
    };
    return {
        enabled, config, loading, error, refresh, field,
        toggle: (next: boolean) => update(() => setWorldRunner(next)),
        pause: (actor: string) => update(() => pauseLifeAgent(actor, !config?.pausedAgents.includes(actor))),
        save: () => config ? update(() => saveLifeConfig(config.settings)) : Promise.resolve(false),
    };
}
