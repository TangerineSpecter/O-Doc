import { useMemo, useState } from 'react';
import { ChevronDown, Filter, RotateCcw, X } from 'lucide-react';
import { ImageTagStat } from '../../types/imageAnthology';
import { DominantColorKey } from '../../utils/imageColor';
import { Select, SelectOption } from '../common/Select';

export interface ColorFilterOption {
  key: DominantColorKey;
  label: string;
  hex: string;
  count: number;
}

interface ImageGalleryFiltersProps {
  visibleCount: number;
  totalCount: number;
  galleryCountry: string;
  galleryCountryOptions: SelectOption<string>[];
  selectedColor: DominantColorKey | 'all';
  colorStats: ColorFilterOption[];
  galleryTags: string[];
  galleryTagOptions: ImageTagStat[];
  galleryFocalMin: string;
  galleryFocalMax: string;
  hasGalleryFilters: boolean;
  hasCountryData?: boolean;
  hasFocalData?: boolean;
  onGalleryCountryChange: (country: string) => void;
  onSelectColor: (color: DominantColorKey | 'all') => void;
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
  selectedColor,
  colorStats,
  galleryTags,
  galleryTagOptions,
  galleryFocalMin,
  galleryFocalMax,
  hasGalleryFilters,
  hasCountryData,
  hasFocalData,
  onGalleryCountryChange,
  onSelectColor,
  onGalleryTagToggle,
  onGalleryFocalMinChange,
  onGalleryFocalMaxChange,
  onClearFilters,
}: ImageGalleryFiltersProps) {
  const hasCountry = hasCountryData ?? galleryCountryOptions.some(o => o.value !== 'all');
  const hasFocal = hasFocalData ?? (galleryFocalMin !== '' || galleryFocalMax !== '');

  // 移动端默认收拢，减少空间占用；用户可随时展开修改（仅移动端生效）
  const [isExpanded, setIsExpanded] = useState(false);

  // 计算当前已选条件的文本摘要（供移动端折叠条展示）
  const selectedCountryLabel = useMemo(() => {
    if (!galleryCountry || galleryCountry === 'all') return null;
    const found = galleryCountryOptions.find(o => o.value === galleryCountry);
    return found ? found.label : galleryCountry;
  }, [galleryCountry, galleryCountryOptions]);

  const selectedColorInfo = useMemo(() => {
    if (selectedColor === 'all') return null;
    return colorStats.find(c => c.key === selectedColor) || null;
  }, [selectedColor, colorStats]);

  const focalSummary = useMemo(() => {
    if (!galleryFocalMin && !galleryFocalMax) return null;
    if (galleryFocalMin && galleryFocalMax) return `${galleryFocalMin}-${galleryFocalMax}mm`;
    if (galleryFocalMin) return `≥${galleryFocalMin}mm`;
    return `≤${galleryFocalMax}mm`;
  }, [galleryFocalMin, galleryFocalMax]);

  // 移动端专属：主色调下拉选项
  const colorOptions = useMemo<SelectOption<DominantColorKey | 'all'>[]>(() => {
    return [
      {
        value: 'all',
        label: '全部颜色',
        description: `${totalCount} 张图片`,
        icon: (
          <span className="h-3 w-3 shrink-0 rounded-full border border-slate-300 bg-gradient-to-tr from-rose-400 via-emerald-400 to-sky-400" />
        ),
      },
      ...colorStats.map(c => ({
        value: c.key,
        label: c.label,
        description: `${c.count} 张图片`,
        icon: (
          <span
            className="h-3 w-3 shrink-0 rounded-full border border-black/10 shadow-xs"
            style={{ backgroundColor: c.hex }}
          />
        ),
      })),
    ];
  }, [colorStats, totalCount]);

  return (
    <>
      {/* 桌面端 (lg 及以上)：常驻展示，无需展开/收起，主色调在左侧侧边栏展示 */}
      <section className="hidden lg:block relative z-30 mb-5 rounded-xl border border-slate-200 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
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

          <div className="flex flex-1 flex-wrap items-end gap-3 xl:max-w-4xl">
            {hasCountry && (
              <div className="w-full sm:w-44 shrink-0">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">国家</label>
                <Select
                  value={galleryCountry}
                  options={galleryCountryOptions}
                  onChange={onGalleryCountryChange}
                  placeholder="选择国家"
                  buttonClassName="min-h-9 py-1.5 text-xs bg-white"
                  menuClassName="z-[100]"
                  showSelectedDescription={false}
                />
              </div>
            )}

            <div className="min-w-[200px] flex-1">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-600">标签</label>
                {galleryTags.length > 0 && (
                  <span className="text-[11px] font-medium text-orange-600">{galleryTags.length} 个</span>
                )}
              </div>
              {galleryTagOptions.length > 0 ? (
                <div className="flex min-h-9 gap-1.5 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 scrollbar-none">
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

            {hasFocal && (
              <div className="w-full sm:w-56 shrink-0">
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
            )}

            {hasGalleryFilters && (
              <div className="flex items-end shrink-0">
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                >
                  <X className="h-3.5 w-3.5" />
                  清除
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 移动端 (lg 以下)：吸顶紧凑折叠摘要栏，展开后提供国家、颜色下拉、标签、焦段筛选 */}
      <section className="lg:hidden sticky top-[57px] sm:top-[69px] z-30 mb-4 rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 sm:px-4 sm:py-2.5 shadow-xs backdrop-blur-md transition-all">
        {/* 顶部紧凑折叠摘要栏（默认常驻，吸顶极度轻薄省空间） */}
        <div className="flex items-center justify-between gap-2">
          {/* 左侧：图标 + 标题 + 匹配张数 */}
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="flex min-w-0 items-center gap-2 text-left group"
            aria-expanded={isExpanded}
          >
            <div className={`flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
              hasGalleryFilters ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/25' : 'bg-orange-50 text-orange-600 group-hover:bg-orange-100'
            }`}>
              <Filter className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-orange-600 transition-colors">
                筛选
              </span>
              <span className="rounded-md border border-slate-200/80 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                {visibleCount} / {totalCount}
              </span>
            </div>

            {/* 中间已激活条件微标签摘要（收拢时一目了然） */}
            <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 ml-2">
              {selectedCountryLabel && (
                <span className="shrink-0 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                  {selectedCountryLabel}
                </span>
              )}
              {selectedColorInfo && (
                <span className="shrink-0 flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-xs">
                  <span
                    className="h-2 w-2 rounded-full shrink-0 border border-black/10"
                    style={{ backgroundColor: selectedColorInfo.hex }}
                  />
                  <span>{selectedColorInfo.label}</span>
                </span>
              )}
              {galleryTags.map(tag => (
                <span key={tag} className="shrink-0 rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                  #{tag}
                </span>
              ))}
              {focalSummary && (
                <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  {focalSummary}
                </span>
              )}
              {!hasGalleryFilters && (
                <span className="text-[11px] text-slate-400 font-normal">
                  {[
                    hasCountry && '国家',
                    '颜色',
                    '标签',
                    hasFocal && '焦段',
                  ].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          </button>

          {/* 右侧：清除与展开/收起按钮 */}
          <div className="flex items-center gap-1.5 shrink-0">
            {hasGalleryFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-500 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 transition-colors"
                title="清除所有筛选条件"
              >
                <RotateCcw className="h-3 w-3" />
                <span className="hidden xs:inline">重置</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsExpanded(prev => !prev)}
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-all ${
                isExpanded
                  ? 'bg-orange-50 text-orange-700 border border-orange-200'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 border border-transparent'
              }`}
            >
              <span>{isExpanded ? '收起' : '展开'}</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* 移动端收拢时微小摘要徽章条（极简占用） */}
        {!isExpanded && hasGalleryFilters && (
          <div className="mt-1.5 flex sm:hidden items-center gap-1.5 overflow-x-auto scrollbar-none pt-1 border-t border-slate-100 text-[10px]">
            {selectedCountryLabel && (
              <span className="shrink-0 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700">
                {selectedCountryLabel}
              </span>
            )}
            {selectedColorInfo && (
              <span className="shrink-0 flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-medium text-slate-700 shadow-xs">
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0 border border-black/10"
                  style={{ backgroundColor: selectedColorInfo.hex }}
                />
                <span>{selectedColorInfo.label}</span>
              </span>
            )}
            {galleryTags.map(tag => (
              <span key={tag} className="shrink-0 rounded-md border border-orange-200 bg-orange-50 px-1.5 py-0.5 font-medium text-orange-700">
                #{tag}
              </span>
            ))}
            {focalSummary && (
              <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
                {focalSummary}
              </span>
            )}
          </div>
        )}

        {/* 展开详细筛选面板（移动端） */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-slate-200/70 animate-in fade-in slide-in-from-top-2 duration-150 min-w-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(120px,1fr)_minmax(130px,1fr)_minmax(200px,1.5fr)_minmax(160px,1.2fr)_auto] items-end min-w-0">
              {/* 国家与主色调：移动端并排双列（省垂直高度），平板与PC端自动变为独立网格项 */}
              <div className={`${hasCountry ? 'grid grid-cols-2 gap-2.5' : ''} sm:contents min-w-0`}>
                {/* 国家选择 */}
                {hasCountry && (
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">国家</label>
                    <Select
                      value={galleryCountry}
                      options={galleryCountryOptions}
                      onChange={onGalleryCountryChange}
                      placeholder="全部国家"
                      buttonClassName="min-h-9 py-1 px-2.5 text-xs bg-white"
                      menuClassName="z-[100]"
                      showSelectedDescription={false}
                    />
                  </div>
                )}

                {/* 主色调选择（仅在移动端使用下拉筛选） */}
                <div className="min-w-0">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">主色调</label>
                  <Select
                    value={selectedColor}
                    options={colorOptions}
                    onChange={onSelectColor}
                    placeholder="全部颜色"
                    buttonClassName="min-h-9 py-1 px-2.5 text-xs bg-white"
                    menuClassName="z-[100]"
                    showSelectedDescription={false}
                  />
                </div>
              </div>

              {/* 标签选择 */}
              <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-600">标签</label>
                  {galleryTags.length > 0 && (
                    <span className="text-[11px] font-medium text-orange-600">已选 {galleryTags.length} 个</span>
                  )}
                </div>
                {galleryTagOptions.length > 0 ? (
                  <div className="flex min-h-9 gap-1.5 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 scrollbar-none">
                    {galleryTagOptions.map((item) => {
                      const active = galleryTags.includes(item.name);
                      return (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => onGalleryTagToggle(item.name)}
                          className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                            active
                              ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-300/40'
                              : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-100'
                          }`}
                        >
                          <span>{item.name}</span>
                          <span className={`text-[10px] ${active ? 'text-orange-500' : 'text-slate-400'}`}>{item.count}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex min-h-9 items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-400">
                    暂无标签
                  </div>
                )}
              </div>

              {/* 焦段范围 */}
              {hasFocal && (
                <div className="min-w-0 sm:col-span-1">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">焦段范围 (mm)</label>
                  <div className="grid grid-cols-2 gap-1.5 min-w-0">
                    <input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={galleryFocalMin}
                      onChange={(event) => onGalleryFocalMinChange(event.target.value)}
                      placeholder="最小"
                      className="min-h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                    <input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={galleryFocalMax}
                      onChange={(event) => onGalleryFocalMaxChange(event.target.value)}
                      placeholder="最大"
                      className="min-h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>
                </div>
              )}

              {/* 清除按钮 */}
              <div className="flex items-center gap-2 min-w-0 sm:col-span-1">
                {hasGalleryFilters && (
                  <button
                    type="button"
                    onClick={onClearFilters}
                    className="flex min-h-9 flex-1 sm:w-auto items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>清除</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="flex min-h-9 flex-1 sm:w-auto items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors"
                >
                  收起
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
