import { useEffect, useMemo, useRef, useState } from 'react';
import { Aperture, ArrowLeft, Droplets, Globe2, Image as ImageIcon, MapPin, Plus, Tag } from 'lucide-react';
import ImageCard from '../components/ImageGallery/ImageCard';
import ImageViewer from '../components/ImageGallery/ImageViewer';
import ImageUploadModal from '../components/ImageGallery/ImageUploadModal';
import LocationChartMap from '../components/ImageAnthology/LocationChartMap';
import FocalLengthDetailChart, { FocalLengthFilterOption, formatFocalLength } from '../components/ImageAnthology/FocalLengthDetailChart';
import { getAnthologyDetail, Anthology } from '../api/anthology';
import { deleteImage, getImagesByAnthology, Image } from '../api/image';
import { getIconComponent } from '../constants/iconList';
import StarLoader from '../components/common/StarLoader';
import ConfirmationModal from '../components/common/ConfirmationModal';
import { useToast } from '../components/common/ToastProvider';
import { FocalLengthStat, ImageTagStat } from '../types/imageAnthology';
import { COLOR_SWATCHES, DominantColorKey, DominantColorResult, extractDominantColor } from '../utils/imageColor';
import { useAuth } from '../contexts/AuthContext';

interface ImageAnthologyPageProps {
  onNavigate?: (viewName: string, params?: any) => void;
  collId?: string;
  title?: string;
}

const parseImageTags = (image: Image) => {
  const source = image.tagsList?.length ? image.tagsList : (image.tags || '').split(/[,，、;；\n]/);
  return source.map(tag => tag.trim()).filter(Boolean);
};

const getImageCityKey = (image: Image) => {
  const country = image.country?.trim();
  const city = image.city?.trim();
  return country && city ? `${country}__${city}` : '';
};

const getImageShootingDateKey = (image: Image) => {
  const source = image.shootingTime || image.shootingTimeStr || image.date || '';
  return source ? source.replace(' ', 'T').slice(0, 10) : '';
};

