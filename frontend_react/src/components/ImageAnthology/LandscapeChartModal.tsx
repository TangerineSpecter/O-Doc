import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minimize2, X, Smartphone } from 'lucide-react';

interface LandscapeChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export default function LandscapeChartModal({
  isOpen,
  onClose,
  title,
  icon,
  children,
}: LandscapeChartModalProps) {
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth > window.innerHeight;
  });
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
      setIsMobileViewport(window.innerWidth < 1024);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // 锁定背景滚动
  useEffect(() => {
    if (!isOpen || !isMobileViewport) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isMobileViewport, isOpen]);

  // 监听 Esc 退出
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !isMobileViewport) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm lg:hidden overflow-hidden touch-none"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute flex flex-col bg-slate-50 text-slate-900 shadow-2xl overflow-hidden transition-transform duration-200"
        style={
          isLandscape
            ? {
                width: '100dvw',
                height: '100dvh',
                top: 0,
                left: 0,
                transform: 'none',
                paddingLeft: 'env(safe-area-inset-left, 0px)',
                paddingRight: 'env(safe-area-inset-right, 0px)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              }
            : {
                width: '100dvh',
                height: '100dvw',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%) rotate(90deg)',
                transformOrigin: 'center center',
                paddingLeft: 'env(safe-area-inset-top, 0px)',
                paddingRight: 'env(safe-area-inset-bottom, 0px)',
              }
        }
      >
        {/* 横屏顶栏 */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur z-20">
          <div className="flex items-center gap-2.5">
            {icon && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                {icon}
              </div>
            )}
            <h2 className="text-sm font-bold text-slate-900 truncate max-w-[200px] sm:max-w-xs">{title}</h2>
            <span className="hidden sm:inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
              全屏横屏展示
            </span>
            {!isLandscape && (
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-400">
                <Smartphone className="h-3 w-3 rotate-90" />
                横握手机浏览更佳
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 active:scale-95 cursor-pointer"
              title="退出全屏"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              <span>退出全屏</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* 内部滚动内容区 */}
        <main
          className="flex-1 min-h-0 overflow-y-auto overflow-x-auto p-4 sm:p-5"
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          <div className="mx-auto max-w-5xl">
            {children}
          </div>
        </main>
      </div>
    </div>,
    document.body
  );
}
