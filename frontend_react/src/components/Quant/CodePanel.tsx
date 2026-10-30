import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Copy, Download, FileCode2, History, Plus, RotateCcw, Save, ShieldCheck, Sparkles } from 'lucide-react';
import { quantApi } from '../../api/quant';
import { Select } from '../common/Select';
import { CodeEditor } from './CodeEditor';
import { SourceCodeEditor } from './SourceCodeEditor';
import { collectedCodeSources } from '../../utils/quantSourceCode';
import { QuantButton, QuantEmpty, QuantField, QuantModal, cardClass } from './ui';
import { quantLanguageOptions as languageOptions } from '../../utils/quant';
import { copyQuantText, downloadQuantBlob, quantDate, quantFilename } from '../../utils/quant';
import { useQuantDraftRegistration, type QuantRegisterDraft } from '../../hooks/useQuantNavigation';
import type { QuantController } from '../../hooks/useQuant';
import type {
    QuantCodeVersion,
    QuantEntryDetail,
    QuantImplementation,
    QuantImplementationInput,
    QuantLanguage,
    QuantVerificationInput,
} from '../../types/api/quant';

export interface QuantCodeSeed {
    name: string;
    code: string;
    language: QuantLanguage;
}
const languageName = (value: string) => languageOptions.find((option) => option.value === value)?.label || value;

export function CodePanel({
    entry,
    collection,
    controller,
    register,
    request,
    seed,
    consumeSeed,
    startAI,
}: {
    entry: QuantEntryDetail;
    collection: string;
    controller: QuantController;
    register: QuantRegisterDraft;
    request: (proceed: () => void) => void;
    seed: QuantCodeSeed | null;
    consumeSeed: () => void;
    startAI: (version: QuantCodeVersion, kind: 'explain' | 'convert') => void;
}) {
    const sources = collectedCodeSources(entry.sources || []);
    const [selected, setSelected] = useState(sources[0] ? `source:${sources[0].id}` : entry.implementations[0]?.id || '');
    const [creating, setCreating] = useState(false);
    const source = sources.find((item) => `source:${item.id}` === selected);
    const implementation = source ? undefined : entry.implementations.find((item) => item.id === selected) || entry.implementations[0];
    const close = () =>
        request(() => {
            setCreating(false);
            consumeSeed();
        });
    return (
        <div className="space-y-5">
            <section className={cardClass}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-bold text-slate-900">多语言实现</h2>
                        <p className="mt-1 text-xs text-slate-400">每次保存形成新版本，历史代码与回测关联保留。</p>
                    </div>
                    <QuantButton primary disabled={controller.busy} onClick={() => request(() => setCreating(true))}>
                        <Plus size={15} />
                        新增实现
                    </QuantButton>
                </div>
                {(entry.implementations.length > 0 || sources.length > 0) && (
                    <div className="mt-5 space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {sources.map((item) => (
                                <button key={item.id} type="button" onClick={() => request(() => setSelected(`source:${item.id}`))}
                                    className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-left text-xs transition ${source?.id === item.id ? 'border-orange-300 bg-orange-50/70 text-orange-900' : 'border-slate-200/80 bg-slate-50/60 text-slate-600'}`}>
                                    <FileCode2 size={14}/><span className="font-bold">来源代码</span>
                                    <span>{languageName(item.payload.language || '')} · {quantDate(item.createdAt)}</span>
                                </button>
                            ))}
                            {entry.implementations.map((item) => {
                                const isActive = implementation?.id === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => request(() => setSelected(item.id))}
                                        className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-left text-xs transition ${
                                            isActive
                                                ? 'border-orange-300 bg-orange-50/70 text-orange-900 shadow-xs'
                                                : 'border-slate-200/80 bg-slate-50/60 text-slate-600 hover:border-slate-300 hover:bg-white'
                                        }`}
                                    >
                                        <FileCode2 size={14} className={isActive ? 'text-orange-500' : 'text-slate-400'} />
                                        <span className="font-bold">{item.name}</span>
                                        <span className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 shadow-2xs">
                                            {languageName(item.language)}
                                            {item.languageVersion ? ` ${item.languageVersion}` : ''}
                                        </span>
                                        <span className="text-[10px] text-slate-400">{item.versions.length} 版本</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="max-w-sm">
                            <Select
                                value={source ? `source:${source.id}` : implementation?.id || ''}
                                options={[...sources.map((item) => ({ value: `source:${item.id}`, label: `来源代码 · ${languageName(item.payload.language || '')}`, description: quantDate(item.createdAt) })), ...entry.implementations.map((item) => ({
                                    value: item.id,
                                    label: item.name,
                                    description: `${languageName(item.language)} ${item.languageVersion}`,
                                }))]}
                                onChange={(id) => request(() => setSelected(id))}
                            />
                        </div>
                    </div>
                )}
            </section>
            {source ? (
                <SourceCodeEditor key={source.id} source={source} entry={entry} collection={collection}
                    controller={controller} register={register} saved={setSelected}/>
            ) : implementation ? (
                <ImplementationEditor
                    key={implementation.id}
                    implementation={implementation}
                    entry={entry}
                    collection={collection}
                    controller={controller}
                    register={register}
                    request={request}
                    startAI={startAI}
                />
            ) : (
                <QuantEmpty
                    title="给这个想法添上第一份代码"
                    description="支持 Python、Pine Script、MQL4。上传的文本脚本也能读取为代码草稿。"
                >
                    <QuantButton onClick={() => setCreating(true)}>
                        <FileCode2 size={16} />
                        新增代码实现
                    </QuantButton>
                </QuantEmpty>
            )}
            {(creating || seed) && (
                <ImplementationModal
                    collection={collection}
                    entryId={entry.id}
                    controller={controller}
                    register={register}
                    seed={seed}
                    close={close}
                    saved={(id) => {
                        setSelected(id);
                        setCreating(false);
                        consumeSeed();
                    }}
                />
            )}
        </div>
    );
}

