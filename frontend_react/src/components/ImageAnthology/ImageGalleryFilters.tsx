import { Filter, X } from 'lucide-react';
import { ImageTagStat } from '../../types/imageAnthology';
import { Select, SelectOption } from '../common/Select';

interface ImageGalleryFiltersProps {
  visibleCount: number;
  totalCount: number;
  galleryCountry: string;
  galleryCountryOptions: SelectOption<string>[];
  galleryTags: string[];
  galleryTagOptions: ImageTagStat[];
  galleryFocalMin: string;
  galleryFocalMax: string;
  hasGalleryFilters: boolean;
  onGalleryCountryChange: (country: string) => void;
  onGalleryTagToggle: (tag: string) => void;
  onGalleryFocalMinChange: (value: string) => void;
  onGalleryFocalMaxChange: (value: string) => void;
  onClearFilters: () => void;
}

export default function ImageGalleryFilters({
  visibleCount,
  totalCount,
  galleryCountry,
  galleryCountryOptions,
  galleryTags,
  galleryTagOptions,
  galleryFocalMin,
  galleryFocalMax,
  hasGalleryFilters,
  onGalleryCountryChange,
  onGalleryTagToggle,
  onGalleryFocalMinChange,
  onGalleryFocalMaxChange,
  onClearFilters,
}: ImageGalleryFiltersProps) {
  return (
    <section className="relative z-30 mb-5 rounded-xl border border-slate-200 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <Filter className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">内容筛选</h2>
            <p className="mt-1 text-xs text-slate-500">
              {visibleCount} / {totalCount} 张匹配
            </p>
          </div>
        </div>

        <div className="grid flex-1 gap-3 md:grid-cols-[minmax(150px,0.8fr)_minmax(220px,1.4fr)_minmax(220px,1fr)_auto] xl:max-w-4xl">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">国家</label>
            <Select
              value={galleryCountry}
              options={galleryCountryOptions}
              onChange={onGalleryCountryChange}
              placeholder="选择国家"
              buttonClassName="min-h-9 py-1.5 text-xs"
              menuClassName="z-[100]"
              showSelectedDescription={false}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-600">标签</label>
              {galleryTags.length > 0 && (
                <span className="text-[11px] font-medium text-orange-600">{galleryTags.length} 个</span>
              )}
            </div>
            {galleryTagOptions.length > 0 ? (
              <div className="flex min-h-9 gap-1.5 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
                {galleryTagOptions.map((item) => {
                  const active = galleryTags.includes(item.name);
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => onGalleryTagToggle(item.name)}
                      className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-orange-50 text-orange-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span>{item.name}</span>
                      <span className={active ? 'text-orange-500' : 'text-slate-400'}>{item.count}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-9 items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 text-xs text-slate-400">
                暂无标签
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">焦段范围</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={galleryFocalMin}
                onChange={(event) => onGalleryFocalMinChange(event.target.value)}
                placeholder="最小 mm"
                className="min-h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              />
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={galleryFocalMax}
                onChange={(event) => onGalleryFocalMaxChange(event.target.value)}
                placeholder="最大 mm"
                className="min-h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
          </div>

          <div className="flex items-end">
            {hasGalleryFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 md:w-auto"
              >
                <X className="h-3.5 w-3.5" />
                清除
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
