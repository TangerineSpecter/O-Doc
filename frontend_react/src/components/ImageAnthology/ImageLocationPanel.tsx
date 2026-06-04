import { ChevronDown, Globe2 } from 'lucide-react';
import LocationChartMap from './LocationChartMap';

export interface ImageLocationPoint {
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  count: number;
}

export interface ImageLocationStats {
  points: ImageLocationPoint[];
  countryCount: number;
  cityCount: number;
  imageCount: number;
}

export interface ImageLocationCountryGroup {
  country: string;
  count: number;
  cities: Array<{ city: string; count: number }>;
}

interface ImageLocationPanelProps {
  locationStats: ImageLocationStats;
  locationCountryGroups: ImageLocationCountryGroup[];
  expandedLocationCountries: string[];
  onToggleCountry: (country: string) => void;
}

export default function ImageLocationPanel({
  locationStats,
  locationCountryGroups,
  expandedLocationCountries,
  onToggleCountry,
}: ImageLocationPanelProps) {
  return (
    <section className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="border-b border-slate-100 bg-slate-50/80 p-5 lg:border-b-0 lg:border-r">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Globe2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">地点地图</h2>
            <p className="mt-1 text-xs text-slate-500">{locationStats.imageCount} 张已定位</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-2xl font-bold text-slate-900">{locationStats.countryCount}</div>
            <div className="mt-1 text-xs font-medium text-slate-500">国家</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-2xl font-bold text-slate-900">{locationStats.cityCount}</div>
            <div className="mt-1 text-xs font-medium text-slate-500">城市</div>
          </div>
        </div>

        <div className="relative mt-5">
          <div className="max-h-[34rem] space-y-2 overflow-auto pb-6 pr-1">
            {locationCountryGroups.length > 0 ? locationCountryGroups.map(group => (
              <div key={group.country} className="overflow-hidden rounded-lg bg-white">
                <button
                  type="button"
                  onClick={() => onToggleCountry(group.country)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs transition-colors hover:bg-orange-50"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
                        expandedLocationCountries.includes(group.country) ? 'rotate-180 text-orange-500' : ''
                      }`}
                    />
                    <span className="min-w-0 truncate font-semibold text-slate-700">{group.country}</span>
                  </span>
                  <span className="shrink-0 font-medium text-slate-400">{group.count} 张</span>
                </button>

                {expandedLocationCountries.includes(group.country) && (
                  <div className="space-y-1 border-t border-slate-100 bg-slate-50/70 px-2 py-2">
                    {group.cities.map(city => (
                      <div key={`${group.country}-${city.city}`} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-xs">
                        <span className="min-w-0 truncate font-medium text-slate-600">{city.city}</span>
                        <span className="shrink-0 text-slate-400">{city.count} 张</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-8 text-center text-xs text-slate-400">
                暂无可定位图片
              </div>
            )}
          </div>
          {locationCountryGroups.length > 4 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-50/95 to-transparent" />
          )}
        </div>
      </div>

      <div className="relative min-h-[560px] overflow-hidden bg-[#f8fbfb] p-5">
        <LocationChartMap points={locationStats.points} />
      </div>
    </section>
  );
}
