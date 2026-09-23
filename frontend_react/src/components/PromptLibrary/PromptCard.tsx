import {Copy, Heart, Image as ImageIcon, Sparkles} from 'lucide-react';
import type {PromptTemplate} from '../../types/api/prompt';
import AuthenticatedResourceImage from '../common/AuthenticatedResourceImage';

interface Props { item: PromptTemplate; onOpen: () => void; onToggleFavorite: () => void; }
const typeLabel = {image: '生图', html_report: 'HTML 报告', general: '通用'};

export default function PromptCard({item, onOpen, onToggleFavorite}: Props) {
  return (
    <article
      onClick={onOpen}
      className="group cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md active:scale-[0.99]"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-orange-50 via-amber-50 to-lime-50">
        {item.coverImage ? (
          <AuthenticatedResourceImage
            resourceId={item.coverImage.assetId}
            alt={`${item.title} 效果`}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-orange-300">
            <ImageIcon className="h-7 w-7 sm:h-8 sm:w-8"/>
            <span className="mt-1.5 text-xs text-orange-400/80">等待第一张效果图</span>
          </div>
        )}
        <button
          onClick={event => { event.stopPropagation(); onToggleFavorite(); }}
          className="absolute right-2.5 top-2.5 rounded-full bg-white/90 p-2 text-slate-400 shadow-sm backdrop-blur hover:text-orange-500 active:scale-95 transition-all w-8 h-8 flex items-center justify-center"
          title={item.isFavorite ? '取消收藏' : '收藏'}
        >
          <Heart className={`h-4 w-4 ${item.isFavorite ? 'fill-orange-400 text-orange-400' : ''}`}/>
        </button>
      </div>

      <div className="p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-bold text-slate-800">{item.title}</h3>
          <span className="shrink-0 rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
            {typeLabel[item.promptType]}
          </span>
        </div>

        <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-5 text-slate-500">
          {item.description || item.positiveTemplate}
        </p>

        <div className="mt-2.5 flex flex-wrap gap-1">
          {item.category && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 font-medium">
              {item.category.name}
            </span>
          )}
          {item.themes.slice(0, 2).map(theme => (
            <span key={theme.id} className="rounded bg-lime-50 px-1.5 py-0.5 text-[10px] text-lime-700">
              {theme.name}
            </span>
          ))}
          {item.tags.slice(0, 2).map(tag => (
            <span key={tag.id} className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">
              #{tag.name}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-orange-400"/>
            {item.latestUsage?.resultImages.length || 0} 张最近效果
          </span>
          <span className="inline-flex items-center gap-1 text-orange-600 font-medium bg-orange-50 px-2 py-0.5 rounded-full hover:bg-orange-100 transition-colors">
            <Copy className="h-3 w-3"/>填写使用
          </span>
        </div>
      </div>
    </article>
  );
}
