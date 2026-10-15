import {useMemo, useState} from 'react';
import {KeyRound, Loader2, Plus} from 'lucide-react';
import {createDecisionConnection, deleteDecisionConnection, saveDecisionKey, testDecisionConnection, updateDecisionConnection} from '../../api/decision';
import {useDecisionConfig} from '../../hooks/useDecisionConfig';
import type {DecisionConnection, DecisionConnectionInput} from '../../types/api/decision';
import {useToast} from '../common/ToastProvider';
import {DecisionConnectionCard} from './DecisionConnectionCard';
import {DecisionConnectionModal} from './DecisionConnectionModal';

export function DecisionSettings() {
    const {config, setConfig, loading, error, refresh} = useDecisionConfig();
    const [secret, setSecret] = useState('');
    const [busy, setBusy] = useState(false);
    const [testing, setTesting] = useState<string | null>(null);
    const [results, setResults] = useState<Record<string, string>>({});
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<DecisionConnection | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<DecisionConnection | null>(null);
    const toast = useToast();
    const connections = config?.connections || config?.providers || [];
    const jev = connections.find(connection => connection.id === 'jev');
    const customConnections = useMemo(() => connections.filter(connection => !connection.builtIn), [connections]);

    const updateJevKey = async (clear: boolean) => {
        if (busy || (!clear && !secret.trim())) return;
        setBusy(true);
        setResults(previous => ({...previous, jev: ''}));
        try {
            setConfig(await saveDecisionKey(clear ? null : secret.trim()));
            setSecret('');
            toast.success(clear ? 'JEV 密钥已清除' : 'JEV 密钥已保存到本机');
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : '保存 JEV 密钥失败');
        } finally {
            setBusy(false);
        }
    };

    const test = async (connection: DecisionConnection) => {
        setTesting(connection.id);
        setResults(previous => ({...previous, [connection.id]: ''}));
        try {
            await testDecisionConnection(connection.id);
            setResults(previous => ({...previous, [connection.id]: '连接正常，协议响应结构有效。'}));
        } catch (cause) {
            setResults(previous => ({...previous, [connection.id]: cause instanceof Error ? cause.message : '连接测试失败'}));
        } finally {
            setTesting(null);
        }
    };

    const saveConnection = async (value: DecisionConnectionInput) => {
        const result = editing
            ? await updateDecisionConnection(editing.id, value)
            : await createDecisionConnection(value);
        setConfig(result);
        setResults({});
        toast.success(editing ? '决策模型连接已更新' : '决策模型连接已新增');
    };

    const clearConnectionKey = async (connection: DecisionConnection) => {
        try {
            setConfig(await updateDecisionConnection(connection.id, {apiKey: null}));
            setResults(previous => ({...previous, [connection.id]: ''}));
            toast.success('本机 API Key 已清除');
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : '清除 API Key 失败');
        }
    };

    const removeConnection = async () => {
        if (!deleteTarget) return;
        try {
            setConfig(await deleteDecisionConnection(deleteTarget.id));
            setDeleteTarget(null);
            setResults(previous => {
                const next = {...previous};
                delete next[deleteTarget.id];
                return next;
            });
            toast.success('决策模型连接已删除；已选中的世界连接已切回 JEV');
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : '删除决策模型连接失败');
        }
    };

    const openEdit = (connection: DecisionConnection) => {
        setEditing(connection);
        setModalOpen(true);
    };

    const openCreate = () => {
        setEditing(null);
        setModalOpen(true);
    };

    return (
        <section aria-labelledby="decision-settings-title" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600"><KeyRound className="h-4 w-4"/></div>
                    <div>
                        <h3 id="decision-settings-title" className="font-bold text-slate-800">决策模型连接</h3>
                        <p className="mt-0.5 text-xs text-slate-500">JEV 保持内置；按模型服务选择协议适配器。</p>
                    </div>
                </div>
                <button type="button" onClick={openCreate} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"><Plus className="h-3.5 w-3.5"/>新增决策模型连接</button>
            </div>

            {loading ? <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>正在读取决策连接…</p> : error ? <div role="alert" className="text-xs text-red-600">{error}<button type="button" onClick={() => void refresh()} className="ml-3 underline">重试</button></div> : <div className="space-y-3">
                {jev && <div className="space-y-2">
                    <DecisionConnectionCard connection={jev} result={results.jev} busy={testing === 'jev'} onTest={() => void test(jev)}/>
                    <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:flex-row sm:items-center">
                        <input type="password" autoComplete="new-password" aria-label="JEV API Key" value={secret} onChange={event => setSecret(event.target.value)} placeholder={jev.apiKeyConfigured ? '已保存；填写新密钥以替换' : '填写 TypeSafe API Key'} className="min-h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"/>
                        <div className="flex shrink-0 gap-2">
                            <button type="button" disabled={busy || !secret.trim()} onClick={() => void updateJevKey(false)} className="min-h-9 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-40">保存密钥</button>
                            <button type="button" disabled={busy || !jev.apiKeyConfigured} onClick={() => void updateJevKey(true)} className="min-h-9 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40">清除密钥</button>
                        </div>
                    </div>
                </div>}
                {customConnections.map(connection => <DecisionConnectionCard key={connection.id} connection={connection} result={results[connection.id]} busy={testing === connection.id} onTest={() => void test(connection)} onEdit={() => openEdit(connection)} onClearKey={() => void clearConnectionKey(connection)} onDelete={() => setDeleteTarget(connection)}/>) }
                <p className="text-xs leading-5 text-slate-500">连接名称、协议、地址和模型 ID 随 WebDev 同步；API Key 仅保存在本机。OpenAI Chat + JSON 适配器会把 state/questions 放入 user content，并解析 assistant 返回的 JSON。</p>
            </div>}

            <DecisionConnectionModal isOpen={modalOpen} initialData={editing} onClose={() => setModalOpen(false)} onSave={saveConnection}/>
            {deleteTarget && <div data-modal-scroll-lock className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                <button type="button" aria-label="关闭删除确认" className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}/>
                <section role="dialog" aria-modal="true" aria-labelledby="delete-decision-title" className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                    <h3 id="delete-decision-title" className="font-bold text-slate-800">删除决策连接？</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">将删除“{deleteTarget.name}”及本机密钥。若世界当前选中了它，会切回 JEV。</p>
                    <div className="mt-5 flex justify-end gap-2">
                        <button type="button" onClick={() => setDeleteTarget(null)} className="min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">取消</button>
                        <button type="button" onClick={() => void removeConnection()} className="min-h-9 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">删除连接</button>
                    </div>
                </section>
            </div>}
        </section>
    );
}
