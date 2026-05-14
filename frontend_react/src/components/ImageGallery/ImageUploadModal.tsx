import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus, Sparkles, Tag, Upload, X } from 'lucide-react';
import { uploadResource } from '../../api/resources';
import { createImage, generateImageDescription, Image, updateImage } from '../../api/image';
import { AIConfigError, recommendImageTagsWithAI } from '../../api/ai';
import { GeoLocation, getGeoLocations } from '../../api/setting';
import { useToast } from '../common/ToastProvider';
import { SettingsSelect } from '../Settings/SettingsSelect';

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  collId: string;
  onSuccess: () => void;
  initialData?: Image | null;
  existingTags?: string[];
}

export default function ImageUploadModal({
  isOpen,
  onClose,
  collId,
  onSuccess,
  initialData,
  existingTags = []
}: ImageUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [shootingTime, setShootingTime] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [locationId, setLocationId] = useState('');
  const [locations, setLocations] = useState<GeoLocation[]>([]);
  const [focalLength, setFocalLength] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isTagMenuOpen, setIsTagMenuOpen] = useState(false);
  const [isRecommendingTags, setIsRecommendingTags] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(dayjs());
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const isEditing = Boolean(initialData);

  const normalizedExistingTags = useMemo(() => {
    return Array.from(new Set(existingTags.map(tag => tag.trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }, [existingTags]);

  const availableTagOptions = useMemo(() => {
    const selected = new Set(selectedTags.map(tag => tag.toLowerCase()));
    return normalizedExistingTags.filter(tag => !selected.has(tag.toLowerCase()));
  }, [normalizedExistingTags, selectedTags]);

  const parseTags = (value?: string | string[]) => {
    const source = Array.isArray(value) ? value : (value || '').split(/[,，、;；\n]/);
    return Array.from(new Set(source.map(tag => tag.trim()).filter(Boolean)));
  };

  const toDateValue = (value?: string) => {
    if (!value) return '';
    return value.replace(' ', 'T').slice(0, 10);
  };

  const formatDateLabel = (value: string) => {
    if (!value) return '';
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : value.replace('T', ' ').slice(0, 10);
  };

  const selectedDate = shootingTime ? dayjs(shootingTime) : null;
  const calendarStart = pickerMonth.startOf('month').startOf('week');
  const calendarDays = Array.from({ length: 42 }, (_, index) => calendarStart.add(index, 'day'));
  const countryOptions = useMemo(() => {
    const countries = Array.from(new Set(locations.map(location => location.country))).sort((a, b) => a.localeCompare(b));
    return countries.map(value => ({ value, label: value }));
  }, [locations]);
  const cityOptions = useMemo(() => {
    return locations
      .filter(location => location.country === country)
      .sort((a, b) => a.city.localeCompare(b.city))
      .map(location => ({
        value: location.id,
        label: location.city,
      }));
  }, [country, locations]);

  const updateDatePickerPosition = () => {
    const button = dateButtonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const panelWidth = 320;
    const panelHeight = 296;
    const margin = 16;
    const left = Math.min(
      Math.max(rect.left, margin),
      window.innerWidth - panelWidth - margin
    );
    const belowTop = rect.bottom + 8;
    const top = belowTop + panelHeight > window.innerHeight - margin
      ? Math.max(margin, rect.top - panelHeight - 8)
      : belowTop;

    setPickerPosition({ top, left });
  };

  const toggleDatePicker = () => {
    if (!isDatePickerOpen) {
      updateDatePickerPosition();
    }
    setIsDatePickerOpen((open) => !open);
  };

  const updateSelectedDate = (date: dayjs.Dayjs) => {
    setShootingTime(date.format('YYYY-MM-DD'));
  };

  const updateFocalLength = (value: string) => {
    setFocalLength(value.replace(/\D/g, ''));
  };

  const resetForm = () => {
    setFile(null);
    setPreview('');
    setTitle('');
    setDescription('');
    setShootingTime('');
    setCountry('');
    setCity('');
    setLocationId('');
    setFocalLength('');
    setSelectedTags([]);
    setTagInput('');
    setIsTagMenuOpen(false);
    setIsGeneratingDescription(false);
  };

  const addTag = (value: string) => {
    const tag = value.trim();
    if (!tag) return;

    setSelectedTags((current) => {
      if (current.some(item => item.toLowerCase() === tag.toLowerCase())) return current;
      return [...current, tag];
    });
    setTagInput('');
    setIsTagMenuOpen(false);
  };

  const removeTag = (tag: string) => {
    setSelectedTags((current) => current.filter(item => item !== tag));
  };

  const addTags = (values: string[]) => {
    const nextTags = parseTags(values);
    if (nextTags.length === 0) return;

    setSelectedTags((current) => {
      const seen = new Set(current.map(tag => tag.toLowerCase()));
      const additions = nextTags.filter(tag => !seen.has(tag.toLowerCase()));
      return additions.length > 0 ? [...current, ...additions] : current;
    });
  };

  const handleTagInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault();
      addTag(tagInput);
    }

    if (event.key === 'Backspace' && !tagInput && selectedTags.length > 0) {
      removeTag(selectedTags[selectedTags.length - 1]);
    }
  };

  const handleRecommendTags = async () => {
    if (normalizedExistingTags.length === 0) {
      toast.info('当前文集还没有可用于推荐的标签');
      return;
    }

    try {
      setIsRecommendingTags(true);
      const recommendedTags = await recommendImageTagsWithAI(title, description, normalizedExistingTags);
      const usableTags = recommendedTags.filter(tag => !selectedTags.some(item => item.toLowerCase() === tag.toLowerCase()));

      if (usableTags.length === 0) {
        toast.info('无可推荐标签');
        return;
      }

      addTags(usableTags);
      toast.success(`已推荐 ${usableTags.length} 个标签`);
    } catch (error) {
      if (error instanceof AIConfigError) {
        toast.error(error.message);
        return;
      }
      console.error('AI 推荐标签失败:', error);
      toast.error('AI 推荐标签失败');
    } finally {
      setIsRecommendingTags(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (!preview) {
      toast.info('请先选择图片');
      return;
    }

    try {
      setIsGeneratingDescription(true);
      const result = await generateImageDescription({
        title: title.trim(),
        country: country.trim(),
        city: city.trim(),
        imageUrl: file ? undefined : preview,
        imageFile: file || undefined,
      });

      const nextDescription = result.description?.trim();
      if (!nextDescription) {
        toast.info('AI 暂未生成描述');
        return;
      }

      setDescription(nextDescription);
      toast.success('描述说明已生成');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('No default image model configured')) {
        toast.error('未配置图像模型，请先在系统设置中配置');
        return;
      }
      console.error('AI 生成图片描述失败:', error);
      toast.error('AI 生成描述失败');
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    getGeoLocations()
      .then(setLocations)
      .catch((error) => {
        console.error('加载地理位置失败:', error);
        toast.error('加载地理位置失败');
      });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      const initialLocationId = initialData.locationId || initialData.location || initialData.locationDetail?.id || '';
      setFile(null);
      setPreview(initialData.imageUrl || '');
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      setShootingTime(toDateValue(initialData.shootingTime));
      setPickerMonth(initialData.shootingTime ? dayjs(toDateValue(initialData.shootingTime)) : dayjs());
      setCountry(initialData.country || '');
      setCity(initialData.city || '');
      setLocationId(initialLocationId);
      setFocalLength(initialData.focalLength || '');
      setSelectedTags(parseTags(initialData.tagsList?.length ? initialData.tagsList : initialData.tags));
      setTagInput('');
    } else {
      resetForm();
      setPickerMonth(dayjs());
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    if (!isDatePickerOpen) return;

    updateDatePickerPosition();
    window.addEventListener('resize', updateDatePickerPosition);
    window.addEventListener('scroll', updateDatePickerPosition, true);

    return () => {
      window.removeEventListener('resize', updateDatePickerPosition);
      window.removeEventListener('scroll', updateDatePickerPosition, true);
    };
  }, [isDatePickerOpen]);

  useEffect(() => {
    if (!isTagMenuOpen) return;

    const closeOnOutside = (event: MouseEvent) => {
      if (!tagMenuRef.current?.contains(event.target as Node)) {
        setIsTagMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [isTagMenuOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isDatePickerOpen) {
        setIsDatePickerOpen(false);
        return;
      }
      if (!isUploading) {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDatePickerOpen, isUploading]);

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
          country: country.trim(),
          city: city.trim(),
          locationId,
          focalLength: focalLength.trim(),
          tags: selectedTags.join(', '),
        });
      } else {
        await createImage({
          title: title.trim(),
          description: description.trim(),
          imageUrl: imageUrl || '',
          collId,
          shootingTime: shootingTime || undefined,
          country: country.trim(),
          city: city.trim(),
          locationId,
          focalLength: focalLength.trim(),
          tags: selectedTags.join(', '),
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
        className="relative w-full max-w-3xl max-h-[calc(100vh-2rem)] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
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

        <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-5">
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
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-semibold text-slate-700">
                描述说明
              </label>
              <button
                type="button"
                disabled={isUploading || isGeneratingDescription || !preview}
                onClick={handleGenerateDescription}
                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGeneratingDescription ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                AI 生成
              </button>
            </div>
            <textarea
              disabled={isUploading || isGeneratingDescription}
              rows={3}
              placeholder="请输入图片描述（可选）"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                拍摄日期
              </label>
              <button
                ref={dateButtonRef}
                type="button"
                disabled={isUploading}
                onClick={toggleDatePicker}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm flex items-center justify-between gap-2 disabled:opacity-60"
              >
                <span className={shootingTime ? 'text-slate-800' : 'text-slate-400'}>
                  {shootingTime ? formatDateLabel(shootingTime) : '选择拍摄日期'}
                </span>
                <Calendar className="w-4 h-4 text-orange-500" />
              </button>

              {isDatePickerOpen && createPortal(
                <div
                  className="fixed z-[140] w-80 rounded-xl border border-slate-200 bg-white shadow-2xl p-3"
                  style={{ top: pickerPosition.top, left: pickerPosition.left }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-3">
                    <button
                      type="button"
                      onClick={() => setPickerMonth((month) => month.subtract(1, 'month'))}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-orange-600"
                      aria-label="上个月"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="text-sm font-semibold text-slate-800">
                      {pickerMonth.format('YYYY 年 MM 月')}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPickerMonth((month) => month.add(1, 'month'))}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-orange-600"
                      aria-label="下个月"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400 mb-1">
                    {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((date) => {
                      const isCurrentMonth = date.month() === pickerMonth.month();
                      const isSelected = selectedDate?.isValid() && date.isSame(selectedDate, 'day');
                      const isToday = date.isSame(dayjs(), 'day');

                      return (
                        <button
                          key={date.format('YYYY-MM-DD')}
                          type="button"
                          onClick={() => updateSelectedDate(date)}
                          className={`
                            h-8 rounded-lg text-xs font-medium transition-colors
                            ${isSelected ? 'bg-orange-500 text-white shadow-sm' : 'hover:bg-orange-50 hover:text-orange-600'}
                            ${!isSelected && isToday ? 'text-orange-600 ring-1 ring-orange-200' : ''}
                            ${!isSelected && !isToday && isCurrentMonth ? 'text-slate-700' : ''}
                            ${!isCurrentMonth ? 'text-slate-300' : ''}
                          `}
                        >
                          {date.date()}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setShootingTime('');
                        setIsDatePickerOpen(false);
                      }}
                      className="text-xs font-medium text-slate-500 hover:text-red-600"
                    >
                      清除
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!shootingTime) {
                          updateSelectedDate(dayjs());
                        }
                        setIsDatePickerOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-medium hover:bg-orange-600"
                    >
                      完成
                    </button>
                  </div>
                </div>,
                document.body
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">拍摄地点</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SettingsSelect
                  value={country}
                  options={countryOptions}
                  onChange={(value) => {
                    setCountry(value);
                    setCity('');
                    setLocationId('');
                  }}
                  placeholder="选择国家"
                  emptyMessage="请先在系统设置中添加地点"
                  buttonClassName="min-h-10 text-sm"
                  menuClassName="min-w-56"
                />
                <SettingsSelect
                  value={locationId}
                  options={cityOptions}
                  onChange={(value) => {
                    const location = locations.find(item => item.id === value);
                    setLocationId(value);
                    setCity(location?.city || '');
                    setCountry(location?.country || country);
                  }}
                  placeholder="选择城市"
                  emptyMessage={country ? '该国家暂无城市' : '请先选择国家'}
                  buttonClassName="min-h-10 text-sm"
                  menuClassName="min-w-64"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">
              焦段
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              disabled={isUploading}
              placeholder="例如 35"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
              value={focalLength}
              onChange={(e) => updateFocalLength(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-semibold text-slate-700">
                标签
              </label>
              <button
                type="button"
                disabled={isUploading || isRecommendingTags}
                onClick={handleRecommendTags}
                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRecommendingTags ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                AI 推荐
              </button>
            </div>

            <div ref={tagMenuRef} className="relative">
              <div className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm transition-all focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20">
                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex max-w-full items-center gap-1 rounded-md border border-orange-100 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700"
                    >
                      <Tag className="h-3 w-3 shrink-0 opacity-70" />
                      <span className="truncate">{tag}</span>
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => removeTag(tag)}
                        className="rounded-full text-orange-400 hover:text-orange-800 disabled:cursor-not-allowed"
                        aria-label={`移除 ${tag}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}

                  <input
                    type="text"
                    disabled={isUploading}
                    placeholder={selectedTags.length > 0 ? '继续添加标签' : '输入自定义标签'}
                    className="min-w-[140px] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-slate-700 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    onFocus={() => setIsTagMenuOpen(true)}
                  />

                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => setIsTagMenuOpen(open => !open)}
                    className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="选择已有标签"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${isTagMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {tagInput.trim() && (
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => addTag(tagInput)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-3.5 w-3.5" />
                  添加“{tagInput.trim()}”
                </button>
              )}

              {isTagMenuOpen && (
                <div className="absolute z-30 mt-2 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-black/5">
                  {availableTagOptions.length > 0 ? availableTagOptions.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addTag(tag)}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-orange-50 hover:text-orange-700"
                    >
                      <Tag className="h-3.5 w-3.5 text-orange-400" />
                      <span className="min-w-0 truncate">{tag}</span>
                    </button>
                  )) : (
                    <div className="flex min-h-16 items-center justify-center rounded-md px-3 py-4 text-center text-xs leading-5 text-slate-400">
                      当前文集暂无可选标签
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
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
