import React, {useEffect, useState} from 'react';
import {Camera, ImagePlus, Loader2, Upload, UploadCloud, X} from 'lucide-react';
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
    const [isDragging, setIsDragging] = useState(false);
    const imageUrl = avatarPreviewUrl || value;

    useEffect(() => {
        onUploadingChange(avatarUploading);
        return () => onUploadingChange(false);
    }, [avatarUploading, onUploadingChange]);

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (avatarUploading) return;
        setIsDragging(true);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (avatarUploading) return;
        e.dataTransfer.dropEffect = 'copy';
        if (!isDragging) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setIsDragging(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (avatarUploading) return;

        const file = e.dataTransfer.files?.[0];
        if (file) {
            handleAvatarUpload(file);
        }
    };

    const handleClickUpload = () => {
        if (!avatarUploading) {
            avatarInputRef.current?.click();
        }
    };

    return (
        <section
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-2xl border transition-all duration-200 bg-white p-4 shadow-sm ${
                isDragging
                    ? 'border-orange-400 bg-orange-50/50 ring-2 ring-orange-200'
                    : 'border-slate-200'
            }`}
        >
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ImagePlus className="h-4 w-4 text-orange-500"/>
                    <h4 className="text-sm font-semibold text-slate-700">全身形象参考图</h4>
                    <span className="text-xs text-slate-400">可选</span>
                </div>
                {isDragging && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 animate-in fade-in">
                        <UploadCloud className="h-3.5 w-3.5 animate-bounce"/>
                        释放鼠标立即上传参考图
                    </span>
                )}
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
                {/* 预览图框：支持点击和拖拽 */}
                <div
                    role="button"
                    tabIndex={0}
                    aria-label="上传或更换全身形象参考图"
                    onClick={handleClickUpload}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleClickUpload();
                        }
                    }}
                    className={`group relative flex h-48 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border select-none cursor-pointer transition-all duration-200 sm:w-32 focus:outline-none focus:ring-2 focus:ring-orange-500/40 ${
                        isDragging
                            ? 'border-dashed border-orange-400 bg-orange-100/50 scale-[1.02]'
                            : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                    }`}
                >
                    {imageUrl && failedUrl !== imageUrl ? (
                        <img
                            src={imageUrl}
                            alt="Agent 全身形象参考图"
                            className="h-full w-full object-contain"
                            onError={() => setFailedUrl(imageUrl)}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center px-3 text-center">
                            <Upload className="h-5 w-5 text-slate-300 mb-1" />
                            <span className="text-xs text-slate-400">{imageUrl ? '图片暂时无法预览' : '点击或拖入立绘'}</span>
                        </div>
                    )}

                    {/* 状态遮罩 */}
                    {avatarUploading ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/60 text-white backdrop-blur-[2px] animate-in fade-in duration-150">
                            <Loader2 className="w-5 h-5 animate-spin text-white mb-1" />
                            <span className="text-[11px] font-medium text-white/90">上传中…</span>
                        </div>
                    ) : isDragging ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-orange-500/85 text-white shadow-lg animate-in fade-in duration-150">
                            <UploadCloud className="w-6 h-6 text-white animate-bounce mb-1" />
                            <span className="text-xs font-semibold text-white">松开上传</span>
                        </div>
                    ) : (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/35 text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                            <Camera className="w-5 h-5 text-white/90 mb-1" />
                            <span className="text-[10px] font-medium text-white/90">{imageUrl ? '更换参考图' : '上传参考图'}</span>
                        </div>
                    )}
                </div>

                <div className="flex-1 space-y-3">
                    <p className="text-xs leading-5 text-slate-500">上传同一角色的清晰全身立绘，用于补充服装、体型和配饰。也支持含全身角色的设定拆解图；优先选择背景简单、角色无遮挡的图片。</p>
                    <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        aria-label="上传全身形象参考图"
                        disabled={avatarUploading}
                        onChange={event => handleAvatarUpload(event.target.files?.[0])}
                    />
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={avatarUploading}
                            onClick={handleClickUpload}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-600 hover:bg-orange-100 disabled:opacity-60"
                        >
                            <Upload className="h-3.5 w-3.5"/>
                            {avatarUploading ? '上传中…' : value ? '更换参考图' : '上传参考图'}
                        </button>
                        {value && (
                            <button
                                type="button"
                                disabled={avatarUploading}
                                onClick={() => {
                                    clearAvatarPreview();
                                    onChange('');
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                            >
                                <X className="h-3.5 w-3.5"/>
                                移除
                            </button>
                        )}
                    </div>
                    <p className="text-[11px] leading-5 text-slate-400">
                        {isDragging ? '拖拽至任意卡片区域即可上传。' : '支持点击或拖拽图片到框内上传。保存后随 Agent 配置同步。'}
                    </p>
                </div>
            </div>
        </section>
    );
};
