import { useState } from 'react';
import {
    Download,
    Trash2,
    Image as ImageIcon,
    FileArchive,
    FileText,
    FileCode,
    File,
    UploadCloud,
    Loader2,
} from 'lucide-react';
import { downloadResource, uploadResource } from '../../api/resources';
import { mt4Api } from '../../api/mt4Archive';
import type { MT4Attachment } from '../../types/api/mt4Archive';
import { downloadQuantBlob } from '../../utils/quant';

function getFileIcon(filename: string, fileType: string) {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.zip') || lower.endsWith('.rar') || lower.endsWith('.7z')) {
        return <FileArchive className="text-amber-500" size={18} />;
    }
    if (
        lower.endsWith('.png') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.gif') ||
        fileType === 'image'
    ) {
        return <ImageIcon className="text-emerald-500" size={18} />;
    }
    if (lower.endsWith('.htm') || lower.endsWith('.html')) {
        return <FileCode className="text-blue-500" size={18} />;
    }
    if (lower.endsWith('.txt') || lower.endsWith('.csv') || lower.endsWith('.set')) {
        return <FileText className="text-slate-500" size={18} />;
    }
    return <File className="text-slate-400" size={18} />;
}

function getRoleBadge(role: string) {
    switch (role) {
        case 'report':
            return <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">报告源文件</span>;
        case 'chart':
            return <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">报告原图</span>;
        case 'screenshot':
            return <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[11px] font-medium text-purple-700">截图识别</span>;
        default:
            return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">附件资源</span>;
    }
}

export function Attachments({
    collection,
    expertId,
    testId,
    attachments,
    reload,
    imageOnly = false,
}: {
    collection: string;
    expertId: string;
    testId: string | null;
    attachments: MT4Attachment[];
    reload: () => Promise<void>;
    imageOnly?: boolean;
}) {
    const [busyId, setBusyId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    const handleUpload = async (file: File) => {
        setUploading(true);
        setError('');
        try {
            const asset = await uploadResource(file, 'quant');
            await mt4Api.attach(collection, expertId, testId, asset.id, imageOnly ? 'chart' : 'attachment');
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : '上传失败，请重试');
        } finally {
            setUploading(false);
        }
    };

    const handleDownload = async (item: MT4Attachment) => {
        setBusyId(item.id);
        setError('');
        try {
            const blob = await downloadResource(item.assetId);
            downloadQuantBlob(blob, item.name);
        } catch (e) {
            setError(e instanceof Error ? e.message : '下载失败');
        } finally {
            setBusyId(null);
        }
    };

    const handleRemove = async (item: MT4Attachment) => {
        if (!window.confirm(`确定要移除附件「${item.name}」吗？`)) return;
        setBusyId(item.id);
        setError('');
        try {
            await mt4Api.removeAttachment(collection, expertId, testId, item.id);
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : '移除失败');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-base font-bold text-slate-900">
                        {testId ? '报告与文件资产' : 'EA 资源文件'}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                        {testId
                            ? '包含导入的原始回测报告压缩包、曲线图及补充截图'
                            : '存放该 EA 的相关源码、配置模板与参考资料'}
                    </p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300">
                    {uploading ? (
                        <Loader2 className="animate-spin text-orange-500" size={14} />
                    ) : (
                        <UploadCloud className="text-orange-500" size={14} />
                    )}
                    <span>{uploading ? '正在上传…' : imageOnly ? '补充图表' : '上传附件'}</span>
                    <input
                        type="file"
                        className="hidden"
                        disabled={uploading}
                        accept={imageOnly ? 'image/png,image/jpeg,image/gif,image/webp' : undefined}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) void handleUpload(file);
                        }}
                    />
                </label>
            </div>

            {attachments.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                    {attachments.map((item) => {
                        const isCurrentBusy = busyId === item.id;
                        return (
                            <div
                                key={item.id}
                                className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm transition hover:border-orange-200 hover:shadow"
                            >
                                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                                        {getFileIcon(item.name, item.fileType)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <p className="truncate text-xs font-semibold text-slate-800" title={item.name}>
                                                {item.name}
                                            </p>
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-2">
                                            {getRoleBadge(item.role)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <button
                                        type="button"
                                        title="下载附件"
                                        disabled={isCurrentBusy}
                                        onClick={() => void handleDownload(item)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                                    >
                                        {isCurrentBusy ? (
                                            <Loader2 size={15} className="animate-spin text-orange-500" />
                                        ) : (
                                            <Download size={15} />
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        title="移除附件"
                                        disabled={isCurrentBusy}
                                        onClick={() => void handleRemove(item)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex h-24 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-400">
                    <p>暂无相关附件文件</p>
                </div>
            )}

            {error && (
                <p role="alert" className="text-xs text-rose-600">
                    {error}
                </p>
            )}
        </div>
    );
}
