import { useEffect, useMemo, useRef, useState } from 'react';
import { Crop, Loader2, Maximize2, RotateCw, X } from 'lucide-react';
import { getProcessedImageOutput, getResizeDrawSource } from '../../utils/imageUpload';
import type { CropRect, ResizeMode } from '../../utils/imageUpload';
import { useToast } from '../common/ToastProvider';

type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';
type CropOrientation = 'landscape' | 'portrait';

interface ImageResizeModalProps {
  file: File | null;
  maxLongEdge: number;
  queueIndex?: number;
  queueTotal?: number;
  onCancel: () => void;
  onSkip?: () => void;
  onComplete: (file: File) => void;
}

const loadImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('图片无法读取'));
  };
  image.src = url;
});

const dataUrlFor = (file: File) => URL.createObjectURL(file);
const revokeDataUrl = (url: string) => URL.revokeObjectURL(url);

const createInitialCrop = (width: number, height: number, targetRatio: number): CropRect => {
  const sourceRatio = width / height;
  const maxWidth = sourceRatio > targetRatio ? (targetRatio / sourceRatio) * 100 : 100;
  const maxHeight = sourceRatio > targetRatio ? 100 : (sourceRatio / targetRatio) * 100;
  const cropWidth = maxWidth;
  const cropHeight = maxHeight;
  return { x: (100 - cropWidth) / 2, y: (100 - cropHeight) / 2, width: cropWidth, height: cropHeight };
};

