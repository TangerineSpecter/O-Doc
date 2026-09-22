import { X } from 'lucide-react';
import { ImageTagStat } from '../../types/imageAnthology';

interface ImageTagStatsPanelProps {
  tagStats: ImageTagStat[];
  maxTagCount: number;
  onClose?: () => void;
}

export default function ImageTagStatsPanel({ tagStats, maxTagCount, onClose }: ImageTagStatsPanelProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">完整标签统计</h2>
          <p className="mt-1 text-xs text-slate-500">按使用次数从大到小排列</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700">
            {tagStats.length} 个标签
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
              aria-label="关闭标签统计"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
        {tagStats.map((item) => (
          <div key={item.name} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-semibold text-slate-800">{item.name}</span>
              <span className="shrink-0 text-xs font-medium text-slate-400">{item.count} 次</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-orange-500"
                style={{ width: `${Math.max((item.count / maxTagCount) * 100, 8)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
