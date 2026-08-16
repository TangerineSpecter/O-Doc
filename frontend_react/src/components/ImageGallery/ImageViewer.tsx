import { useEffect, useRef, useState } from 'react';
import {
  Aperture,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  MapPin,
  Tag as TagIcon,
  X
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
}: ImageViewerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [displayImage, setDisplayImage] = useState<ImageData | null>(image);
  const [displayGroupImages, setDisplayGroupImages] = useState<ImageData[]>(groupImages);
  const [displayGroupIndex, setDisplayGroupIndex] = useState(currentGroupIndex);
  const [imageRetryTokens, setImageRetryTokens] = useState<Record<string, number>>({});
  const thumbnailStripRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const closeTimerRef = useRef<number | null>(null);
  const imageRetryAttemptsRef = useRef<Record<string, number>>({});
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
  const currentIndex = isOpen ? currentGroupIndex : displayGroupIndex;

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
  const previousImage = currentIndex > 0 ? currentGroupImages[currentIndex - 1] : null;
  const nextImage = currentIndex < currentGroupImages.length - 1 ? currentGroupImages[currentIndex + 1] : null;

  return (
    <div
      className={`
        fixed inset-x-0 bottom-0 top-16 z-50 bg-slate-900/28 p-3 text-slate-900 backdrop-blur-sm md:p-6 lg:px-28 xl:px-32
        transition-opacity duration-300
        ${isVisible ? 'opacity-100' : 'opacity-0'}
        ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}
      `}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`
          relative mx-auto flex h-full w-full max-w-[1920px] overflow-hidden rounded-2xl
          border border-white bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]
          transition-all duration-300 ease-out
          ${isVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.985] opacity-0'}
        `}
      >
        <main className="grid min-h-0 w-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="relative flex min-h-[360px] min-w-0 bg-[#fbfaf8] lg:min-h-0">
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 px-4 py-4 md:px-6">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrevious?.();
                  }}
                  disabled={!hasPrevious}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="上一张"
                  title={previousImage ? `上一张 · ${previousImage.focalLength || '未填写'}mm` : '上一张'}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                {isPhotoGroup && (
                  <div className="rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur-sm">
                    拍摄组 <span className="text-orange-600">{currentIndex + 1}</span> / {currentGroupImages.length}
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNext?.();
                  }}
                  disabled={!hasNext}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="下一张"
                  title={nextImage ? `下一张 · ${nextImage.focalLength || '未填写'}mm` : '下一张'}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 w-full items-center justify-center p-4 md:p-6 2xl:p-8">
              <img
                src={getImageSource(currentImage.imageUrl)}
                alt={currentImage.title}
                onError={() => retryImageOnce(currentImage.imageUrl)}
                className="max-h-full max-w-full select-none rounded-sm object-contain shadow-[0_14px_44px_rgba(15,23,42,0.16)]"
              />
            </div>
            {isPhotoGroup && (
              <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-4 md:pb-6">
                <div ref={thumbnailStripRef} className="flex max-w-full gap-2 overflow-x-auto rounded-xl border border-white/60 bg-slate-900/45 p-2 shadow-lg backdrop-blur-md">
                  {currentGroupImages.map((groupImage, index) => (
                    <button
                      key={`${groupImage.imageUrl}-${index}`}
                      ref={(element) => {
                        thumbnailRefs.current[index] = element;
                      }}
                      type="button"
                      onClick={() => onSelectGroupImage?.(index)}
                      className={`relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${index === currentIndex ? 'border-orange-400 ring-2 ring-orange-300/70' : 'border-white/50 opacity-70 hover:opacity-100'}`}
                      aria-label={`查看第 ${index + 1} 张`}
                    >
                      <img src={getImageSource(groupImage.imageUrl)} alt={`第 ${index + 1} 张`} loading={index === currentIndex ? 'eager' : 'lazy'} onError={() => retryImageOnce(groupImage.imageUrl)} className="h-full w-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-slate-950/55 py-0.5 text-[10px] font-semibold text-white">{groupImage.focalLength ? `${groupImage.focalLength}mm` : `${index + 1}`}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="flex min-h-0 flex-col border-t border-slate-100 bg-white lg:border-l lg:border-t-0">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <div className="mb-3 h-1 w-12 rounded-full bg-orange-500" />
                <h2 className="break-words text-2xl font-bold leading-tight text-slate-900">
                  {currentImage.title}
                </h2>
                {authorName && (
                  <p className="mt-2 text-sm text-slate-500">
                    by <span className="font-semibold text-orange-600">{authorName}</span>
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload();
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
                  aria-label="下载图片"
                  title="下载图片"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500 text-white transition-colors hover:bg-orange-600"
                  aria-label="关闭"
                  title="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-6">
                {currentImage.description && (
                  <section>
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <FileText className="h-4 w-4 text-orange-500" />
                      <span>描述</span>
                    </div>
                    <p className="text-sm leading-7 text-slate-600">
                      {currentImage.description}
                    </p>
                  </section>
                )}

                {(shootingDate || location || placeName || focalLengthLabel) && (
                  <section className="divide-y divide-slate-100 border-y border-slate-100">
                    {shootingDate && (
                      <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 py-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                          <Calendar className="h-4 w-4 text-orange-500" />
                          <span>拍摄日期</span>
                        </div>
                        <p className="break-words text-sm font-semibold text-slate-800">{shootingDate}</p>
                      </div>
                    )}

                    {location && (
                      <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 py-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                          <MapPin className="h-4 w-4 text-emerald-500" />
                          <span>拍摄地点</span>
                        </div>
                        <p className="break-words text-sm font-semibold text-slate-800">{location}</p>
                      </div>
                    )}

                    {placeName && (
                      <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 py-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                          <MapPin className="h-4 w-4 text-lime-500" />
                          <span>具体地点</span>
                        </div>
                        <p className="break-words text-sm font-semibold text-slate-800">{placeName}</p>
                      </div>
                    )}

                    {focalLengthLabel && (
                      <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 py-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                          <Aperture className="h-4 w-4 text-sky-500" />
                          <span>焦段</span>
                        </div>
                        <p className="break-words text-sm font-semibold text-slate-800">{focalLengthLabel}</p>
                      </div>
                    )}
                  </section>
                )}

                {currentImage.tags && currentImage.tags.length > 0 && (
                  <section>
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <TagIcon className="h-4 w-4 text-orange-500" />
                      <span>标签</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {currentImage.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>

            {currentImage.createdAt && (
              <div className="shrink-0 border-t border-slate-100 bg-slate-50/70 px-6 py-4 text-right text-xs font-medium text-slate-400">
                上传于 {currentImage.createdAt}
              </div>
            )}
          </aside>
        </main>
      </div>
    </div>
  );
}
