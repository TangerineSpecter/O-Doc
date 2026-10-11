import {useState} from 'react';
import {KeyRound, Loader2} from 'lucide-react';
import {saveDecisionKey, testDecisionConnection} from '../../api/decision';
import {useDecisionConfig} from '../../hooks/useDecisionConfig';
import {useToast} from '../common/ToastProvider';

export function DecisionSettings() {
    const {config, setConfig, loading, error, refresh} = useDecisionConfig();
    const [secret, setSecret] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState('');
    const toast = useToast();
    const configured = config?.providers.find(provider => provider.id === 'jev')?.configured ?? false;
    const update = async (clear: boolean) => {
        if (busy || (!clear && !secret.trim())) return;
        setBusy(true);
        setResult('');
        try {
            setConfig(await saveDecisionKey(clear ? null : secret.trim()));
            setSecret('');
            toast.success(clear ? 'JEV 密钥已清除' : 'JEV 密钥已保存到本机');
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : '保存失败');
        } finally { setBusy(false); }
    };
    const test = async () => {
        setBusy(true);
        setResult('');
        try {
            await testDecisionConnection();
            setResult('JEV 连接正常');
        } catch (cause) {
            setResult(cause instanceof Error ? cause.message : 'JEV 连接失败');
        } finally { setBusy(false); }
    };
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3"><KeyRound className="h-5 w-5 text-orange-500"/><div><h3 className="font-bold text-slate-800">决策模型</h3><p className="mt-1 text-xs text-slate-500">用于居民选择动作，在市场任务中单独开启。</p></div></div>
        {loading ? <p className="text-sm text-slate-500">正在读取配置…</p> : error ? <div className="text-sm text-red-600">{error}<button type="button" onClick={() => void refresh()} className="ml-3 underline">重试</button></div> : <div className="space-y-4">
            <div className="flex items-center gap-3"><span className="font-semibold text-slate-800">JEV</span><span className={`text-xs ${configured ? 'text-lime-700' : 'text-slate-400'}`}>{configured ? '本机已配置' : '本机未配置'}</span></div>
            <label className="block space-y-2 text-sm text-slate-700"><span>API 密钥</span><input type="password" autoComplete="new-password" aria-label="JEV API 密钥" value={secret} onChange={event => setSecret(event.target.value)} placeholder={configured ? '输入新密钥以替换' : '填写 TypeSafe API 密钥'} className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"/></label>
            <p className="text-xs leading-relaxed text-slate-500">密钥仅保存在本机，不随 WebDAV 同步；接续设备需重新填写，未配置或服务不可用时市场会自动使用文本模型。</p>
            <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !secret.trim()} onClick={() => void update(false)} className="rounded-full bg-orange-500 px-4 py-2 text-sm text-white disabled:opacity-40">保存密钥</button><button type="button" disabled={busy || !configured} onClick={() => void test()} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 disabled:opacity-40">检测连接</button><button type="button" disabled={busy || !configured} onClick={() => void update(true)} className="rounded-full px-4 py-2 text-sm text-red-600 disabled:opacity-40">清除密钥</button>{busy && <Loader2 className="h-5 w-5 animate-spin self-center text-orange-500"/>}</div>
            {result && <p role="status" className="text-sm text-slate-600">{result}</p>}
        </div>}
    </section>;
}
