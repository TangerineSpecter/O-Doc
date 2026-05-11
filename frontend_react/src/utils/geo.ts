import countries from 'i18n-iso-countries';
import zhLocale from 'i18n-iso-countries/langs/zh.json';

countries.registerLocale(zhLocale);

const CITY_REGION_ALIASES: Record<string, string[]> = {
  伊斯坦布尔: ['İstanbul', 'Istanbul'],
};

export const getCountryIso3 = (country: string) => {
  const normalizedCountry = country.trim();
  if (!normalizedCountry) return '';
  if (/^[A-Z]{3}$/.test(normalizedCountry) && countries.isValid(normalizedCountry)) {
    return normalizedCountry;
  }
  return countries.getAlpha3Code(normalizedCountry, 'zh')
    || countries.getAlpha3Code(normalizedCountry, 'en')
    || '';
};

export const getCountryDisplayName = (iso3?: string, fallback = '') => {
  if (!iso3) return fallback;
  return countries.getName(iso3, 'zh') || fallback || iso3;
};

export const getCityRegionAliases = (city: string) => CITY_REGION_ALIASES[city] || [city];

export const getTopoJsonObjectName = (topoJson: any, preferredObjectName?: string) => {
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

export const findRegionByCoordinate = (geoJson: any, longitude: number, latitude: number) => {
  const features = geoJson?.features || [];
  return features.find((feature: any) => isPointInGeometry([longitude, latitude], feature.geometry));
};
