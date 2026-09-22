import { useEffect, useRef, useState } from 'react';
import {
  Aperture,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Info,
  MapPin,
  Tag as TagIcon
} from 'lucide-react';

interface ImageData {
  imageUrl: string;
  title: string;
  description?: string;
  shootingTime?: string;
  country?: string;
  city?: string;
  placeName?: string;
  latitude?: string;
  longitude?: string;
  focalLength?: string;
  tags?: string[];
  author?: string;
  authorNickname?: string;
  createdAt?: string;
}

interface ImageViewerProps {
  isOpen: boolean;
  image: ImageData | null;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  groupImages?: ImageData[];
  currentGroupIndex?: number;
  onSelectGroupImage?: (index: number) => void;
  currentIndex?: number;
  totalCount?: number;
}

export default function ImageViewer({
  isOpen,
  image,
  onClose,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  groupImages = [],
  currentGroupIndex = 0,
  onSelectGroupImage,
  currentIndex,
  totalCount,
}: ImageViewerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [displayImage, setDisplayImage] = useState<ImageData | null>(image);
  const [displayGroupImages, setDisplayGroupImages] = useState<ImageData[]>(groupImages);
  const [displayGroupIndex, setDisplayGroupIndex] = useState(currentGroupIndex);
  const [showInfo, setShowInfo] = useState(true);
  const [imageRetryTokens, setImageRetryTokens] = useState<Record<string, number>>({});
  const thumbnailStripRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const closeTimerRef = useRef<number | null>(null);
  const imageRetryAttemptsRef = useRef<Record<string, number>>({});
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const groupImageUrls = groupImages.map(groupImage => groupImage.imageUrl).join('|');

  useEffect(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (isOpen && image) {
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
      document.body.style.overflow = 'hidden';
    } else {
      setIsVisible(false);
      document.body.style.overflow = 'unset';
      closeTimerRef.current = window.setTimeout(() => {
        setDisplayImage(null);
        setDisplayGroupImages([]);
      }, 300);
    }

    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, [isOpen, image]);

  useEffect(() => {
    if (!isOpen || !image) return;

    setDisplayImage(image);
    setDisplayGroupImages(groupImages);
    setDisplayGroupIndex(currentGroupIndex);
  }, [currentGroupIndex, groupImages, image, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    imageRetryAttemptsRef.current = {};
    setImageRetryTokens({});
  }, [groupImageUrls, isOpen]);

  useEffect(() => () => {
    document.body.style.overflow = 'unset';
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && hasPrevious) {
        onPrevious?.();
      } else if (e.key === 'ArrowRight' && hasNext) {
        onNext?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onPrevious, onNext, hasPrevious, hasNext]);

  useEffect(() => {
    if (!isOpen || displayGroupImages.length < 2) return;

    const thumbnailStrip = thumbnailStripRef.current;
    const selectedThumbnail = thumbnailRefs.current[displayGroupIndex];
    if (!thumbnailStrip || !selectedThumbnail) return;

    const stripRect = thumbnailStrip.getBoundingClientRect();
    const thumbnailRect = selectedThumbnail.getBoundingClientRect();
    const padding = 8;
    let scrollOffset = 0;

    if (thumbnailRect.left < stripRect.left + padding) {
      scrollOffset = thumbnailRect.left - stripRect.left - padding;
    } else if (thumbnailRect.right > stripRect.right - padding) {
      scrollOffset = thumbnailRect.right - stripRect.right + padding;
    }

    if (scrollOffset !== 0) {
      thumbnailStrip.scrollBy({ left: scrollOffset, behavior: 'smooth' });
    }
  }, [displayGroupImages.length, displayGroupIndex, isOpen]);

  const currentImage = isOpen && image ? image : displayImage;
  const currentGroupImages = isOpen ? groupImages : displayGroupImages;
  const currentGroupIdx = isOpen ? currentGroupIndex : displayGroupIndex;
  const activeDisplayIndex = currentIndex !== undefined ? currentIndex : currentGroupIdx;
  const activeTotalCount = totalCount !== undefined ? totalCount : (currentGroupImages.length || 1);

  if (!currentImage) return null;

  const getImageSource = (imageUrl: string) => {
    const retryToken = imageRetryTokens[imageUrl];
    if (!retryToken || imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) return imageUrl;
    return `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}imageRetry=${retryToken}`;
  };

  const retryImageOnce = (imageUrl: string) => {
    const attempts = imageRetryAttemptsRef.current[imageUrl] || 0;
    if (attempts >= 1) return;

    imageRetryAttemptsRef.current[imageUrl] = attempts + 1;
    setImageRetryTokens(currentTokens => ({ ...currentTokens, [imageUrl]: attempts + 1 }));
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = currentImage.imageUrl;
    link.download = currentImage.title || 'image';
    link.target = '_blank';
    link.click();
  };

  const location = [currentImage.country, currentImage.city].filter(Boolean).join(' ');
  const placeName = currentImage.placeName?.trim() || '';
  const shootingDate = currentImage.shootingTime ? currentImage.shootingTime.replace('T', ' ').slice(0, 10) : '';
  const focalLengthLabel = currentImage.focalLength ? `${currentImage.focalLength}mm` : '';
  const authorName = currentImage.authorNickname || currentImage.author;
  const isPhotoGroup = currentGroupImages.length > 1;
  const previousImage = currentGroupIdx > 0 ? currentGroupImages[currentGroupIdx - 1] : null;
  const nextImage = currentGroupIdx < currentGroupImages.length - 1 ? currentGroupImages[currentGroupIdx + 1] : null;

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

    // 水平左右滑动手势翻页
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      if (deltaX < -40 && hasNext) {
        onNext?.();
      } else if (deltaX > 40 && hasPrevious) {
        onPrevious?.();
      }
    } else if (deltaY > 90 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
      // 垂直向下滑动快速退出预览
      onClose();
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  const hasExtraInfo = Boolean(shootingDate || location || placeName || focalLengthLabel || (currentImage.tags && currentImage.tags.length > 0) || currentImage.description);

  return (
    <div
      data-disable-swipe-back="true"
      className={`
        fixed inset-0 z-50 flex flex-col bg-slate-900/40 backdrop-blur-sm text-slate-900
        transition-opacity duration-200
        ${isVisible ? 'opacity-100' : 'opacity-0'}
        ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}
      `}
      onClick={onClose}
    >
      {/* 整个画廊主容器（Light 纯净浅色背景） */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col bg-slate-50 overflow-hidden select-none"
      >
        {/* 顶部优雅轻量控制栏 */}
        <header className="relative z-30 flex h-12 sm:h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/95 px-3 sm:px-6 backdrop-blur-md shadow-xs">
          {/* 左侧返回与进度指示 */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition-all hover:bg-slate-100 hover:text-orange-600 active:scale-95"
              aria-label="关闭"
              title="关闭 (Esc)"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>返回</span>
            </button>
            <div className="flex items-center gap-1 rounded-full border border-orange-200/80 bg-orange-50/90 px-2.5 py-0.5 text-xs font-semibold text-orange-700 shadow-2xs">
              <span>{activeDisplayIndex + 1}</span>
              <span className="text-orange-400">/</span>
              <span>{activeTotalCount}</span>
              {isPhotoGroup && (
                <span className="ml-1 text-[10px] text-orange-600 font-normal">
                  (组图 {currentGroupIdx + 1}/{currentGroupImages.length})
                </span>
              )}
            </div>
          </div>

          {/* 顶部中间标题 */}
          <div className="max-w-[140px] sm:max-w-md truncate text-center text-xs sm:text-sm font-bold text-slate-800">
            {currentImage.title}
          </div>

          {/* 右侧操作按钮 */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setShowInfo(prev => !prev)}
              className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all active:scale-95 shadow-2xs ${
                showInfo
                  ? 'border-orange-500 bg-orange-500 text-white shadow-xs shadow-orange-500/30'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              aria-label="切换信息"
              title={showInfo ? '隐藏图片信息' : '展开图片信息'}
            >
              <Info className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-2xs transition-all hover:bg-slate-100 hover:text-slate-900 active:scale-95"
              aria-label="下载图片"
              title="下载原图"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* 主展示区：图片视口 + 严格固定高度/宽度的描述面板 */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row overflow-hidden">
          {/* 上部：图片视口（flex-1 自动撑满剩余固定视口，支持手势翻页） */}
          <div
            className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-slate-100/75 p-2 sm:p-4 touch-pan-y select-none"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* 浮动翻页按钮：上一张（移动端与桌面端均提供便捷轻触） */}
            {hasPrevious && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPrevious?.();
                }}
                className="absolute left-2.5 sm:left-4 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-slate-200/90 bg-white/90 text-slate-700 shadow-md backdrop-blur-sm transition-all hover:bg-white hover:text-orange-600 active:scale-90"
                aria-label="上一张"
                title={previousImage ? `上一张 · ${previousImage.title || ''}` : '上一张'}
              >
                <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            )}

            {/* 浮动翻页按钮：下一张 */}
            {hasNext && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNext?.();
                }}
                className="absolute right-2.5 sm:right-4 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-slate-200/90 bg-white/90 text-slate-700 shadow-md backdrop-blur-sm transition-all hover:bg-white hover:text-orange-600 active:scale-90"
                aria-label="下一张"
                title={nextImage ? `下一张 · ${nextImage.title || ''}` : '下一张'}
              >
                <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            )}

            {/* 核心大图容器：保证无论横图竖图均在固定视口内完整居中呈现 */}
            <div className="flex h-full w-full items-center justify-center overflow-hidden">
              <img
                src={getImageSource(currentImage.imageUrl)}
                alt={currentImage.title}
                onError={() => retryImageOnce(currentImage.imageUrl)}
                className="max-h-full max-w-full object-contain rounded-lg shadow-md shadow-slate-300/60 transition-transform duration-200"
              />
            </div>

            {/* 组图水平缩略图条 */}
            {isPhotoGroup && (
              <div className="absolute bottom-2.5 inset-x-0 z-20 flex justify-center px-4">
                <div
                  ref={thumbnailStripRef}
                  className="flex max-w-full gap-2 overflow-x-auto rounded-xl border border-slate-200/90 bg-white/90 p-1.5 backdrop-blur-md shadow-md scrollbar-none"
                >
                  {currentGroupImages.map((groupImage, index) => (
                    <button
                      key={`${groupImage.imageUrl}-${index}`}
                      ref={(element) => {
                        thumbnailRefs.current[index] = element;
                      }}
                      type="button"
                      onClick={() => onSelectGroupImage?.(index)}
                      className={`relative h-11 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                        index === currentGroupIdx
                          ? 'border-orange-500 ring-2 ring-orange-500/40 scale-105'
                          : 'border-slate-200 opacity-65 hover:opacity-100'
                      }`}
                      aria-label={`查看第 ${index + 1} 张`}
                    >
                      <img
                        src={getImageSource(groupImage.imageUrl)}
                        alt={`第 ${index + 1} 张`}
                        loading={index === currentGroupIdx ? 'eager' : 'lazy'}
                        onError={() => retryImageOnce(groupImage.imageUrl)}
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute bottom-0 inset-x-0 bg-slate-900/65 py-0.5 text-[9px] font-semibold text-white">
                        {groupImage.focalLength ? `${groupImage.focalLength}mm` : `${index + 1}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 下部：详细信息面板（移动端固定高度 h-[210px]，绝不随内容多少发生上下位移） */}
          {showInfo && (
            <aside className="shrink-0 flex flex-col border-t border-slate-200/90 bg-white transition-all duration-200 h-[210px] sm:h-[225px] lg:h-full lg:w-80 xl:w-96 lg:border-l lg:border-t-0 shadow-xs">
              {/* 标题与作者信息（固定高顶栏） */}
              <div className="shrink-0 border-b border-slate-100 px-4 py-2.5 sm:px-5 sm:py-3.5 bg-white">
                <div className="mb-1 h-1 w-6 rounded-full bg-orange-500" />
                <h3 className="truncate text-sm sm:text-base font-bold text-slate-900 leading-tight">
                  {currentImage.title}
                </h3>
                {authorName && (
                  <p className="mt-0.5 text-xs text-slate-500 truncate">
                    by <span className="font-semibold text-orange-600">{authorName}</span>
                  </p>
                )}
              </div>

              {/* 详细信息内容滚动区（固定面板内部独立滚动，杜绝抖动） */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2.5 sm:px-5 sm:py-3 space-y-2.5 text-xs">
                {/* EXIF 胶囊信息行 */}
                {(focalLengthLabel || location || placeName || shootingDate) && (
                  <div className="flex flex-wrap gap-1.5">
                    {focalLengthLabel && (
                      <div className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 font-medium text-sky-700">
                        <Aperture className="h-3 w-3 text-sky-500" />
                        <span>焦段 {focalLengthLabel}</span>
                      </div>
                    )}
                    {location && (
                      <div className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                        <MapPin className="h-3 w-3 text-emerald-500" />
                        <span>{location}</span>
                      </div>
                    )}
                    {placeName && (
                      <div className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 font-medium text-teal-700">
                        <MapPin className="h-3 w-3 text-teal-500" />
                        <span>{placeName}</span>
                      </div>
                    )}
                    {shootingDate && (
                      <div className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                        <Calendar className="h-3 w-3 text-amber-500" />
                        <span>{shootingDate}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 标签列表 */}
                {currentImage.tags && currentImage.tags.length > 0 && (
                  <div>
                    <div className="mb-1 flex items-center gap-1 font-semibold text-slate-600">
                      <TagIcon className="h-3 w-3 text-orange-500" />
                      <span>标签</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {currentImage.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 描述信息 */}
                {currentImage.description && (
                  <div>
                    <div className="mb-1 flex items-center gap-1 font-semibold text-slate-600">
                      <FileText className="h-3 w-3 text-orange-500" />
                      <span>描述</span>
                    </div>
                    <p className="leading-relaxed text-slate-700 whitespace-pre-wrap">
                      {currentImage.description}
                    </p>
                  </div>
                )}

                {!hasExtraInfo && (
                  <p className="text-slate-400 py-1 italic">
                    暂无更多参数描述
                  </p>
                )}

                {/* 上传时间 */}
                {currentImage.createdAt && (
                  <div className="pt-2 border-t border-slate-100 text-right text-[10px] text-slate-400">
                    上传于 {currentImage.createdAt}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
