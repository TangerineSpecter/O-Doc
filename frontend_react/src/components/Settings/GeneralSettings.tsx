import React from 'react';
import { Monitor, Shield } from 'lucide-react';

export const GeneralSettings = () => {
    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 text-slate-600 rounded-lg"><Monitor className="w-5 h-5" /></div>
                    <div>
                        <h3 className="font-bold text-slate-800">界面主题</h3>
                        <p className="text-xs text-slate-500">切换系统的外观显示模式</p>
                    </div>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button className="px-3 py-1.5 bg-white shadow-sm rounded text-xs font-medium text-slate-800">浅色</button>
                    <button className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">深色</button>
                    <button className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">跟随系统</button>
                </div>
            </div>

            <div className="h-px bg-slate-100"></div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Shield className="w-5 h-5" /></div>
                    <div>
                        <h3 className="font-bold text-slate-800">安全选项</h3>
                        <p className="text-xs text-slate-500">文集默认访问权限设置</p>
                    </div>
                </div>
                <select className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/20">
                    <option>默认为公开</option>
                    <option>默认为私有</option>
                </select>
            </div>
        </div>
    );
};