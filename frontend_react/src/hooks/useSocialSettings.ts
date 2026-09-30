import {useEffect, useState} from 'react';
import {getSocialConfiguration, getSocialImageProviders, saveSocialConfiguration} from '../api/social';
import type {SocialConfiguration, SocialSettings} from '../types/api/social';
import type {AIModel} from '../types/api/setting';

export function useSocialSettings(onSaved?: () => void) {
    const [config, setConfig] = useState<SocialConfiguration | null>(null);
    const [actor, setActor] = useState('');
    const [models, setModels] = useState<AIModel[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        let active = true;
        void getSocialConfiguration().then(c => {if (active) setConfig(c);})
            .catch(e => {if (active) setError(e instanceof Error ? e.message : '配置加载失败');});
        void getSocialImageProviders().then(p => {if (active) setModels(p.flatMap(v => v.models).filter(m => m.type === 'image_generation'));})
            .catch(() => { /* 未配置模型时仍可编辑文字社交，后端提交配图前会校验能力。 */ });
        return () => {active = false;};
    }, []);
    const settings = config ? {...config.settings, ...(actor ? config.overrides[actor] : {})} : null;
    const update = (key: keyof SocialSettings, value: SocialSettings[keyof SocialSettings]) => {
        setConfig(previous => previous ? actor
            ? {...previous, overrides: {...previous.overrides, [actor]: {...previous.overrides[actor], [key]: value}}}
            : {...previous, settings: {...previous.settings, [key]: value}} : previous);
    };
    const reset = () => setConfig(c => {
        if (!c) return c;
        const overrides = {...c.overrides}; delete overrides[actor]; return {...c, overrides};
    });
    const save = async () => {
        if (!config || busy) return;
        setBusy(true); setError('');
        try {setConfig(await saveSocialConfiguration(config)); onSaved?.();}
        catch (e) {setError(e instanceof Error ? e.message : '保存失败');}
        finally {setBusy(false);}
    };
    return {config, actor, setActor, settings, models, error, busy, update, reset, save};
}
