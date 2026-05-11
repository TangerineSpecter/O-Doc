import { useEffect, useMemo, useState } from 'react';
import { Edit2, Globe2, Loader2, MapPin, Plus, Trash2 } from 'lucide-react';
import { deleteGeoLocation, GeoLocation, getGeoLocations, saveGeoLocation } from '@/api/setting';
import { useToast } from '../common/ToastProvider';

const emptyForm = {
    id: '',
    country: '',
    city: '',
    latitude: '',
    longitude: '',
};

const isCoordinateValid = (latitude: string, longitude: string) => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

export const LocationSettings = () => {
    const [locations, setLocations] = useState<GeoLocation[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const toast = useToast();

    const groupedLocations = useMemo(() => {
        const groups = new Map<string, GeoLocation[]>();
        locations.forEach(location => {
            const items = groups.get(location.country) || [];
            items.push(location);
            groups.set(location.country, items);
        });
        return Array.from(groups.entries()).map(([country, items]) => ({
            country,
            items: items.sort((a, b) => a.city.localeCompare(b.city)),
        }));
    }, [locations]);

    const loadLocations = async () => {
        try {
            setLoading(true);
            setLocations(await getGeoLocations());
        } catch (error) {
            console.error('加载地理位置失败', error);
            toast.error('加载地理位置失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLocations();
    }, []);

    const handleSubmit = async () => {
        if (!form.country.trim() || !form.city.trim()) {
            toast.warning('请填写国家和城市');
            return;
        }

        if (!isCoordinateValid(form.latitude, form.longitude)) {
            toast.warning('请输入有效的经纬度');
            return;
        }

        try {
            setSaving(true);
            await saveGeoLocation({
                id: form.id || undefined,
                country: form.country.trim(),
                city: form.city.trim(),
                latitude: form.latitude.trim(),
                longitude: form.longitude.trim(),
            });
            toast.success(form.id ? '地点已更新' : '地点已添加');
            setForm(emptyForm);
            await loadLocations();
        } catch (error: any) {
            console.error('保存地理位置失败', error);
            toast.error(error?.message || '保存失败');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (location: GeoLocation) => {
        if (!window.confirm(`确定删除「${location.country} - ${location.city}」吗？`)) return;

        try {
            await deleteGeoLocation(location.id);
            toast.success('地点已删除');
            await loadLocations();
        } catch (error: any) {
            console.error('删除地理位置失败', error);
            toast.error(error?.message || '删除失败');
        }
    };

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
                    <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                        <Globe2 className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">拍摄地点库</h3>
                        <p className="text-xs text-slate-500">维护国家、城市与地图坐标，图片上传时从这里选择。</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input
                        value={form.country}
                        onChange={(event) => setForm(prev => ({ ...prev, country: event.target.value }))}
                        placeholder="国家，例如 土耳其"
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                    <input
                        value={form.city}
                        onChange={(event) => setForm(prev => ({ ...prev, city: event.target.value }))}
                        placeholder="城市，例如 伊斯坦布尔"
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                    <input
                        value={form.latitude}
                        onChange={(event) => setForm(prev => ({ ...prev, latitude: event.target.value }))}
                        placeholder="纬度，例如 41.0082"
                        inputMode="decimal"
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                    <input
                        value={form.longitude}
                        onChange={(event) => setForm(prev => ({ ...prev, longitude: event.target.value }))}
                        placeholder="经度，例如 28.9784"
                        inputMode="decimal"
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                </div>

                <div className="mt-4 flex justify-end gap-3">
                    {form.id && (
                        <button
                            onClick={() => setForm(emptyForm)}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100"
                        >
                            取消编辑
                        </button>
                    )}
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 disabled:opacity-70"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {form.id ? '保存地点' : '添加地点'}
                    </button>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                    <div>
                        <h3 className="font-bold text-slate-800">已录入地点</h3>
                        <p className="mt-1 text-xs text-slate-500">{locations.length} 个城市，{groupedLocations.length} 个国家</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex min-h-40 items-center justify-center text-sm text-slate-400">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        正在加载地点...
                    </div>
                ) : locations.length === 0 ? (
                    <div className="flex min-h-40 items-center justify-center text-sm text-slate-400">
                        暂无地点，先添加一个城市坐标
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {groupedLocations.map(group => (
                            <div key={group.country} className="px-6 py-4">
                                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                                    <MapPin className="h-4 w-4 text-emerald-500" />
                                    {group.country}
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                    {group.items.map(location => (
                                        <div
                                            key={location.id}
                                            className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                                        >
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-semibold text-slate-800">{location.city}</div>
                                                <div className="mt-0.5 text-xs text-slate-400">
                                                    {location.latitude}, {location.longitude}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <button
                                                    onClick={() => setForm({
                                                        id: location.id,
                                                        country: location.country,
                                                        city: location.city,
                                                        latitude: String(location.latitude),
                                                        longitude: String(location.longitude),
                                                    })}
                                                    className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                                                    aria-label="编辑地点"
                                                    title="编辑地点"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(location)}
                                                    className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                                    aria-label="删除地点"
                                                    title="删除地点"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
