import type {
  SyncHistoryEntry,
  SyncProtocol,
  WebDavConfig,
  WebDavSyncStatus,
} from "@/api/setting.ts";

export type SyncDirection = "upload" | "download";

export interface SyncSettingsProps {
  config: WebDavConfig;
  status: WebDavSyncStatus;
  onChange: (config: WebDavConfig) => void;
  onRefreshStatus: () => Promise<void>;
}

export interface SyncOperationState {
  isSaving: boolean;
  isSyncing: boolean;
  isExporting: boolean;
  isImporting: boolean;
  isRefreshingHistory: boolean;
  isRestoringHistory: string;
  isCancelling: boolean;
  logs: string[];
  progress: number;
  history: SyncHistoryEntry[];
  isServerSyncing: boolean;
  isCancelRequested: boolean;
  isTransferBusy: boolean;
}

export interface ProtocolOption {
  value: SyncProtocol;
  label: string;
  description: string;
  badge: string;
}
