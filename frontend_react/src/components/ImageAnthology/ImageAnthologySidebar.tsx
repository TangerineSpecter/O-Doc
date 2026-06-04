import { Aperture, Droplets, MapPin, Tag } from 'lucide-react';
import { FocalLengthStat, ImageTagStat } from '../../types/imageAnthology';
import { COLOR_SWATCHES, DominantColorKey } from '../../utils/imageColor';
import { formatFocalLength } from './FocalLengthDetailChart';

type ColorStat = (typeof COLOR_SWATCHES)[number] & { count: number };

interface ImageAnthologySidebarProps {
  imageCount: number;
  locationCityCount: number;
  isLocationMapOpen: boolean;
  isFocalLengthDetailOpen: boolean;
  isTagDetailOpen: boolean;
  focalLengthStats: FocalLengthStat[];
  focalLengthSummaryStats: FocalLengthStat[];
  focalLengthTotal: number;
  missingFocalLengthCount: number;
  maxFocalLengthCount: number;
  tagStats: ImageTagStat[];
  tagSummaryStats: ImageTagStat[];
  taggedImageCount: number;
  tagTotal: number;
  maxTagCount: number;
  selectedColor: DominantColorKey | 'all';
  colorStats: ColorStat[];
  extractedColorCount: number;
  baseVisibleImageCount: number;
  onToggleLocationMap: () => void;
  onToggleFocalLengthDetail: () => void;
  onToggleTagDetail: () => void;
  onSelectColor: (color: DominantColorKey | 'all') => void;
}

export default function ImageAnthologySidebar({
  imageCount,
  locationCityCount,
  isLocationMapOpen,
  isFocalLengthDetailOpen,
  isTagDetailOpen,
  focalLengthStats,
  focalLengthSummaryStats,
  focalLengthTotal,
  missingFocalLengthCount,
  maxFocalLengthCount,
  tagStats,
  tagSummaryStats,
  taggedImageCount,
  tagTotal,
  maxTagCount,
  selectedColor,
  colorStats,
  extractedColorCount,
  baseVisibleImageCount,
  onToggleLocationMap,
  onToggleFocalLengthDetail,
  onToggleTagDetail,
  onSelectColor,
}: ImageAnthologySidebarProps) {
  return (
    <aside className="self-start rounded-xl border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur lg:sticky lg:top-24">
      <div className="mb-4">
        <button
          onClick={onToggleLocationMap}
          className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-xs font-semibold transition-all ${
            isLocationMapOpen
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            拍摄地点
          </span>
          <span>{locationCityCount} 城市</span>
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">焦段统计</h2>
          <p className="mt-1 text-xs text-slate-500">
            {focalLengthTotal} / {imageCount} 张已记录
          </p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
          <Aperture className="h-4 w-4" />
        </div>
      </div>

      {focalLengthStats.length > 0 ? (
        <div className="space-y-3">
          {focalLengthSummaryStats.map((item) => (
            <div key={item.name} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-semibold text-slate-700">{formatFocalLength(item.name)}</span>
                <span className="shrink-0 font-medium text-slate-400">{item.count} 张</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-sky-500"
                  style={{ width: `${Math.max((item.count / maxFocalLengthCount) * 100, 8)}%` }}
                />
              </div>
            </div>
          ))}
          {missingFocalLengthCount > 0 && (
            <div className="border-t border-slate-100 pt-3 text-xs text-slate-400">
              未记录焦段 {missingFocalLengthCount} 张
            </div>
          )}
          <button
            type="button"
            onClick={onToggleFocalLengthDetail}
            className={`w-full rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              isFocalLengthDetailOpen
                ? 'border-sky-200 bg-sky-50 text-sky-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700'
            }`}
          >
            {focalLengthStats.length > 5 ? `查看全部 ${focalLengthStats.length} 个焦段` : '查看完整焦段图表'}
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs leading-5 text-slate-500">
          暂无焦段数据
        </div>
      )}

      <div className="my-5 border-t border-slate-100" />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">标签统计</h2>
          <p className="mt-1 text-xs text-slate-500">
            {taggedImageCount} / {imageCount} 张已记录
          </p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
          <Tag className="h-4 w-4" />
        </div>
      </div>

      {tagStats.length > 0 ? (
        <div className="space-y-3">
          {tagSummaryStats.map((item) => (
            <div key={item.name} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-semibold text-slate-700">{item.name}</span>
                <span className="shrink-0 font-medium text-slate-400">{item.count} 次</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-orange-500"
                  style={{ width: `${Math.max((item.count / maxTagCount) * 100, 8)}%` }}
                />
              </div>
            </div>
          ))}
          <div className="border-t border-slate-100 pt-3 text-xs text-slate-400">
            共记录 {tagTotal} 个标签
          </div>
          <button
            type="button"
            onClick={onToggleTagDetail}
            className={`w-full rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              isTagDetailOpen
                ? 'border-orange-200 bg-orange-50 text-orange-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700'
            }`}
          >
            {tagStats.length > 5 ? `查看全部 ${tagStats.length} 个标签` : '查看完整标签统计'}
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs leading-5 text-slate-500">
          暂无标签数据
        </div>
      )}

      <div className="my-5 border-t border-slate-100" />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">主色调</h2>
          <p className="mt-1 text-xs text-slate-500">
            {extractedColorCount} / {baseVisibleImageCount} 张已识别
          </p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
          <Droplets className="h-4 w-4" />
        </div>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onSelectColor('all')}
          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
            selectedColor === 'all'
              ? 'border-orange-200 bg-orange-50 text-orange-700'
              : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700'
          }`}
        >
          <span>全部颜色</span>
          <span>{baseVisibleImageCount} 张</span>
        </button>
        <div className="grid grid-cols-2 gap-2">
          {colorStats.map((color) => (
            <button
              key={color.key}
              type="button"
              onClick={() => onSelectColor(color.key)}
              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-all ${
                selectedColor === color.key
                  ? `${color.borderClass} ${color.bgClass} ${color.textClass} ring-2 ring-offset-1 ring-orange-500/20`
                  : `border-slate-200 bg-white text-slate-600 hover:bg-slate-50 ${color.count === 0 ? 'opacity-55' : ''}`
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: color.hex }}
                />
                <span className="truncate">{color.label}</span>
              </span>
              <span className="shrink-0 text-slate-400">{color.count}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
