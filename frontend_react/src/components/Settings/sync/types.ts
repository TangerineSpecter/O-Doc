import type {
  SyncHistoryEntry,
  SyncProtocol,
  WebDavConfig,
  WebDavSyncStatus,
} from "@/api/setting.ts";

export type SyncDirection = "upload" | "download";

export interface SyncConflict {
  key: string;
  model: string;
  label: string;
  remoteLabel: string;
  localAt: string;
  remoteAt: string;
  suggested: "local" | "remote";
}

export interface SyncRequest {
  forceOverwrite?: boolean;
  compare?: boolean;
  resolutions?: { key: string; side: "local" | "remote" }[];
  resolutionDefault?: "local" | "remote";
  choicesConfirmed?: boolean;
}

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
  isForceUploadConfirmOpen: boolean;
  conflicts: SyncConflict[];
  conflictTotal: number;
  conflictDirection: SyncDirection;
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
