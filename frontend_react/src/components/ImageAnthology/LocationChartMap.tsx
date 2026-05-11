import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { feature as topojsonFeature } from 'topojson-client';
import { LocationPoint } from '../../types/imageAnthology';
import {
  findRegionByCoordinate,
  getCityRegionAliases,
  getCountryDisplayName,
  getCountryIso3,
  getTopoJsonObjectName,
} from '../../utils/geo';

interface CountrySummary {
  country: string;
  iso3: string;
  count: number;
}

function LocationChartMap({ points }: { points: LocationPoint[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.EChartsType | null>(null);
  const [worldMapReady, setWorldMapReady] = useState(false);
  const [worldMapError, setWorldMapError] = useState('');
  const [selectedCountryIso, setSelectedCountryIso] = useState<string | null>(null);
  const [countryMapReady, setCountryMapReady] = useState(false);
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const [boundaryError, setBoundaryError] = useState('');
  const [countryGeoJson, setCountryGeoJson] = useState<any | null>(null);

  const countrySummaries = useMemo(() => {
    const summaries = new Map<string, CountrySummary>();
    points.forEach(point => {
      const iso3 = getCountryIso3(point.country);
      if (!iso3) return;
      const current = summaries.get(iso3);
      if (current) {
        current.count += point.count;
      } else {
        summaries.set(iso3, {
          country: point.country,
          iso3,
          count: point.count,
        });
      }
    });
    return Array.from(summaries.values());
  }, [points]);

  const visitedCountryIds = useMemo(
    () => new Set(countrySummaries.map(summary => summary.iso3)),
    [countrySummaries]
  );

  const visiblePoints = useMemo(() => {
    if (!selectedCountryIso) return points;
    return points.filter(point => getCountryIso3(point.country) === selectedCountryIso);
  }, [points, selectedCountryIso]);

  const selectedSummary = selectedCountryIso
    ? countrySummaries.find(summary => summary.iso3 === selectedCountryIso)
    : null;
  const currentMapName = selectedCountryIso && countryMapReady
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
  }, [countryGeoJson, visiblePoints]);

  const displayNameByRegionKey = useMemo(() => {
    const names = new Map<string, string>();
    countrySummaries.forEach(summary => {
      names.set(summary.iso3, getCountryDisplayName(summary.iso3, summary.country));
    });
    return names;
  }, [countrySummaries]);

  const chartData = useMemo(() => {
    if (selectedCountryIso && countryMapReady) {
      return selectedCityRegions.map(item => ({
        name: item.name,
        locationNames: item.city,
        value: item.value,
      }));
    }

    return countrySummaries.map(summary => ({
      id: summary.iso3,
      name: getCountryDisplayName(summary.iso3, summary.country),
      displayName: getCountryDisplayName(summary.iso3, summary.country),
      value: summary.count,
      country: summary.country,
    }));
  }, [countryMapReady, countrySummaries, selectedCityRegions, selectedCountryIso]);

  const mapView = useMemo(() => {
    if (!selectedCountryIso) {
      return { center: [104, 35] as [number, number], zoom: 3.2 };
    }

    if (visiblePoints.length === 0) {
      return { center: [20, 28] as [number, number], zoom: 1.15 };
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
  }, [selectedCountryIso, visiblePoints]);

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
    if (!selectedCountryIso) {
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
  }, [selectedCountryIso]);

  useEffect(() => {
    if (!chartRef.current || !worldMapReady) return;

    const isCountryDetailMap = Boolean(selectedCountryIso && countryMapReady);
    const chart = instanceRef.current || echarts.init(chartRef.current);
    instanceRef.current = chart;
    const regionDataByName = new Map(chartData.map((item: any) => [item.id || item.name, item]));
    const formatRegionName = (name: string) => {
      const data = regionDataByName.get(name) as any;
      if (data?.displayName) return data.displayName;
      return displayNameByRegionKey.get(name) || getCountryDisplayName(name, name);
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
      if (!selectedCountryIso) {
        const countryId = params?.name;
        const summary = countrySummaries.find(item => item.iso3 === countryId);
        if (summary && visitedCountryIds.has(summary.iso3)) {
          setSelectedCountryIso(summary.iso3);
        }
      }
    };

    chart.on('click', handleClick);

    return () => {
      chart.off('click', handleClick);
    };
  }, [
    chartData,
    countryMapReady,
    countrySummaries,
    currentMapName,
    displayNameByRegionKey,
    mapView,
    selectedCountryIso,
    visiblePoints,
    visitedCountryIds,
    worldMapReady,
  ]);

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
          {selectedSummary ? `${getCountryDisplayName(selectedSummary.iso3, selectedSummary.country)} · ${countryMapReady ? '行政区/城市明细' : '城市明细'}` : '世界地图 · 点击高亮国家钻入'}
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
            onClick={() => setSelectedCountryIso(null)}
            className="pointer-events-auto rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            返回世界地图
          </button>
        )}
      </div>
    </div>
  );
}

export default LocationChartMap;
