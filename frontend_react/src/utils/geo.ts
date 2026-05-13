import countries from 'i18n-iso-countries';
import zhLocale from 'i18n-iso-countries/langs/zh.json';

countries.registerLocale(zhLocale);

const CITY_REGION_ALIASES: Record<string, string[]> = {
  伊斯坦布尔: ['İstanbul', 'Istanbul'],
};

const CHINA_ADM1_DISPLAY_NAMES: Record<string, string> = {
  'Anhui Province': '安徽省',
  'Beijing Municipality': '北京市',
  'Chongqing Municipality': '重庆市',
  'Fujian Province': '福建省',
  'Gansu Province': '甘肃省',
  'Guangxi Zhuang Autonomous Region': '广西壮族自治区',
  'Guangzhou Province': '广东省',
  'Guizhou Province': '贵州省',
  'Hainan Province': '海南省',
  'Hebei Province': '河北省',
  'Heilongjiang Province': '黑龙江省',
  'Henan Province': '河南省',
  'Hong Kong Special Administrative Region': '香港特别行政区',
  'Hubei Province': '湖北省',
  'Hunan Province': '湖南省',
  'Inner Mongolia Autonomous Region': '内蒙古自治区',
  'Jiangsu Province': '江苏省',
  'Jiangxi Province': '江西省',
  'Jilin Province': '吉林省',
  'Liaoning Province': '辽宁省',
  'Macau Special Administrative Region': '澳门特别行政区',
  'Ningxia Ningxia Hui Autonomous Region': '宁夏回族自治区',
  'Qinghai Province': '青海省',
  'Shaanxi Province': '陕西省',
  'Shandong Province': '山东省',
  'Shanghai Municipality': '上海市',
  'Shanxi Province': '山西省',
  'Sichuan Province': '四川省',
  'Taiwan Province': '台湾省',
  'Tianjin Municipality': '天津市',
  'Tibet Autonomous Region': '西藏自治区',
  'Xinjiang Uyghur Autonomous Region': '新疆维吾尔自治区',
  'Yunnan Province': '云南省',
  'Zhejiang Province': '浙江省',
};

const JAPAN_ADM1_DISPLAY_NAMES: Record<string, string> = {
  'Hokkaido': '北海道',
  'Aomori': '青森县',
  'Iwate': '岩手县',
  'Miyagi': '宫城县',
  'Akita': '秋田县',
  'Yamagata': '山形县',
  'Fukushima': '福岛县',
  'Ibaraki': '茨城县',
  'Tochigi': '栃木县',
  'Gunma': '群马县',
  'Saitama': '埼玉县',
  'Chiba': '千叶县',
  'Tokyo': '东京都',
  'Kanagawa': '神奈川县',
  'Niigata': '新潟县',
  'Toyama': '富山县',
  'Ishikawa Prefecture': '石川县',
  'Fukui Prefecture': '福井县',
  'Yamanashi': '山梨县',
  'Nagano': '长野县',
  'Gifu Prefecture': '岐阜县',
  'Shizuoka': '静冈县',
  'Aichi Prefecture': '爱知县',
  'Mie Prefecture': '三重县',
  'Shiga': '滋贺县',
  'Kyoto Prefecture': '京都府',
  'Osaka Prefecture': '大阪府',
  'Hyogo Prefecture': '兵库县',
  'Nara Prefecture': '奈良县',
  'Wakayama Prefecture': '和歌山县',
  'Tottori Prefecture': '鸟取县',
  'Shimane': '岛根县',
  'Okayama Prefecture': '冈山县',
  'Hiroshima': '广岛县',
  'Yamaguchi': '山口县',
  'Tokushima Prefecture': '德岛县',
  'Kagawa Prefecture': '香川县',
  'Ehime Prefecture': '爱媛县',
  'Kochi Prefecture': '高知县',
  'Fukuoka Prefecture': '福冈县',
  'Saga Prefecture': '佐贺县',
  'Nagasaki Prefecture': '长崎县',
  'Kumamoto': '熊本县',
  'Oita': '大分县',
  'Miyazaki Prefecture': '宫崎县',
  'Kagoshima Prefecture': '鹿儿岛县',
  'Okinawa Prefecture': '冲绳县',
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

export const getAdm1DisplayName = (iso3: string | null | undefined, name: string) => {
  if (iso3 === 'CHN') {
    return CHINA_ADM1_DISPLAY_NAMES[name] || name;
  }
  if (iso3 === 'JPN') {
    return JAPAN_ADM1_DISPLAY_NAMES[name] || name;
  }
  return name;
};

export const getCountryBoundaryConfig = (iso3: string) => {
  if (iso3 === 'CHN') {
    return {
      level: 'ADM2',
      fileName: 'CHN-ADM2.topojson',
      mapLabel: '城市明细',
    };
  }

  return {
    level: 'ADM1',
    fileName: `${iso3}_ADM1.topojson`,
    mapLabel: '行政区/城市明细',
  };
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