function ImplementationModal({
    collection,
    entryId,
    controller,
    register,
    seed,
    close,
    saved,
}: {
    collection: string;
    entryId: string;
    controller: QuantController;
    register: QuantRegisterDraft;
    seed: QuantCodeSeed | null;
    close: () => void;
    saved: (id: string) => void;
}) {
    const initial: QuantImplementationInput = {
        name: seed?.name || '',
        language: seed?.language || 'python',
        languageVersion: '',
        dependencies: '',
        parameters: '',
        code: seed?.code || '',
        note: '',
    };
    const [draft, setDraft] = useState(initial);
    const [baseline, setBaseline] = useState(JSON.stringify(seed ? { ...initial, code: '', name: '' } : initial));
    const patch = (field: keyof QuantImplementationInput, value: string) =>
        setDraft((current) => ({ ...current, [field]: value }));
    const save = useCallback(async () => {
        if (!draft.name.trim() || !draft.code.trim()) {
            controller.setError('请填写实现名称和代码');
            return false;
        }
        let id = '';
        const ok = await controller.safe(async () => {
            const result = await quantApi.implementation(collection, entryId, { ...draft, name: draft.name.trim() });
            id = result.id;
        });
        if (ok) {
            setBaseline(JSON.stringify(draft));
            saved(id);
        }
        return ok;
    }, [draft, controller, collection, entryId, saved]);
    useQuantDraftRegistration('new-implementation', JSON.stringify(draft) !== baseline, save, register, () =>
        setDraft(JSON.parse(baseline) as QuantImplementationInput),
    );
    return (
        <QuantModal title={seed ? '从脚本读取代码草稿' : '新增代码实现'} close={close} wide busy={controller.busy}>
            <div className="grid gap-4 sm:grid-cols-2">
                <QuantField
                    label="实现名称"
                    value={draft.name}
                    onChange={(value) => patch('name', value)}
                    placeholder="例如：均线斜率 · Python"
                    required
                />
                <label className="space-y-2 text-sm font-semibold text-slate-700">
                    <span className="block">代码语言</span>
                    <Select
                        menuPortal
                        value={draft.language}
                        options={languageOptions}
                        onChange={(value) => patch('language', value)}
                    />
                </label>
                <QuantField
                    label="语言 / 平台版本"
                    value={draft.languageVersion}
                    onChange={(value) => patch('languageVersion', value)}
                    placeholder="例如：3.11 / Pine v6 / MT4"
                />
                <QuantField
                    label="保存说明"
                    value={draft.note}
                    onChange={(value) => patch('note', value)}
                    placeholder="初始实现"
                />
                <QuantField
                    label="依赖"
                    value={draft.dependencies}
                    onChange={(value) => patch('dependencies', value)}
                    multiline
                    rows={2}
                />
                <QuantField
                    label="参数说明"
                    value={draft.parameters}
                    onChange={(value) => patch('parameters', value)}
                    multiline
                    rows={2}
                />
            </div>
            <CodeEditor value={draft.code} onChange={(value) => patch('code', value)} language={draft.language} />
            <p className="text-xs text-slate-400">保存后默认待验证。这里仅编辑和归档代码，不执行脚本。</p>
            <div className="flex justify-end gap-3">
                <QuantButton onClick={close} disabled={controller.busy}>
                    取消
                </QuantButton>
                <QuantButton primary onClick={() => void save()} disabled={controller.busy}>
                    <Save size={15} />
                    保存实现
                </QuantButton>
            </div>
            {controller.error && (
                <p role="alert" className="text-sm text-red-600">
                    {controller.error}
                </p>
            )}
        </QuantModal>
    );
}