const buildFocalLengthStats = (sourceImages: Image[]): FocalLengthStat[] => {
  const counts = new Map<string, number>();

  sourceImages.forEach((image) => {
    const focalLength = image.focalLength?.trim();
    if (!focalLength) return;
    counts.set(focalLength, (counts.get(focalLength) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([name, count]) => ({
      name,
      count,
      numericValue: Number.parseFloat(name),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

const sortFilterOptions = (options: FocalLengthFilterOption[]) => {
  return options.sort((a, b) => b.count - a.count || (a.label || a.name).localeCompare(b.label || b.name));
};

const getGalleryColumnCount = () => {
  if (typeof window === 'undefined') return 1;
  if (window.innerWidth >= 1536) return 4;
  if (window.innerWidth >= 1280) return 3;
  if (window.innerWidth >= 640) return 2;
  return 1;
};

export default function ImageAnthologyPage({ onNavigate, collId, title }: ImageAnthologyPageProps) {
  const { isAuthenticated } = useAuth();
  const [anthologyInfo, setAnthologyInfo] = useState<Anthology | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<Image | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Image | null>(null);
  const [isLocationMapOpen, setIsLocationMapOpen] = useState(false);
  const [isFocalLengthDetailOpen, setIsFocalLengthDetailOpen] = useState(false);
  const [isTagDetailOpen, setIsTagDetailOpen] = useState(false);
  const [selectedFocalCountry, setSelectedFocalCountry] = useState('all');
  const [selectedFocalCities, setSelectedFocalCities] = useState<string[]>([]);
  const [selectedFocalTags, setSelectedFocalTags] = useState<string[]>([]);
  const [selectedFocalStartDate, setSelectedFocalStartDate] = useState('');
  const [selectedFocalEndDate, setSelectedFocalEndDate] = useState('');
  const [selectedColor, setSelectedColor] = useState<DominantColorKey | 'all'>('all');
  const [dominantColors, setDominantColors] = useState<Record<string, DominantColorResult | null>>({});
  const [imageAspectRatios, setImageAspectRatios] = useState<Record<string, number>>({});
  const [galleryColumnCount, setGalleryColumnCount] = useState(getGalleryColumnCount);
  const colorExtractionKeysRef = useRef(new Set<string>());
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

      const [anthologyData, imagesData] = await Promise.all([
        getAnthologyDetail(collId),
        getImagesByAnthology(collId),
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
    if (selectedIndex !== null && selectedIndex < visibleImages.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  const handleOpenCreateModal = () => {
    if (!isAuthenticated) return;
    setEditingImage(null);
    setIsUploadModalOpen(true);
  };

  const handleOpenEditModal = (image: Image) => {
    if (!isAuthenticated) return;
    setEditingImage(image);
    setIsUploadModalOpen(true);
  };

  const handleCloseUploadModal = () => {
    setIsUploadModalOpen(false);
    setEditingImage(null);
  };

  const handleConfirmDelete = async () => {
    if (!isAuthenticated || !deleteTarget) return;

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

  const focalLengthStats = useMemo<FocalLengthStat[]>(() => buildFocalLengthStats(images), [images]);

  const focalLengthTotal = focalLengthStats.reduce((total, item) => total + item.count, 0);
  const missingFocalLengthCount = images.length - focalLengthTotal;
  const maxFocalLengthCount = focalLengthStats[0]?.count || 0;
  const focalLengthSummaryStats = focalLengthStats.slice(0, 5);

  const tagStats = useMemo<ImageTagStat[]>(() => {
    const counts = new Map<string, number>();

    images.forEach((image) => {
      parseImageTags(image).forEach((tag) => {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [images]);

  const tagTotal = tagStats.reduce((total, item) => total + item.count, 0);
  const taggedImageCount = images.filter(image => parseImageTags(image).length > 0).length;
  const maxTagCount = tagStats[0]?.count || 0;
  const tagSummaryStats = tagStats.slice(0, 5);

  const focalCountryOptions = useMemo<FocalLengthFilterOption[]>(() => {
    const counts = new Map<string, number>();

    images.forEach((image) => {
      const country = image.country?.trim();
      if (!country) return;
      counts.set(country, (counts.get(country) || 0) + 1);
    });

    return sortFilterOptions(Array.from(counts.entries()).map(([name, count]) => ({ name, count })));
  }, [images]);

  const focalCityOptions = useMemo<FocalLengthFilterOption[]>(() => {
    const counts = new Map<string, { label: string; count: number }>();

    images.forEach((image) => {
      const country = image.country?.trim();
      const city = image.city?.trim();
      if (!country || !city) return;
      if (selectedFocalCountry !== 'all' && country !== selectedFocalCountry) return;

      const key = `${country}__${city}`;
      const current = counts.get(key);
      counts.set(key, {
        label: selectedFocalCountry === 'all' ? `${country} · ${city}` : city,
        count: (current?.count || 0) + 1,
      });
    });

    return sortFilterOptions(Array.from(counts.entries()).map(([name, item]) => ({
      name,
      label: item.label,
      count: item.count,
    })));
  }, [images, selectedFocalCountry]);

  const focalTagOptions = useMemo<FocalLengthFilterOption[]>(
    () => tagStats.map(item => ({ name: item.name, count: item.count })),
    [tagStats]
  );

  useEffect(() => {
    const availableCountries = new Set(focalCountryOptions.map(option => option.name));
    if (selectedFocalCountry !== 'all' && !availableCountries.has(selectedFocalCountry)) {
      setSelectedFocalCountry('all');
    }
  }, [focalCountryOptions, selectedFocalCountry]);

  useEffect(() => {
    const availableCities = new Set(focalCityOptions.map(option => option.name));
    setSelectedFocalCities(prev => prev.filter(city => availableCities.has(city)));
  }, [focalCityOptions]);

  useEffect(() => {
    const availableTags = new Set(focalTagOptions.map(option => option.name));
    setSelectedFocalTags(prev => prev.filter(tag => availableTags.has(tag)));
  }, [focalTagOptions]);

  const filteredFocalImages = useMemo(() => {
    return images.filter((image) => {
      const country = image.country?.trim();
      const cityKey = getImageCityKey(image);
      const imageTags = parseImageTags(image);
      const shootingDate = getImageShootingDateKey(image);

      if (selectedFocalCountry !== 'all' && country !== selectedFocalCountry) return false;
      if (selectedFocalCities.length > 0 && !selectedFocalCities.includes(cityKey)) return false;
      if (selectedFocalTags.length > 0 && !selectedFocalTags.every(tag => imageTags.includes(tag))) return false;
      if (selectedFocalStartDate && (!shootingDate || shootingDate < selectedFocalStartDate)) return false;
      if (selectedFocalEndDate && (!shootingDate || shootingDate > selectedFocalEndDate)) return false;

      return true;
    });
  }, [images, selectedFocalCities, selectedFocalCountry, selectedFocalEndDate, selectedFocalStartDate, selectedFocalTags]);

  const filteredFocalLengthStats = useMemo<FocalLengthStat[]>(
    () => buildFocalLengthStats(filteredFocalImages),
    [filteredFocalImages]
  );

  const filteredFocalLengthTotal = filteredFocalLengthStats.reduce((total, item) => total + item.count, 0);
  const filteredMissingFocalLengthCount = filteredFocalImages.length - filteredFocalLengthTotal;

  const handleFocalCountryChange = (country: string) => {
    setSelectedFocalCountry(country);
    setSelectedFocalCities([]);
  };

  const handleFocalCityToggle = (city: string) => {
    setSelectedFocalCities(prev => (
      prev.includes(city) ? prev.filter(item => item !== city) : [...prev, city]
    ));
  };

  const handleFocalTagToggle = (tag: string) => {
    setSelectedFocalTags(prev => (
      prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag]
    ));
  };

  const clearFocalFilters = () => {
    setSelectedFocalCountry('all');
    setSelectedFocalCities([]);
    setSelectedFocalTags([]);
    setSelectedFocalStartDate('');
    setSelectedFocalEndDate('');
  };

  useEffect(() => {
    let isCancelled = false;
    const targets = images.filter((image) => {
      const extractionKey = `${image.imageId}:${image.imageUrl}`;
      if (colorExtractionKeysRef.current.has(extractionKey)) return false;
      return true;
    });
    if (targets.length === 0) return;

    const extractColors = async () => {
      for (const image of targets) {
        const extractionKey = `${image.imageId}:${image.imageUrl}`;
        colorExtractionKeysRef.current.add(extractionKey);
        const result = await extractDominantColor(image.imageUrl, extractionKey);
        if (isCancelled) return;
        setDominantColors(prev => {
          return { ...prev, [image.imageId]: result };
        });
      }
    };

    extractColors();

    return () => {
      isCancelled = true;
    };
  }, [images]);

  const colorStats = useMemo(() => {
    const counts = new Map<DominantColorKey, number>();

    images.forEach((image) => {
      const dominantColor = dominantColors[image.imageId];
      if (!dominantColor) return;
      counts.set(dominantColor.key, (counts.get(dominantColor.key) || 0) + 1);
    });

    return COLOR_SWATCHES
      .map(color => ({ ...color, count: counts.get(color.key) || 0 }));
  }, [dominantColors, images]);

  const extractedColorCount = images.filter(image => dominantColors[image.imageId]).length;
  const visibleImages = useMemo(() => {
    if (selectedColor === 'all') return images;
    return images.filter(image => dominantColors[image.imageId]?.key === selectedColor);
  }, [dominantColors, images, selectedColor]);

  const imageColumns = useMemo(() => {
    const columnCount = Math.max(galleryColumnCount, 1);
    const columns = Array.from({ length: columnCount }, () => [] as Array<{ image: Image; index: number }>);
    const columnHeights = Array.from({ length: columnCount }, () => 0);

    visibleImages.forEach((image, index) => {
      const aspectRatio = imageAspectRatios[image.imageId] || 4 / 3;
      const estimatedCardHeight = (1 / aspectRatio) + 0.45;
      const columnIndex = index < columnCount
        ? index
        : columnHeights.reduce((shortestIndex, height, currentIndex) => (
          height < columnHeights[shortestIndex] ? currentIndex : shortestIndex
        ), 0);

      columns[columnIndex].push({ image, index });
      columnHeights[columnIndex] += estimatedCardHeight;
    });

    return columns;
  }, [galleryColumnCount, imageAspectRatios, visibleImages]);

  useEffect(() => {
    setSelectedIndex(null);
  }, [selectedColor]);

  useEffect(() => {
    const updateColumnCount = () => setGalleryColumnCount(getGalleryColumnCount());
    updateColumnCount();
    window.addEventListener('resize', updateColumnCount);
    return () => window.removeEventListener('resize', updateColumnCount);
  }, []);

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
  const selectedImage = selectedIndex !== null ? visibleImages[selectedIndex] : null;
  const isDetailPanelOpen = isFocalLengthDetailOpen || isTagDetailOpen || isLocationMapOpen;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50">
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
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

            {isAuthenticated && (
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
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1480px] px-5 py-7 lg:px-6">
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
              <div className="mb-4">
                <button
                  onClick={() => {
                    setIsLocationMapOpen(open => !open);
                    setIsFocalLengthDetailOpen(false);
                    setIsTagDetailOpen(false);
                  }}
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
                  {focalLengthSummaryStats.map((item) => (
                    <div key={item.name} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-semibold text-slate-700">{formatFocalLength(item.name)}</span>
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
                  <button
                    type="button"
                    onClick={() => {
                      setIsFocalLengthDetailOpen(open => !open);
                      setIsLocationMapOpen(false);
                      setIsTagDetailOpen(false);
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      isFocalLengthDetailOpen
                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700'
                    }`}
                  >
                    {focalLengthStats.length > 5 ? `查看全部 ${focalLengthStats.length} 个焦段` : '查看完整焦段图表'}
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs leading-5 text-slate-500">
                  暂无焦段数据
                </div>
              )}

              <div className="my-5 border-t border-slate-100" />

              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">标签统计</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {taggedImageCount} / {images.length} 张已记录
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                  <Tag className="h-4 w-4" />
                </div>
              </div>

              {tagStats.length > 0 ? (
                <div className="space-y-3">
                  {tagSummaryStats.map((item) => (
                    <div key={item.name} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-semibold text-slate-700">{item.name}</span>
                        <span className="shrink-0 font-medium text-slate-400">{item.count} 次</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-orange-500"
                          style={{ width: `${Math.max((item.count / maxTagCount) * 100, 8)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-slate-100 pt-3 text-xs text-slate-400">
                    共记录 {tagTotal} 个标签
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsTagDetailOpen(open => !open);
                      setIsLocationMapOpen(false);
                      setIsFocalLengthDetailOpen(false);
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      isTagDetailOpen
                        ? 'border-orange-200 bg-orange-50 text-orange-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700'
                    }`}
                  >
                    {tagStats.length > 5 ? `查看全部 ${tagStats.length} 个标签` : '查看完整标签统计'}
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs leading-5 text-slate-500">
                  暂无标签数据
                </div>
              )}

              <div className="my-5 border-t border-slate-100" />

              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">主色调</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {extractedColorCount} / {images.length} 张已识别
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                  <Droplets className="h-4 w-4" />
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setSelectedColor('all')}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    selectedColor === 'all'
                      ? 'border-orange-200 bg-orange-50 text-orange-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700'
                  }`}
                >
                  <span>全部颜色</span>
                  <span>{images.length} 张</span>
                </button>
                <div className="grid grid-cols-2 gap-2">
                  {colorStats.map((color) => (
                    <button
                      key={color.key}
                      type="button"
                      onClick={() => setSelectedColor(color.key)}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-all ${
                        selectedColor === color.key
                          ? `${color.borderClass} ${color.bgClass} ${color.textClass} ring-2 ring-offset-1 ring-orange-500/20`
                          : `border-slate-200 bg-white text-slate-600 hover:bg-slate-50 ${color.count === 0 ? 'opacity-55' : ''}`
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                          style={{ backgroundColor: color.hex }}
                        />
                        <span className="truncate">{color.label}</span>
                      </span>
                      <span className="shrink-0 text-slate-400">{color.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <div className="min-w-0">
              {isFocalLengthDetailOpen && (
                <FocalLengthDetailChart
                  stats={filteredFocalLengthStats}
                  totalImages={filteredFocalImages.length}
                  focalLengthTotal={filteredFocalLengthTotal}
                  missingFocalLengthCount={filteredMissingFocalLengthCount}
                  countryOptions={focalCountryOptions}
                  cityOptions={focalCityOptions}
                  tagOptions={focalTagOptions}
                  selectedCountry={selectedFocalCountry}
                  selectedCities={selectedFocalCities}
                  selectedTags={selectedFocalTags}
                  selectedStartDate={selectedFocalStartDate}
                  selectedEndDate={selectedFocalEndDate}
                  onCountryChange={handleFocalCountryChange}
                  onCityToggle={handleFocalCityToggle}
                  onTagToggle={handleFocalTagToggle}
                  onStartDateChange={setSelectedFocalStartDate}
                  onEndDateChange={setSelectedFocalEndDate}
                  onClearFilters={clearFocalFilters}
                />
              )}

              {isTagDetailOpen && (
                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">完整标签统计</h2>
                      <p className="mt-1 text-xs text-slate-500">按使用次数从大到小排列</p>
                    </div>
                    <div className="rounded-lg bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700">
                      {tagStats.length} 个标签
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {tagStats.map((item) => (
                      <div key={item.name} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-semibold text-slate-800">{item.name}</span>
                          <span className="shrink-0 text-xs font-medium text-slate-400">{item.count} 次</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white">
                          <div
                            className="h-full rounded-full bg-orange-500"
                            style={{ width: `${Math.max((item.count / maxTagCount) * 100, 8)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {isLocationMapOpen && (
                <section className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[240px_minmax(0,1fr)]">
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

                  <div className="relative min-h-[560px] overflow-hidden bg-[#f8fbfb] p-5">
                    <LocationChartMap points={locationStats.points} />
                  </div>
                </section>
              )}

              <div className={isDetailPanelOpen ? 'hidden' : ''}>
                {visibleImages.length > 0 ? (
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
                              onClick={() => handleImageClick(index)}
                              onEdit={isAuthenticated ? () => handleOpenEditModal(image) : undefined}
                              onDelete={isAuthenticated ? () => setDeleteTarget(image) : undefined}
                              onImageLoad={({ width, height }) => {
                                if (width <= 0 || height <= 0) return;
                                setImageAspectRatios(prev => (
                                  prev[image.imageId] === width / height
                                    ? prev
                                    : { ...prev, [image.imageId]: width / height }
                                ));
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
                      <Droplets className="h-6 w-6" />
                    </div>
                    <h3 className="text-base font-bold text-slate-800">没有匹配的主色调</h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                      当前颜色筛选下暂无图片，可以切回全部颜色查看完整文集。
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedColor('all')}
                      className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600"
                    >
                      查看全部颜色
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <ImageViewer
        isOpen={selectedIndex !== null}
        image={selectedImage ? {
          imageUrl: selectedImage.imageUrl,
          title: selectedImage.title,
          description: selectedImage.description,
          shootingTime: selectedImage.shootingTimeStr,
          country: selectedImage.country,
          city: selectedImage.city,
          latitude: selectedImage.latitude,
          longitude: selectedImage.longitude,
          focalLength: selectedImage.focalLength,
          tags: selectedImage.tagsList,
          author: selectedImage.author,
          authorNickname: selectedImage.authorNickname,
          createdAt: selectedImage.createdAt,
        } : null}
        onClose={handleCloseViewer}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={selectedIndex !== null && selectedIndex > 0}
        hasNext={selectedIndex !== null && selectedIndex < visibleImages.length - 1}
      />

      {isAuthenticated && (
        <ImageUploadModal
          isOpen={isUploadModalOpen}
          onClose={handleCloseUploadModal}
          onSuccess={loadAnthologyData}
          collId={collId || ''}
          initialData={editingImage}
          existingTags={tagStats.map(item => item.name)}
        />
      )}

      {isAuthenticated && (
        <ConfirmationModal
          isOpen={deleteTarget !== null}
          title="删除图片"
          description={`确定要删除「${deleteTarget?.title || '这张图片'}」吗？此操作无法撤销。`}
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
