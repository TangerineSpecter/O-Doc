import {useEffect, useRef, useState} from 'react';
import {BrainCircuit, Info, Loader2, Plus} from 'lucide-react';
import {createDecisionConnection, deleteDecisionConnection, testDecisionConnection, updateDecisionConnection} from '../../api/decision';
import {useDecisionConfig} from '../../hooks/useDecisionConfig';
import type {DecisionConnection, DecisionConnectionInput} from '../../types/api/decision';
import {formatStickyUntil} from '../AgentWorld/decisionFailover';
import {useToast} from '../common/ToastProvider';
import {DecisionConnectionCard, type DecisionConnectionTestResult} from './DecisionConnectionCard';
import {DecisionConnectionModal} from './DecisionConnectionModal';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';

export function DecisionSettings() {
    const {config, setConfig, loading, error, refresh} = useDecisionConfig();
    const [testing, setTesting] = useState<string | null>(null);
    const [results, setResults] = useState<Record<string, DecisionConnectionTestResult | undefined>>({});
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<DecisionConnection | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<DecisionConnection | null>(null);
    const [showInfo, setShowInfo] = useState(false);
    const infoRef = useRef<HTMLDivElement>(null);
    const toast = useToast();

    useEscapeDismissal(Boolean(deleteTarget), () => setDeleteTarget(null));
    useEscapeDismissal(showInfo, () => setShowInfo(false));

    useEffect(() => {
        if (!showInfo) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
                setShowInfo(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showInfo]);
    const connections = config?.connections || config?.providers || [];
    const failover = config?.failover;
    const connectionLabels = (id: string) => {
        const index = failover?.order.indexOf(id) ?? -1;
        return {
            failoverLabel: index === 0 ? '先用' : index > 0 ? `第 ${index + 1} 位` : undefined,
            stickyLabel: failover?.stickyConnectionId === id && failover.stickyUntil
                ? `暂时沿用至 ${formatStickyUntil(failover.stickyUntil)}`
                : undefined,
        };
    };
    const stickyConnection = connections.find(connection => connection.id === failover?.stickyConnectionId);

    const test = async (connection: DecisionConnection) => {
        setTesting(connection.id);
        setResults(previous => ({...previous, [connection.id]: undefined}));
        try {
            await testDecisionConnection(connection.id);
            setResults(previous => ({...previous, [connection.id]: {success: true, message: '连接正常，协议响应结构有效。'}}));
        } catch (cause) {
            setResults(previous => ({...previous, [connection.id]: {success: false, message: cause instanceof Error ? cause.message : '连接测试失败'}}));
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
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600"><BrainCircuit className="h-4 w-4"/></div>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <h3 id="decision-settings-title" className="font-bold text-slate-800">决策模型连接</h3>
                            <div ref={infoRef} className="relative inline-flex items-center">
                                <button
                                    type="button"
                                    aria-label="查看决策模型连接说明"
                                    aria-expanded={showInfo}
                                    onClick={() => setShowInfo(v => !v)}
                                    className={`inline-flex items-center justify-center rounded-full p-1 transition-colors ${
                                        showInfo ? 'bg-orange-50 text-orange-600' : 'text-slate-400 hover:bg-orange-50 hover:text-orange-600'
                                    }`}
                                >
                                    <Info className="h-4 w-4"/>
                                </button>
                                {showInfo && (
                                    <div
                                        role="dialog"
                                        aria-label="决策模型连接说明"
                                        className="absolute left-0 top-full z-30 mt-2 w-80 sm:w-96 max-w-[calc(100vw-3rem)] rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-xl animate-in fade-in zoom-in-95 duration-150"
                                    >
                                        <div className="mb-2 flex items-center gap-1.5 font-bold text-slate-800">
                                            <Info className="h-4 w-4 text-orange-500"/>
                                            <span>决策模型连接说明</span>
                                        </div>
                                        <div className="space-y-2 text-xs leading-5 text-slate-600">
                                            <p>连接信息和 API Key 都随 WebDAV 同步；暂时沿用哪一个模型只记在本机，不进入快照。在世界设置 → 决策模型里选择哪些连接加入顺序，并拖动排列。平时用第一位；后面的模型成功后默认沿用 2 小时，也可选 1 小时或 4 小时。觉得第一位不稳定时，把稳定的模型拖到第一位。</p>
                                            <p>密钥不会通过设置接口回显，但会进入同步快照，请确保远端存储访问受控。原生 System One 请求 /systemone；OpenAI Chat + JSON 请求 /chat/completions，并从 assistant 正文解析 JSON。请按服务实际提供的接口选择。</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">按模型服务选择协议，自行添加决策连接。</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-orange-600 hover:border-orange-200 rounded-lg text-xs font-medium transition-all shadow-sm whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus className="w-3.5 h-3.5 shrink-0"/> 新增模型
                </button>
            </div>

            {loading ? <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>正在读取决策连接…</p> : error ? <div role="alert" className="text-xs text-red-600">{error}<button type="button" onClick={() => void refresh()} className="ml-3 underline">重试</button></div> : <div className="space-y-3">
                {stickyConnection && failover?.stickyUntil && <p role="status" className="rounded-xl border border-lime-200 bg-lime-50 px-3 py-2 text-xs leading-5 text-lime-800">顺序里靠前的模型暂时跳过。当前沿用「{stickyConnection.name}」，{formatStickyUntil(failover.stickyUntil)} 后重新从第一位开始。沿用状态只保存在本机。</p>}
                {connections.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs leading-5 text-slate-500">还没有决策连接。JEV、本地决策模型和其他服务都从右上角「新增模型」添加。选择原生 System One 会填入 JEV 默认地址和模型 ID，可改为本地服务；名称和密钥仍由你填写。</p>}
                {connections.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {connections.map(connection => (
                            <DecisionConnectionCard
                                key={connection.id}
                                connection={connection}
                                result={results[connection.id]}
                                busy={testing === connection.id}
                                onTest={() => void test(connection)}
                                onEdit={() => openEdit(connection)}
                                onDelete={() => setDeleteTarget(connection)}
                                {...connectionLabels(connection.id)}
                            />
                        ))}
                    </div>
                )}
            </div>}

            <DecisionConnectionModal isOpen={modalOpen} initialData={editing} onClose={() => setModalOpen(false)} onSave={saveConnection}/>
            {deleteTarget && <div data-modal-scroll-lock className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                <button type="button" aria-label="关闭删除确认" className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}/>
                <section role="dialog" aria-modal="true" aria-labelledby="delete-decision-title" className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                    <h3 id="delete-decision-title" className="font-bold text-slate-800">删除决策连接？</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">将删除“{deleteTarget.name}”及其 API Key。若它在决策顺序里，会从顺序中移除；排在第一位时由下一位接任。顺序空了之后，有限选择改走普通文本模型。</p>
                    <div className="mt-5 flex justify-end gap-2">
                        <button type="button" onClick={() => setDeleteTarget(null)} className="min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">取消</button>
                        <button type="button" onClick={() => void removeConnection()} className="min-h-9 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">删除连接</button>
                    </div>
                </section>
            </div>}
        </section>
    );
}
