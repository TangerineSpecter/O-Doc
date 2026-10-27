import { useState, useRef, useEffect, type DragEvent } from 'react';
import { Upload, FileText, Image as ImageIcon, ImagePlus, X, Sparkles, AlertCircle } from 'lucide-react';
import { uploadResource } from '../../api/resources';
import { mt4Api } from '../../api/mt4Archive';
import type { MT4Expert, MT4Parameter, MT4Preview, MT4Report } from '../../types/api/mt4Archive';
import { QuantButton, QuantField, QuantModal, inputClass } from '../Quant/ui';
import { Select } from '../common/Select';
import { formatFileSize, isReportFile, isImageFile } from '../../utils/mt4ArchiveFiles';

export function TestForm({
    collection,
    expert,
    close,
    saved,
}: {
    collection: string;
    expert: MT4Expert;
    close: () => void;
    saved: () => Promise<void>;
}) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [conclusion, setConclusion] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [image, setImage] = useState<File | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    const [assetId, setAssetId] = useState('');
    const [preview, setPreview] = useState<MT4Preview | null>(null);
    const [params, setParams] = useState<MT4Parameter[]>(expert.parameters.map((p) => ({ ...p })));
    const [setName, setSetName] = useState('');
    const [metrics, setMetrics] = useState<{ name: string; value: string }[]>([]);
    const [visionModel, setVisionModel] = useState('');
    const [fields, setFields] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [allowDuplicate, setAllowDuplicate] = useState(false);

    const [isDraggingReport, setIsDraggingReport] = useState(false);
    const [isDraggingImage, setIsDraggingImage] = useState(false);
    const reportInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!image) {
            setImagePreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(image);
        setImagePreviewUrl(url);
        return () => {
            URL.revokeObjectURL(url);
        };
    }, [image]);

    const run = async (work: () => Promise<void>) => {
        setBusy(true);
        setError('');
        try {
            await work();
        } catch (e) {
            setError(e instanceof Error ? e.message : '操作失败，请重试');
        } finally {
            setBusy(false);
        }
    };

    const handleSelectReport = (selectedFile: File) => {
        if (!isReportFile(selectedFile)) {
            setError('请上传 .htm、.html 或 .zip 格式的 MT4 报告文件');
            return;
        }
        setFile(selectedFile);
        setPreview(null);
        setAssetId('');
        setError('');
    };

    const handleSelectImage = (selectedImage: File) => {
        if (!isImageFile(selectedImage)) {
            setError('请上传 PNG、JPEG、WebP 或 GIF 格式的图片文件');
            return;
        }
        setImage(selectedImage);
        if (visionModel) setMetrics([]);
        setVisionModel('');
        setError('');
    };

    const handleReportDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingReport(false);
        if (busy) return;
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) handleSelectReport(dropped);
    };

    const handleImageDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingImage(false);
        if (busy) return;
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) handleSelectImage(dropped);
    };

    const inspect = () =>
        run(async () => {
            if (!file) return;
            const asset = await uploadResource(file, 'quant');
            const result = await mt4Api.preview(collection, expert.id, asset.id);
            setAssetId(asset.id);
            setPreview(result);
            setAllowDuplicate(false);
            setParams(
                (result.report.parameters || []).map((item) => ({
                    ...expert.parameters.find((definition) => definition.name === item.name),
                    ...item,
                })),
            );
            setFields(result.report.fields || {});
            if (!title) setTitle(result.report.title?.replace(/^Strategy Tester:\s*/i, '') || file.name);
        });

    const recognize = () =>
        run(async () => {
            if (!image) return;
            const asset = await uploadResource(image, 'quant');
            const result = await mt4Api.recognize(collection, expert.id, asset.id);
            setMetrics(result.metrics);
            setVisionModel(result.modelName);
        });

    const submit = () =>
        run(async () => {
            const report: MT4Report = {
                ...(preview?.report || {}),
                fields,
                parameters: params,
                expertVersion: expert.version,
                source: preview ? 'html' : visionModel ? 'vision' : 'manual',
                visionModel,
                hasChart: preview?.hasChart || false,
            };
            if (metrics.length) report.metrics = [...(report.metrics || []), ...metrics.map((item) => [item.name, item.value])];
            const imageAssetId = image ? (await uploadResource(image, 'quant')).id : undefined;
            await mt4Api.createTest(collection, expert.id, {
                title,
                description,
                conclusion,
                data: report,
                reportAssetId: assetId || undefined,
                imageAssetId,
                allowDuplicate,
            });
            await saved();
        });

    return (
        <QuantModal
            title="添加回测记录"
            close={close}
            wide
            busy={busy}
            footer={
                <>
                    <QuantButton onClick={close} disabled={busy}>
                        取消
                    </QuantButton>
                    <QuantButton
                        primary
                        disabled={busy || !title.trim() || (!!file && !preview) || (!!preview?.duplicates.length && !allowDuplicate)}
                        onClick={submit}
                    >
                        {busy ? '处理中…' : '保存回测'}
                    </QuantButton>
                </>
            }
        >
            <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                    <QuantField label="回测标题" value={title} onChange={setTitle} required />
                    <QuantField
                        label="回测说明"
                        value={description}
                        onChange={setDescription}
                        placeholder="例如品种、周期和使用条件"
                    />
                </div>

                {/* 导入 MT4 报告区域 */}
                <div
                    className={`rounded-xl border p-4 transition-colors ${
                        isDraggingReport ? 'border-orange-500 bg-orange-50/40' : 'border-slate-200 bg-white'
                    }`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingReport(true);
                    }}
                    onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                            setIsDraggingReport(false);
                        }
                    }}
                    onDrop={handleReportDrop}
                >
                    <div className="mb-3">
                        <h3 className="text-sm font-semibold text-slate-800">导入 MT4 报告</h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                            选择 HTML 或 ZIP；曲线图片可选，也可保存后补充。
                        </p>
                    </div>

                    <input
                        ref={reportInputRef}
                        type="file"
                        accept=".htm,.html,.zip"
                        disabled={busy}
                        className="hidden"
                        onChange={(e) => {
                            const selected = e.target.files?.[0];
                            if (selected) handleSelectReport(selected);
                            e.target.value = '';
                        }}
                    />

                    {!file ? (
                        <div
                            role="button"
                            tabIndex={0}
                            aria-label="上传 MT4 报告文件"
                            onClick={() => !busy && reportInputRef.current?.click()}
                            onKeyDown={(e) => {
                                if ((e.key === 'Enter' || e.key === ' ') && !busy) {
                                    e.preventDefault();
                                    reportInputRef.current?.click();
                                }
                            }}
                            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-6 px-4 text-center transition-all ${
                                isDraggingReport
                                    ? 'border-orange-500 bg-orange-100/60 text-orange-700 scale-[1.005]'
                                    : 'border-slate-200 bg-slate-50/60 hover:border-orange-300 hover:bg-orange-50/30'
                            }`}
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-orange-500 shadow-sm ring-1 ring-slate-200/60">
                                <Upload className="h-5 w-5" />
                            </div>
                            <p className="mt-2 text-sm font-medium text-slate-700">
                                {isDraggingReport ? '松开鼠标即可添加报告' : '点击选择或拖拽文件到此处'}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                                支持 MT4 生成的 .htm / .html 报告，或包含曲线图的 .zip 压缩包
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                                        <FileText className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-800" title={file.name}>
                                            {file.name}
                                        </p>
                                        <p className="text-xs text-slate-400">{formatFileSize(file.size)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => reportInputRef.current?.click()}
                                        className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                    >
                                        更换文件
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                            setFile(null);
                                            setPreview(null);
                                            setAssetId('');
                                        }}
                                        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50"
                                        title="移除文件"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                    <QuantButton
                                        primary={!preview}
                                        disabled={busy}
                                        onClick={inspect}
                                    >
                                        <Sparkles className="h-3.5 w-3.5" />
                                        {busy ? '解析中…' : preview ? '重新解析' : '解析并预览'}
                                    </QuantButton>
                                </div>
                            </div>
                        </div>
                    )}

                    {preview && (
                        <div className="mt-3 space-y-1.5 rounded-xl border border-slate-200 bg-white p-3.5 text-xs text-slate-600 shadow-sm">
                            {preview.report.source === 'local-demo' && (
                                <p className="flex items-center gap-1.5 font-medium text-amber-700">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    本地样例数据，仅演示流程，未解析所选文件。
                                </p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                <span className="font-semibold text-slate-800">
                                    {preview.report.fields?.symbol || '品种未识别'} · {preview.report.fields?.period || '周期未识别'}
                                </span>
                                <span className="text-slate-500">
                                    识别到 {preview.report.events?.length || 0} 条交易事件、{preview.report.metrics?.length || 0} 行指标
                                </span>
                                <span className="text-slate-500">
                                    {preview.hasChart ? '· ZIP 包含曲线图' : '· 未包含曲线图'}
                                </span>
                            </div>
                            {!!preview.duplicates.length && (
                                <label className="flex items-center gap-2 pt-1 text-amber-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="rounded border-amber-300 text-orange-500 focus:ring-orange-500/20"
                                        checked={allowDuplicate}
                                        onChange={(e) => setAllowDuplicate(e.target.checked)}
                                    />
                                    已存在相同报告（{preview.duplicates.map((x) => x.title).join('、')}），仍要新建
                                </label>
                            )}
                        </div>
                    )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    {[
                        ['symbol', '交易品种'],
                        ['period', '周期与时间区间'],
                        ['model', '复盘模型'],
                    ].map(([key, label]) => (
                        <QuantField
                            key={key}
                            label={label}
                            value={fields[key] || ''}
                            onChange={(value) => setFields((current) => ({ ...current, [key]: value }))}
                        />
                    ))}
                </div>

                {!!preview?.report.metrics?.length && (
                    <div>
                        <h3 className="text-sm font-semibold text-slate-800">报告指标 · 可核对修改</h3>
                        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto scrollbar-hide">
                            {preview.report.metrics.map((row, rowIndex) => (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" key={rowIndex}>
                                    {row.map((cell, index) => (
                                        <input
                                            key={index}
                                            className={inputClass}
                                            aria-label={`指标 ${rowIndex + 1} 字段 ${index + 1}`}
                                            value={cell}
                                            onChange={(e) =>
                                                setPreview((current) =>
                                                    current
                                                        ? {
                                                              ...current,
                                                              report: {
                                                                  ...current.report,
                                                                  metrics: current.report.metrics?.map((oldRow, i) =>
                                                                      i === rowIndex
                                                                          ? oldRow.map((old, j) =>
                                                                                j === index ? e.target.value : old,
                                                                            )
                                                                          : oldRow,
                                                                  ),
                                                              },
                                                          }
                                                        : null,
                                                )
                                            }
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 图片附件区域 */}
                <div
                    className={`rounded-xl border p-4 transition-colors ${
                        isDraggingImage ? 'border-orange-500 bg-orange-50/40' : 'border-slate-200 bg-white'
                    }`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingImage(true);
                    }}
                    onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                            setIsDraggingImage(false);
                        }
                    }}
                    onDrop={handleImageDrop}
                >
                    <div className="mb-3">
                        <h3 className="text-sm font-semibold text-slate-800">图片附件</h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                            有 HTML 时可附曲线图；只有截图时可使用系统识图模型提取指标，保存前请核对。
                        </p>
                    </div>

                    <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        disabled={busy}
                        className="hidden"
                        onChange={(e) => {
                            const selected = e.target.files?.[0];
                            if (selected) handleSelectImage(selected);
                            e.target.value = '';
                        }}
                    />

                    {!image ? (
                        <div
                            role="button"
                            tabIndex={0}
                            aria-label="上传图片附件"
                            onClick={() => !busy && imageInputRef.current?.click()}
                            onKeyDown={(e) => {
                                if ((e.key === 'Enter' || e.key === ' ') && !busy) {
                                    e.preventDefault();
                                    imageInputRef.current?.click();
                                }
                            }}
                            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-6 px-4 text-center transition-all ${
                                isDraggingImage
                                    ? 'border-orange-500 bg-orange-100/60 text-orange-700 scale-[1.005]'
                                    : 'border-slate-200 bg-slate-50/60 hover:border-orange-300 hover:bg-orange-50/30'
                            }`}
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-orange-500 shadow-sm ring-1 ring-slate-200/60">
                                <ImagePlus className="h-5 w-5" />
                            </div>
                            <p className="mt-2 text-sm font-medium text-slate-700">
                                {isDraggingImage ? '松开鼠标即可添加图片' : '点击选择或拖拽图片到此处'}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                                支持 PNG、JPEG、WebP、GIF 格式曲线图或报告截图
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    {imagePreviewUrl ? (
                                        <img
                                            src={imagePreviewUrl}
                                            alt={image.name}
                                            className="h-12 w-12 rounded-lg border border-slate-200 object-cover shrink-0 bg-white"
                                        />
                                    ) : (
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                                            <ImageIcon className="h-5 w-5" />
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-800" title={image.name}>
                                            {image.name}
                                        </p>
                                        <p className="text-xs text-slate-400">{formatFileSize(image.size)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => imageInputRef.current?.click()}
                                        className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                    >
                                        更换图片
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                            setImage(null);
                                            if (visionModel) setMetrics([]);
                                            setVisionModel('');
                                        }}
                                        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50"
                                        title="移除图片"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                    {!preview && (
                                        <QuantButton
                                            disabled={busy}
                                            onClick={recognize}
                                        >
                                            <Sparkles className="h-3.5 w-3.5" />
                                            {busy ? '识别中…' : '识别截图指标'}
                                        </QuantButton>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {visionModel && (
                        <p className="mt-2 text-xs text-slate-500">
                            识图模型：<span className="font-medium text-slate-700">{visionModel}</span>；
                            {metrics.length ? '识别结果已填入下方指标，仅供核对。' : '未识别到可用指标，可手工填写。'}
                        </p>
                    )}
                </div>

                <div>
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-slate-800">参数快照</h3>
                        {expert.parameterSets.length > 0 && (
                            <div className="w-48">
                                <Select
                                    value={setName}
                                    options={[
                                        { value: '', label: '选择参数组合' },
                                        ...expert.parameterSets.map((item) => ({ value: item.name, label: item.name })),
                                    ]}
                                    menuPortal
                                    onChange={(name) => {
                                        setSetName(name);
                                        const set = expert.parameterSets.find((item) => item.name === name);
                                        if (set) setParams(set.parameters.map((item) => ({ ...item })));
                                    }}
                                />
                            </div>
                        )}
                    </div>
                    <div className="mt-2 space-y-2">
                        {params.map((p, index) => (
                            <div key={index} className="grid grid-cols-2 gap-2">
                                <input className={inputClass} aria-label="参数名称" value={p.label || p.name} readOnly />
                                <input
                                    className={inputClass}
                                    aria-label="参数值"
                                    value={p.value}
                                    onChange={(e) =>
                                        setParams((current) =>
                                            current.map((v, i) => (i === index ? { ...v, value: e.target.value } : v)),
                                        )
                                    }
                                />
                            </div>
                        ))}
                        {!params.length && (
                            <p className="text-xs text-slate-500">EA 暂未配置参数，也可以导入报告自动识别。</p>
                        )}
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-800">
                            补充指标{metrics.length > 0 && image && !preview ? ' · 请核对识别结果' : ''}
                        </h3>
                        <QuantButton onClick={() => setMetrics((current) => [...current, { name: '', value: '' }])}>
                            添加指标
                        </QuantButton>
                    </div>
                    <div className="mt-2 space-y-2">
                        {metrics.map((metric, index) => (
                            <div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={index}>
                                <input
                                    aria-label="指标名称"
                                    className={inputClass}
                                    value={metric.name}
                                    onChange={(e) =>
                                        setMetrics((current) =>
                                            current.map((v, i) => (i === index ? { ...v, name: e.target.value } : v)),
                                        )
                                    }
                                />
                                <input
                                    aria-label="指标数值"
                                    className={inputClass}
                                    value={metric.value}
                                    onChange={(e) =>
                                        setMetrics((current) =>
                                            current.map((v, i) => (i === index ? { ...v, value: e.target.value } : v)),
                                        )
                                    }
                                />
                                <button
                                    type="button"
                                    className="text-sm text-slate-500 hover:text-red-600 transition-colors"
                                    onClick={() => setMetrics((current) => current.filter((_, i) => i !== index))}
                                >
                                    删除
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <QuantField label="回测结论" value={conclusion} onChange={setConclusion} multiline rows={3} />
                {error && (
                    <p role="alert" className="text-sm text-red-600">
                        {error}
                    </p>
                )}
            </div>
        </QuantModal>
    );
}
