import { useState, useMemo } from 'react';
import { Sliders, FileText, BarChart3, Plus, Trash2, Search } from 'lucide-react';
import type { MT4Test } from '../../types/api/mt4Archive';
import { QuantButton, QuantField, QuantModal, inputClass } from '../Quant/ui';

export function EditTestForm({
    test,
    close,
    save,
    busy,
    error,
}: {
    test: MT4Test;
    close: () => void;
    save: (data: Partial<MT4Test>) => void;
    busy: boolean;
    error: string;
}) {
    const [activeTab, setActiveTab] = useState<'basic' | 'params' | 'metrics'>('basic');
    const [title, setTitle] = useState(test.title);
    const [description, setDescription] = useState(test.description || '');
    const [conclusion, setConclusion] = useState(test.conclusion || '');
    const [data, setData] = useState(() => structuredClone(test.data));

    // 参数过滤搜索
    const [paramFilter, setParamFilter] = useState('');

    const parameters = data.parameters || [];
    const filteredParams = useMemo(() => {
        if (!paramFilter.trim()) return parameters;
        const q = paramFilter.trim().toLowerCase();
        return parameters.filter(
            (p) => (p.label || p.name).toLowerCase().includes(q) || String(p.value).toLowerCase().includes(q),
        );
    }, [parameters, paramFilter]);

    const handleParamChange = (origIndex: number, newValue: string) => {
        setData((curr) => ({
            ...curr,
            parameters: curr.parameters?.map((p, i) => (i === origIndex ? { ...p, value: newValue } : p)),
        }));
    };

    const handleAddParam = () => {
        setData((curr) => ({
            ...curr,
            parameters: [...(curr.parameters || []), { name: `param_${(curr.parameters?.length || 0) + 1}`, value: '' }],
        }));
    };

    const handleRemoveParam = (origIndex: number) => {
        setData((curr) => ({
            ...curr,
            parameters: curr.parameters?.filter((_, i) => i !== origIndex),
        }));
    };

    return (
        <QuantModal
            title="编辑回测记录"
            close={close}
            busy={busy}
            wide
            footer={
                <>
                    <QuantButton onClick={close} disabled={busy}>
                        取消
                    </QuantButton>
                    <QuantButton
                        primary
                        disabled={busy || !title.trim()}
                        onClick={() => save({ title, description, conclusion, data })}
                    >
                        {busy ? '正在保存…' : '保存修改'}
                    </QuantButton>
                </>
            }
        >
            <div className="space-y-4">
                {/* 顶部标签页切换 */}
                <div className="flex border-b border-slate-200">
                    <button
                        type="button"
                        onClick={() => setActiveTab('basic')}
                        className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                            activeTab === 'basic'
                                ? 'border-orange-500 text-orange-600'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <FileText size={14} />
                        基本信息与结论
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('params')}
                        className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                            activeTab === 'params'
                                ? 'border-orange-500 text-orange-600'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Sliders size={14} />
                        EA 参数配置
                        {parameters.length > 0 && (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600">
                                {parameters.length}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('metrics')}
                        className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                            activeTab === 'metrics'
                                ? 'border-orange-500 text-orange-600'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <BarChart3 size={14} />
                        回测指标矩阵
                    </button>
                </div>

                {/* Tab 1: 基本信息与结论 */}
                {activeTab === 'basic' && (
                    <div className="space-y-4">
                        <QuantField
                            label="回测标题"
                            value={title}
                            onChange={setTitle}
                            placeholder="例如：EA Driver-EURUSD-M5_2023"
                            required
                        />

                        <div className="grid gap-3 sm:grid-cols-3">
                            <QuantField
                                label="交易品种"
                                value={data.fields?.symbol || ''}
                                placeholder="例如：EURUSD"
                                onChange={(value) =>
                                    setData((curr) => ({
                                        ...curr,
                                        fields: { ...curr.fields, symbol: value },
                                    }))
                                }
                            />
                            <QuantField
                                label="周期与时间区间"
                                value={data.fields?.period || ''}
                                placeholder="例如：5 分钟图 2023.01.01 - 2023.12.29"
                                onChange={(value) =>
                                    setData((curr) => ({
                                        ...curr,
                                        fields: { ...curr.fields, period: value },
                                    }))
                                }
                            />
                            <QuantField
                                label="复盘模型"
                                value={data.fields?.model || ''}
                                placeholder="例如：每个即时价格 (分形插值)"
                                onChange={(value) =>
                                    setData((curr) => ({
                                        ...curr,
                                        fields: { ...curr.fields, model: value },
                                    }))
                                }
                            />
                        </div>

                        <QuantField
                            label="回测说明"
                            value={description}
                            onChange={setDescription}
                            multiline
                            rows={3}
                            placeholder="描述本轮回测的测试背景、平台环境或调优目的…"
                        />

                        <QuantField
                            label="策略分析与回测结论"
                            value={conclusion}
                            onChange={setConclusion}
                            multiline
                            rows={4}
                            placeholder="总结策略在此区间的表现、最大回撤风险或实盘部署建议…"
                        />
                    </div>
                )}

                {/* Tab 2: EA 参数配置 */}
                {activeTab === 'params' && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="relative min-w-[200px] flex-1 max-w-xs">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <input
                                    type="text"
                                    value={paramFilter}
                                    onChange={(e) => setParamFilter(e.target.value)}
                                    placeholder="搜索参数名或值…"
                                    className={`${inputClass} pl-8 py-1.5 text-xs`}
                                />
                            </div>
                            <QuantButton onClick={handleAddParam} className="text-xs">
                                <Plus size={14} />
                                添加参数
                            </QuantButton>
                        </div>

                        {filteredParams.length > 0 ? (
                            <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1 scrollbar-hide">
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {parameters.map((param, origIndex) => {
                                        if (
                                            paramFilter.trim() &&
                                            !filteredParams.includes(param)
                                        ) {
                                            return null;
                                        }
                                        const isComment =
                                            param.name.toLowerCase().startsWith('comm') ||
                                            param.value.startsWith('"') ||
                                            param.value.startsWith("'");

                                        return (
                                            <div
                                                key={origIndex}
                                                className={`flex items-center gap-2 rounded-xl border p-2.5 transition ${
                                                    isComment
                                                        ? 'border-slate-200/60 bg-slate-50/50'
                                                        : 'border-slate-200 bg-white hover:border-orange-200'
                                                }`}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span
                                                            className="truncate font-mono text-xs font-semibold text-slate-700"
                                                            title={param.label || param.name}
                                                        >
                                                            {param.label || param.name}
                                                        </span>
                                                        {isComment && (
                                                            <span className="rounded bg-slate-200/70 px-1 text-[9px] text-slate-600">
                                                                注释
                                                            </span>
                                                        )}
                                                    </div>
                                                    <input
                                                        aria-label={`${param.label || param.name} 参数值`}
                                                        className={`${inputClass} mt-1.5 py-1 text-xs font-mono`}
                                                        value={param.value}
                                                        onChange={(e) => handleParamChange(origIndex, e.target.value)}
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    title="删除参数"
                                                    onClick={() => handleRemoveParam(origIndex)}
                                                    className="mt-5 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                                <p>没有匹配的参数</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Tab 3: 指标数据编辑 */}
                {activeTab === 'metrics' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-slate-500">
                                MT4 报告提取的原始矩阵（每行可包含 2~6 个单元格，支持增补与校正）：
                            </p>
                            <QuantButton
                                className="text-xs"
                                onClick={() =>
                                    setData((curr) => ({
                                        ...curr,
                                        metrics: [...(curr.metrics || []), ['', '', '', '']],
                                    }))
                                }
                            >
                                <Plus size={13} /> 添加指标行
                            </QuantButton>
                        </div>

                        <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1 scrollbar-hide">
                            {(data.metrics || []).map((row, rowIndex) => (
                                <div
                                    key={rowIndex}
                                    className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2"
                                >
                                    <span className="w-6 shrink-0 text-center font-mono text-[11px] text-slate-400">
                                        #{rowIndex + 1}
                                    </span>
                                    <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4">
                                        {row.map((cell, cellIndex) => (
                                            <input
                                                key={cellIndex}
                                                aria-label={`指标行 ${rowIndex + 1} 字段 ${cellIndex + 1}`}
                                                className={`${inputClass} bg-white py-1 text-xs`}
                                                value={cell}
                                                onChange={(e) =>
                                                    setData((curr) => ({
                                                        ...curr,
                                                        metrics: curr.metrics?.map((oldRow, rIdx) =>
                                                            rIdx === rowIndex
                                                                ? oldRow.map((old, cIdx) =>
                                                                      cIdx === cellIndex ? e.target.value : old,
                                                                  )
                                                                : oldRow,
                                                        ),
                                                    }))
                                                }
                                            />
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        title="删除本行"
                                        onClick={() =>
                                            setData((curr) => ({
                                                ...curr,
                                                metrics: curr.metrics?.filter((_, rIdx) => rIdx !== rowIndex),
                                            }))
                                        }
                                        className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-400">
                    提示：修改后保存将更新回测详情与展示口径，原始上传的 HTML/ZIP 报告文件依然会原样保存在附件区。
                </div>

                {error && (
                    <p role="alert" className="text-xs text-rose-600">
                        {error}
                    </p>
                )}
            </div>
        </QuantModal>
    );
}
