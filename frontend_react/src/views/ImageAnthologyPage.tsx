import { useEffect, useMemo, useRef, useState } from 'react';
import { Aperture, ArrowLeft, Globe2, Image as ImageIcon, MapPin, Plus } from 'lucide-react';
import * as echarts from 'echarts';
import { feature as topojsonFeature } from 'topojson-client';
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

interface LocationPoint {
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  count: number;
}

const COUNTRY_MAP_NAMES: Record<string, string> = {
  中国: 'China',
  日本: 'Japan',
  韩国: 'South Korea',
  泰国: 'Thailand',
  新加坡: 'Singapore',
  马来西亚: 'Malaysia',
  印度尼西亚: 'Indonesia',
  越南: 'Vietnam',
  阿联酋: 'United Arab Emirates',
  土耳其: 'Turkey',
  英国: 'United Kingdom',
  法国: 'France',
  意大利: 'Italy',
  西班牙: 'Spain',
  德国: 'Germany',
  荷兰: 'Netherlands',
  瑞士: 'Switzerland',
  奥地利: 'Austria',
  捷克: 'Czechia',
  希腊: 'Greece',
  冰岛: 'Iceland',
  美国: 'United States of America',
  加拿大: 'Canada',
  墨西哥: 'Mexico',
  巴西: 'Brazil',
  阿根廷: 'Argentina',
  澳大利亚: 'Australia',
  新西兰: 'New Zealand',
  埃及: 'Egypt',
  摩洛哥: 'Morocco',
  南非: 'South Africa',
  俄罗斯: 'Russia',
  蒙古: 'Mongolia',
};

const MAP_COUNTRY_CN_NAMES = Object.fromEntries(
  Object.entries(COUNTRY_MAP_NAMES).map(([cnName, mapName]) => [mapName, cnName])
);

const COUNTRY_ISO3: Record<string, string> = {
  中国: 'CHN',
  日本: 'JPN',
  韩国: 'KOR',
  泰国: 'THA',
  新加坡: 'SGP',
  马来西亚: 'MYS',
  印度尼西亚: 'IDN',
  越南: 'VNM',
  阿联酋: 'ARE',
  土耳其: 'TUR',
  英国: 'GBR',
  法国: 'FRA',
  意大利: 'ITA',
  西班牙: 'ESP',
  德国: 'DEU',
  荷兰: 'NLD',
  瑞士: 'CHE',
  奥地利: 'AUT',
  捷克: 'CZE',
  希腊: 'GRC',
  冰岛: 'ISL',
  美国: 'USA',
  加拿大: 'CAN',
  墨西哥: 'MEX',
  巴西: 'BRA',
  阿根廷: 'ARG',
  澳大利亚: 'AUS',
  新西兰: 'NZL',
  埃及: 'EGY',
  摩洛哥: 'MAR',
  南非: 'ZAF',
  俄罗斯: 'RUS',
  蒙古: 'MNG',
};

const CITY_REGION_ALIASES: Record<string, string[]> = {
  伊斯坦布尔: ['İstanbul', 'Istanbul'],
};

const toMapCountryName = (country: string) => COUNTRY_MAP_NAMES[country] || country;
const toDisplayCountryName = (mapName: string) => MAP_COUNTRY_CN_NAMES[mapName] || mapName;
const toCountryIso3 = (country: string) => COUNTRY_ISO3[country] || '';
const toCountryByIso3 = (iso3: string) => (
  Object.entries(COUNTRY_ISO3).find(([, value]) => value === iso3)?.[0] || ''
);
const getCityRegionAliases = (city: string) => CITY_REGION_ALIASES[city] || [city];
const getTopoJsonObjectName = (topoJson: any, preferredObjectName?: string) => {
  if (preferredObjectName && topoJson.objects?.[preferredObjectName]) {
    return preferredObjectName;
  }
  const objectName = Object.keys(topoJson.objects || {})[0];
  if (!objectName) {
    throw new Error('TopoJSON 缺少 objects 数据');
  }
  return objectName;
};

const isPointInRing = ([longitude, latitude]: [number, number], ring: number[][]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > latitude) !== (yj > latitude))
      && (longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
};

