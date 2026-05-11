import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { Calendar, ChevronLeft, ChevronRight, Loader2, Plus, Upload, X } from 'lucide-react';
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

const COUNTRY_OPTIONS = [
  '中国',
  '日本',
  '韩国',
  '泰国',
  '新加坡',
  '马来西亚',
  '印度尼西亚',
  '越南',
  '阿联酋',
  '土耳其',
  '英国',
  '法国',
  '意大利',
  '西班牙',
  '德国',
  '荷兰',
  '瑞士',
  '奥地利',
  '捷克',
  '希腊',
  '冰岛',
  '美国',
  '加拿大',
  '墨西哥',
  '巴西',
  '阿根廷',
  '澳大利亚',
  '新西兰',
  '埃及',
  '摩洛哥',
  '南非'
];

const CITY_OPTIONS = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '成都',
  '杭州',
  '西安',
  '香港',
  '澳门',
  '台北',
  '东京',
  '京都',
  '大阪',
  '首尔',
  '曼谷',
  '新加坡',
  '吉隆坡',
  '巴厘岛',
  '河内',
  '胡志明市',
  '迪拜',
  '伊斯坦布尔',
  '伦敦',
  '巴黎',
  '罗马',
  '威尼斯',
  '巴塞罗那',
  '柏林',
  '阿姆斯特丹',
  '苏黎世',
  '维也纳',
  '布拉格',
  '雅典',
  '雷克雅未克',
  '纽约',
  '洛杉矶',
  '旧金山',
  '西雅图',
  '芝加哥',
  '迈阿密',
  '多伦多',
  '温哥华',
  '墨西哥城',
  '里约热内卢',
  '布宜诺斯艾利斯',
  '悉尼',
  '墨尔本',
  '奥克兰',
  '开罗',
  '马拉喀什',
  '开普敦'
];

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
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [focalLength, setFocalLength] = useState('');
  const [tags, setTags] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(dayjs());
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();
  const isEditing = Boolean(initialData);

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
    setFocalLength('');
    setTags('');
  };

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setFile(null);
      setPreview(initialData.imageUrl || '');
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      setShootingTime(toDateValue(initialData.shootingTime));
      setPickerMonth(initialData.shootingTime ? dayjs(toDateValue(initialData.shootingTime)) : dayjs());
      setCountry(initialData.country || '');
      setCity(initialData.city || '');
      setFocalLength(initialData.focalLength || '');
      setTags(initialData.tags || initialData.tagsList?.join(', ') || '');
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
          focalLength: focalLength.trim(),
          tags: tags.trim(),
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
          focalLength: focalLength.trim(),
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
        className="relative w-full max-w-lg max-h-[calc(100vh-2rem)] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <label className="text-sm font-semibold text-slate-700">
                拍摄地点
              </label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  list="image-country-options"
                  disabled={isUploading}
                  placeholder="国家"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
                <input
                  type="text"
                  list="image-city-options"
                  disabled={isUploading}
                  placeholder="城市"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <datalist id="image-country-options">
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              <datalist id="image-city-options">
                {CITY_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
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
