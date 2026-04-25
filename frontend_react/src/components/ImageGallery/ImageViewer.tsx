import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Calendar, MapPin, Tag as TagIcon, FileText, Download } from 'lucide-react';

interface ImageData {
  imageUrl: string;
  title: string;
  description?: string;
  shootingTime?: string;
  location?: string;
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
  const [isImageZoomed, setIsImageZoomed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
      document.body.style.overflow = 'hidden';
    } else {
      setIsVisible(false);
      setIsImageZoomed(false);
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

  return (
    <div 
      className={`
        fixed inset-0 z-50 flex items-center justify-center
        transition-opacity duration-300
        ${isVisible ? 'opacity-100' : 'opacity-0'}
      `}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
      onClick={onClose}
    >
      {/* Backdrop with blur */}
      <div className="absolute inset-0 backdrop-blur-sm" />

      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-60 p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all duration-300 hover:scale-110 group"
        aria-label="关闭"
      >
        <X className="w-6 h-6 text-white group-hover:rotate-90 transition-transform duration-300" />
      </button>

      {/* Navigation Buttons */}
      {hasPrevious && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsImageZoomed(false);
            onPrevious?.();
          }}
          className="absolute left-6 top-1/2 -translate-y-1/2 z-60 p-4 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all duration-300 hover:scale-110 group"
          aria-label="上一张"
        >
          <ChevronLeft className="w-8 h-8 text-white group-hover:-translate-x-1 transition-transform duration-300" />
        </button>
      )}

      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsImageZoomed(false);
            onNext?.();
          }}
          className="absolute right-[calc(400px+3rem)] top-1/2 -translate-y-1/2 z-60 p-4 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all duration-300 hover:scale-110 group"
          aria-label="下一张"
          style={{ right: 'calc(400px + 3rem)' }}
        >
          <ChevronRight className="w-8 h-8 text-white group-hover:translate-x-1 transition-transform duration-300" />
        </button>
      )}

      {/* Main Content Container */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className={`
          relative w-full max-w-7xl mx-6 my-6 flex gap-6
          transition-all duration-500 ease-out
          ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
        `}
        style={{ height: 'calc(100vh - 3rem)' }}
      >
        {/* Left: Large Image */}
        <div 
          className="flex-1 relative bg-white rounded-3xl overflow-hidden shadow-2xl"
          onClick={() => setIsImageZoomed(!isImageZoomed)}
        >
          {/* Image */}
          <div className={`
            w-full h-full transition-transform duration-500 ease-out
            ${isImageZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}
          `}>
            <img
              src={image.imageUrl}
              alt={image.title}
              className={`
                w-full h-full object-contain
                transition-all duration-500 ease-out
                ${isImageZoomed ? 'scale-150' : 'scale-100'}
              `}
            />
          </div>

          {/* Zoom Indicator */}
          <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
            <span>{isImageZoomed ? '点击缩小' : '点击放大'}</span>
          </div>

          {/* Download Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const link = document.createElement('a');
              link.href = image.imageUrl;
              link.download = image.title || 'image';
              link.target = '_blank';
              link.click();
            }}
            className="absolute bottom-4 right-4 p-2.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-all duration-300 hover:scale-110 group"
            aria-label="下载图片"
          >
            <Download className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Right: Image Details */}
        <div className="w-96 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-8 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
            <h2 className="text-2xl font-bold text-slate-900 leading-relaxed mb-3">
              {image.title}
            </h2>
            {image.author && (
              <p className="text-sm text-slate-500">
                by <span className="text-orange-600 font-medium">{image.author}</span>
              </p>
            )}
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            {/* Description */}
            {image.description && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
                  <FileText className="w-4 h-4 text-orange-500" />
                  <span>描述</span>
                </div>
                <p className="text-slate-600 text-sm leading-relaxed pl-6">
                  {image.description}
                </p>
              </div>
            )}

            {/* Shooting Time */}
            {image.shootingTime && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
                  <Calendar className="w-4 h-4 text-orange-500" />
                  <span>拍摄时间</span>
                </div>
                <p className="text-slate-600 text-sm leading-relaxed pl-6">
                  {image.shootingTime}
                </p>
              </div>
            )}

            {/* Location */}
            {image.location && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
                  <MapPin className="w-4 h-4 text-emerald-500" />
                  <span>拍摄地点</span>
                </div>
                <p className="text-slate-600 text-sm leading-relaxed pl-6">
                  {image.location}
                </p>
              </div>
            )}

            {/* Tags */}
            {image.tags && image.tags.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
                  <TagIcon className="w-4 h-4 text-orange-500" />
                  <span>标签</span>
                </div>
                <div className="flex flex-wrap gap-2 pl-6">
                  {image.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1.5 rounded-full bg-gradient-to-r from-orange-50 to-amber-50 text-orange-700 text-xs font-medium border border-orange-200 hover:border-orange-400 transition-colors"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {image.createdAt && (
            <div className="p-6 bg-gradient-to-br from-slate-50 to-white border-t border-slate-100">
              <p className="text-xs text-slate-400 text-center">
                上传于 {image.createdAt}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Keyboard Shortcuts Hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-6 px-6 py-3 rounded-full bg-white/10 backdrop-blur-md text-white text-xs">
        <span className="flex items-center gap-2">
          <kbd className="px-2 py-1 rounded bg-white/20 font-mono">←</kbd>
          <span>上一张</span>
        </span>
        <span className="flex items-center gap-2">
          <kbd className="px-2 py-1 rounded bg-white/20 font-mono">→</kbd>
          <span>下一张</span>
        </span>
        <span className="flex items-center gap-2">
          <kbd className="px-2 py-1 rounded bg-white/20 font-mono">ESC</kbd>
          <span>关闭</span>
        </span>
      </div>
    </div>
  );
}
