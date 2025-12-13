import React, { useState } from 'react';
import { Save, Cpu, RefreshCw, Settings } from 'lucide-react';
import ConfirmationModal from '../components/common/ConfirmationModal';
import { useSettings } from '../hooks/useSettings';
import { AIProvider } from '../api/setting';

// 子组件
import { AISettings } from '../components/Settings/AISettings';
import { SyncSettings } from '../components/Settings/SyncSettings';
import { GeneralSettings } from '../components/Settings/GeneralSettings';
import { ProviderModal } from '../components/Settings/ProviderModal';
import { ModelModal } from '../components/Settings/ModelModal';

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<'ai' | 'sync' | 'general'>('ai');

    // 使用自定义 Hook
    const {
        providers, systemConfig, webDavConfig, isSaving,
        setSystemConfig, setWebDavConfig,
        getModelsByType, handleSaveProvider, handleSaveModel, handleDelete
    } = useSettings();

    // 页面内部的模态框状态 (UI State)
    const [providerModal, setProviderModal] = useState<{ open: boolean, data?: AIProvider | null }>({ open: false });
    const [modelModal, setModelModal] = useState<{ open: boolean, providerId?: string }>({ open: false });
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean, target?: any }>({ open: false });

    // 辅助组件：侧边栏按钮
    const TabButton = ({ id, label, icon }: { id: typeof activeTab, label: string, icon: React.ReactNode }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all w-full text-left ${activeTab === id
                ? 'bg-orange-50 text-orange-600 shadow-sm ring-1 ring-orange-200'
                : 'text-slate-600 hover:bg-slate-50'
                }`}
        >
            {icon}
            {label}
        </button>
    );

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">

            {/* --- Modals --- */}
            <ConfirmationModal
                isOpen={deleteConfirm.open}
                onClose={() => setDeleteConfirm({ open: false })}
                onConfirm={() => {
                    handleDelete(deleteConfirm.target);
                    setDeleteConfirm({ open: false });
                }}
                title="确认删除"
                description="此操作无法撤销，确定要删除该配置吗？"
                confirmText="删除"
                type="danger"
            />

            <ProviderModal
                isOpen={providerModal.open}
                onClose={() => setProviderModal({ open: false })}
                onSave={(data) => {
                    handleSaveProvider(data, !!providerModal.data);
                    setProviderModal({ open: false });
                }}
                initialData={providerModal.data}
            />

            <ModelModal
                isOpen={modelModal.open}
                onClose={() => setModelModal({ open: false })}
                onSave={(data) => {
                    if (modelModal.providerId) {
                        handleSaveModel(modelModal.providerId, data);
                    }
                    setModelModal({ open: false });
                }}
            />

            {/* --- Header --- */}
            <div className="flex items-center justify-between mb-8 sticky top-0 bg-slate-50/90 backdrop-blur z-20 py-4 -mt-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        系统设置 <span className="text-orange-500">.</span>
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">管理 AI 模型接入、数据同步及系统偏好。</p>
                </div>
                <button
                    onClick={() => { /* WebDAV save functionality not implemented yet */ }}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-70"
                >
                    {isSaving ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Save className="w-4 h-4" />
                    )}
                    保存更改
                </button>
            </div>

            {/* --- Main Grid --- */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                {/* Sidebar */}
                <div className="md:col-span-1 space-y-1">
                    <TabButton id="ai" label="AI 模型接入" icon={<Cpu className="w-4 h-4" />} />
                    <TabButton id="sync" label="同步与备份" icon={<RefreshCw className="w-4 h-4" />} />
                    <TabButton id="general" label="常规设置" icon={<Settings className="w-4 h-4" />} />
                </div>

                {/* Content */}
                <div className="md:col-span-3">
                    {activeTab === 'ai' && (
                        <AISettings
                            providers={providers}
                            systemConfig={systemConfig}
                            setSystemConfig={setSystemConfig}
                            getModelsByType={getModelsByType}
                            onOpenProviderModal={(data) => setProviderModal({ open: true, data })}
                            onOpenModelModal={(providerId) => setModelModal({ open: true, providerId })}
                            onDelete={(target) => setDeleteConfirm({ open: true, target })}
                        />
                    )}
                    {activeTab === 'sync' && (
                        <SyncSettings config={webDavConfig} onChange={setWebDavConfig} />
                    )}
                    {activeTab === 'general' && (
                        <GeneralSettings />
                    )}
                </div>
            </div>
        </div>
    );
}