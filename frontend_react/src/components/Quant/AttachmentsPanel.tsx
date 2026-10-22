import { useCallback, useState } from 'react';
import { Download, Eye, FileCode2, FileText, Paperclip, Plus, Trash2, Upload } from 'lucide-react';
import { quantApi } from '../../api/quant';
import { downloadResource, uploadResource } from '../../api/resources';
import { Select } from '../common/Select';
import ConfirmationModal from '../common/ConfirmationModal';
import AuthenticatedResourceImage from '../common/AuthenticatedResourceImage';
import { QuantButton, QuantEmpty, QuantModal, cardClass, inputClass } from './ui';
import type { QuantCodeSeed } from './CodePanel';
import { quantVersionLabel as versionLabel } from '../../utils/quant';
import { downloadQuantBlob, quantScriptLanguage } from '../../utils/quant';
import { useQuantDraftRegistration, type QuantRegisterDraft } from '../../hooks/useQuantNavigation';
import type { QuantController } from '../../hooks/useQuant';
import type { QuantAttachment, QuantEntryDetail } from '../../types/api/quant';

function fileSize(bytes: number) {
    return bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function isImage(attachment: QuantAttachment) {
    return attachment.mimeType?.startsWith('image/') || attachment.fileType === 'image';
}

export function AttachmentsPanel({
    entry,
    collection,
    controller,
    register,
    request,
    importCode,
}: {
    entry: QuantEntryDetail;
    collection: string;
    controller: QuantController;
    register: QuantRegisterDraft;
    request: (next: () => void) => void;
    importCode: (seed: QuantCodeSeed) => void;
}) {
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState<QuantAttachment | null>(null);
    const [removing, setRemoving] = useState<QuantAttachment | null>(null);
    const readCode = (attachment: QuantAttachment) =>
        controller.safe(async () => {
            const result = await quantApi.text(collection, entry.id, attachment.id);
            importCode({ name: result.name.replace(/\.[^.]+$/, ''), code: result.code, language: result.language });
        }, false);
    const download = (attachment: QuantAttachment) =>
        controller.safe(async () => {
            downloadQuantBlob(await downloadResource(attachment.assetId), attachment.name);
        }, false);
    return (
        <div className="space-y-5">
            <section className={cardClass}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-bold text-slate-900">研究附件</h2>
                        <p className="mt-1 text-xs text-slate-400">
                            保留原始脚本、Notebook、报告与曲线，按需关联代码或回测。
                        </p>
                    </div>
                    <QuantButton primary disabled={controller.busy} onClick={() => setUploading(true)}>
                        <Upload size={15} />
                        上传附件
                    </QuantButton>
                </div>
            </section>
            {entry.attachments.length ? (
                <div className="grid gap-4 xl:grid-cols-2">
                    {entry.attachments.map((attachment) => {
                        const implementation = entry.implementations.find(
                            (item) =>
                                item.id === attachment.implementationId ||
                                item.versions.some((version) => version.id === attachment.versionId),
                        );
                        const version = implementation?.versions.find((item) => item.id === attachment.versionId);
                        const backtest = entry.backtests.find((item) => item.id === attachment.backtestId);
                        return (
                            <article
                                key={attachment.id}
                                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                            >
                                {isImage(attachment) && (
                                    <button
                                        type="button"
                                        aria-label={`预览 ${attachment.name}`}
                                        onClick={() => setPreview(attachment)}
                                        className="block w-full bg-slate-50"
                                    >
                                        <AuthenticatedResourceImage
                                            resourceId={attachment.assetId}
                                            alt={attachment.name}
                                            className="h-40 w-full object-contain"
                                        />
                                    </button>
                                )}
                                <div className="p-5">
                                    <div className="flex items-start gap-3">
                                        <div className="rounded-lg bg-slate-50 p-2 text-orange-500">
                                            {quantScriptLanguage(attachment.name) ? (
                                                <FileCode2 size={20} />
                                            ) : (
                                                <FileText size={20} />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="break-all text-sm font-semibold text-slate-800">
                                                {attachment.name}
                                            </h3>
                                            <p className="mt-1 text-xs text-slate-400">
                                                {attachment.fileExtension || attachment.fileType} ·{' '}
                                                {fileSize(attachment.fileSize)}
                                            </p>
                                        </div>
                                    </div>
                                    {(implementation || backtest) && (
                                        <div className="mt-3 space-y-1 text-xs text-orange-600">
                                            {implementation && (
                                                <p className="break-words">
                                                    代码：
                                                    {version
                                                        ? versionLabel(implementation, version)
                                                        : implementation.name}
                                                </p>
                                            )}
                                            {backtest && <p>回测：{backtest.name}</p>}
                                        </div>
                                    )}
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {isImage(attachment) && (
                                            <QuantButton onClick={() => setPreview(attachment)}>
                                                <Eye size={14} />
                                                预览
                                            </QuantButton>
                                        )}
                                        <QuantButton
                                            disabled={controller.busy}
                                            onClick={() => void download(attachment)}
                                        >
                                            <Download size={14} />
                                            下载
                                        </QuantButton>
                                        {quantScriptLanguage(attachment.name) && (
                                            <QuantButton
                                                disabled={controller.busy}
                                                onClick={() => void readCode(attachment)}
                                            >
                                                <FileCode2 size={14} />
                                                读取为代码草稿
                                            </QuantButton>
                                        )}
                                        <QuantButton
                                            danger
                                            aria-label={`移除附件 ${attachment.name}`}
                                            disabled={controller.busy}
                                            onClick={() => setRemoving(attachment)}
                                        >
                                            <Trash2 size={14} />
                                        </QuantButton>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <QuantEmpty
                    title="把实验的原始资料放在这里"
                    description="支持脚本、Notebook、CSV、PDF、图片和压缩包。文本脚本可读取为代码草稿，其他文件保留原件供下载。"
                >
                    <QuantButton onClick={() => setUploading(true)}>
                        <Paperclip size={15} />
                        上传第一个附件
                    </QuantButton>
                </QuantEmpty>
            )}
            {uploading && (
                <AttachmentUpload
                    entry={entry}
                    collection={collection}
                    controller={controller}
                    register={register}
                    close={() => request(() => setUploading(false))}
                    saved={() => setUploading(false)}
                />
            )}
            <ConfirmationModal
                isOpen={!!removing}
                title="移除附件关联？"
                description="仅移除这个研究条目中的关联，原始文件继续保留在资源库中。"
                onClose={() => setRemoving(null)}
                isLoading={controller.busy}
                onConfirm={async () => {
                    if (removing && (await controller.safe(() => quantApi.detach(collection, entry.id, removing.id))))
                        setRemoving(null);
                }}
            />
            {preview && (
                <QuantModal title={preview.name} close={() => setPreview(null)} wide>
                    <AuthenticatedResourceImage
                        resourceId={preview.assetId}
                        alt={preview.name}
                        className="max-h-[65dvh] w-full object-contain"
                    />
                    <div className="flex justify-end">
                        <QuantButton disabled={controller.busy} onClick={() => void download(preview)}>
                            <Download size={15} />
                            下载原图
                        </QuantButton>
                    </div>
                </QuantModal>
            )}
        </div>
    );
}

function AttachmentUpload({
    entry,
    collection,
    controller,
    register,
    close,
    saved,
}: {
    entry: QuantEntryDetail;
    collection: string;
    controller: QuantController;
    register: QuantRegisterDraft;
    close: () => void;
    saved: () => void;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [implementationId, setImplementationId] = useState('');
    const [versionId, setVersionId] = useState('');
    const [backtestId, setBacktestId] = useState('');
    const [assetId, setAssetId] = useState('');
    const save = useCallback(async () => {
        if (!file) {
            controller.setError('请先选择附件文件');
            return false;
        }
        const ok = await controller.safe(async () => {
            let id = assetId;
            if (!id) {
                const uploaded = await uploadResource(file, 'quant');
                id = uploaded.id;
                setAssetId(id);
            }
            await quantApi.attach(collection, entry.id, {
                assetId: id,
                ...(implementationId ? { implementationId } : {}),
                ...(versionId ? { versionId } : {}),
                ...(backtestId ? { backtestId } : {}),
            });
        });
        if (ok) saved();
        return ok;
    }, [file, assetId, implementationId, versionId, backtestId, controller, collection, entry.id, saved]);
    useQuantDraftRegistration('attachment-upload', !!file, save, register, () => {
        setFile(null);
        setAssetId('');
    });
    const implementation = entry.implementations.find((item) => item.id === implementationId);
    return (
        <QuantModal title="上传研究附件" close={close} busy={controller.busy}>
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/30 px-5 py-8 text-center">
                <span className="rounded-full bg-orange-100 p-3 text-orange-500">
                    <Upload size={22} />
                </span>
                <span className="text-sm font-semibold text-slate-700">
                    {file ? file.name : '选择脚本、报告或图片'}
                </span>
                <span className="text-xs text-slate-400">保留文件原件；Notebook、CSV 与第三方报告不自动解析</span>
                <input
                    aria-label="选择附件文件"
                    type="file"
                    disabled={controller.busy}
                    className={`${inputClass} max-w-sm text-xs`}
                    accept=".py,.pine,.mq4,.mqh,.mq5,.ipynb,.txt,.md,.csv,.tsv,.json,.yaml,.yml,.html,.htm,.pdf,.png,.jpg,.jpeg,.webp,.gif,.zip"
                    onChange={(e) => {
                        setFile(e.target.files?.[0] || null);
                        setAssetId('');
                    }}
                />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold text-slate-700">
                    <span className="block">关联代码实现（可选）</span>
                    <Select
                        menuPortal
                        value={implementationId}
                        options={[
                            { value: '', label: '整个研究条目' },
                            ...entry.implementations.map((item) => ({ value: item.id, label: item.name })),
                        ]}
                        onChange={(value) => {
                            setImplementationId(value);
                            setVersionId('');
                        }}
                    />
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-700">
                    <span className="block">关联代码版本（可选）</span>
                    <Select
                        menuPortal
                        value={versionId}
                        disabled={!implementationId}
                        options={[
                            { value: '', label: '不指定版本' },
                            ...(implementation?.versions || []).map((version) => ({
                                value: version.id,
                                label: versionLabel(implementation!, version),
                            })),
                        ]}
                        onChange={setVersionId}
                    />
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-700 sm:col-span-2">
                    <span className="block">关联回测（可选）</span>
                    <Select
                        menuPortal
                        value={backtestId}
                        options={[
                            { value: '', label: '不指定回测' },
                            ...entry.backtests.map((item) => ({ value: item.id, label: item.name })),
                        ]}
                        onChange={setBacktestId}
                    />
                </label>
            </div>
            {assetId && <p className="text-xs text-orange-600">文件已上传，重试将继续建立关联，不重复上传。</p>}
            <div className="flex justify-end gap-3">
                <QuantButton disabled={controller.busy} onClick={close}>
                    取消
                </QuantButton>
                <QuantButton primary disabled={controller.busy || !file} onClick={() => void save()}>
                    <Plus size={15} />
                    {controller.busy ? '上传并关联中…' : '上传并关联'}
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
