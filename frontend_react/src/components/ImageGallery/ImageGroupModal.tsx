import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { Aperture, Calendar, ChevronDown, ChevronLeft, ChevronRight, GripVertical, ImagePlus, Loader2, Plus, Sparkles, Tag, Trash2, X } from 'lucide-react';
import { createImageGroup, generateImageDescription, Image, updateImageGroup } from '../../api/image';
import { recommendImageTagsWithAI } from '../../api/ai';
import { uploadResource } from '../../api/resources';
import { GeoLocation, getGeoLocations } from '../../api/setting';
import { getImageUploadConfig, ImageUploadConfig } from '../../api/setting';
import { SettingsSelect } from '../Settings/SettingsSelect';
import { getImageDimensions, readPhotoExifMetadata } from './ImageUploadModal';
import { useToast } from '../common/ToastProvider';

interface DraftPhoto { id: string; imageId?: string; imageUrl: string; file?: File; focalLength: string; }
interface Props { isOpen: boolean; collId: string; initialImages?: Image[] | null; existingTags?: string[]; onClose: () => void; onSuccess: () => void; }

const newId = () => `draft-${Math.random().toString(36).slice(2)}`;
const DEFAULT_IMAGE_UPLOAD_CONFIG: ImageUploadConfig = { maxLongEdge: 2048, maxFileSizeMb: 10 };

