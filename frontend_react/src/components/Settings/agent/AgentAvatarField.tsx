import React, {useState} from 'react';
import {Camera, Crop, ImagePlus, Loader2, Upload, UploadCloud, X} from 'lucide-react';
import {isImageAvatarValue} from '@/utils/avatar';
import {isImageUploadFile} from '@/utils/imageUpload';
import {useToast} from '../../common/ToastProvider';
import {AvatarCropModal} from '../../common/AvatarCropModal';

interface AgentAvatarFieldProps {
    name: string;
    avatar?: string;
    previewUrl?: string;
    uploading: boolean;
    inputRef: React.RefObject<HTMLInputElement | null>;
    onUpload: (file?: File) => void;
    onRemove: () => void;
}

export const AgentAvatarField = ({
    name,
    avatar,
    previewUrl,
    uploading,
    inputRef,
    onUpload,
    onRemove,
}: AgentAvatarFieldProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const [cropModalOpen, setCropModalOpen] = useState(false);
    const [selectedFileForCrop, setSelectedFileForCrop] = useState<File | null>(null);
    const [selectedUrlForCrop, setSelectedUrlForCrop] = useState<string | null>(null);
    const toast = useToast();

    const displayAvatar = previewUrl || avatar;
    const initialLetter = name?.trim().slice(0, 1).toUpperCase() || 'A';
    const isImage = isImageAvatarValue(displayAvatar);

    const handleInitiateCropWithFile = (file: File) => {
        if (!isImageUploadFile(file)) {
            toast.warning('请选择图片文件作为头像');
            return;
        }
        setSelectedFileForCrop(file);
        setSelectedUrlForCrop(null);
        setCropModalOpen(true);
    };

    const handleInitiateCropWithCurrentAvatar = () => {
        if (!displayAvatar) return;
        setSelectedFileForCrop(null);
        setSelectedUrlForCrop(displayAvatar);
        setCropModalOpen(true);
    };

    const handleCropConfirm = (croppedFile: File) => {
        onUpload(croppedFile);
        setCropModalOpen(false);
        setSelectedFileForCrop(null);
        setSelectedUrlForCrop(null);
    };

    const handleCropClose = () => {
        setCropModalOpen(false);
        setSelectedFileForCrop(null);
        setSelectedUrlForCrop(null);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (uploading) return;
        setIsDragging(true);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (uploading) return;
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
        if (uploading) return;

        const file = e.dataTransfer.files?.[0];
        if (!file) return;

        handleInitiateCropWithFile(file);
    };

    const handleClickUpload = () => {
        if (!uploading) {
            inputRef.current?.click();
        }
    };

    return (
        <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`group/dropzone relative flex flex-col items-center text-center p-4 rounded-2xl border-2 border-dashed transition-all duration-200 ${
                isDragging
                    ? 'border-orange-400 bg-orange-50/70 shadow-sm'
                    : 'border-transparent hover:border-slate-200/80 bg-slate-50/30'
            }`}
        >
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                aria-label="上传头像文件"
                onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) handleInitiateCropWithFile(file);
                }}
            />

            {/* 头像预览区域：支持点击与拖拽悬停反馈 */}
            <div
                role="button"
                tabIndex={0}
                aria-label="上传或更换头像"
                onClick={handleClickUpload}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleClickUpload();
                    }
                }}
                className={`group relative w-24 h-24 rounded-[1.35rem] overflow-hidden select-none cursor-pointer transition-all duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 ${
                    isDragging
                        ? 'scale-105 ring-4 ring-orange-400/50 shadow-md'
                        : 'hover:scale-[1.02] hover:shadow-md'
                }`}
            >
                {isImage ? (
                    <img
                        src={displayAvatar}
                        alt={name || 'Agent'}
                        className="w-full h-full object-cover border border-slate-200 bg-white"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-orange-50 text-orange-600 border border-orange-100 font-bold text-3xl">
                        {initialLetter}
                    </div>
                )}

                {/* 悬停与拖拽遮罩反馈 */}
                {uploading ? (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/60 text-white backdrop-blur-[2px] animate-in fade-in duration-150">
                        <Loader2 className="w-6 h-6 animate-spin text-white mb-1" />
                        <span className="text-[11px] font-medium text-white/90">上传中…</span>
                    </div>
                ) : isDragging ? (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-orange-500/85 text-white shadow-lg animate-in fade-in duration-150">
                        <UploadCloud className="w-7 h-7 text-white animate-bounce mb-1" />
                        <span className="text-xs font-semibold text-white">松开上传</span>
                    </div>
                ) : (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/35 text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                        <Camera className="w-5 h-5 text-white/90 mb-1" />
                        <span className="text-[10px] font-medium text-white/90">{displayAvatar ? '更换头像' : '上传头像'}</span>
                    </div>
                )}
            </div>

            {/* 按钮操作区 */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                    type="button"
                    onClick={handleClickUpload}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:opacity-60"
                >
                    {uploading ? (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    ) : (
                        <Upload className="w-3.5 h-3.5" />
                    )}
                    {displayAvatar ? '更换头像' : '上传头像'}
                </button>
                {isImage && (
                    <button
                        type="button"
                        onClick={handleInitiateCropWithCurrentAvatar}
                        disabled={uploading}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 disabled:opacity-60"
                        title="重新调整头像框选范围"
                    >
                        <Crop className="w-3.5 h-3.5" />
                        裁切
                    </button>
                )}
                {displayAvatar && (
                    <button
                        type="button"
                        onClick={onRemove}
                        disabled={uploading}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-red-50 hover:border-red-100 hover:text-red-600 disabled:opacity-60"
                    >
                        <X className="w-3.5 h-3.5" />
                        移除
                    </button>
                )}
            </div>

            {/* 辅助提示 */}
            <div className="mt-2 flex items-center gap-1.5 text-[11px] transition-colors">
                {isDragging ? (
                    <>
                        <UploadCloud className="w-3.5 h-3.5 text-orange-500 animate-bounce" />
                        <span className="font-medium text-orange-600">释放鼠标进行头像裁切</span>
                    </>
                ) : (
                    <>
                        <ImagePlus className="w-3 h-3 text-slate-400" />
                        <span className="text-slate-400">支持拖拽或点击上传 · 可框选 1:1 方形头像范围</span>
                    </>
                )}
            </div>

            {/* 头像裁切弹窗 */}
            <AvatarCropModal
                isOpen={cropModalOpen}
                file={selectedFileForCrop}
                imageUrl={selectedUrlForCrop}
                onClose={handleCropClose}
                onConfirm={handleCropConfirm}
            />
        </div>
    );
};

