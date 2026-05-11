import { useMemo } from 'react';
import { Aperture } from 'lucide-react';
import { FocalLengthStat } from '../../types/imageAnthology';

export const formatFocalLength = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase().endsWith('mm') ? trimmed : `${trimmed}mm`;
};

export default function FocalLengthDetailChart({ stats }: { stats: FocalLengthStat[] }) {
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

  if (numericStats.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        暂无可展示的焦段数据
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">完整焦段统计</h2>
            <p className="mt-1 text-xs text-slate-500">
              {formatFocalLength(String(minFocalLength))} - {formatFocalLength(String(maxFocalLength))}
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <Aperture className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div className="px-6 py-7">
        <div className="relative h-[360px] rounded-xl border border-slate-100 bg-[linear-gradient(180deg,rgba(148,163,184,0.14)_1px,transparent_1px)] bg-[size:100%_72px] px-4 pb-12 pt-8">
          <div className="absolute bottom-12 left-4 right-4 border-t border-slate-300" />
          {numericStats.map(item => {
            const left = ((item.numericValue - minFocalLength) / range) * 100;
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
          <div className="absolute bottom-3 left-4 text-[11px] font-semibold text-slate-400">
            {formatFocalLength(String(minFocalLength))}
          </div>
          <div className="absolute bottom-3 right-4 text-[11px] font-semibold text-slate-400">
            {formatFocalLength(String(maxFocalLength))}
          </div>
        </div>
      </div>
    </section>
  );
}