const isPointInPolygon = (point: [number, number], polygon: number[][][]) => {
  if (!polygon.length || !isPointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some(ring => isPointInRing(point, ring));
};

const isPointInGeometry = (point: [number, number], geometry: any) => {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    return isPointInPolygon(point, geometry.coordinates);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon: number[][][]) => isPointInPolygon(point, polygon));
  }
  return false;
};

const findRegionByCoordinate = (geoJson: any, longitude: number, latitude: number) => {
  const features = geoJson?.features || [];
  return features.find((feature: any) => isPointInGeometry([longitude, latitude], feature.geometry));
};

function LocationChartMap({ points }: { points: LocationPoint[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.EChartsType | null>(null);
  const [worldMapReady, setWorldMapReady] = useState(false);
  const [worldMapError, setWorldMapError] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [countryMapReady, setCountryMapReady] = useState(false);
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const [boundaryError, setBoundaryError] = useState('');
  const [worldNamesByIso3, setWorldNamesByIso3] = useState<Record<string, string>>({});
  const [countryGeoJson, setCountryGeoJson] = useState<any | null>(null);
  const countrySummaries = useMemo(() => {
    const summaries = new Map<string, { country: string; mapName: string; iso3: string; count: number }>();
    points.forEach(point => {
      const mapName = toMapCountryName(point.country);
      const current = summaries.get(mapName);
      if (current) {
        current.count += point.count;
      } else {
        summaries.set(mapName, {
          country: point.country,
          mapName,
          iso3: toCountryIso3(point.country),
          count: point.count,
        });
      }
    });
    return Array.from(summaries.values());
  }, [points]);
  const visitedCountryIds = useMemo(
    () => new Set(countrySummaries.map(summary => summary.iso3).filter(Boolean)),
    [countrySummaries]
  );
  const visiblePoints = useMemo(() => {
    if (!selectedCountry) return points;
    return points.filter(point => toMapCountryName(point.country) === selectedCountry);
  }, [points, selectedCountry]);
  const selectedSummary = selectedCountry
    ? countrySummaries.find(summary => summary.mapName === selectedCountry)
    : null;
  const selectedCountryIso = selectedSummary ? toCountryIso3(selectedSummary.country) : '';
  const currentMapName = selectedCountry && countryMapReady
    ? `country-${selectedCountryIso}`
    : 'photo-world-map';
  const selectedCityRegions = useMemo(() => {
    const summaries = new Map<string, { name: string; city: string; value: number }>();
    visiblePoints.forEach(point => {
      const aliases = getCityRegionAliases(point.city);
      const features = countryGeoJson?.features || [];
      const matchedFeature = features.find((feature: any) => aliases.includes(feature?.properties?.shapeName))
        || findRegionByCoordinate(countryGeoJson, point.longitude, point.latitude);
      const regionNames = matchedFeature?.properties?.shapeName ? [matchedFeature.properties.shapeName] : aliases;

      regionNames.forEach(name => {
        const current = summaries.get(name);
        if (current) {
          current.value += point.count;
          if (!current.city.split('、').includes(point.city)) {
            current.city = `${current.city}、${point.city}`;
          }
          return;
        }
        summaries.set(name, {
          name,
          city: point.city,
          value: point.count,
        });
      });
    });
    return Array.from(summaries.values());
  }, [countryGeoJson, selectedCountry, visiblePoints]);
  const displayNameByRegionKey = useMemo(() => {
    const names = new Map<string, string>();
    countrySummaries.forEach(summary => {
      if (summary.iso3) {
        names.set(summary.iso3, summary.country);
      }
      names.set(summary.mapName, summary.country);
    });
    return names;
  }, [countrySummaries]);
  const chartData = useMemo(() => {
    if (selectedCountry && countryMapReady) {
      return selectedCityRegions.map(item => ({
        name: item.name,
        locationNames: item.city,
        value: item.value,
      }));
    }

    return countrySummaries.map(summary => ({
      id: summary.iso3,
      name: summary.mapName,
      displayName: summary.country,
      value: summary.count,
      country: summary.country,
    }));
  }, [countryMapReady, countrySummaries, selectedCityRegions, selectedCountry]);
  const mapView = useMemo(() => {
    if (!selectedCountry) {
      return { center: [104, 35], zoom: 3.2 };
    }

    if (visiblePoints.length === 0) {
      return { center: [20, 28], zoom: 1.15 };
    }

    const longitudes = visiblePoints.map(point => point.longitude);
    const latitudes = visiblePoints.map(point => point.latitude);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const center: [number, number] = [
      (minLng + maxLng) / 2,
      (minLat + maxLat) / 2,
    ];

    if (visiblePoints.length === 1) {
      return { center, zoom: 5.8 };
    }

    const lngRange = Math.max(maxLng - minLng, 8);
    const latRange = Math.max(maxLat - minLat, 6);
    const zoom = Math.min(Math.max(180 / Math.max(lngRange, latRange * 1.8), 1.2), 5);
    return { center, zoom };
  }, [selectedCountry, visiblePoints]);

  useEffect(() => {
    let cancelled = false;
    setWorldMapReady(false);
    setWorldMapError('');

    fetch('/maps/world.json')
      .then(response => {
        if (!response.ok) throw new Error('世界地图文件不存在');
        return response.json();
      })
      .then(geoJson => {
        if (cancelled) return;
        echarts.registerMap('photo-world-map', geoJson);
        setWorldMapReady(true);
        const names = (geoJson.features || []).reduce((result: Record<string, string>, feature: any) => {
          const id = feature?.properties?.id;
          const name = feature?.properties?.name;
          if (id && name) {
            result[id] = name;
          }
          return result;
        }, {});
        setWorldNamesByIso3(names);
      })
      .catch(error => {
        if (cancelled) return;
        console.error('加载世界地图失败:', error);
        setWorldMapError('世界地图加载失败');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCountry || !selectedCountryIso) {
      setCountryMapReady(false);
      setCountryGeoJson(null);
      setBoundaryError('');
      setBoundaryLoading(false);
      return;
    }

    let cancelled = false;
    const registeredMapName = `country-${selectedCountryIso}`;
    setBoundaryLoading(true);
    setBoundaryError('');

    fetch(`/maps/${selectedCountryIso}_ADM1.topojson`)
      .then(response => {
        if (!response.ok) throw new Error('本地边界文件不存在');
        return response.json();
      })
      .then(topoJson => {
        if (cancelled) return;
        const objectName = getTopoJsonObjectName(topoJson);
        const geoJson = topojsonFeature(topoJson, topoJson.objects[objectName]) as any;
        echarts.registerMap(registeredMapName, geoJson);
        setCountryGeoJson(geoJson);
        setCountryMapReady(true);
      })
      .catch(error => {
        if (cancelled) return;
        console.error('加载本地国家行政区边界失败:', error);
        setCountryMapReady(false);
        setCountryGeoJson(null);
        setBoundaryError('未找到本地行政区边界，已使用城市点视图');
      })
      .finally(() => {
        if (!cancelled) {
          setBoundaryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCountry, selectedCountryIso]);

  useEffect(() => {
    if (!chartRef.current || !worldMapReady) return;

    const isCountryDetailMap = Boolean(selectedCountry && countryMapReady);
    const chart = instanceRef.current || echarts.init(chartRef.current);
    instanceRef.current = chart;
    const regionDataByName = new Map(chartData.map((item: any) => [item.id || item.name, item]));
    const formatRegionName = (name: string) => {
      const data = regionDataByName.get(name) as any;
      if (data?.displayName) return data.displayName;
      if (!isCountryDetailMap && worldNamesByIso3[name]) {
        return toDisplayCountryName(worldNamesByIso3[name]);
      }
      return displayNameByRegionKey.get(name) || toCountryByIso3(name) || toDisplayCountryName(name);
    };
    const highlightedRegions = chartData.map((item: any) => ({
      name: isCountryDetailMap ? item.name : item.id,
      itemStyle: {
        areaColor: '#fde68a',
        borderColor: '#f59e0b',
        borderWidth: 1.2,
      },
      label: {
        show: isCountryDetailMap,
        color: '#334155',
        fontWeight: 700,
        formatter: () => formatRegionName(item.id || item.name),
      },
    }));
    const scatterData = visiblePoints.map(point => ({
      name: `${point.country} · ${point.city}`,
      value: [point.longitude, point.latitude, point.count],
      displayName: `${point.country} · ${point.city}`,
      count: point.count,
    }));

    const option: echarts.EChartsOption = {
      backgroundColor: '#f8fbfb',
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const datum = params.data || {};
          const displayName = datum.displayName || formatRegionName(params.name);
          const count = datum.count || (Array.isArray(datum.value) ? datum.value[2] : datum.value);
          const countText = count ? `<br/>${count} 张图片` : '';
          const locationText = datum.locationNames ? `<br/>地点：${datum.locationNames}` : '';
          return `${displayName}${locationText}${countText}`;
        },
      },
      geo: {
        map: currentMapName,
        nameProperty: isCountryDetailMap ? 'shapeName' : 'id',
        roam: true,
        center: mapView.center,
        zoom: isCountryDetailMap ? Math.max(mapView.zoom, 4.5) : mapView.zoom,
        scaleLimit: {
          min: 1,
          max: 20,
        },
        regions: highlightedRegions,
        itemStyle: {
          areaColor: '#eef2f7',
          borderColor: '#cbd5e1',
          borderWidth: 0.7,
        },
        emphasis: {
          label: {
            show: true,
            color: '#334155',
            fontWeight: 700,
            formatter: (params: any) => formatRegionName(params.name),
          },
          itemStyle: {
            areaColor: '#e2e8f0',
            borderColor: '#94a3b8',
          },
        },
        label: {
          show: false,
        },
      },
      series: [
        {
          type: 'effectScatter',
          coordinateSystem: 'geo',
          data: scatterData,
          symbolSize: (value: number[]) => Math.min(16 + (value?.[2] || 1) * 3, 34),
          showEffectOn: 'render',
          rippleEffect: {
            brushType: 'stroke',
            scale: 3,
          },
          itemStyle: {
            color: '#f97316',
            borderColor: '#ffffff',
            borderWidth: 2,
            shadowBlur: 14,
            shadowColor: 'rgba(249,115,22,0.35)',
          },
          zlevel: 2,
        },
      ],
    };

    chart.setOption(option, true);

    const handleClick = (params: any) => {
      if (!selectedCountry) {
        const countryId = params?.name;
        const summary = countrySummaries.find(item => (
          (countryId && item.iso3 === countryId)
          || item.mapName === countryId
        ));
        if (summary && visitedCountryIds.has(summary.iso3)) {
          setSelectedCountry(summary.mapName);
        }
      }
    };

    chart.on('click', handleClick);

    return () => {
      chart.off('click', handleClick);
    };
  }, [chartData, countryMapReady, countrySummaries, currentMapName, displayNameByRegionKey, mapView, selectedCountry, visiblePoints, visitedCountryIds, worldMapReady, worldNamesByIso3]);

  useEffect(() => {
    const handleResize = () => {
      instanceRef.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    window.requestAnimationFrame(handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, []);

  return (
    <div className="relative">
      <div ref={chartRef} className="h-[calc(100vh-260px)] min-h-[560px] w-full overflow-hidden rounded-[28px] border border-emerald-100 bg-[#f8fbfb]" />
      <div className="pointer-events-none absolute left-5 top-5 flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
          {selectedSummary ? `${selectedSummary.country} · ${countryMapReady ? '行政区/城市明细' : '城市明细'}` : '世界地图 · 点击高亮国家钻入'}
        </span>
        {boundaryLoading && (
          <span className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-emerald-600 shadow-sm ring-1 ring-emerald-100">
            正在加载行政区边界...
          </span>
        )}
        {boundaryError && (
          <span className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-amber-600 shadow-sm ring-1 ring-amber-100">
            {boundaryError}
          </span>
        )}
        {worldMapError && (
          <span className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm ring-1 ring-red-100">
            {worldMapError}
          </span>
        )}
        {selectedSummary && (
          <button
            type="button"
            onClick={() => setSelectedCountry(null)}
            className="pointer-events-auto rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            返回世界地图
          </button>
        )}
      </div>
    </div>
  );
}

const formatFocalLength = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase().endsWith('mm') ? trimmed : `${trimmed}mm`;
};

interface FocalLengthStat {
  name: string;
  count: number;
  numericValue: number;
}

function FocalLengthDetailChart({ stats }: { stats: FocalLengthStat[] }) {
  const numericStats = useMemo(
    () => stats
      .filter(item => Number.isFinite(item.numericValue))
      .sort((a, b) => a.numericValue - b.numericValue || a.name.localeCompare(b.name)),
    [stats]
  );
  const minFocalLength = numericStats[0]?.numericValue || 0;
  const maxFocalLength = numericStats[numericStats.length - 1]?.numericValue || minFocalLength;
  const maxCount = Math.max(...numericStats.map(item => item.count), 1);
  const range = Math.max(maxFocalLength - minFocalLength, 1);

  if (numericStats.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        暂无可展示的焦段数据
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">完整焦段统计</h2>
            <p className="mt-1 text-xs text-slate-500">
              {formatFocalLength(String(minFocalLength))} - {formatFocalLength(String(maxFocalLength))}
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <Aperture className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div className="px-6 py-7">
        <div className="relative h-[360px] rounded-xl border border-slate-100 bg-[linear-gradient(180deg,rgba(148,163,184,0.14)_1px,transparent_1px)] bg-[size:100%_72px] px-4 pb-12 pt-8">
          <div className="absolute bottom-12 left-4 right-4 border-t border-slate-300" />
          {numericStats.map(item => {
            const left = ((item.numericValue - minFocalLength) / range) * 100;
            const height = Math.max((item.count / maxCount) * 230, 18);

            return (
              <div
                key={item.name}
                className="absolute bottom-12 flex w-12 -translate-x-1/2 flex-col items-center gap-2"
                style={{ left: `${left}%` }}
              >
                <div className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                  {item.count}
                </div>
                <div
                  className="w-5 rounded-t-md bg-sky-500 shadow-sm shadow-sky-500/20"
                  style={{ height }}
                  title={`${formatFocalLength(item.name)}：${item.count} 张`}
                />
                <div className="absolute top-full mt-2 w-20 text-center text-[11px] font-semibold text-slate-600">
                  {formatFocalLength(item.name)}
                </div>
              </div>
            );
          })}
          <div className="absolute bottom-3 left-4 text-[11px] font-semibold text-slate-400">
            {formatFocalLength(String(minFocalLength))}
          </div>
          <div className="absolute bottom-3 right-4 text-[11px] font-semibold text-slate-400">
            {formatFocalLength(String(maxFocalLength))}
          </div>
        </div>
      </div>
    </section>
  );
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
  const [isFocalLengthDetailOpen, setIsFocalLengthDetailOpen] = useState(false);
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
      .map(([name, count]) => ({
        name,
        count,
        numericValue: Number.parseFloat(name),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [images]);

  const focalLengthTotal = focalLengthStats.reduce((total, item) => total + item.count, 0);
  const missingFocalLengthCount = images.length - focalLengthTotal;
  const maxFocalLengthCount = focalLengthStats[0]?.count || 0;
  const focalLengthSummaryStats = focalLengthStats.slice(0, 5);
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
              <div className="mb-4">
                <button
                  onClick={() => {
                    setIsLocationMapOpen(open => !open);
                    setIsFocalLengthDetailOpen(false);
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
                  {focalLengthStats.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsFocalLengthDetailOpen(open => !open);
                        setIsLocationMapOpen(false);
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                        isFocalLengthDetailOpen
                          ? 'border-sky-200 bg-sky-50 text-sky-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700'
                      }`}
                    >
                      {focalLengthStats.length > 5 ? `查看全部 ${focalLengthStats.length} 个焦段` : '查看完整焦段图表'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs leading-5 text-slate-500">
                  暂无焦段数据
                </div>
              )}
            </aside>

            <div className="min-w-0">
              {isFocalLengthDetailOpen ? (
                <FocalLengthDetailChart stats={focalLengthStats} />
              ) : isLocationMapOpen ? (
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
              ) : (
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
              )}
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
