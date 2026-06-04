import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Image as ImageIcon, Plus } from 'lucide-react';
import ImageViewer from '../components/ImageGallery/ImageViewer';
import ImageUploadModal from '../components/ImageGallery/ImageUploadModal';
import FocalLengthDetailChart, { FocalLengthFilterOption } from '../components/ImageAnthology/FocalLengthDetailChart';
import ImageAnthologySidebar from '../components/ImageAnthology/ImageAnthologySidebar';
import ImageGalleryFilters from '../components/ImageAnthology/ImageGalleryFilters';
import ImageLocationPanel, { ImageLocationCountryGroup, ImageLocationStats } from '../components/ImageAnthology/ImageLocationPanel';
import ImageMasonryGrid from '../components/ImageAnthology/ImageMasonryGrid';
import ImageTagStatsPanel from '../components/ImageAnthology/ImageTagStatsPanel';
import { SelectOption } from '../components/common/Select';
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

const parseFocalLengthNumber = (focalLength?: string) => {
  if (!focalLength?.trim()) return null;
  const value = Number.parseFloat(focalLength);
  return Number.isFinite(value) ? value : null;
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
  const [galleryCountry, setGalleryCountry] = useState('all');
  const [galleryTags, setGalleryTags] = useState<string[]>([]);
  const [galleryFocalMin, setGalleryFocalMin] = useState('');
  const [galleryFocalMax, setGalleryFocalMax] = useState('');
  const [expandedLocationCountries, setExpandedLocationCountries] = useState<string[]>([]);
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

  const galleryCountryOptions = useMemo<SelectOption<string>[]>(() => {
    const counts = new Map<string, number>();

    images.forEach((image) => {
      const country = image.country?.trim();
      if (!country) return;
      counts.set(country, (counts.get(country) || 0) + 1);
    });

    const options = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([country, count]) => ({
        value: country,
        label: country,
        description: `${count} 张图片`,
      }));

    return [
      { value: 'all', label: '全部国家', description: `${images.length} 张图片` },
      ...options,
    ];
  }, [images]);

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

  useEffect(() => {
    const availableCountries = new Set(galleryCountryOptions.map(option => option.value));
    if (!availableCountries.has(galleryCountry)) {
      setGalleryCountry('all');
    }
  }, [galleryCountry, galleryCountryOptions]);

  useEffect(() => {
    const availableTags = new Set(tagStats.map(option => option.name));
    setGalleryTags(prev => prev.filter(tag => availableTags.has(tag)));
  }, [tagStats]);

  const galleryTagOptions = tagStats;

  const baseVisibleImages = useMemo(() => {
    const minFocal = galleryFocalMin === '' ? null : Number.parseFloat(galleryFocalMin);
    const maxFocal = galleryFocalMax === '' ? null : Number.parseFloat(galleryFocalMax);
    const hasValidMin = minFocal !== null && Number.isFinite(minFocal);
    const hasValidMax = maxFocal !== null && Number.isFinite(maxFocal);

    return images.filter((image) => {
      const country = image.country?.trim();
      const imageTags = parseImageTags(image);
      const focalLength = parseFocalLengthNumber(image.focalLength);

      if (galleryCountry !== 'all' && country !== galleryCountry) return false;
      if (galleryTags.length > 0 && !galleryTags.every(tag => imageTags.includes(tag))) return false;
      if (hasValidMin && (focalLength === null || focalLength < minFocal!)) return false;
      if (hasValidMax && (focalLength === null || focalLength > maxFocal!)) return false;

      return true;
    });
  }, [galleryCountry, galleryFocalMax, galleryFocalMin, galleryTags, images]);

  const galleryFilterCount = [
    galleryCountry !== 'all',
    galleryTags.length > 0,
    galleryFocalMin !== '' || galleryFocalMax !== '',
  ].filter(Boolean).length;

  const hasGalleryFilters = galleryFilterCount > 0 || selectedColor !== 'all';

  const handleGalleryTagToggle = (tag: string) => {
    setGalleryTags(prev => (
      prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag]
    ));
  };

  const clearGalleryFilters = () => {
    setGalleryCountry('all');
    setGalleryTags([]);
    setGalleryFocalMin('');
    setGalleryFocalMax('');
    setSelectedColor('all');
  };

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

    baseVisibleImages.forEach((image) => {
      const dominantColor = dominantColors[image.imageId];
      if (!dominantColor) return;
      counts.set(dominantColor.key, (counts.get(dominantColor.key) || 0) + 1);
    });

    return COLOR_SWATCHES
      .map(color => ({ ...color, count: counts.get(color.key) || 0 }));
  }, [baseVisibleImages, dominantColors]);

  const extractedColorCount = baseVisibleImages.filter(image => dominantColors[image.imageId]).length;
  const visibleImages = useMemo(() => {
    if (selectedColor === 'all') return baseVisibleImages;
    return baseVisibleImages.filter(image => dominantColors[image.imageId]?.key === selectedColor);
  }, [baseVisibleImages, dominantColors, selectedColor]);

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
  }, [galleryCountry, galleryFocalMax, galleryFocalMin, galleryTags, selectedColor]);

  useEffect(() => {
    const updateColumnCount = () => setGalleryColumnCount(getGalleryColumnCount());
    updateColumnCount();
    window.addEventListener('resize', updateColumnCount);
    return () => window.removeEventListener('resize', updateColumnCount);
  }, []);

  const locationStats = useMemo<ImageLocationStats>(() => {
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

  const locationCountryGroups = useMemo<ImageLocationCountryGroup[]>(() => {
    const groupMap = new Map<string, {
      country: string;
      count: number;
      cities: Array<{ city: string; count: number }>;
    }>();

    locationStats.points.forEach((point) => {
      const current = groupMap.get(point.country);
      if (current) {
        current.count += point.count;
        current.cities.push({ city: point.city, count: point.count });
      } else {
        groupMap.set(point.country, {
          country: point.country,
          count: point.count,
          cities: [{ city: point.city, count: point.count }],
        });
      }
    });

    return Array.from(groupMap.values())
      .map(group => ({
        ...group,
        cities: group.cities.sort((a, b) => b.count - a.count || a.city.localeCompare(b.city)),
      }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
  }, [locationStats.points]);

  useEffect(() => {
    const availableCountries = new Set(locationCountryGroups.map(group => group.country));
    setExpandedLocationCountries(prev => prev.filter(country => availableCountries.has(country)));
  }, [locationCountryGroups]);

  const handleLocationCountryToggle = (country: string) => {
    setExpandedLocationCountries(prev => (
      prev.includes(country) ? prev.filter(item => item !== country) : [...prev, country]
    ));
  };

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
                    {visibleImages.length === images.length ? `${images.length} 张图片` : `${visibleImages.length} / ${images.length} 张图片`}
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
            <ImageAnthologySidebar
              imageCount={images.length}
              locationCityCount={locationStats.cityCount}
              isLocationMapOpen={isLocationMapOpen}
              isFocalLengthDetailOpen={isFocalLengthDetailOpen}
              isTagDetailOpen={isTagDetailOpen}
              focalLengthStats={focalLengthStats}
              focalLengthSummaryStats={focalLengthSummaryStats}
              focalLengthTotal={focalLengthTotal}
              missingFocalLengthCount={missingFocalLengthCount}
              maxFocalLengthCount={maxFocalLengthCount}
              tagStats={tagStats}
              tagSummaryStats={tagSummaryStats}
              taggedImageCount={taggedImageCount}
              tagTotal={tagTotal}
              maxTagCount={maxTagCount}
              selectedColor={selectedColor}
              colorStats={colorStats}
              extractedColorCount={extractedColorCount}
              baseVisibleImageCount={baseVisibleImages.length}
              onToggleLocationMap={() => {
                setIsLocationMapOpen(open => !open);
                setIsFocalLengthDetailOpen(false);
                setIsTagDetailOpen(false);
              }}
              onToggleFocalLengthDetail={() => {
                setIsFocalLengthDetailOpen(open => !open);
                setIsLocationMapOpen(false);
                setIsTagDetailOpen(false);
              }}
              onToggleTagDetail={() => {
                setIsTagDetailOpen(open => !open);
                setIsLocationMapOpen(false);
                setIsFocalLengthDetailOpen(false);
              }}
              onSelectColor={setSelectedColor}
            />

            <div className="min-w-0">
              <ImageGalleryFilters
                visibleCount={visibleImages.length}
                totalCount={images.length}
                galleryCountry={galleryCountry}
                galleryCountryOptions={galleryCountryOptions}
                galleryTags={galleryTags}
                galleryTagOptions={galleryTagOptions}
                galleryFocalMin={galleryFocalMin}
                galleryFocalMax={galleryFocalMax}
                hasGalleryFilters={hasGalleryFilters}
                onGalleryCountryChange={setGalleryCountry}
                onGalleryTagToggle={handleGalleryTagToggle}
                onGalleryFocalMinChange={setGalleryFocalMin}
                onGalleryFocalMaxChange={setGalleryFocalMax}
                onClearFilters={clearGalleryFilters}
              />

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
                <ImageTagStatsPanel tagStats={tagStats} maxTagCount={maxTagCount} />
              )}

              {isLocationMapOpen && (
                <ImageLocationPanel
                  locationStats={locationStats}
                  locationCountryGroups={locationCountryGroups}
                  expandedLocationCountries={expandedLocationCountries}
                  onToggleCountry={handleLocationCountryToggle}
                />
              )}

              <ImageMasonryGrid
                isHidden={isDetailPanelOpen}
                imageColumns={imageColumns}
                visibleImageCount={visibleImages.length}
                dominantColors={dominantColors}
                isAuthenticated={isAuthenticated}
                onImageClick={handleImageClick}
                onEditImage={handleOpenEditModal}
                onDeleteImage={setDeleteTarget}
                onImageAspectRatio={(imageId, ratio) => {
                  setImageAspectRatios(prev => (
                    prev[imageId] === ratio ? prev : { ...prev, [imageId]: ratio }
                  ));
                }}
                onClearFilters={clearGalleryFilters}
              />
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
          placeName: selectedImage.placeName,
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
