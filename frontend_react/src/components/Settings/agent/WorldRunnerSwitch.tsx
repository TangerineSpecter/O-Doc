import {useEffect, useState} from 'react';
import {getWorldRunner, setWorldRunner} from '@/api/setting';
import {Checkbox} from '@/components/common/Checkbox';

export function WorldRunnerSwitch() {
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        let live = true;
        setLoading(true);
        getWorldRunner().then(value => {if (live) {setEnabled(value.enabled); setError('');}})
            .catch(e => {if (live) setError(e.message || '本机调度状态加载失败');})
            .finally(() => {if (live) setLoading(false);});
        return () => {live = false;};
    }, [revision]);
    const change = async (next: boolean) => {
        setLoading(true);
        try {const value = await setWorldRunner(next); setEnabled(value.enabled); setError('');}
        catch (e) {setError(e instanceof Error ? e.message : '设置失败');}
        finally {setLoading(false);}
    };
    return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Checkbox checked={enabled} disabled={loading || !!error} onChange={change} label="在本机自动执行系统任务"/>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">此开关仅保存在本机，同一世界请选择一台设备承担自动执行。任务配置同步到其他设备后不会自动启动。</p>
        {error && <p className="mt-2 text-xs text-red-600">{error}<button type="button" onClick={() => setRevision(value => value + 1)} className="ml-2 shrink-0 whitespace-nowrap text-orange-600 underline">重试</button></p>}
    </section>;
}
