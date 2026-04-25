import { useEffect, useState } from 'react';
import {
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
  tags?: string[];
  author?: string;
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
}

export default function ImageViewer({
  isOpen,
  image,
  onClose,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext
}: ImageViewerProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
      document.body.style.overflow = 'hidden';
    } else {
      setIsVisible(false);
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

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

  if (!isOpen || !image) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = image.imageUrl;
    link.download = image.title || 'image';
    link.target = '_blank';
    link.click();
  };
  const location = [image.country, image.city].filter(Boolean).join(' ');

  return (
    <div
      className={`
        fixed inset-0 z-50 bg-slate-900/28 p-3 text-slate-900 backdrop-blur-sm md:p-8
        transition-opacity duration-300
        ${isVisible ? 'opacity-100' : 'opacity-0'}
      `}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`
          relative mx-auto flex h-full w-full max-w-[1320px] overflow-hidden rounded-2xl
          border border-white bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]
          transition-all duration-300 ease-out
          ${isVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.985] opacity-0'}
        `}
      >
        <main className="grid min-h-0 w-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="relative min-h-[360px] bg-[#fbfaf8] lg:min-h-0">
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
                  title="上一张"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNext?.();
                  }}
                  disabled={!hasNext}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="下一张"
                  title="下一张"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex h-full min-h-[360px] items-center justify-center p-5 pt-16 md:p-8 md:pt-20 lg:min-h-0">
              <img
                src={image.imageUrl}
                alt={image.title}
                className="max-h-full max-w-full select-none rounded-sm object-contain shadow-[0_14px_44px_rgba(15,23,42,0.16)]"
              />
            </div>
          </section>

          <aside className="flex min-h-0 flex-col border-t border-slate-100 bg-white lg:border-l lg:border-t-0">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <div className="mb-3 h-1 w-12 rounded-full bg-orange-500" />
                <h2 className="break-words text-2xl font-bold leading-tight text-slate-900">
                  {image.title}
                </h2>
                {image.author && (
                  <p className="mt-2 text-sm text-slate-500">
                    by <span className="font-semibold text-orange-600">{image.author}</span>
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
                {image.description && (
                  <section>
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <FileText className="h-4 w-4 text-orange-500" />
                      <span>描述</span>
                    </div>
                    <p className="text-sm leading-7 text-slate-600">
                      {image.description}
                    </p>
                  </section>
                )}

                {(image.shootingTime || location) && (
                  <section className="divide-y divide-slate-100 border-y border-slate-100">
                    {image.shootingTime && (
                      <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 py-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                          <Calendar className="h-4 w-4 text-orange-500" />
                          <span>拍摄时间</span>
                        </div>
                        <p className="break-words text-sm font-semibold text-slate-800">{image.shootingTime}</p>
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
                  </section>
                )}

                {image.tags && image.tags.length > 0 && (
                  <section>
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <TagIcon className="h-4 w-4 text-orange-500" />
                      <span>标签</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {image.tags.map((tag, index) => (
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

            {image.createdAt && (
              <div className="shrink-0 border-t border-slate-100 bg-slate-50/70 px-6 py-4 text-right text-xs font-medium text-slate-400">
                上传于 {image.createdAt}
              </div>
            )}
          </aside>
        </main>
      </div>
    </div>
  );
}
