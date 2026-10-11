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
    return <section aria-labelledby="decision-settings-title" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600"><KeyRound className="h-4 w-4"/></div>
                <h3 id="decision-settings-title" className="font-bold text-slate-800">决策模型</h3>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">JEV</span>
                {!loading && !error && <span className={`text-xs ${configured ? 'text-lime-700' : 'text-slate-400'}`}>{configured ? '本机已配置' : '本机未配置'}</span>}
                {busy && <Loader2 className="h-4 w-4 animate-spin text-orange-500"/>}
            </div>
            <p className="text-xs text-slate-500">在市场任务中单独开启</p>
        </div>
        {loading ? <p className="text-xs text-slate-500">正在读取配置…</p> : error ? <div className="text-xs text-red-600">{error}<button type="button" onClick={() => void refresh()} className="ml-3 underline">重试</button></div> : <div>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <input type="password" autoComplete="new-password" aria-label="JEV API 密钥" value={secret} onChange={event => setSecret(event.target.value)} placeholder={configured ? '********（已保存，输入新密钥可替换）' : '填写 TypeSafe API 密钥'} className="min-h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"/>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button type="button" disabled={busy || !secret.trim()} onClick={() => void update(false)} className="min-h-9 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20 disabled:opacity-40">保存密钥</button>
                    <button type="button" disabled={busy || !configured} onClick={() => void test()} className="min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:border-orange-200 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20 disabled:opacity-40">检测连接</button>
                    <button type="button" disabled={busy || !configured} onClick={() => void update(true)} className="min-h-9 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/20 disabled:opacity-40">清除密钥</button>
                </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">密钥仅存本机，不随 WebDAV 同步；换设备需重新填写。不可用时自动使用文本模型。</p>
            {result && <p role="status" className="mt-2 text-xs text-slate-600">{result}</p>}
        </div>}
    </section>;
}
