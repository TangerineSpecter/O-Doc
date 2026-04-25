import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Upload, X } from 'lucide-react';
import { uploadResource } from '../../api/resources';
import { createImage, Image, updateImage } from '../../api/image';
import { useToast } from '../common/ToastProvider';

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  collId: string;
  onSuccess: () => void;
  initialData?: Image | null;
}

export default function ImageUploadModal({
  isOpen,
  onClose,
  collId,
  onSuccess,
  initialData
}: ImageUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [shootingTime, setShootingTime] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const isEditing = Boolean(initialData);

  const toDateTimeLocalValue = (value?: string) => {
    if (!value) return '';
    return value.replace(' ', 'T').slice(0, 16);
  };

  const resetForm = () => {
    setFile(null);
    setPreview('');
    setTitle('');
    setDescription('');
    setShootingTime('');
    setLocation('');
    setTags('');
  };

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setFile(null);
      setPreview(initialData.imageUrl || '');
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      setShootingTime(toDateTimeLocalValue(initialData.shootingTime));
      setLocation(initialData.location || '');
      setTags(initialData.tags || initialData.tagsList?.join(', ') || '');
    } else {
      resetForm();
    }
  }, [isOpen, initialData]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('图片大小不能超过 10MB');
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreview(event.target?.result as string);
    };
    reader.readAsDataURL(selectedFile);

    if (!title.trim()) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile || !droppedFile.type.startsWith('image/')) {
      toast.error('请拖拽图片文件');
      return;
    }
    if (droppedFile.size > 10 * 1024 * 1024) {
      toast.error('图片大小不能超过 10MB');
      return;
    }

    setFile(droppedFile);
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreview(event.target?.result as string);
    };
    reader.readAsDataURL(droppedFile);

    if (!title.trim()) {
      setTitle(droppedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleSubmit = async () => {
    if (!file && !isEditing) {
      toast.error('请选择图片');
      return;
    }
    if (!title.trim()) {
      toast.error('请输入标题');
      return;
    }

    try {
      setIsUploading(true);

      let imageUrl = initialData?.imageUrl;
      if (file) {
        const uploadResponse = await uploadResource(file, 'image');
        imageUrl = `/api/resource/view/${uploadResponse.id}`;
      }

      if (isEditing && initialData) {
        await updateImage(initialData.imageId, {
          title: title.trim(),
          description: description.trim(),
          imageUrl,
          shootingTime: shootingTime || undefined,
          location: location.trim(),
          tags: tags.trim(),
        });
      } else {
        await createImage({
          title: title.trim(),
          description: description.trim(),
          imageUrl: imageUrl || '',
          collId,
          shootingTime: shootingTime || undefined,
          location: location.trim(),
          tags: tags.trim(),
        });
      }

      toast.success(isEditing ? '图片已更新' : '图片上传成功');
      onSuccess();
      handleClose();
    } catch (error) {
      console.error(isEditing ? '更新失败:' : '上传失败:', error);
      toast.error(isEditing ? '更新失败，请重试' : '上传失败，请重试');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={() => !isUploading && handleClose()}
      />
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-lg font-bold text-slate-800">
            {isEditing ? '编辑图片' : '上传图片'}
          </h3>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="p-1 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200
              ${preview ? 'border-orange-300 bg-orange-50/50' : 'border-slate-300 hover:border-orange-400 hover:bg-orange-50/30'}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {preview ? (
              <div className="p-3">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-48 object-contain rounded-lg"
                />
                <p className="text-center text-xs text-slate-500 mt-3">
                  点击或拖拽{isEditing ? '替换' : '更换'}图片
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-6">
                <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-700 mb-1">
                  点击上传或拖拽图片
                </p>
                <p className="text-xs text-slate-500">
                  支持 JPG、PNG，最大 10MB
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">
              图片标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              disabled={isUploading}
              placeholder="请输入图片标题"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">
              描述说明
            </label>
            <textarea
              disabled={isUploading}
              rows={2}
              placeholder="请输入图片描述（可选）"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                拍摄时间
              </label>
              <input
                type="datetime-local"
                disabled={isUploading}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                value={shootingTime}
                onChange={(e) => setShootingTime(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                拍摄地点
              </label>
              <input
                type="text"
                disabled={isUploading}
                placeholder="如：北京"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">
              标签
            </label>
            <input
              type="text"
              disabled={isUploading}
              placeholder="多个标签用逗号分隔"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={isUploading || (!file && !isEditing) || !title.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {isEditing ? '保存中...' : '上传中...'}</>
            ) : (
              <><Plus className="w-4 h-4" /> {isEditing ? '保存修改' : '上传图片'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
