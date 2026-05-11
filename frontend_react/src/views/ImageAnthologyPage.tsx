import { useEffect, useMemo, useState } from 'react';
import { Aperture, ArrowLeft, Globe2, Image as ImageIcon, MapPin, Plus } from 'lucide-react';
import ImageCard from '../components/ImageGallery/ImageCard';
import ImageViewer from '../components/ImageGallery/ImageViewer';
import ImageUploadModal from '../components/ImageGallery/ImageUploadModal';
import { getAnthologyDetail, Anthology } from '../api/anthology';
import { deleteImage, getImagesByAnthology, Image } from '../api/image';
import { getIconComponent } from '../constants/iconList';
import StarLoader from '../components/common/StarLoader';
import ConfirmationModal from '../components/common/ConfirmationModal';
import { useToast } from '../components/common/ToastProvider';

interface ImageAnthologyPageProps {
  onNavigate?: (viewName: string, params?: any) => void;
  collId?: string;
  title?: string;
}

export default function ImageAnthologyPage({ onNavigate, collId, title }: ImageAnthologyPageProps) {
  const [anthologyInfo, setAnthologyInfo] = useState<Anthology | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<Image | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Image | null>(null);
  const [isLocationMapOpen, setIsLocationMapOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (collId) {
      loadAnthologyData();
    }
  }, [collId]);

  const loadAnthologyData = async () => {
    if (!collId) return;
    
    try {
      setLoading(true);

      // 并行获取文集详情和图片列表
      const [anthologyData, imagesData] = await Promise.all([
        getAnthologyDetail(collId),
        getImagesByAnthology(collId)
      ]);

      setAnthologyInfo(anthologyData);

      setImages(imagesData);
    } catch (error) {
      console.error('加载图片文集失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (onNavigate) {
      onNavigate('home');
    }
  };

  const handleImageClick = (index: number) => {
    setSelectedIndex(index);
  };

  const handleCloseViewer = () => {
    setSelectedIndex(null);
  };

  const handlePrevious = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleNext = () => {
    if (selectedIndex !== null && selectedIndex < images.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingImage(null);
    setIsUploadModalOpen(true);
  };

  const handleOpenEditModal = (image: Image) => {
    setEditingImage(image);
    setIsUploadModalOpen(true);
  };

  const handleCloseUploadModal = () => {
    setIsUploadModalOpen(false);
    setEditingImage(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteImage(deleteTarget.imageId);
      toast.success('图片已删除');
      setDeleteTarget(null);
      await loadAnthologyData();
    } catch (error) {
      console.error('删除图片失败:', error);
      toast.error('删除失败，请重试');
    }
  };

  const focalLengthStats = useMemo(() => {
    const counts = new Map<string, number>();

    images.forEach((image) => {
      const focalLength = image.focalLength?.trim();
      if (!focalLength) return;
      counts.set(focalLength, (counts.get(focalLength) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [images]);

  const focalLengthTotal = focalLengthStats.reduce((total, item) => total + item.count, 0);
  const missingFocalLengthCount = images.length - focalLengthTotal;
  const maxFocalLengthCount = focalLengthStats[0]?.count || 0;
  const locationStats = useMemo(() => {
    const locationMap = new Map<string, {
      country: string;
      city: string;
      latitude: number;
      longitude: number;
      count: number;
    }>();

    images.forEach((image) => {
      const latitude = Number(image.latitude);
      const longitude = Number(image.longitude);
      const country = image.country?.trim();
      const city = image.city?.trim();

      if (!country || !city || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      const key = `${country}__${city}`;
      const current = locationMap.get(key);
      if (current) {
        current.count += 1;
      } else {
        locationMap.set(key, { country, city, latitude, longitude, count: 1 });
      }
    });

    const points = Array.from(locationMap.values()).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));

    return {
      points,
      countryCount: new Set(points.map(point => point.country)).size,
      cityCount: points.length,
      imageCount: points.reduce((total, point) => total + point.count, 0),
    };
  }, [images]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-orange-50 flex-col">
        <StarLoader />
        <span className="text-sm text-slate-500 mt-4 font-medium">正在加载图片...</span>
      </div>
    );
  }

  const displayTitle = anthologyInfo?.title || title || '图片文集';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left Section */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="p-2 rounded-xl hover:bg-slate-100 transition-colors group"
                aria-label="返回"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600 group-hover:text-orange-600 transition-colors" />
              </button>
              
              <div className="flex items-center gap-3">
                {anthologyInfo && (
                  <div className="p-1.5 bg-slate-50 rounded-md border border-slate-100">
                    {getIconComponent(anthologyInfo.iconId, 'w-5 h-5')}
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-bold text-slate-900 leading-tight">
                    {displayTitle}
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {images.length} 张图片
                  </p>
                </div>
              </div>
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenCreateModal}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-xs font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95"
                aria-label="添加图片"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加图片</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-[1480px] px-5 py-7 lg:px-6">
        {/* Empty State */}
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
              <ImageIcon className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              暂无图片
            </h3>
            <p className="text-sm text-slate-500 text-center max-w-sm">
              这个图片文集还没有上传任何图片
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="self-start rounded-xl border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur lg:sticky lg:top-24">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">焦段统计</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {focalLengthTotal} / {images.length} 张已记录
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <Aperture className="h-4 w-4" />
                </div>
              </div>

              {focalLengthStats.length > 0 ? (
                <div className="space-y-3">
                  {focalLengthStats.map((item) => (
                    <div key={item.name} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-semibold text-slate-700">{item.name}mm</span>
                        <span className="shrink-0 font-medium text-slate-400">{item.count} 张</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{ width: `${Math.max((item.count / maxFocalLengthCount) * 100, 8)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {missingFocalLengthCount > 0 && (
                    <div className="border-t border-slate-100 pt-3 text-xs text-slate-400">
                      未记录焦段 {missingFocalLengthCount} 张
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs leading-5 text-slate-500">
                  暂无焦段数据
                </div>
              )}

              <div className="mt-4 border-t border-slate-100 pt-4">
                <button
                  onClick={() => setIsLocationMapOpen(open => !open)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                    isLocationMapOpen
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    拍摄地点
                  </span>
                  <span>{locationStats.cityCount} 城市</span>
                </button>
              </div>
            </aside>

            <div className="min-w-0 space-y-6">
              {isLocationMapOpen && (
                <section className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="border-b border-slate-100 bg-slate-50/80 p-5 lg:border-b-0 lg:border-r">
                    <div className="mb-5 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <Globe2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">地点地图</h2>
                        <p className="mt-1 text-xs text-slate-500">{locationStats.imageCount} 张已定位</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="text-2xl font-bold text-slate-900">{locationStats.countryCount}</div>
                        <div className="mt-1 text-xs font-medium text-slate-500">国家</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="text-2xl font-bold text-slate-900">{locationStats.cityCount}</div>
                        <div className="mt-1 text-xs font-medium text-slate-500">城市</div>
                      </div>
                    </div>

                    <div className="mt-5 max-h-48 space-y-2 overflow-auto pr-1">
                      {locationStats.points.length > 0 ? locationStats.points.map(point => (
                        <div key={`${point.country}-${point.city}`} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs">
                          <span className="min-w-0 truncate font-semibold text-slate-700">{point.country} · {point.city}</span>
                          <span className="shrink-0 text-slate-400">{point.count} 张</span>
                        </div>
                      )) : (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-8 text-center text-xs text-slate-400">
                          暂无可定位图片
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="relative min-h-[360px] overflow-hidden bg-[#f7fbfb]">
                    <div className="absolute inset-6 rounded-[32px] border border-emerald-100 bg-[linear-gradient(90deg,rgba(15,118,110,0.05)_1px,transparent_1px),linear-gradient(rgba(15,118,110,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />
                    <div className="absolute left-[9%] top-[18%] h-[42%] w-[22%] rounded-[48%_52%_45%_55%] bg-emerald-100/70 blur-sm" />
                    <div className="absolute left-[31%] top-[15%] h-[36%] w-[18%] rounded-[40%_60%_55%_45%] bg-emerald-100/70 blur-sm" />
                    <div className="absolute left-[47%] top-[22%] h-[50%] w-[31%] rounded-[55%_45%_50%_50%] bg-emerald-100/70 blur-sm" />
                    <div className="absolute left-[73%] top-[58%] h-[20%] w-[14%] rounded-[50%] bg-emerald-100/70 blur-sm" />

                    {locationStats.points.map(point => {
                      const left = ((point.longitude + 180) / 360) * 100;
                      const top = ((90 - point.latitude) / 180) * 100;
                      const size = Math.min(18 + point.count * 3, 34);

                      return (
                        <div
                          key={`${point.country}-${point.city}-pin`}
                          className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                          style={{ left: `${left}%`, top: `${top}%` }}
                          title={`${point.country} · ${point.city}：${point.count} 张`}
                        >
                          <div
                            className="rounded-full border-2 border-white bg-orange-500 shadow-[0_8px_24px_rgba(249,115,22,0.35)] ring-4 ring-orange-500/20"
                            style={{ width: size, height: size }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <div className="columns-1 gap-5 sm:columns-2 xl:columns-3 2xl:columns-4">
              {images.map((image, index) => (
                <div
                  key={image.imageId}
                  className="break-inside-avoid animate-fade-in-up"
                  style={{
                    animationDelay: `${index * 60}ms`,
                    animationFillMode: 'both'
                  }}
                >
                  <ImageCard
                    imageUrl={image.imageUrl}
                    title={image.title}
                    shootingTime={image.shootingTimeStr}
                    country={image.country}
                    city={image.city}
                    focalLength={image.focalLength}
                    onClick={() => handleImageClick(index)}
                    onEdit={() => handleOpenEditModal(image)}
                    onDelete={() => setDeleteTarget(image)}
                  />
                </div>
              ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Image Viewer Modal */}
      <ImageViewer
        isOpen={selectedIndex !== null}
        image={selectedIndex !== null ? {
          imageUrl: images[selectedIndex].imageUrl,
          title: images[selectedIndex].title,
          description: images[selectedIndex].description,
          shootingTime: images[selectedIndex].shootingTimeStr,
          country: images[selectedIndex].country,
          city: images[selectedIndex].city,
          latitude: images[selectedIndex].latitude,
          longitude: images[selectedIndex].longitude,
          focalLength: images[selectedIndex].focalLength,
          tags: images[selectedIndex].tagsList,
          author: images[selectedIndex].author,
          createdAt: images[selectedIndex].createdAt
        } : null}
        onClose={handleCloseViewer}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={selectedIndex !== null && selectedIndex > 0}
        hasNext={selectedIndex !== null && selectedIndex < images.length - 1}
      />

      {/* Upload Modal */}
      <ImageUploadModal
        isOpen={isUploadModalOpen}
        onClose={handleCloseUploadModal}
        collId={collId || ''}
        initialData={editingImage}
        onSuccess={() => {
          loadAnthologyData();
        }}
      />

      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="确认删除图片?"
        description={
          <span>
            确定要删除图片<strong className="text-red-600">「{deleteTarget?.title}」</strong>吗？此操作无法恢复。
          </span>
        }
        confirmText="确认删除"
        type="danger"
      />

      {/* Animation Styles */}
      <style>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out;
        }
      `}</style>
    </div>
  );
}
