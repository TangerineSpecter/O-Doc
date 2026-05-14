import { useMemo } from 'react';
import { Aperture, Calendar, Check, Filter, X } from 'lucide-react';
import { Select, SelectOption } from '../common/Select';
import { FocalLengthStat } from '../../types/imageAnthology';

export const formatFocalLength = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase().endsWith('mm') ? trimmed : `${trimmed}mm`;
};

export interface FocalLengthFilterOption {
  name: string;
  label?: string;
  count: number;
}

interface FocalLengthDetailChartProps {
  stats: FocalLengthStat[];
  totalImages: number;
  focalLengthTotal: number;
  missingFocalLengthCount: number;
  countryOptions: FocalLengthFilterOption[];
  cityOptions: FocalLengthFilterOption[];
  tagOptions: FocalLengthFilterOption[];
  selectedCountry: string;
  selectedCities: string[];
  selectedTags: string[];
  selectedStartDate: string;
  selectedEndDate: string;
  onCountryChange: (country: string) => void;
  onCityToggle: (city: string) => void;
  onTagToggle: (tag: string) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onClearFilters: () => void;
}

export default function FocalLengthDetailChart({
  stats,
  totalImages,
  focalLengthTotal,
  missingFocalLengthCount,
  countryOptions,
  cityOptions,
  tagOptions,
  selectedCountry,
  selectedCities,
  selectedTags,
  selectedStartDate,
  selectedEndDate,
  onCountryChange,
  onCityToggle,
  onTagToggle,
  onStartDateChange,
  onEndDateChange,
  onClearFilters,
}: FocalLengthDetailChartProps) {
  const numericStats = useMemo(
    () => stats
      .filter(item => Number.isFinite(item.numericValue))
      .sort((a, b) => a.numericValue - b.numericValue || a.name.localeCompare(b.name)),
    [stats]
  );
  const minFocalLength = numericStats[0]?.numericValue || 0;
  const maxFocalLength = numericStats[numericStats.length - 1]?.numericValue || minFocalLength;
  const maxCount = Math.max(...numericStats.map(item => item.count), 1);
  const range = Math.max(maxFocalLength - minFocalLength, 1);
  const plotInsetPercent = 4;
  const plotWidthPercent = 100 - plotInsetPercent * 2;
  const countrySelectOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: 'all', label: '全部国家', description: `${countryOptions.reduce((total, item) => total + item.count, 0)} 张图片` },
      ...countryOptions.map(option => ({
        value: option.name,
        label: option.name,
        description: `${option.count} 张图片`,
      })),
    ],
    [countryOptions]
  );
  const hasActiveFilters = selectedCountry !== 'all'
    || selectedCities.length > 0
    || selectedTags.length > 0
    || Boolean(selectedStartDate)
    || Boolean(selectedEndDate);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">完整焦段统计</h2>
            <p className="mt-1 text-xs text-slate-500">
              {numericStats.length > 0
                ? `${formatFocalLength(String(minFocalLength))} - ${formatFocalLength(String(maxFocalLength))}`
                : '当前条件下暂无可展示的焦段数据'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">
              {focalLengthTotal} / {totalImages} 张已记录
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Aperture className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-7">
        <div className="mb-6 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Filter className="h-4 w-4 text-sky-600" />
              筛选条件
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 sm:self-auto"
              >
                <X className="h-3.5 w-3.5" />
                清除筛选
              </button>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-500">国家</label>
              <Select
                value={selectedCountry}
                options={countrySelectOptions}
                onChange={onCountryChange}
                showSelectedDescription={false}
                buttonClassName="min-h-9 text-xs"
                menuClassName="z-40"
                accentClassName="bg-sky-50 text-sky-700"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-500">城市</label>
              <div className="flex min-h-9 flex-wrap gap-2">
                {cityOptions.length > 0 ? cityOptions.map(option => {
                  const active = selectedCities.includes(option.name);
                  return (
                    <button
                      key={option.name}
                      type="button"
                      onClick={() => onCityToggle(option.name)}
                      className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? 'border-sky-200 bg-sky-50 text-sky-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700'
                      }`}
                    >
                      {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">{option.label || option.name}</span>
                      <span className="shrink-0 text-slate-400">{option.count}</span>
                    </button>
                  );
                }) : (
                  <div className="flex items-center rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-400">
                    暂无城市数据
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <Calendar className="h-3.5 w-3.5 text-sky-600" />
              拍摄日期
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
              <input
                type="date"
                value={selectedStartDate}
                onChange={(event) => onStartDateChange(event.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none transition-all focus:border-sky-400 focus:ring-2 focus:ring-sky-500/10"
                aria-label="焦段统计开始拍摄日期"
              />
              <input
                type="date"
                value={selectedEndDate}
                min={selectedStartDate || undefined}
                onChange={(event) => onEndDateChange(event.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none transition-all focus:border-sky-400 focus:ring-2 focus:ring-sky-500/10"
                aria-label="焦段统计结束拍摄日期"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-xs font-semibold text-slate-500">标签</label>
            <div className="flex max-h-32 flex-wrap gap-2 overflow-auto pr-1">
              {tagOptions.length > 0 ? tagOptions.map(option => {
                const active = selectedTags.includes(option.name);
                return (
                  <button
                    key={option.name}
                    type="button"
                    onClick={() => onTagToggle(option.name)}
                    className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-orange-200 bg-orange-50 text-orange-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700'
                    }`}
                  >
                    {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">{option.name}</span>
                    <span className="shrink-0 text-slate-400">{option.count}</span>
                  </button>
                );
              }) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-400">
                  暂无标签数据
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-lg bg-white px-2.5 py-1.5 font-semibold">{totalImages} 张符合条件</span>
            <span className="rounded-lg bg-white px-2.5 py-1.5 font-semibold">{focalLengthTotal} 张参与焦段统计</span>
            {missingFocalLengthCount > 0 && (
              <span className="rounded-lg bg-white px-2.5 py-1.5 font-semibold">未记录焦段 {missingFocalLengthCount} 张</span>
            )}
          </div>
        </div>

        {numericStats.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center text-sm text-slate-500">
            暂无可展示的焦段数据
          </div>
        ) : (
          <div className="relative h-[360px] overflow-hidden rounded-xl border border-slate-100 bg-[linear-gradient(180deg,rgba(148,163,184,0.14)_1px,transparent_1px)] bg-[size:100%_72px] px-4 pb-12 pt-8">
            <div
              className="absolute bottom-12 border-t border-slate-300"
              style={{ left: `${plotInsetPercent}%`, right: `${plotInsetPercent}%` }}
            />
            {numericStats.map(item => {
              const left = plotInsetPercent + ((item.numericValue - minFocalLength) / range) * plotWidthPercent;
              const height = Math.max((item.count / maxCount) * 230, 18);

              return (
                <div
                  key={item.name}
                  className="absolute bottom-12 flex w-12 -translate-x-1/2 flex-col items-center gap-2"
                  style={{ left: `${left}%` }}
                >
                  <div className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                    {item.count}
                  </div>
                  <div
                    className="w-5 rounded-t-md bg-sky-500 shadow-sm shadow-sky-500/20"
                    style={{ height }}
                    title={`${formatFocalLength(item.name)}：${item.count} 张`}
                  />
                  <div className="absolute top-full mt-2 w-20 text-center text-[11px] font-semibold text-slate-600">
                    {formatFocalLength(item.name)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {stats.length > numericStats.length && (
          <div className="mt-3 text-xs text-slate-400">
            另有 {stats.length - numericStats.length} 个焦段无法按数值定位，暂未绘制在图表中。
          </div>
        )}
      </div>
    </section>
  );
}