function ImplementationEditor({
    implementation,
    entry,
    collection,
    controller,
    register,
    request,
    startAI,
}: {
    implementation: QuantImplementation;
    entry: QuantEntryDetail;
    collection: string;
    controller: QuantController;
    register: QuantRegisterDraft;
    request: (proceed: () => void) => void;
    startAI: (version: QuantCodeVersion, kind: 'explain' | 'convert') => void;
}) {
    const current = implementation.versions.find((version) => version.id === implementation.currentVersionId);
    const [viewId, setViewId] = useState(current?.id || '');
    const version = implementation.versions.find((item) => item.id === viewId) || current;
    const selectedSnapshot = useRef(version);
    useLayoutEffect(() => {
        selectedSnapshot.current = version;
    }, [version]);
    const [code, setCode] = useState(current?.code || '');
    const [name, setName] = useState(implementation.name);
    const [note, setNote] = useState('');
    const [languageVersion, setLanguageVersion] = useState(current?.languageVersion || '');
    const [dependencies, setDependencies] = useState(current?.dependencies || '');
    const [parameters, setParameters] = useState(current?.parameters || '');
    const [checking, setChecking] = useState(false);
    const [copied, setCopied] = useState(false);
    const editable = version?.id === implementation.currentVersionId;
    const dirty =
        !!current &&
        (code !== current.code ||
            name !== implementation.name ||
            note !== '' ||
            languageVersion !== current.languageVersion ||
            dependencies !== current.dependencies ||
            parameters !== current.parameters);
    const save = useCallback(async () => {
        if (!current || !code.trim() || !name.trim()) {
            controller.setError('实现名称和代码不能为空');
            return false;
        }
        let next: QuantCodeVersion | null = null;
        const ok = await controller.safe(async () => {
            if (name !== implementation.name)
                await quantApi.rename(collection, entry.id, implementation.id, name.trim());
            next = await quantApi.version(collection, entry.id, implementation.id, {
                code,
                note,
                language: current.language,
                languageVersion,
                dependencies,
                parameters,
            });
        });
        if (ok && next) {
            const saved = next as QuantCodeVersion;
            selectedSnapshot.current = saved;
            setViewId(saved.id);
            setNote('');
        }
        return ok;
    }, [
        current,
        code,
        name,
        note,
        languageVersion,
        dependencies,
        parameters,
        controller,
        collection,
        entry.id,
        implementation,
    ]);
    useQuantDraftRegistration('code-editor', dirty, save, register, () => {
        setCode(current?.code || '');
        setName(implementation.name);
        setNote('');
        setLanguageVersion(current?.languageVersion || '');
        setDependencies(current?.dependencies || '');
        setParameters(current?.parameters || '');
    });
    if (!version) return <QuantEmpty title="版本资料未找到" description="请刷新后重试，或新增一份实现。" />;
    const restore = () =>
        request(() => {
            void controller.safe(async () => {
                const restored = await quantApi.version(collection, entry.id, implementation.id, {
                    code: version.code,
                    language: version.language,
                    languageVersion: version.languageVersion,
                    dependencies: version.dependencies,
                    parameters: version.parameters,
                    note: `恢复自 ${version.id.slice(0, 8)}`,
                    sourceVersionId: version.id,
                });
                selectedSnapshot.current = restored;
                setViewId(restored.id);
                setCode(restored.code);
                setLanguageVersion(restored.languageVersion);
                setDependencies(restored.dependencies);
                setParameters(restored.parameters);
                setNote('');
            });
        });
    return (
        <section className={cardClass}>
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <History size={17} className="text-orange-500" />
                <div className="min-w-48 flex-1">
                    <Select
                        value={version.id}
                        options={implementation.versions.map((item) => ({
                            value: item.id,
                            label: `${item.id === implementation.currentVersionId ? '当前版本' : '历史版本'} · ${quantDate(item.createdAt)}`,
                            description: `${item.id.slice(0, 8)}${item.note ? ` · ${item.note}` : ''}`,
                        }))}
                        onChange={(value) => request(() => setViewId(value))}
                    />
                </div>
                <QuantButton disabled={controller.busy} onClick={() => request(() => setChecking(true))}>
                    <ShieldCheck size={15} />
                    验证记录
                </QuantButton>
                {editable ? (
                    <QuantButton primary disabled={controller.busy || !dirty} onClick={() => void save()}>
                        <Save size={15} />
                        保存新版本
                    </QuantButton>
                ) : (
                    <QuantButton primary disabled={controller.busy} onClick={restore}>
                        <RotateCcw size={15} />
                        恢复为新版本
                    </QuantButton>
                )}
            </div>
            {!editable && (
                <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    正在查看历史快照。恢复会创建新版本，旧代码和回测关联保留。
                </p>
            )}
            {editable ? (
                <div className="mb-5 grid gap-4 sm:grid-cols-2">
                    <QuantField label="实现名称" value={name} onChange={setName} />
                    <QuantField label="语言 / 平台版本" value={languageVersion} onChange={setLanguageVersion} />
                    <QuantField label="依赖" value={dependencies} onChange={setDependencies} multiline rows={2} />
                    <QuantField label="参数说明" value={parameters} onChange={setParameters} multiline rows={2} />
                </div>
            ) : (
                <div className="mb-4 grid gap-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 sm:grid-cols-2">
                    <p>
                        语言：{languageName(version.language)} {version.languageVersion || '未填写'}
                    </p>
                    <p>依赖：{version.dependencies || '未填写'}</p>
                    <p className="sm:col-span-2">参数：{version.parameters || '未填写'}</p>
                </div>
            )}
            <CodeEditor
                key={editable ? 'edit' : version.id}
                value={editable ? code : version.code}
                onChange={editable ? setCode : undefined}
                language={version.language}
                readOnly={!editable}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="mr-auto font-mono">
                    {languageName(version.language)} · {version.id.slice(0, 8)}
                </span>
                <QuantButton
                    onClick={() => {
                        void copyQuantText(editable ? code : version.code)
                            .then(() => setCopied(true))
                            .catch(() => controller.setError('复制失败，可在编辑器内全选并复制'));
                    }}
                >
                    <Copy size={14} />
                    {copied ? '已复制' : '复制'}
                </QuantButton>
                <QuantButton
                    onClick={() =>
                        downloadQuantBlob(
                            new Blob([editable ? code : version.code], { type: 'text/plain;charset=utf-8' }),
                            quantFilename(implementation.name, version.language),
                        )
                    }
                >
                    <Download size={14} />
                    下载代码
                </QuantButton>
                <QuantButton
                    onClick={() =>
                        request(() => {
                            if (selectedSnapshot.current) startAI(selectedSnapshot.current, 'explain');
                        })
                    }
                    disabled={controller.busy}
                >
                    <Sparkles size={14} />
                    解释代码
                </QuantButton>
                <QuantButton
                    onClick={() =>
                        request(() => {
                            if (selectedSnapshot.current) startAI(selectedSnapshot.current, 'convert');
                        })
                    }
                    disabled={controller.busy}
                >
                    <Sparkles size={14} />
                    转换语言
                </QuantButton>
            </div>
            {editable && (
                <div className="mt-5">
                    <QuantField
                        label="本次版本说明"
                        value={note}
                        onChange={setNote}
                        placeholder="记录修改原因，方便日后对应回测"
                    />
                </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-[11px]">
                <span className="text-xs font-semibold text-slate-500">外部验证状态：</span>
                {[
                    ['编译', version.compileCheck],
                    ['运行', version.runCheck],
                    ['结果核对', version.resultCheck],
                ].map(([label, status]) => (
                    <button
                        type="button"
                        key={label}
                        onClick={() => request(() => setChecking(true))}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium transition hover:opacity-85 ${
                            status === 'passed'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : status === 'failed'
                                  ? 'border-red-200 bg-red-50 text-red-600'
                                  : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                    >
                        {label}：{status === 'passed' ? '通过' : status === 'failed' ? '失败' : '待验证'}
                    </button>
                ))}
                {version.verificationNotes && (
                    <span className="ml-1 truncate text-xs text-slate-400">备注：{version.verificationNotes}</span>
                )}
            </div>
            {checking && (
                <VerificationModal
                    version={version}
                    entry={entry}
                    collection={collection}
                    controller={controller}
                    register={register}
                    close={() => request(() => setChecking(false))}
                    saved={() => setChecking(false)}
                />
            )}
        </section>
    );
}

function VerificationModal({
    version,
    entry,
    collection,
    controller,
    register,
    close,
    saved,
}: {
    version: QuantCodeVersion;
    entry: QuantEntryDetail;
    collection: string;
    controller: QuantController;
    register: QuantRegisterDraft;
    close: () => void;
    saved: () => void;
}) {
    const initial: QuantVerificationInput = {
        compileCheck: version.compileCheck,
        runCheck: version.runCheck,
        resultCheck: version.resultCheck,
        verificationNotes: version.verificationNotes,
    };
    const [draft, setDraft] = useState(initial);
    const save = useCallback(async () => {
        const ok = await controller.safe(() => quantApi.verification(collection, entry.id, version.id, draft));
        if (ok) saved();
        return ok;
    }, [controller, collection, entry.id, version.id, draft, saved]);
    useQuantDraftRegistration('verification', JSON.stringify(draft) !== JSON.stringify(initial), save, register, () =>
        setDraft(initial),
    );
    return (
        <QuantModal title="代码验证记录" close={close} busy={controller.busy}>
            <p className="text-xs leading-6 text-slate-500">
                当前快照 {version.id.slice(0, 8)}。记录你在外部平台完成的验证；AI 生成代码不会自动被判定为通过。
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
                {(
                    [
                        { key: 'compileCheck', label: '编译检查' },
                        { key: 'runCheck', label: '运行检查' },
                        { key: 'resultCheck', label: '结果核对' },
                    ] as const
                ).map((field) => (
                    <label key={field.key} className="space-y-2 text-sm font-semibold text-slate-700">
                        <span className="block">{field.label}</span>
                        <Select
                            menuPortal
                            value={draft[field.key]}
                            options={[
                                { value: 'pending', label: '待验证' },
                                { value: 'passed', label: '通过' },
                                { value: 'failed', label: '失败' },
                            ]}
                            onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
                        />
                    </label>
                ))}
            </div>
            <QuantField
                label="验证备注"
                value={draft.verificationNotes}
                onChange={(value) => setDraft((current) => ({ ...current, verificationNotes: value }))}
                multiline
                placeholder="平台版本、测试方法、差异或失败原因"
            />
            <div className="flex justify-end">
                <QuantButton primary disabled={controller.busy} onClick={() => void save()}>
                    保存验证记录
                </QuantButton>
            </div>
            {controller.error && (
                <p role="alert" className="text-sm text-red-600">
                    {controller.error}
                </p>
            )}
        </QuantModal>
    );
}
