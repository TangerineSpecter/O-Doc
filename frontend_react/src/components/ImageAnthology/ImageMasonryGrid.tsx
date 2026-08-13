import { Filter } from 'lucide-react';
import { Image } from '../../api/image';
import { DominantColorResult } from '../../utils/imageColor';
import ImageCard from '../ImageGallery/ImageCard';

export interface ImageDisplayItem {
  image: Image;
  images: Image[];
  index: number;
}

interface ImageMasonryGridProps {
  isHidden: boolean;
  imageColumns: Array<ImageDisplayItem[]>;
  visibleImageCount: number;
  dominantColors: Record<string, DominantColorResult | null>;
  isAuthenticated: boolean;
  onImageClick: (item: ImageDisplayItem) => void;
  onEditImage: (item: ImageDisplayItem) => void;
  onDeleteImage: (item: ImageDisplayItem) => void;
  onImageAspectRatio: (imageId: string, ratio: number) => void;
  onClearFilters: () => void;
}

export default function ImageMasonryGrid({
  isHidden,
  imageColumns,
  visibleImageCount,
  dominantColors,
  isAuthenticated,
  onImageClick,
  onEditImage,
  onDeleteImage,
  onImageAspectRatio,
  onClearFilters,
}: ImageMasonryGridProps) {
  return (
    <div className={isHidden ? 'hidden' : 'relative z-0'}>
      {visibleImageCount > 0 ? (
        <div className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {imageColumns.map((column, columnIndex) => (
            <div key={columnIndex} className="min-w-0">
              {column.map((item) => (
                <div
                  key={item.image.imageId}
                  className="animate-fade-in-up"
                  style={{
                    animationDelay: `${item.index * 60}ms`,
                    animationFillMode: 'both',
                  }}
                >
                  <ImageCard
                    imageUrl={item.image.imageUrl}
                    title={item.image.title}
                    shootingTime={item.image.shootingTimeStr}
                    country={item.image.country}
                    city={item.image.city}
                    focalLength={item.image.focalLength}
                    photoCount={item.images.length}
                    focalSummary={item.images.length > 1 ? item.images.map(image => image.focalLength ? `${image.focalLength}mm` : '未知').join(' · ') : undefined}
                    dominantColor={dominantColors[item.image.imageId]}
                    onClick={() => onImageClick(item)}
                    onEdit={isAuthenticated ? () => onEditImage(item) : undefined}
                    onDelete={isAuthenticated ? () => onDeleteImage(item) : undefined}
                    onImageLoad={({ width, height }) => {
                      if (width <= 0 || height <= 0) return;
                      onImageAspectRatio(item.image.imageId, width / height);
                    }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/70 px-6 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <Filter className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">没有匹配的图片</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
            当前筛选条件下暂无图片，可以清除筛选查看完整文集。
          </p>
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600"
          >
            清除筛选
          </button>
        </div>
      )}
    </div>
  );
}
