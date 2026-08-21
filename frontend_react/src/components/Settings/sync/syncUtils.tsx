import type React from "react";
import type { SyncProtocol } from "@/api/setting.ts";
import type { ProtocolOption } from "./types";

export const PROTOCOL_OPTIONS: ProtocolOption[] = [
  {
    value: "webdav",
    label: "WebDAV",
    description: "支持坚果云、群晖、Nextcloud 等主流网盘",
    badge: "推荐",
  },
  {
    value: "ftp",
    label: "FTP / FTPS",
    description: "传统文件传输协议，支持开启 TLS 加密",
    badge: "经典",
  },
  {
    value: "sftp",
    label: "SFTP",
    description: "基于 SSH 的高安全性文件传输通道",
    badge: "安全",
  },
];

export const TRIGGER_CONFIG: Record<string, { label: string; tone: string }> = {
  scheduler: {
    label: "定时同步",
    tone: "bg-lime-50 text-lime-700 border-lime-200",
  },
  manual: {
    label: "手动上传",
    tone: "bg-orange-50 text-orange-700 border-orange-200",
  },
  "manual-pull": {
    label: "手动下载",
    tone: "bg-blue-50 text-blue-700 border-blue-200",
  },
  "manual-preflight": {
    label: "手动上传",
    tone: "bg-orange-50 text-orange-700 border-orange-200",
  },
  "local-export": {
    label: "导出备份",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  "local-import": {
    label: "导入备份",
    tone: "bg-purple-50 text-purple-700 border-purple-200",
  },
  "history-restore": {
    label: "历史恢复",
    tone: "bg-amber-50 text-amber-700 border-amber-200",
  },
};
export const INTERVAL_PRESETS = [
  { label: "15分钟", value: 15 },
  { label: "30分钟", value: 30 },
  { label: "1小时", value: 60 },
  { label: "6小时", value: 360 },
  { label: "1天", value: 1440 },
];
export const defaultPortForProtocol = (protocol: SyncProtocol) =>
  protocol === "sftp" ? 22 : protocol === "ftp" ? 21 : null;
export const hostFromUrl = (url: string) => {
  const raw = (url || "").trim();
  if (!raw) return { host: "", port: null as number | null };
  try {
    const parsed = new URL(raw.includes("://") ? raw : `http://${raw}`);
    return {
      host: parsed.hostname || "",
      port: parsed.port ? Number(parsed.port) : null,
    };
  } catch {
    return {
      host: raw.split("/")[0].split(":")[0],
      port: null as number | null,
    };
  }
};
export const formatDateTime = (value?: string) => {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};
export const formatBytes = (bytes?: number | null) => {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "大小未知";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
};
export const formatTerminalLogContent = (log: string): React.ReactNode => {
  if (log.includes("❌") || log.includes("错误") || log.startsWith("Error:"))
    return <span className="text-red-400 font-medium">{log}</span>;
  const tokenRegex =
    /(^>\s*)|(\bv\d+(?:\.\d+)?\b)|(\b\d+(?:\.\d+)?(?:\s*(?:B|KB|MB|GB|TB|%|ms|s))?\b)|(\b(?:blob|blobs|json|manifest)\b)/gi;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(log)) !== null) {
    if (match.index > lastIdx) parts.push(log.substring(lastIdx, match.index));
    const [full, prefix, version, numSize, keyword] = match;
    const key = `${match.index}-${full}`;
    if (prefix)
      parts.push(
        <span key={key} className="text-cyan-400 font-bold select-none mr-1.5">
          &gt;
        </span>,
      );
    else if (version)
      parts.push(
        <span key={key} className="text-amber-300 font-semibold px-0.5">
          {full}
        </span>,
      );
    else if (numSize)
      parts.push(
        <span key={key} className="text-amber-300 font-semibold">
          {full}
        </span>,
      );
    else if (keyword)
      parts.push(
        <span key={key} className="text-cyan-300 font-mono">
          {full}
        </span>,
      );
    lastIdx = tokenRegex.lastIndex;
  }
  if (lastIdx < log.length) parts.push(log.substring(lastIdx));
  return parts.length > 0 ? parts : log;
};
