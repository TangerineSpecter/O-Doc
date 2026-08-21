import type React from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock3,
  CloudCog,
  DownloadCloud,
  Eye,
  EyeOff,
  FileDown,
  FileUp,
  FolderTree,
  Globe,
  HardDrive,
  History,
  Info,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  Save,
  Server,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react";
import type {
  SyncHistoryEntry,
  SyncProtocol,
  WebDavConfig,
  WebDavSyncStatus,
} from "@/api/setting.ts";
import {
  INTERVAL_PRESETS,
  PROTOCOL_OPTIONS,
  TRIGGER_CONFIG,
  formatBytes,
  formatDateTime,
  formatTerminalLogContent,
} from "./syncUtils";
import type { SyncOperationState } from "./types";

export const SyncOverviewCard = ({
  config,
  status,
  isSaving,
  isSummaryOpen,
  onSummaryToggle,
  onEnabledChange,
}: {
  config: WebDavConfig;
  status: WebDavSyncStatus;
  isSaving: boolean;
  isSummaryOpen: boolean;
  onSummaryToggle: () => void;
  onEnabledChange: (enabled: boolean) => void;
}) => {
  const meta = {
    idle: {
      Icon: Clock3,
      label: "就绪 / 等待同步",
      tone: "bg-slate-50 border-slate-200",
    },
    running: {
      Icon: Loader2,
      label: "同步传输中",
      tone: "bg-orange-50/40 border-orange-200",
    },
    success: {
      Icon: CheckCircle2,
      label: "最近同步成功",
      tone: "bg-emerald-50/40 border-emerald-200",
    },
    error: {
      Icon: AlertCircle,
      label: "同步遇到异常",
      tone: "bg-rose-50/40 border-rose-200",
    },
  }[status.status] || {
    Icon: Clock3,
    label: status.status || "未知状态",
    tone: "bg-slate-50 border-slate-200",
  };
  const Icon = meta.Icon;
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-500">
            <CloudCog className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">同步与备份</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              多端数据同步、云端备份与全量历史快照恢复
            </p>
          </div>
        </div>
        <label className="flex items-center gap-3 text-xs font-medium text-slate-600">
          服务总开关
          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            disabled={isSaving}
            onClick={() => onEnabledChange(!config.enabled)}
            className={`relative h-6 w-11 rounded-full ${config.enabled ? "bg-orange-500" : "bg-slate-200"}`}
          >
            <span
              className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${config.enabled ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        <div className={`rounded-xl border p-4 ${meta.tone}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Icon
              className={`w-4 h-4 ${status.status === "running" ? "animate-spin" : ""}`}
            />
            {meta.label}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            最近成功：{formatDateTime(status.lastSuccessAt)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            最近开始：{formatDateTime(status.lastStartedAt)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <p>最近上传：{formatDateTime(status.lastPushAt)}</p>
          <p className="mt-1">最近拉取：{formatDateTime(status.lastPullAt)}</p>
          <p className="mt-1">
            触发方式：
            {TRIGGER_CONFIG[status.trigger]?.label || status.trigger || "暂无"}
          </p>
          <p className="mt-1 font-mono truncate">
            远端快照：{status.lastSyncedSnapshotId || "暂无"}
          </p>
        </div>
      </div>
      {status.lastError && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="inline w-4 h-4 mr-2" />
          {status.lastError}
        </div>
      )}
      {status.lastSummary?.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <button
            type="button"
            onClick={onSummaryToggle}
            className="w-full text-left font-medium text-slate-700"
          >
            最近一次同步变更摘要 ({status.lastSummary.length} 项)
          </button>
          {isSummaryOpen && (
            <div className="mt-2 space-y-1 font-mono text-slate-600">
              {status.lastSummary.map((item, index) => (
                <div key={`${item}-${index}`}>› {item}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export const SyncHistoryCard = ({
  history,
  isRefreshing,
  isRestoringHistory,
  isManifestHelpOpen,
  onManifestHelpToggle,
  onRefresh,
  onRestore,
}: {
  history: SyncHistoryEntry[];
  isRefreshing: boolean;
  isRestoringHistory: string;
  isManifestHelpOpen: boolean;
  onManifestHelpToggle: () => void;
  onRefresh: () => void;
  onRestore: (item: SyncHistoryEntry) => void;
}) => (
  <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <History className="w-4 h-4 text-orange-500" />
          远端历史快照
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          可恢复任意云端快照；恢复前会自动创建安全备份。
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onManifestHelpToggle}
          className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
        >
          <Info className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
        >
          <RefreshCw
            className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </button>
      </div>
    </div>
    {isManifestHelpOpen && (
      <div className="mt-3 p-3 rounded-lg bg-slate-50 text-xs text-slate-600">
        <FolderTree className="inline w-4 h-4 mr-1" />
        快照以 manifest 与资源 blob 形式保存在远端目录。
      </div>
    )}
    <div className="mt-4 max-h-72 overflow-y-auto space-y-2">
      {history.length ? (
        history.map((item) => (
          <div
            key={item.snapshotId}
            className="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700">
                {formatDateTime(item.generatedAt)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {TRIGGER_CONFIG[item.source]?.label ||
                  item.source ||
                  "同步上传"}{" "}
                · {formatBytes(item.snapshotBytes ?? item.mediaBytes)}
              </p>
              <p className="text-[11px] text-slate-400 font-mono truncate">
                {item.snapshotId}
              </p>
            </div>
            <button
              type="button"
              disabled={Boolean(isRestoringHistory)}
              onClick={() => onRestore(item)}
              className="px-3 py-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg disabled:opacity-60"
            >
              {isRestoringHistory === item.snapshotId ? "恢复中…" : "恢复"}
            </button>
          </div>
        ))
      ) : (
        <p className="py-8 text-center text-xs text-slate-400">
          暂无远端历史快照
        </p>
      )}
    </div>
  </section>
);

export const LocalBackupCard = ({
  importInputRef,
  isExporting,
  isImporting,
  isServerSyncing,
  onExport,
  onSelectImport,
}: {
  importInputRef: React.RefObject<HTMLInputElement | null>;
  isExporting: boolean;
  isImporting: boolean;
  isServerSyncing: boolean;
  onExport: () => void;
  onSelectImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) => (
  <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
    <h3 className="font-bold text-slate-800 flex items-center gap-2">
      <Archive className="w-4 h-4 text-orange-500" />
      本地备份与归档
    </h3>
    <p className="text-xs text-slate-500 mt-1">
      导出当前数据压缩包；导入会全量覆盖当前数据。
    </p>
    <input
      ref={importInputRef}
      type="file"
      accept=".zip,application/zip"
      className="hidden"
      onChange={onSelectImport}
    />
    <div className="grid sm:grid-cols-2 gap-3 mt-4">
      <button
        type="button"
        disabled={isExporting || isImporting || isServerSyncing}
        onClick={onExport}
        className="p-4 text-left border border-slate-200 rounded-xl hover:border-orange-200 disabled:opacity-60"
      >
        <FileDown className="w-5 h-5 text-orange-500" />
        <p className="mt-2 text-sm font-medium">导出本地备份</p>
        <p className="text-xs text-slate-500">
          {isExporting ? "正在导出…" : "下载 ZIP 压缩包"}
        </p>
      </button>
      <button
        type="button"
        disabled={isImporting || isServerSyncing}
        onClick={() => importInputRef.current?.click()}
        className="p-4 text-left border border-slate-200 rounded-xl hover:border-orange-200 disabled:opacity-60"
      >
        <FileUp className="w-5 h-5 text-orange-500" />
        <p className="mt-2 text-sm font-medium">导入本地备份</p>
        <p className="text-xs text-slate-500">
          {isImporting ? "正在导入…" : "选择 ZIP 压缩包"}
        </p>
      </button>
    </div>
  </section>
);

export const RemoteStorageConfigCard = ({
  config,
  protocol,
  showPassword,
  showPassphrase,
  onChange,
  onProtocolChange,
  onTogglePassword,
  onTogglePassphrase,
}: {
  config: WebDavConfig;
  protocol: SyncProtocol;
  showPassword: boolean;
  showPassphrase: boolean;
  onChange: (config: WebDavConfig) => void;
  onProtocolChange: (protocol: SyncProtocol) => void;
  onTogglePassword: () => void;
  onTogglePassphrase: () => void;
}) => (
  <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
    <h3 className="font-bold text-slate-800 flex items-center gap-2">
      <HardDrive className="w-4 h-4 text-orange-500" />
      云端存储连接配置
    </h3>
    <div className="grid md:grid-cols-3 gap-3 mt-4">
      {PROTOCOL_OPTIONS.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onProtocolChange(item.value)}
          className={`p-3 text-left rounded-xl border ${protocol === item.value ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:border-orange-200"}`}
        >
          <p className="text-sm font-semibold">
            {item.label}{" "}
            <span className="text-[10px] text-orange-600">{item.badge}</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">{item.description}</p>
        </button>
      ))}
    </div>
    <div className="grid md:grid-cols-2 gap-4 mt-5">
      {protocol === "webdav" ? (
        <Field
          label="WebDAV 服务器地址"
          icon={<Globe className="w-4 h-4" />}
          value={config.url}
          onChange={(value) => onChange({ ...config, url: value })}
          placeholder="https://dav.jianguoyun.com/dav/"
        />
      ) : (
        <>
          <Field
            label="主机地址"
            icon={<Server className="w-4 h-4" />}
            value={config.host || ""}
            onChange={(value) => onChange({ ...config, host: value })}
            placeholder="host.example.com"
          />
          <Field
            label="端口"
            value={String(config.port || "")}
            onChange={(value) =>
              onChange({ ...config, port: value ? Number(value) : null })
            }
            placeholder="端口"
            type="number"
          />
        </>
      )}
      <Field
        label="远程路径"
        value={config.remotePath || ""}
        onChange={(value) => onChange({ ...config, remotePath: value })}
        placeholder="/O-Doc"
      />
      <Field
        label="用户名"
        value={config.username}
        onChange={(value) => onChange({ ...config, username: value })}
        placeholder="存储账号用户名"
      />
      <PasswordField
        label={protocol === "sftp" ? "密码（可选）" : "密码 / 应用令牌"}
        value={config.password}
        show={showPassword}
        onChange={(value) => onChange({ ...config, password: value })}
        onToggle={onTogglePassword}
      />
    </div>
    {protocol === "ftp" && (
      <div className="mt-4 flex gap-5 text-xs text-slate-600">
        <label>
          <input
            type="checkbox"
            checked={Boolean(config.useTls)}
            onChange={(event) =>
              onChange({ ...config, useTls: event.target.checked })
            }
          />{" "}
          使用 FTPS / TLS 加密
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.passive !== false}
            onChange={(event) =>
              onChange({ ...config, passive: event.target.checked })
            }
          />{" "}
          被动模式
        </label>
      </div>
    )}
    {protocol === "sftp" && (
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <label className="text-xs font-semibold text-slate-700">
          私钥 PEM
          <textarea
            rows={4}
            className="mt-1 w-full p-2 border border-slate-200 rounded-lg font-mono text-xs"
            value={config.privateKey || ""}
            onChange={(event) =>
              onChange({ ...config, privateKey: event.target.value })
            }
          />
        </label>
        <div className="space-y-4">
          <PasswordField
            label="私钥口令"
            value={config.passphrase || ""}
            show={showPassphrase}
            onChange={(value) => onChange({ ...config, passphrase: value })}
            onToggle={onTogglePassphrase}
          />
          <Field
            label="服务器主机密钥（可选）"
            value={config.hostKey || ""}
            onChange={(value) => onChange({ ...config, hostKey: value })}
            placeholder="ssh-ed25519 AAAA..."
          />
        </div>
      </div>
    )}
    <div className="mt-5 pt-4 border-t border-slate-100">
      <div className="flex justify-between text-xs font-semibold text-slate-700">
        <span>自动定时同步间隔</span>
        <span className="text-orange-600">
          每{" "}
          {config.interval >= 60
            ? `${config.interval / 60} 小时`
            : `${config.interval} 分钟`}
        </span>
      </div>
      <input
        className="mt-3 w-full accent-orange-500"
        type="range"
        min="5"
        max="1440"
        step="5"
        value={config.interval}
        onChange={(event) =>
          onChange({ ...config, interval: Number(event.target.value) || 30 })
        }
      />
      <div className="flex flex-wrap gap-2 mt-3">
        {INTERVAL_PRESETS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange({ ...config, interval: item.value })}
            className={`px-2.5 py-1 text-xs rounded-md ${config.interval === item.value ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  </section>
);
const Field = ({
  label,
  value,
  onChange,
  placeholder,
  icon,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon?: React.ReactNode;
  type?: string;
}) => (
  <label className="text-xs font-semibold text-slate-700">
    {label}
    <span className="relative block mt-1">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
      )}
      <input
        type={type}
        className={`w-full py-2 border border-slate-200 rounded-lg text-sm ${icon ? "pl-9 pr-3" : "px-3"}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </span>
  </label>
);
const PasswordField = ({
  label,
  value,
  show,
  onChange,
  onToggle,
}: {
  label: string;
  value: string;
  show: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) => (
  <label className="text-xs font-semibold text-slate-700">
    {label}
    <span className="relative block mt-1">
      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        type={show ? "text" : "password"}
        className="w-full py-2 pl-9 pr-10 border border-slate-200 rounded-lg text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </span>
  </label>
);

export const SyncConsoleCard = ({
  logContainerRef,
  state,
  onSave,
  onClearLogs,
  onCancel,
  onUpload,
  onDownload,
}: {
  logContainerRef: React.RefObject<HTMLDivElement | null>;
  state: SyncOperationState;
  onSave: () => void;
  onClearLogs: () => void;
  onCancel: () => void;
  onUpload: () => void;
  onDownload: () => void;
}) => (
  <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
    <div className="flex items-center justify-between">
      <h3 className="font-bold text-slate-800 flex items-center gap-2">
        <Terminal className="w-4 h-4" />
        同步控制台
      </h3>
      {state.isSyncing && (
        <span className="text-xs text-emerald-700">正在流式通信中</span>
      )}
    </div>
    <div className="mt-4 text-xs text-slate-500 flex justify-between">
      <span>任务进度</span>
      <span>{state.progress}%</span>
    </div>
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
      <div
        className="h-full bg-indigo-500"
        style={{ width: `${state.progress}%` }}
      />
    </div>
    <div className="relative mt-4">
      <div
        ref={logContainerRef}
        className="h-48 overflow-y-auto rounded-xl bg-slate-900 p-4 font-mono text-xs space-y-1"
      >
        {state.logs.length ? (
          state.logs.map((log, index) => (
            <div key={index} className="text-green-400 break-all">
              {formatTerminalLogContent(log)}
            </div>
          ))
        ) : (
          <p className="text-center mt-16 text-slate-500">等待任务开始...</p>
        )}
      </div>
      {state.logs.length > 0 && (
        <button
          type="button"
          onClick={onClearLogs}
          className="absolute top-2 right-2 text-xs text-slate-300"
        >
          <Trash2 className="inline w-3 h-3" /> 清屏
        </button>
      )}
    </div>
    <div className="flex flex-wrap justify-between gap-3 mt-4">
      <button
        type="button"
        disabled={state.isSaving}
        onClick={onSave}
        className="px-4 py-2 text-xs rounded-lg bg-slate-100 text-slate-700"
      >
        <Save className="inline w-3.5 h-3.5" /> 保存配置并测试
      </button>
      <div className="flex gap-3">
        {state.isServerSyncing && (
          <button
            type="button"
            disabled={state.isCancelling || state.isCancelRequested}
            onClick={onCancel}
            className="px-3 py-2 text-xs rounded-lg border border-rose-200 text-rose-700 disabled:opacity-60"
          >
            <XCircle className="inline w-3.5 h-3.5" />
            {state.isCancelRequested ? "正在终止…" : "终止同步"}
          </button>
        )}
        <button
          type="button"
          disabled={state.isTransferBusy}
          onClick={onUpload}
          className="px-4 py-2 text-xs rounded-lg bg-orange-500 text-white disabled:opacity-60"
        >
          <Play className="inline w-3.5 h-3.5" />
          开始上传同步
        </button>
        <button
          type="button"
          disabled={state.isTransferBusy}
          onClick={onDownload}
          className="px-4 py-2 text-xs rounded-lg border border-slate-200 text-slate-700 disabled:opacity-60"
        >
          <DownloadCloud className="inline w-3.5 h-3.5" />
          从云端下载
        </button>
      </div>
    </div>
  </section>
);
