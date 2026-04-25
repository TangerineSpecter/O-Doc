import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { Calendar, ChevronLeft, ChevronRight, Clock, Loader2, Plus, Upload, X } from 'lucide-react';
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

const LOCATION_OPTIONS = [
  '中国 北京',
  '中国 上海',
  '中国 广州',
  '中国 深圳',
  '中国 成都',
  '中国 杭州',
  '中国 西安',
  '中国 香港',
  '中国 澳门',
  '中国 台北',
  '日本 东京',
  '日本 京都',
  '日本 大阪',
  '韩国 首尔',
  '泰国 曼谷',
  '新加坡 新加坡',
  '马来西亚 吉隆坡',
  '印度尼西亚 巴厘岛',
  '越南 河内',
  '越南 胡志明市',
  '阿联酋 迪拜',
  '土耳其 伊斯坦布尔',
  '英国 伦敦',
  '法国 巴黎',
  '意大利 罗马',
  '意大利 威尼斯',
  '西班牙 巴塞罗那',
  '德国 柏林',
  '荷兰 阿姆斯特丹',
  '瑞士 苏黎世',
  '奥地利 维也纳',
  '捷克 布拉格',
  '希腊 雅典',
  '冰岛 雷克雅未克',
  '美国 纽约',
  '美国 洛杉矶',
  '美国 旧金山',
  '美国 西雅图',
  '美国 芝加哥',
  '美国 迈阿密',
  '加拿大 多伦多',
  '加拿大 温哥华',
  '墨西哥 墨西哥城',
  '巴西 里约热内卢',
  '阿根廷 布宜诺斯艾利斯',
  '澳大利亚 悉尼',
  '澳大利亚 墨尔本',
  '新西兰 奥克兰',
  '埃及 开罗',
  '摩洛哥 马拉喀什',
  '南非 开普敦'
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
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(dayjs());
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();
  const isEditing = Boolean(initialData);

  const toDateTimeLocalValue = (value?: string) => {
    if (!value) return '';
    return value.replace(' ', 'T').slice(0, 16);
  };

  const formatDateTimeLabel = (value: string) => {
    if (!value) return '';
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : value.replace('T', ' ');
  };

  const selectedDate = shootingTime ? dayjs(shootingTime) : null;
  const selectedHour = selectedDate?.isValid() ? selectedDate.hour() : 9;
  const selectedMinute = selectedDate?.isValid() ? selectedDate.minute() : 0;
  const calendarStart = pickerMonth.startOf('month').startOf('week');
  const calendarDays = Array.from({ length: 42 }, (_, index) => calendarStart.add(index, 'day'));

  const updateDatePickerPosition = () => {
    const button = dateButtonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const panelWidth = 320;
    const panelHeight = 348;
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

  const updateSelectedDate = (date: dayjs.Dayjs, hour = selectedHour, minute = selectedMinute) => {
    setShootingTime(date.hour(hour).minute(minute).second(0).millisecond(0).format('YYYY-MM-DDTHH:mm'));
  };

  const updateSelectedTime = (hour: number, minute: number) => {
    const baseDate = selectedDate?.isValid() ? selectedDate : pickerMonth;
    updateSelectedDate(baseDate, hour, minute);
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
      setPickerMonth(initialData.shootingTime ? dayjs(toDateTimeLocalValue(initialData.shootingTime)) : dayjs());
      setLocation(initialData.location || '');
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
                拍摄时间
              </label>
              <button
                ref={dateButtonRef}
                type="button"
                disabled={isUploading}
                onClick={toggleDatePicker}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm flex items-center justify-between gap-2 disabled:opacity-60"
              >
                <span className={shootingTime ? 'text-slate-800' : 'text-slate-400'}>
                  {shootingTime ? formatDateTimeLabel(shootingTime) : '选择拍摄时间'}
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

                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-orange-500" />
                      时间
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedHour}
                        onChange={(e) => updateSelectedTime(Number(e.target.value), selectedMinute)}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:border-orange-500"
                      >
                        {Array.from({ length: 24 }, (_, hour) => (
                          <option key={hour} value={hour}>{String(hour).padStart(2, '0')}</option>
                        ))}
                      </select>
                      <span className="text-slate-400">:</span>
                      <select
                        value={selectedMinute}
                        onChange={(e) => updateSelectedTime(selectedHour, Number(e.target.value))}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:border-orange-500"
                      >
                        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((minute) => (
                          <option key={minute} value={minute}>{String(minute).padStart(2, '0')}</option>
                        ))}
                      </select>
                    </div>
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
              <input
                type="text"
                list="image-location-options"
                disabled={isUploading}
                placeholder="如：中国 北京"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <datalist id="image-location-options">
                {LOCATION_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
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
