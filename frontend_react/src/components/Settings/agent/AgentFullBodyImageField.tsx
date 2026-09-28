import {useEffect, useState} from 'react';
import {ImagePlus, Upload, X} from 'lucide-react';
import {useAgentAvatarUpload} from './useAgentAvatarUpload';

interface Props {
    value: string;
    onChange: (value: string) => void;
    onUploadingChange: (uploading: boolean) => void;
}

export const AgentFullBodyImageField = ({value, onChange, onUploadingChange}: Props) => {
    const {avatarInputRef, avatarPreviewUrl, avatarUploading, clearAvatarPreview, handleAvatarUpload} =
        useAgentAvatarUpload(onChange, '全身形象参考图');
    const [failedUrl, setFailedUrl] = useState('');
    const imageUrl = avatarPreviewUrl || value;

    useEffect(() => {
        onUploadingChange(avatarUploading);
        return () => onUploadingChange(false);
    }, [avatarUploading, onUploadingChange]);

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
                <ImagePlus className="h-4 w-4 text-orange-500"/>
                <h4 className="text-sm font-semibold text-slate-700">全身形象参考图</h4>
                <span className="text-xs text-slate-400">可选</span>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex h-48 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50 sm:w-32">
                    {imageUrl && failedUrl !== imageUrl ? (
                        <img src={imageUrl} alt="Agent 全身形象参考图" className="h-full w-full object-contain"
                            onError={() => setFailedUrl(imageUrl)}/>
                    ) : (
                        <span className="px-3 text-center text-xs text-slate-400">{imageUrl ? '图片暂时无法预览' : '尚未配置参考图'}</span>
                    )}
                </div>
                <div className="flex-1 space-y-3">
                    <p className="text-xs leading-5 text-slate-500">上传同一角色的清晰全身立绘，用于补充服装、体型和配饰。也支持含全身角色的设定拆解图；优先选择背景简单、角色无遮挡的图片。</p>
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
                        aria-label="上传全身形象参考图" disabled={avatarUploading}
                        onChange={event => handleAvatarUpload(event.target.files?.[0])}/>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={avatarUploading} onClick={() => avatarInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-600 hover:bg-orange-100 disabled:opacity-60">
                            <Upload className="h-3.5 w-3.5"/>{avatarUploading ? '上传中…' : value ? '更换参考图' : '上传参考图'}
                        </button>
                        {value && <button type="button" disabled={avatarUploading} onClick={() => {clearAvatarPreview(); onChange('');}}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-60">
                            <X className="h-3.5 w-3.5"/>移除
                        </button>}
                    </div>
                    <p className="text-[11px] leading-5 text-slate-400">保存后随 Agent 配置同步。当前用于保存形象参考，旅行自拍技能接入后可使用。</p>
                </div>
            </div>
        </section>
    );
};
