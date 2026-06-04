import { Filter } from 'lucide-react';
import { Image } from '../../api/image';
import { DominantColorResult } from '../../utils/imageColor';
import ImageCard from '../ImageGallery/ImageCard';

interface ImageMasonryGridProps {
  isHidden: boolean;
  imageColumns: Array<Array<{ image: Image; index: number }>>;
  visibleImageCount: number;
  dominantColors: Record<string, DominantColorResult | null>;
  isAuthenticated: boolean;
  onImageClick: (index: number) => void;
  onEditImage: (image: Image) => void;
  onDeleteImage: (image: Image) => void;
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
              {column.map(({ image, index }) => (
                <div
                  key={image.imageId}
                  className="animate-fade-in-up"
                  style={{
                    animationDelay: `${index * 60}ms`,
                    animationFillMode: 'both',
                  }}
                >
                  <ImageCard
                    imageUrl={image.imageUrl}
                    title={image.title}
                    shootingTime={image.shootingTimeStr}
                    country={image.country}
                    city={image.city}
                    focalLength={image.focalLength}
                    dominantColor={dominantColors[image.imageId]}
                    onClick={() => onImageClick(index)}
                    onEdit={isAuthenticated ? () => onEditImage(image) : undefined}
                    onDelete={isAuthenticated ? () => onDeleteImage(image) : undefined}
                    onImageLoad={({ width, height }) => {
                      if (width <= 0 || height <= 0) return;
                      onImageAspectRatio(image.imageId, width / height);
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
