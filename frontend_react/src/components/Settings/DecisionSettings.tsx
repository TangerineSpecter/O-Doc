import {useMemo, useState} from 'react';
import {KeyRound, Loader2, Plus} from 'lucide-react';
import {createDecisionConnection, deleteDecisionConnection, saveDecisionKey, testDecisionConnection, updateDecisionConnection} from '../../api/decision';
import {useDecisionConfig} from '../../hooks/useDecisionConfig';
import type {DecisionConnection, DecisionConnectionInput} from '../../types/api/decision';
import {formatStickyUntil} from '../AgentWorld/decisionFailover';
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
    const failover = config?.failover;
    const connectionLabels = (id: string) => {
        const index = failover?.order.indexOf(id) ?? -1;
        return {
            failoverLabel: index === 0 ? '主决策' : index > 0 ? `备用 ${index}` : undefined,
            stickyLabel: failover?.stickyConnectionId === id && failover.stickyUntil
                ? `暂时沿用至 ${formatStickyUntil(failover.stickyUntil)}`
                : undefined,
        };
    };
    const stickyConnection = connections.find(connection => connection.id === failover?.stickyConnectionId);

    const updateJevKey = async (clear: boolean) => {
        if (busy || (!clear && !secret.trim())) return;
        setBusy(true);
        setResults(previous => ({...previous, jev: ''}));
        try {
            setConfig(await saveDecisionKey(clear ? null : secret.trim()));
            setSecret('');
            toast.success(clear ? 'JEV 密钥已清除' : 'JEV 密钥已保存');
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
            toast.success('已保存的 API Key 已清除');
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
            toast.success('决策模型连接已删除，并已从故障转移顺序中移除');
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
                {stickyConnection && failover?.stickyUntil && <p role="status" className="rounded-xl border border-lime-200 bg-lime-50 px-3 py-2 text-xs leading-5 text-lime-800">主决策模型暂时跳过。当前沿用「{stickyConnection.name}」，{formatStickyUntil(failover.stickyUntil)} 后重新从主模型开始。沿用状态只保存在本机。</p>}
                {jev && <div className="space-y-2">
                    <DecisionConnectionCard connection={jev} result={results.jev} busy={testing === 'jev'} onTest={() => void test(jev)} {...connectionLabels('jev')}/>
                    <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:flex-row sm:items-center">
                        <input type="password" autoComplete="new-password" aria-label="JEV API Key" value={secret} onChange={event => setSecret(event.target.value)} placeholder={jev.apiKeyConfigured ? '已保存；填写新密钥以替换' : '填写 TypeSafe API Key'} className="min-h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"/>
                        <div className="flex shrink-0 gap-2">
                            <button type="button" disabled={busy || !secret.trim()} onClick={() => void updateJevKey(false)} className="min-h-9 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-40">保存密钥</button>
                            <button type="button" disabled={busy || !jev.apiKeyConfigured} onClick={() => void updateJevKey(true)} className="min-h-9 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40">清除密钥</button>
                        </div>
                    </div>
                </div>}
                {customConnections.map(connection => <DecisionConnectionCard key={connection.id} connection={connection} result={results[connection.id]} busy={testing === connection.id} onTest={() => void test(connection)} onEdit={() => openEdit(connection)} onClearKey={() => void clearConnectionKey(connection)} onDelete={() => setDeleteTarget(connection)} {...connectionLabels(connection.id)}/>) }
                <p className="text-xs leading-5 text-slate-500">连接信息、故障转移顺序和 API Key 都随 WebDAV 同步；暂时沿用哪一个模型只记在本机，不进入快照。顺序和沿用时间在世界设置 → 决策模型里调整，默认沿用 2 小时，也可选 1 小时或 4 小时。密钥不会通过设置接口回显，但会进入同步快照，请确保远端存储访问受控。OpenAI Chat + JSON 适配器会把 state/questions 放入 user content，并解析 assistant 返回的 JSON。</p>
            </div>}

            <DecisionConnectionModal isOpen={modalOpen} initialData={editing} onClose={() => setModalOpen(false)} onSave={saveConnection}/>
            {deleteTarget && <div data-modal-scroll-lock className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                <button type="button" aria-label="关闭删除确认" className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}/>
                <section role="dialog" aria-modal="true" aria-labelledby="delete-decision-title" className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                    <h3 id="delete-decision-title" className="font-bold text-slate-800">删除决策连接？</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">将删除“{deleteTarget.name}”及其 API Key。若它在故障转移顺序里，会从顺序中移除；主模型被删时由下一个备用接任，没有备用时回到 JEV。</p>
                    <div className="mt-5 flex justify-end gap-2">
                        <button type="button" onClick={() => setDeleteTarget(null)} className="min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">取消</button>
                        <button type="button" onClick={() => void removeConnection()} className="min-h-9 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">删除连接</button>
                    </div>
                </section>
            </div>}
        </section>
    );
}
