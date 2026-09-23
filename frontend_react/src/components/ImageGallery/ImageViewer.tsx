import { useCallback, useEffect, useRef, useState } from 'react';
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
  onSwipePrevious?: () => void;
  onSwipeNext?: () => void;
  hasSwipePrevious?: boolean;
  hasSwipeNext?: boolean;
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
  onSwipePrevious,
  onSwipeNext,
  hasSwipePrevious,
  hasSwipeNext,
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
  const [areNavButtonsVisible, setAreNavButtonsVisible] = useState(true);
  const [imageRetryTokens, setImageRetryTokens] = useState<Record<string, number>>({});
  const thumbnailStripRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const desktopThumbnailStripRef = useRef<HTMLDivElement>(null);
  const desktopThumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const closeTimerRef = useRef<number | null>(null);
  const hideNavTimerRef = useRef<number | null>(null);
  const imageRetryAttemptsRef = useRef<Record<string, number>>({});
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const isTouchInBottomZoneRef = useRef<boolean>(false);
  const isTouchInImageZoneRef = useRef<boolean>(false);
  const [edgeSwipeProgress, setEdgeSwipeProgress] = useState<{ deltaX: number; clientY: number } | null>(null);
  const isEdgeSwipingRef = useRef(false);
  const edgeSwipeStartXRef = useRef(0);
  const edgeSwipeStartYRef = useRef(0);
  const hasVibratedRef = useRef(false);
  const groupImageUrls = groupImages.map(groupImage => groupImage.imageUrl).join('|');

  const resetNavButtonsTimer = useCallback(() => {
    setAreNavButtonsVisible(true);
    if (hideNavTimerRef.current !== null) {
      window.clearTimeout(hideNavTimerRef.current);
    }
    hideNavTimerRef.current = window.setTimeout(() => {
      setAreNavButtonsVisible(false);
    }, 1500);
  }, []);

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
      resetNavButtonsTimer();
    } else {
      setIsVisible(false);
      document.body.style.overflow = 'unset';
      if (hideNavTimerRef.current !== null) {
        window.clearTimeout(hideNavTimerRef.current);
        hideNavTimerRef.current = null;
      }
      closeTimerRef.current = window.setTimeout(() => {
        setDisplayImage(null);
        setDisplayGroupImages([]);
      }, 300);
    }

    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (hideNavTimerRef.current !== null) {
        window.clearTimeout(hideNavTimerRef.current);
      }
    };
  }, [isOpen, image, resetNavButtonsTimer]);

  useEffect(() => {
    if (!isOpen || !image) return;

    setDisplayImage(image);
    setDisplayGroupImages(groupImages);
    setDisplayGroupIndex(currentGroupIndex);
    resetNavButtonsTimer();
  }, [currentGroupIndex, groupImages, image, isOpen, resetNavButtonsTimer]);

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
      } else if (e.key === 'ArrowLeft') {
        resetNavButtonsTimer();
        if (hasSwipePrevious && onSwipePrevious) {
          onSwipePrevious();
        } else if (hasPrevious) {
          onPrevious?.();
        }
      } else if (e.key === 'ArrowRight') {
        resetNavButtonsTimer();
        if (hasSwipeNext && onSwipeNext) {
          onSwipeNext();
        } else if (hasNext) {
          onNext?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onPrevious, onNext, hasPrevious, hasNext, onSwipePrevious, onSwipeNext, hasSwipePrevious, hasSwipeNext, resetNavButtonsTimer]);

  useEffect(() => {
    if (!isOpen || displayGroupImages.length < 2) return;

    const scrollStrip = (strip: HTMLDivElement | null, item: HTMLButtonElement | null) => {
      if (!strip || !item) return;
      const stripRect = strip.getBoundingClientRect();
      const thumbnailRect = item.getBoundingClientRect();

      // 计算使选中项居中展示的目标滚动距离
      const currentScrollLeft = strip.scrollLeft;
      const itemOffsetFromStripLeft = thumbnailRect.left - stripRect.left;
      const targetScrollLeft = currentScrollLeft + itemOffsetFromStripLeft - (stripRect.width - thumbnailRect.width) / 2;

      strip.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
    };

    scrollStrip(thumbnailStripRef.current, thumbnailRefs.current[displayGroupIndex]);
    scrollStrip(desktopThumbnailStripRef.current, desktopThumbnailRefs.current[displayGroupIndex]);
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

  const handleImageTouchStart = (e: React.TouchEvent) => {
    resetNavButtonsTimer();
    const touch = e.touches[0];
    if (!touch) return;
    const startX = touch.clientX;

    // 屏幕左侧边缘起手判定（<= 45px）：触发边缘右滑返回
    if (startX <= 45) {
      isEdgeSwipingRef.current = true;
      edgeSwipeStartXRef.current = startX;
      edgeSwipeStartYRef.current = touch.clientY;
      hasVibratedRef.current = false;
      touchStartXRef.current = null;
      return;
    }

    isEdgeSwipingRef.current = false;
    isTouchInImageZoneRef.current = true;
    isTouchInBottomZoneRef.current = false;
    touchStartXRef.current = startX;
    touchStartYRef.current = touch.clientY;
  };

  const handleContainerTouchStart = (e: React.TouchEvent) => {
    resetNavButtonsTimer();
    const touch = e.touches[0];
    if (!touch) return;
    const startX = touch.clientX;
    const clientY = touch.clientY;

    // 屏幕左侧边缘起手判定（<= 45px）：触发边缘右滑返回
    if (startX <= 45) {
      isEdgeSwipingRef.current = true;
      edgeSwipeStartXRef.current = startX;
      edgeSwipeStartYRef.current = clientY;
      hasVibratedRef.current = false;
      touchStartXRef.current = null;
      return;
    }

    isEdgeSwipingRef.current = false;
    // 判定是否处于屏幕底部 20%~25% 区域 (即视口下半部分 clientY >= 75%)
    const isBottomArea = clientY >= window.innerHeight * 0.75;
    if (isBottomArea) {
      isTouchInBottomZoneRef.current = true;
      isTouchInImageZoneRef.current = false;
      touchStartXRef.current = startX;
      touchStartYRef.current = clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    resetNavButtonsTimer();

    // 边缘右滑返回手势处理
    if (isEdgeSwipingRef.current) {
      const touch = e.touches[0];
      if (!touch) return;
      const currentDeltaX = touch.clientX - edgeSwipeStartXRef.current;
      const currentDeltaY = touch.clientY - edgeSwipeStartYRef.current;

      // 若纵向位移明显大于水平位移，说明是上下拖拽，取消边缘返回
      if (Math.abs(currentDeltaY) > Math.abs(currentDeltaX) * 1.5 && Math.abs(currentDeltaY) > 25) {
        isEdgeSwipingRef.current = false;
        setEdgeSwipeProgress(null);
        return;
      }

      if (currentDeltaX > 0) {
        // 达到有效返回阈值（60px）时触发微触感反馈
        if (currentDeltaX >= 60 && !hasVibratedRef.current) {
          hasVibratedRef.current = true;
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate(10); } catch { /* ignore */ }
          }
        } else if (currentDeltaX < 60) {
          hasVibratedRef.current = false;
        }

        setEdgeSwipeProgress({ deltaX: currentDeltaX, clientY: touch.clientY });
      } else {
        setEdgeSwipeProgress(null);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    resetNavButtonsTimer();

    // 边缘右滑返回手势松手结算
    if (isEdgeSwipingRef.current) {
      const deltaX = edgeSwipeProgress?.deltaX || 0;
      isEdgeSwipingRef.current = false;
      setEdgeSwipeProgress(null);

      if (deltaX >= 60) {
        onClose();
        return;
      }
    }

    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    const isImageZone = isTouchInImageZoneRef.current;
    const isBottomZone = isTouchInBottomZoneRef.current;

    // 仅在图片展示区或底部 20%~25% 区域响应滑动手势翻页
    if (isImageZone || isBottomZone) {
      // 水平左右滑动手势翻页
      if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        if (deltaX < -35) {
          // 向左滑：查看下一张
          const canSwipeNext = hasSwipeNext ?? hasNext;
          if (canSwipeNext) {
            if (onSwipeNext) {
              onSwipeNext();
            } else {
              onNext?.();
            }
          }
        } else if (deltaX > 35) {
          // 向右滑：查看上一张
          const canSwipePrev = hasSwipePrevious ?? hasPrevious;
          if (canSwipePrev) {
            if (onSwipePrevious) {
              onSwipePrevious();
            } else {
              onPrevious?.();
            }
          }
        }
      } else if (isImageZone && deltaY > 90 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
        // 仅在图片展示区：垂直向下滑动快速退出预览
        onClose();
      }
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
    isTouchInBottomZoneRef.current = false;
    isTouchInImageZoneRef.current = false;
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
        className={`flex h-full w-full flex-col bg-slate-50 overflow-hidden select-none ${
          edgeSwipeProgress ? 'transition-none' : 'transition-transform duration-200 ease-out'
        }`}
        style={
          edgeSwipeProgress
            ? {
                transform: `translateX(${Math.max(0, edgeSwipeProgress.deltaX * 0.35)}px)`,
                opacity: Math.max(0.72, 1 - edgeSwipeProgress.deltaX / 360),
              }
            : undefined
        }
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

        {/* 移动端专属主展示区（< lg）：自适应贴顶，图片顶部贴齐，标题/参数/描述紧随其后垂直排版 */}
        <div
          className="flex lg:hidden flex-1 min-h-0 flex-col overflow-y-auto bg-slate-50 select-text"
          onTouchStart={handleContainerTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={resetNavButtonsTimer}
        >
          {/* 上部：贴顶图片展示区 */}
          <div
            className="relative flex shrink-0 w-full flex-col items-center justify-center overflow-hidden bg-slate-100/80 select-none touch-pan-y"
            onTouchStart={handleImageTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={resetNavButtonsTimer}
          >
            {/* 浮动翻页按钮：上一张（进入上一张照片条目） */}
            {hasPrevious && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  resetNavButtonsTimer();
                  onPrevious?.();
                }}
                className={`absolute left-2.5 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/90 bg-white/90 text-slate-700 shadow-md backdrop-blur-sm transition-all duration-300 hover:bg-white hover:text-orange-600 active:scale-90 ${
                  areNavButtonsVisible ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 pointer-events-none scale-95'
                }`}
                aria-label="上一张相片"
                title={previousImage ? `上一张 · ${previousImage.title || ''}` : '上一张相片'}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}

            {/* 浮动翻页按钮：下一张（进入下一张照片条目） */}
            {hasNext && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  resetNavButtonsTimer();
                  onNext?.();
                }}
                className={`absolute right-2.5 top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/90 bg-white/90 text-slate-700 shadow-md backdrop-blur-sm transition-all duration-300 hover:bg-white hover:text-orange-600 active:scale-90 ${
                  areNavButtonsVisible ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 pointer-events-none scale-95'
                }`}
                aria-label="下一张相片"
                title={nextImage ? `下一张 · ${nextImage.title || ''}` : '下一张相片'}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}

            {/* 图片呈现容器：采用固定高度，保证无论横图竖图大图视口高度恒定，杜绝下方缩略图上下跳变 */}
            <div className={`flex w-full items-center justify-center ${showInfo ? 'h-[50vh] sm:h-[54vh]' : 'h-full min-h-[70vh]'} overflow-hidden`}>
              <img
                src={getImageSource(currentImage.imageUrl)}
                alt={currentImage.title}
                onError={() => retryImageOnce(currentImage.imageUrl)}
                className="max-h-full max-w-full object-contain shadow-xs transition-transform duration-200"
              />
            </div>

            {/* 当隐藏信息模式（showInfo === false）全屏沉浸看图时，缩略图条浮动于大图底部 */}
            {isPhotoGroup && !showInfo && (
              <div className="absolute bottom-4 inset-x-0 z-20 flex justify-center px-4 pointer-events-none">
                <div
                  ref={thumbnailStripRef}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                  className="flex max-w-full items-center gap-2 overflow-x-auto rounded-xl border border-slate-200/90 bg-white/90 p-1.5 backdrop-blur-md shadow-md scrollbar-none pointer-events-auto"
                >
                  {currentGroupImages.map((groupImage, index) => {
                    const isSelected = index === currentGroupIdx;
                    return (
                      <button
                        key={`${groupImage.imageUrl}-${index}`}
                        ref={(element) => {
                          thumbnailRefs.current[index] = element;
                        }}
                        type="button"
                        onClick={() => onSelectGroupImage?.(index)}
                        className={`group relative h-11 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-all active:scale-95 ${
                          isSelected
                            ? 'border-orange-500 ring-2 ring-orange-500/35 scale-105 shadow-xs z-10'
                            : 'border-slate-200/90 opacity-60 hover:opacity-100'
                        }`}
                        aria-label={`查看第 ${index + 1} 张`}
                      >
                        <img
                          src={getImageSource(groupImage.imageUrl)}
                          alt={`第 ${index + 1} 张`}
                          loading={isSelected ? 'eager' : 'lazy'}
                          onError={() => retryImageOnce(groupImage.imageUrl)}
                          className="h-full w-full object-cover"
                        />
                        <span
                          className={`absolute bottom-0.5 inset-x-0.5 flex items-center justify-center rounded py-0.5 text-[9px] font-semibold leading-none shadow-xs ${
                            isSelected ? 'bg-orange-600/90 text-white' : 'bg-slate-900/60 text-white'
                          }`}
                        >
                          {groupImage.focalLength ? `${groupImage.focalLength}mm` : `${index + 1}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 当展开信息模式（showInfo === true）时，组图缩略图条自然流平铺在大图下方，杜绝遮挡大图 */}
          {isPhotoGroup && showInfo && (
            <div className="shrink-0 border-y border-slate-200/70 bg-white/95 px-3 py-2 backdrop-blur-md shadow-2xs">
              <div
                ref={thumbnailStripRef}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                className="flex max-w-full items-center gap-2 overflow-x-auto scrollbar-none py-0.5 px-0.5"
              >
                {currentGroupImages.map((groupImage, index) => {
                  const isSelected = index === currentGroupIdx;
                  return (
                    <button
                      key={`${groupImage.imageUrl}-${index}`}
                      ref={(element) => {
                        thumbnailRefs.current[index] = element;
                      }}
                      type="button"
                      onClick={() => onSelectGroupImage?.(index)}
                      className={`group relative h-11 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-all active:scale-95 ${
                        isSelected
                          ? 'border-orange-500 ring-2 ring-orange-500/35 scale-105 shadow-xs z-10'
                          : 'border-slate-200/90 opacity-60 hover:opacity-100'
                      }`}
                      aria-label={`查看第 ${index + 1} 张`}
                    >
                      <img
                        src={getImageSource(groupImage.imageUrl)}
                        alt={`第 ${index + 1} 张`}
                        loading={isSelected ? 'eager' : 'lazy'}
                        onError={() => retryImageOnce(groupImage.imageUrl)}
                        className="h-full w-full object-cover"
                      />
                      <span
                        className={`absolute bottom-0.5 inset-x-0.5 flex items-center justify-center rounded py-0.5 text-[9px] font-semibold leading-none shadow-xs ${
                          isSelected ? 'bg-orange-600/90 text-white' : 'bg-slate-900/60 text-white'
                        }`}
                      >
                        {groupImage.focalLength ? `${groupImage.focalLength}mm` : `${index + 1}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 下部：排版内容卡片（标题、作者、EXIF、标签、描述） */}
          {showInfo && (
            <div className="flex-1 bg-white px-4 py-3.5 sm:px-5 space-y-3 border-t border-slate-200/80 shadow-2xs">
              {/* 标题与作者 */}
              <div>
                <div className="mb-1.5 h-1 w-6 rounded-full bg-orange-500" />
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    {currentImage.title}
                  </h2>
                  {authorName && (
                    <span className="text-xs text-slate-500">
                      by <span className="font-semibold text-orange-600">{authorName}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* EXIF 与 标签 徽章胶囊区 */}
              {(focalLengthLabel || location || placeName || shootingDate || (currentImage.tags && currentImage.tags.length > 0)) && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {focalLengthLabel && (
                    <div className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 font-medium text-sky-700">
                      <Aperture className="h-3.5 w-3.5 text-sky-500" />
                      <span>焦段 {focalLengthLabel}</span>
                    </div>
                  )}
                  {location && (
                    <div className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                      <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                      <span>{location}</span>
                    </div>
                  )}
                  {placeName && (
                    <div className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 font-medium text-teal-700">
                      <MapPin className="h-3.5 w-3.5 text-teal-500" />
                      <span>{placeName}</span>
                    </div>
                  )}
                  {shootingDate && (
                    <div className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                      <Calendar className="h-3.5 w-3.5 text-amber-500" />
                      <span>{shootingDate}</span>
                    </div>
                  )}
                  {currentImage.tags && currentImage.tags.map((tag, index) => (
                    <div
                      key={index}
                      className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 font-medium text-orange-700"
                    >
                      <TagIcon className="h-3 w-3 text-orange-500" />
                      <span>{tag}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 描述信息 */}
              {currentImage.description && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-orange-500" />
                      <span>描述</span>
                    </div>
                    {currentImage.createdAt && (
                      <span className="text-[11px] font-normal text-slate-400">
                        上传于 {currentImage.createdAt}
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {currentImage.description}
                  </p>
                </div>
              )}

              {/* 无描述时的上传时间 */}
              {!currentImage.description && currentImage.createdAt && (
                <div className="pt-2 border-t border-slate-100 text-right text-[11px] text-slate-400">
                  上传于 {currentImage.createdAt}
                </div>
              )}

              {/* 底部呼吸垫片 */}
              <div className="h-8" />
            </div>
          )}
        </div>

        {/* 屏幕左边缘右滑返回动态反馈指示器（微信/iOS 风格弹性抽拉气泡） */}
        {edgeSwipeProgress && (
          <aside
            aria-hidden="true"
            className="pointer-events-none fixed left-0 z-50 flex items-center select-none"
            style={{
              top: `${Math.max(70, Math.min(window.innerHeight - 90, edgeSwipeProgress.clientY - 26))}px`,
              transform: `translateX(${Math.min(edgeSwipeProgress.deltaX * 0.5, 46) - 46}px)`,
              transition: 'transform 75ms ease-out',
            }}
          >
            <div
              className={`flex h-13 items-center rounded-r-full pl-3.5 pr-2.5 shadow-xl transition-all duration-150 ${
                edgeSwipeProgress.deltaX >= 60
                  ? 'bg-orange-500 text-white shadow-orange-500/40 ring-2 ring-orange-300 scale-105'
                  : 'bg-white/95 text-slate-700 backdrop-blur-xl border-y border-r border-slate-200/90 shadow-slate-900/15'
              }`}
            >
              <ChevronLeft
                className={`h-5 w-5 transition-transform duration-150 ${
                  edgeSwipeProgress.deltaX >= 60 ? 'scale-125' : ''
                }`}
              />
            </div>
          </aside>
        )}

        {/* 移动端专属悬浮返回按钮（质感毛玻璃圆纽扣，纯图标设计，居于右侧距离底部 15% 黄金舒适区） */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="fixed right-3.5 bottom-[15%] z-40 lg:hidden flex h-11 w-11 items-center justify-center rounded-full bg-white/90 backdrop-blur-xl border border-white/80 shadow-[0_4px_16px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04] text-slate-700 transition-all duration-200 hover:scale-105 active:scale-90 active:bg-white hover:border-orange-200 hover:shadow-orange-500/20 hover:text-orange-600"
          aria-label="退出照片预览"
          title="退出照片预览"
        >
          <ChevronLeft className="h-5 w-5 -translate-x-0.5" />
        </button>

        {/* 桌面端大屏专属展示区（>= lg）：左侧大图视口 + 右侧固定侧边栏 */}
        <div className="hidden lg:flex min-h-0 flex-1 flex-row overflow-hidden">
          {/* 左侧大图视口 */}
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-slate-100/75 p-4 select-none">
            {/* 浮动翻页按钮：上一张 */}
            {hasPrevious && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPrevious?.();
                }}
                className="absolute left-4 top-1/2 z-20 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/90 bg-white/90 text-slate-700 shadow-md backdrop-blur-sm transition-all hover:bg-white hover:text-orange-600 active:scale-90"
                aria-label="上一张"
                title={previousImage ? `上一张 · ${previousImage.title || ''}` : '上一张'}
              >
                <ChevronLeft className="h-6 w-6" />
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
                className="absolute right-4 top-1/2 z-20 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/90 bg-white/90 text-slate-700 shadow-md backdrop-blur-sm transition-all hover:bg-white hover:text-orange-600 active:scale-90"
                aria-label="下一张"
                title={nextImage ? `下一张 · ${nextImage.title || ''}` : '下一张'}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}

            {/* 核心大图容器 */}
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
              <div className="absolute bottom-4 inset-x-0 z-20 flex justify-center px-4 pointer-events-none">
                <div
                  ref={desktopThumbnailStripRef}
                  className="flex max-w-full items-center gap-2 overflow-x-auto rounded-xl border border-slate-200/90 bg-white/90 p-1.5 backdrop-blur-md shadow-md scrollbar-none pointer-events-auto"
                >
                  {currentGroupImages.map((groupImage, index) => {
                    const isSelected = index === currentGroupIdx;
                    return (
                      <button
                        key={`${groupImage.imageUrl}-${index}`}
                        ref={(element) => {
                          desktopThumbnailRefs.current[index] = element;
                        }}
                        type="button"
                        onClick={() => onSelectGroupImage?.(index)}
                        className={`group relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all active:scale-95 ${
                          isSelected
                            ? 'border-orange-500 ring-2 ring-orange-500/35 scale-105 shadow-sm z-10'
                            : 'border-slate-200/90 opacity-60 hover:opacity-100'
                        }`}
                        aria-label={`查看第 ${index + 1} 张`}
                      >
                        <img
                          src={getImageSource(groupImage.imageUrl)}
                          alt={`第 ${index + 1} 张`}
                          loading={isSelected ? 'eager' : 'lazy'}
                          onError={() => retryImageOnce(groupImage.imageUrl)}
                          className="h-full w-full object-cover"
                        />
                        <span
                          className={`absolute bottom-0.5 inset-x-0.5 flex items-center justify-center rounded py-0.5 text-[9px] font-semibold leading-none shadow-xs ${
                            isSelected ? 'bg-orange-600/90 text-white' : 'bg-slate-900/60 text-white'
                          }`}
                        >
                          {groupImage.focalLength ? `${groupImage.focalLength}mm` : `${index + 1}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 桌面端专属：详细信息右侧边栏 */}
          {showInfo && (
            <aside className="hidden lg:flex shrink-0 flex-col border-l border-slate-200/90 bg-white transition-all duration-200 lg:h-full lg:w-80 xl:w-96 shadow-xs">
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