export default function ImageResizeModal({ file, maxLongEdge, queueIndex, queueTotal, onCancel, onSkip, onComplete }: ImageResizeModalProps) {
  const toast = useToast();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [previewUrl, setPreviewUrl] = useState('');
  const [mode, setMode] = useState<ResizeMode>('long-edge');
  const [cropOrientation, setCropOrientation] = useState<CropOrientation>('landscape');
  const [longEdge, setLongEdge] = useState(maxLongEdge);
  const [cropRect, setCropRect] = useState<CropRect>({ x: 8, y: 8, width: 84, height: 84 });
  const [quality, setQuality] = useState(94);
  const [isProcessing, setIsProcessing] = useState(false);
  const dragStart = useRef<{ handle: CropHandle; clientX: number; clientY: number; crop: CropRect } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const processLock = useRef(false);

  useEffect(() => {
    if (!file) return;
    const url = dataUrlFor(file);
    processLock.current = false;
    setIsProcessing(false);
    setPreviewUrl(url);
    setLongEdge(maxLongEdge);
    setMode('long-edge');
    setCropOrientation('landscape');
    loadImage(file).then(image => setDimensions({ width: image.naturalWidth, height: image.naturalHeight }));
    return () => revokeDataUrl(url);
  }, [file, maxLongEdge]);

  useEffect(() => {
    if (!dimensions.width || (mode !== '3:2' && mode !== '16:9')) return;
    const baseRatio = mode === '3:2' ? 3 / 2 : 16 / 9;
    const targetRatio = cropOrientation === 'portrait' ? 1 / baseRatio : baseRatio;
    setCropRect(createInitialCrop(dimensions.width, dimensions.height, targetRatio));
  }, [cropOrientation, dimensions, mode]);

  const output = useMemo(() => {
    const { width, height } = dimensions;
    if (!width || !height) return { width: 0, height: 0, crop: false };
    if (mode === 'long-edge') {
      const safeEdge = Math.max(256, Math.min(16384, longEdge || maxLongEdge));
      const scale = Math.min(1, safeEdge / Math.max(width, height));
      return { width: Math.round(width * scale), height: Math.round(height * scale), crop: false };
    }
    const selectedWidth = width * cropRect.width / 100;
    const selectedHeight = height * cropRect.height / 100;
    const scale = Math.min(1, maxLongEdge / Math.max(selectedWidth, selectedHeight));
    return { width: Math.round(selectedWidth * scale), height: Math.round(selectedHeight * scale), crop: true };
  }, [cropRect, dimensions, longEdge, maxLongEdge, mode]);

  const handleProcess = async () => {
    if (!file || !dimensions.width || processLock.current) return;
    processLock.current = true;
    try {
      setIsProcessing(true);
      const image = await loadImage(file);
      const canvas = document.createElement('canvas');
      canvas.width = output.width;
      canvas.height = output.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器不支持图片处理');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      const { sx, sy, sw, sh } = getResizeDrawSource(mode, cropRect, image.naturalWidth, image.naturalHeight);
      context.drawImage(image, sx, sy, sw, sh, 0, 0, output.width, output.height);

      const outputFile = getProcessedImageOutput(file);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, outputFile.type, quality / 100));
      if (!blob) throw new Error('图片生成失败');
      const name = file.name.replace(/\.[^.]+$/, '') + `_${output.width}x${output.height}.${outputFile.extension}`;
      onComplete(new File([blob], name, { type: outputFile.type, lastModified: Date.now() }));
    } catch (error) {
      console.error('图片缩放失败:', error);
      processLock.current = false;
      toast.error(error instanceof Error ? error.message : '图片处理失败，请重试或跳过');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!file) return null;
  const processedOutput = getProcessedImageOutput(file);
  const queued = Boolean(queueTotal && queueTotal > 1 && onSkip);
  const baseCropRatio = mode === '3:2' ? 3 / 2 : 16 / 9;
  const cropRatio = cropOrientation === 'portrait' ? 1 / baseCropRatio : baseCropRatio;
  const beginDrag = (event: React.PointerEvent<HTMLDivElement>, handle: CropHandle) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { handle, clientX: event.clientX, clientY: event.clientY, crop: cropRect };
  };

  const moveCrop = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const bounds = previewRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const toPixels = (crop: CropRect) => ({ x: crop.x * bounds.width / 100, y: crop.y * bounds.height / 100, width: crop.width * bounds.width / 100, height: crop.height * bounds.height / 100 });
    const fromPixels = (crop: { x: number; y: number; width: number; height: number }): CropRect => ({ x: crop.x / bounds.width * 100, y: crop.y / bounds.height * 100, width: crop.width / bounds.width * 100, height: crop.height / bounds.height * 100 });
    const source = toPixels(start.crop);
    const dx = event.clientX - start.clientX;
    const dy = event.clientY - start.clientY;
    if (start.handle === 'move') {
      setCropRect(fromPixels({
        ...source,
        x: Math.min(Math.max(0, source.x + dx), bounds.width - source.width),
        y: Math.min(Math.max(0, source.y + dy), bounds.height - source.height),
      }));
      return;
    }
    const anchors = {
      nw: { x: source.x + source.width, y: source.y + source.height, horizontal: -1, vertical: -1 },
      ne: { x: source.x, y: source.y + source.height, horizontal: 1, vertical: -1 },
      sw: { x: source.x + source.width, y: source.y, horizontal: -1, vertical: 1 },
      se: { x: source.x, y: source.y, horizontal: 1, vertical: 1 },
    } as const;
    const anchor = anchors[start.handle as Exclude<CropHandle, 'move'>];
    // 用按下后的位移，而不是鼠标的绝对坐标。控制点在边框外侧，
    // 若直接取绝对坐标会把控制点半径误算进尺寸，从而在首次移动时跳动。
    const pointerWidth = source.width + dx * anchor.horizontal;
    const pointerHeight = source.height + dy * anchor.vertical;
    const maxWidth = Math.min(
      anchor.horizontal > 0 ? bounds.width - anchor.x : anchor.x,
      (anchor.vertical > 0 ? bounds.height - anchor.y : anchor.y) * cropRatio,
    );
    const nextWidth = Math.min(maxWidth, Math.max(72, Math.min(pointerWidth, pointerHeight * cropRatio)));
    const nextHeight = nextWidth / cropRatio;
    setCropRect(fromPixels({
      x: anchor.horizontal > 0 ? anchor.x : anchor.x - nextWidth,
      y: anchor.vertical > 0 ? anchor.y : anchor.y - nextHeight,
      width: nextWidth,
      height: nextHeight,
    }));
  };

  const endDrag = () => { dragStart.current = null; };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !isProcessing && onCancel()} />
      <div className="relative flex w-full max-w-7xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <div><h3 className="text-lg font-bold text-slate-800">{queueTotal && queueTotal > 1 ? `调整上传图片（${queueIndex}/${queueTotal}）` : '调整上传图片'}</h3><p className="mt-0.5 text-xs text-slate-500">{queueTotal && queueTotal > 1 ? `当前「${file.name}」，处理完会自动打开下一张超标图片。` : file.name} · 原图 {dimensions.width} × {dimensions.height} · {(file.size / 1024 / 1024).toFixed(1)} MB</p></div>
          <button onClick={onCancel} disabled={isProcessing} className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-3 lg:min-h-[560px]">
            {previewUrl && output.crop ? (
              <div
                ref={previewRef}
                className="relative max-h-[64vh] max-w-full overflow-hidden rounded-lg bg-slate-950 shadow-inner"
                style={{ aspectRatio: `${dimensions.width}/${dimensions.height}`, width: `min(100%, calc(64vh * ${dimensions.width / Math.max(dimensions.height, 1)}))` }}
              >
                <img
                  src={previewUrl}
                  alt="原图裁切预览"
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-contain"
                />
                <div
                  className="absolute touch-none cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.56)] active:cursor-grabbing"
                  style={{ left: `${cropRect.x}%`, top: `${cropRect.y}%`, width: `${cropRect.width}%`, height: `${cropRect.height}%` }}
                  onPointerDown={(event) => beginDrag(event, 'move')}
                  onPointerMove={moveCrop}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  aria-label="裁切区域；拖动移动取景位置"
                >
                  <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-70">
                    {Array.from({ length: 9 }).map((_, index) => <span key={index} className="border border-white/35" />)}
                  </div>
                  {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
                    <div
                      key={handle}
                      className={`absolute h-4 w-4 rounded-full border-2 border-orange-500 bg-white shadow-sm ${handle.includes('n') ? '-top-2' : '-bottom-2'} ${handle.includes('w') ? '-left-2' : '-right-2'} cursor-pointer`}
                      onPointerDown={(event) => beginDrag(event, handle)}
                      aria-label="拖动以调整裁切框大小"
                    />
                  ))}
                </div>
                <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur-sm">拖动框选区域；拖动四角可在保持比例下缩放</div>
              </div>
            ) : (
              <img src={previewUrl} alt="缩放预览" draggable={false} className="max-h-[64vh] max-w-full rounded-lg object-contain" />
            )}
          </div>
          <div className="space-y-5 lg:pt-1">
            <div><p className="mb-2 text-sm font-semibold text-slate-700">处理方式</p><div className="grid grid-cols-3 gap-2">
              {([['long-edge', '最长边缩放'], ['3:2', '裁切为 3:2'], ['16:9', '裁切为 16:9']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setMode(value)} className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${mode === value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:border-orange-200'}`}>{label}</button>)}
            </div></div>
            {mode === 'long-edge' && <label className="block text-sm font-semibold text-slate-700">最长边（px）<input type="number" min="256" max="16384" value={longEdge} onChange={event => setLongEdge(Number(event.target.value))} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" /></label>}
            {output.crop && <><div><p className="mb-2 text-sm font-semibold text-slate-700">裁切方向</p><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setCropOrientation('landscape')} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${cropOrientation === 'landscape' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:border-orange-200'}`}><RotateCw className="h-3.5 w-3.5" />横向 {mode === '3:2' ? '3:2' : '16:9'}</button><button type="button" onClick={() => setCropOrientation('portrait')} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${cropOrientation === 'portrait' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:border-orange-200'}`}><RotateCw className="h-3.5 w-3.5 rotate-90" />纵向 {mode === '3:2' ? '2:3' : '9:16'}</button></div></div><div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600"><span className="font-semibold text-slate-700">裁切方式：</span>拖动白色框移动取景；拖动四个橙色控制点缩放裁切框。比例保持为 {cropOrientation === 'landscape' ? (mode === '3:2' ? '3:2' : '16:9') : (mode === '3:2' ? '2:3' : '9:16')}。</div></>}
            {processedOutput.type !== 'image/png' && <label className="block text-sm font-semibold text-slate-700">JPEG 质量 <span className="font-normal text-slate-400">{quality}%</span><input type="range" min="82" max="100" value={quality} onChange={event => setQuality(Number(event.target.value))} className="mt-3 w-full accent-orange-500" /></label>}
            <div className="rounded-lg border border-orange-100 bg-orange-50 p-3 text-xs leading-5 text-orange-800"><div className="mb-1 flex items-center gap-1.5 font-semibold"><Maximize2 className="h-3.5 w-3.5" />输出 {output.width} × {output.height}</div>{output.crop ? '输出分辨率将随框选区域变化，且最长边不超过设定值，不会对裁切后的区域放大。' : '保持原始比例且不会放大图片。'} 点击处理后只会上传此处理结果，不会保存原始大图。</div>
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">{queued && <button type="button" onClick={onSkip} disabled={isProcessing} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200">跳过</button>}<button type="button" onClick={onCancel} disabled={isProcessing} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200">{queued ? '取消剩余' : '取消'}</button><button type="button" onClick={handleProcess} disabled={isProcessing || !dimensions.width} className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 disabled:opacity-60">{isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crop className="h-4 w-4" />}{isProcessing ? '处理中…' : '处理并使用'}</button></div>
      </div>
    </div>
  );
}