export default function ImageGroupModal({ isOpen, collId, initialImages, existingTags = [], onClose, onSuccess }: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [shootingTime, setShootingTime] = useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(dayjs());
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [locationId, setLocationId] = useState('');
  const [locations, setLocations] = useState<GeoLocation[]>([]);
  const [imageUploadConfig, setImageUploadConfig] = useState<ImageUploadConfig>(DEFAULT_IMAGE_UPLOAD_CONFIG);
  const [tags, setTags] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [isTagMenuOpen, setIsTagMenuOpen] = useState(false);
  const [recommendingTags, setRecommendingTags] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<DraftPhoto | null>(null);
  const editing = Boolean(initialImages?.[0]?.photoGroupId);
  const selectedTags = useMemo(() => Array.from(new Set(tags.split(/[,，、;；\n]/).map(tag => tag.trim()).filter(Boolean))), [tags]);
  const availableTags = useMemo(() => Array.from(new Set(existingTags.map(tag => tag.trim()).filter(Boolean)))
    .filter(tag => !selectedTags.some(selected => selected.toLowerCase() === tag.toLowerCase())), [existingTags, selectedTags]);
  const countryOptions = useMemo(() => Array.from(new Set(locations.map(location => location.country))).sort((a, b) => a.localeCompare(b)).map(value => ({ value, label: value })), [locations]);
  const cityOptions = useMemo(() => locations.filter(location => location.country === country).sort((a, b) => a.city.localeCompare(b.city)).map(location => ({ value: location.id, label: location.city })), [country, locations]);
  const selectedDate = shootingTime ? dayjs(shootingTime) : null;
  const calendarStart = pickerMonth.startOf('month').startOf('week');
  const calendarDays = Array.from({ length: 42 }, (_, index) => calendarStart.add(index, 'day'));

  useEffect(() => {
    if (!isOpen) return;
    const first = initialImages?.[0];
    setPhotos((initialImages || []).slice().sort((a, b) => (a.groupIndex || 0) - (b.groupIndex || 0)).map(image => ({
      id: newId(), imageId: image.imageId, imageUrl: image.imageUrl, focalLength: image.focalLength || '',
    })));
    setTitle(first?.title || ''); setDescription(first?.description || '');
    const date = first?.shootingTime?.slice(0, 10) || '';
    setShootingTime(date); setPickerMonth(date ? dayjs(date) : dayjs()); setCountry(first?.country || '');
    setCity(first?.city || ''); setPlaceName(first?.placeName || ''); setLocationId(first?.locationId || first?.location || first?.locationDetail?.id || ''); setTags(first?.tagsList?.join(', ') || first?.tags || ''); setTagInput(''); setIsTagMenuOpen(false);
  }, [isOpen, initialImages]);

  useEffect(() => {
    if (!isOpen) return;
    getGeoLocations().then(setLocations).catch(() => toast.error('加载地理位置失败'));
    getImageUploadConfig().then(setImageUploadConfig).catch(() => setImageUploadConfig(DEFAULT_IMAGE_UPLOAD_CONFIG));
  }, [isOpen, toast]);

  const updateDatePickerPosition = () => {
    const rect = dateButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelWidth = 320; const panelHeight = 296; const margin = 16;
    setPickerPosition({
      left: Math.min(Math.max(rect.left, margin), window.innerWidth - panelWidth - margin),
      top: rect.bottom + 8 + panelHeight > window.innerHeight - margin ? Math.max(margin, rect.top - panelHeight - 8) : rect.bottom + 8,
    });
  };
  const toggleDatePicker = () => { if (!isDatePickerOpen) updateDatePickerPosition(); setIsDatePickerOpen(open => !open); };

  useEffect(() => {
    if (!isDatePickerOpen) return;
    const updatePosition = () => updateDatePickerPosition();
    window.addEventListener('resize', updatePosition); window.addEventListener('scroll', updatePosition, true);
    return () => { window.removeEventListener('resize', updatePosition); window.removeEventListener('scroll', updatePosition, true); };
  }, [isDatePickerOpen]);

  const addFiles = async (files: FileList | File[]) => {
    const additions = [] as DraftPhoto[];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const { width, height } = await getImageDimensions(file);
        const exceedsLongEdge = Math.max(width, height) > imageUploadConfig.maxLongEdge;
        const exceedsSize = file.size > imageUploadConfig.maxFileSizeMb * 1024 * 1024;
        if (exceedsLongEdge || exceedsSize) {
          toast.error(`「${file.name}」超过上传限制，请先压缩至 ${imageUploadConfig.maxLongEdge}px / ${imageUploadConfig.maxFileSizeMb}MB 以内`);
          continue;
        }
        const metadata = await readPhotoExifMetadata(file);
        additions.push({ id: newId(), imageUrl: URL.createObjectURL(file), file, focalLength: metadata.focalLength || '' });
      } catch {
        toast.error(`无法读取「${file.name}」`);
      }
    }
    if (!additions.length) return;
    setPhotos(current => [...current, ...additions]);
    if (!title.trim()) setTitle(additions[0].file!.name.replace(/\.[^/.]+$/, ''));
  };
  const addTag = (value: string) => {
    const tag = value.trim();
    if (!tag || selectedTags.some(item => item.toLowerCase() === tag.toLowerCase())) return;
    setTags([...selectedTags, tag].join(', ')); setTagInput(''); setIsTagMenuOpen(false);
  };
  const removeTag = (tag: string) => setTags(selectedTags.filter(item => item !== tag).join(', '));
  const recommendTags = async () => {
    try {
      setRecommendingTags(true);
      const recommended = await recommendImageTagsWithAI(title, description, existingTags);
      const additions = recommended.filter(tag => !selectedTags.some(item => item.toLowerCase() === tag.toLowerCase()));
      if (!additions.length) { toast.info('无可推荐标签'); return; }
      setTags([...selectedTags, ...additions].join(', ')); toast.success(`已推荐 ${additions.length} 个标签`);
    } catch { toast.error('AI 推荐标签失败'); } finally { setRecommendingTags(false); }
  };
  const reorder = (from: number, to: number) => setPhotos(current => {
    const next = [...current]; const [photo] = next.splice(from, 1); next.splice(to, 0, photo); return next;
  });
  const generateDescription = async () => {
    const first = photos[0];
    if (!first) return;
    try { setGenerating(true); const result = await generateImageDescription({ title, country, city, placeName, imageFile: first.file, imageUrl: first.file ? undefined : first.imageUrl }); setDescription(result.description || ''); }
    catch { toast.error('AI 生成描述失败'); } finally { setGenerating(false); }
  };

  useEffect(() => {
    if (!previewPhoto) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewPhoto(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [previewPhoto]);

  const save = async () => {
    if (!photos.length || !title.trim()) { toast.error('请至少添加一张照片并填写标题'); return; }
    try {
      setSaving(true);
      const submitted = await Promise.all(photos.map(async photo => ({
        imageId: photo.imageId,
        imageUrl: photo.file ? `/api/resource/view/${(await uploadResource(photo.file, 'image')).id}` : photo.imageUrl,
        focalLength: photo.focalLength.replace(/\D/g, ''), groupIndex: photos.indexOf(photo),
      })));
      const payload = { title: title.trim(), description: description.trim(), shootingTime: shootingTime || undefined, country: country.trim(), city: city.trim(), placeName: placeName.trim(), locationId, tags: tags.trim(), photos: submitted };
      if (editing && initialImages?.[0].photoGroupId) await updateImageGroup(initialImages[0].photoGroupId, payload);
      else await createImageGroup({ collId, ...payload });
      toast.success(editing ? '拍摄组已更新' : '照片已添加'); onSuccess(); onClose();
    } catch (error) { console.error(error); toast.error('保存失败，请重试'); } finally { setSaving(false); }
  };
  const dateField = <div className="space-y-1.5"><label className="text-sm font-semibold text-slate-700">拍摄日期</label><button ref={dateButtonRef} type="button" onClick={toggleDatePicker} className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all hover:border-orange-300 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"><span className={shootingTime ? 'text-slate-800' : 'text-slate-400'}>{shootingTime || '选择拍摄日期'}</span><Calendar className="h-4 w-4 text-orange-500" /></button>{isDatePickerOpen && createPortal(<div className="fixed z-[140] w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl" style={{ top: pickerPosition.top, left: pickerPosition.left }}><div className="mb-3 flex items-center justify-between"><button type="button" onClick={() => setPickerMonth(month => month.subtract(1, 'month'))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-orange-600"><ChevronLeft className="h-4 w-4" /></button><div className="text-sm font-semibold text-slate-800">{pickerMonth.format('YYYY 年 MM 月')}</div><button type="button" onClick={() => setPickerMonth(month => month.add(1, 'month'))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-orange-600"><ChevronRight className="h-4 w-4" /></button></div><div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400">{['日', '一', '二', '三', '四', '五', '六'].map(day => <span key={day}>{day}</span>)}</div><div className="grid grid-cols-7 gap-1">{calendarDays.map(date => { const isSelected = selectedDate?.isValid() && date.isSame(selectedDate, 'day'); const isToday = date.isSame(dayjs(), 'day'); const isCurrentMonth = date.month() === pickerMonth.month(); return <button key={date.format('YYYY-MM-DD')} type="button" onClick={() => setShootingTime(date.format('YYYY-MM-DD'))} className={`h-8 rounded-lg text-xs font-medium transition-colors ${isSelected ? 'bg-orange-500 text-white shadow-sm' : 'hover:bg-orange-50 hover:text-orange-600'} ${!isSelected && isToday ? 'text-orange-600 ring-1 ring-orange-200' : ''} ${!isSelected && !isToday && isCurrentMonth ? 'text-slate-700' : ''} ${!isCurrentMonth ? 'text-slate-300' : ''}`}>{date.date()}</button>; })}</div><div className="mt-3 flex items-center justify-between"><button type="button" onClick={() => { setShootingTime(''); setIsDatePickerOpen(false); }} className="text-xs font-medium text-slate-500 hover:text-red-600">清除</button><button type="button" onClick={() => { if (!shootingTime) setShootingTime(dayjs().format('YYYY-MM-DD')); setIsDatePickerOpen(false); }} className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600">完成</button></div></div>, document.body)}</div>;
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !saving && onClose()} />
    <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-6 py-4"><div><h3 className="text-lg font-bold text-slate-800">{editing ? '编辑拍摄组' : '添加一组照片'}</h3><p className="mt-0.5 text-xs text-slate-500">拖拽调整展示顺序，第一张会作为封面和 AI 识别依据。</p></div><button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-200"><X className="h-5 w-5" /></button></header>
      <main className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
        <section className="rounded-xl border border-orange-100 bg-orange-50/40 p-3"><div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold text-slate-700">照片顺序 <span className="text-orange-600">{photos.length} 张</span></span><button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-orange-700 ring-1 ring-orange-200 hover:bg-orange-50"><ImagePlus className="h-3.5 w-3.5" />添加照片</button><input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} /></div>
          {photos.length ? <div className={photos.length === 1 ? 'flex justify-center' : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'}>{photos.map((photo, index) => <div key={photo.id} draggable onDragStart={() => setDraggedIndex(index)} onDragOver={e => e.preventDefault()} onDrop={() => { if (draggedIndex !== null) reorder(draggedIndex, index); setDraggedIndex(null); }} className={`group relative overflow-hidden rounded-lg border bg-white ${photos.length === 1 ? 'w-[calc((100%-12px)/2)] sm:w-[calc((100%-24px)/3)] lg:w-[calc((100%-36px)/4)]' : ''} ${index === 0 ? 'border-orange-400 ring-2 ring-orange-100' : 'border-slate-200'}`}><button type="button" onClick={() => setPreviewPhoto(photo)} className="block w-full cursor-zoom-in"><img src={photo.imageUrl} alt={`照片 ${index + 1}`} className="h-28 w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" /></button><div className="flex items-center gap-1.5 p-2"><GripVertical className="h-3.5 w-3.5 text-slate-400" /><Aperture className="h-3.5 w-3.5 text-sky-500" /><input value={photo.focalLength} inputMode="numeric" placeholder="焦段" onChange={e => setPhotos(current => current.map((item, i) => i === index ? {...item, focalLength: e.target.value.replace(/\D/g, '')} : item))} className="min-w-0 flex-1 text-xs outline-none" /><span className="text-xs text-slate-400">mm</span></div>{index === 0 && <span className="absolute left-2 top-2 rounded-full bg-orange-500 px-2 py-1 text-[10px] font-bold text-white">封面 / AI</span>}<button type="button" onClick={() => setPhotos(current => current.filter((_, i) => i !== index))} className="absolute right-2 top-2 rounded-md bg-white/90 p-1.5 text-slate-500 opacity-0 shadow-sm transition-opacity hover:text-red-600 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div> : <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 py-10 text-sm text-slate-500 hover:border-orange-400 hover:bg-white"><Plus className="mb-2 h-6 w-6 text-orange-500" />选择或拖入照片</button>}</section>
        <label className="block space-y-1.5 text-sm font-semibold text-slate-700">图片标题 <span className="text-red-500">*</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="请输入图片标题" className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" /></label>
        <div className="space-y-1.5"><div className="flex items-center justify-between gap-3"><label className="text-sm font-semibold text-slate-700">描述说明</label><button type="button" disabled={!photos.length || generating} onClick={generateDescription} className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60">{generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}AI 生成</button></div><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="请输入图片描述（可选）" className="block w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" /></div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {dateField}
          <div className="space-y-1.5"><label className="text-sm font-semibold text-slate-700">拍摄地点</label><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><SettingsSelect value={country} options={countryOptions} onChange={value => { setCountry(value); setCity(''); setLocationId(''); }} placeholder="选择国家" emptyMessage="请先在系统设置中添加地点" buttonClassName="min-h-10 text-sm" menuClassName="min-w-56" /><SettingsSelect value={locationId} options={cityOptions} onChange={value => { const location = locations.find(item => item.id === value); setLocationId(value); setCity(location?.city || ''); setCountry(location?.country || country); }} placeholder="选择城市" emptyMessage={country ? '该国家暂无城市' : '请先选择国家'} buttonClassName="min-h-10 text-sm" menuClassName="min-w-64" /></div></div>
        </div>
        <label className="block space-y-1.5 text-sm font-semibold text-slate-700">具体地点<input value={placeName} onChange={e => setPlaceName(e.target.value)} placeholder="例如 人才公园、鲁斯塔维利大道" className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" /></label>
        <div className="space-y-1.5"><div className="flex items-center justify-between gap-3"><label className="text-sm font-semibold text-slate-700">标签</label><button type="button" disabled={recommendingTags} onClick={recommendTags} className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60">{recommendingTags ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}AI 推荐</button></div><div className="relative"><div className="min-h-10 rounded-lg border border-slate-200 bg-white px-2 py-1.5 transition-all focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20"><div className="flex flex-wrap items-center gap-1.5">{selectedTags.map(tag => <span key={tag} className="inline-flex items-center gap-1 rounded-md border border-orange-100 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700"><Tag className="h-3 w-3" />{tag}<button type="button" onClick={() => removeTag(tag)} className="text-orange-400 hover:text-orange-800"><X className="h-3 w-3" /></button></span>)}<input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',' || e.key === '，') { e.preventDefault(); addTag(tagInput); } }} onFocus={() => setIsTagMenuOpen(true)} placeholder={selectedTags.length ? '继续添加标签' : '输入自定义标签'} className="min-w-[140px] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400" /><button type="button" onClick={() => setIsTagMenuOpen(open => !open)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><ChevronDown className={`h-4 w-4 transition-transform ${isTagMenuOpen ? 'rotate-180' : ''}`} /></button></div></div>{tagInput.trim() && <button type="button" onClick={() => addTag(tagInput)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"><Plus className="h-3.5 w-3.5" />添加“{tagInput.trim()}”</button>}{isTagMenuOpen && <div className="absolute z-30 mt-2 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">{availableTags.length ? availableTags.map(tag => <button type="button" key={tag} onClick={() => addTag(tag)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-slate-600 hover:bg-orange-50 hover:text-orange-700"><Tag className="h-3.5 w-3.5 text-orange-400" />{tag}</button>) : <div className="px-3 py-4 text-center text-xs text-slate-400">当前文集暂无可选标签</div>}</div>}</div></div>
      </main>
      <footer className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4"><button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-200">取消</button><button onClick={save} disabled={saving || !photos.length || !title.trim()} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? '保存拍摄组' : '添加照片'}</button></footer>
    </div>
    {previewPhoto && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur-sm" onClick={() => setPreviewPhoto(null)}><button type="button" onClick={() => setPreviewPhoto(null)} className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="关闭预览"><X className="h-6 w-6" /></button><img src={previewPhoto.imageUrl} alt="照片预览" onClick={event => event.stopPropagation()} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" /></div>}
  </div>;
}
