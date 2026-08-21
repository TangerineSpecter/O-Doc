import { useEffect, useRef, useState } from "react";
import {
  cancelWebDavSync,
  downloadLocalBackupFile,
  getSyncHistory,
  getWebDavStatus,
  importLocalBackup,
  restoreSyncHistory,
  saveWebDavConfig,
} from "@/api/setting.ts";
import { getAuthToken } from "@/utils/authStorage";
import { useToast } from "../../common/ToastProvider";
import type {
  SyncDirection,
  SyncOperationState,
  SyncSettingsProps,
} from "./types";
import type { SyncHistoryEntry, WebDavSyncStatus } from "@/api/setting.ts";

export const useSyncOperations = ({
  config,
  status,
  onRefreshStatus,
}: SyncSettingsProps) => {
  const { success, error, warning } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<SyncOperationState["history"]>([]);
  const [isRefreshingHistory, setIsRefreshingHistory] = useState(false);
  const [isRestoringHistory, setIsRestoringHistory] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const statusSummaryKeyRef = useRef("");
  const isServerSyncing = status.status === "running";
  const isCancelRequested = Boolean(status.cancelRequested);

  const refreshHistory = async () => {
    setIsRefreshingHistory(true);
    try {
      setHistory((await getSyncHistory()) as unknown as SyncHistoryEntry[]);
    } catch {
      setHistory([]);
    } finally {
      setIsRefreshingHistory(false);
    }
  };
  useEffect(() => {
    onRefreshStatus();
    const timer = window.setInterval(
      onRefreshStatus,
      status.status === "running" ? 5000 : 15000,
    );
    return () => window.clearInterval(timer);
  }, [onRefreshStatus, status.status]);
  useEffect(() => {
    if (config.enabled) void refreshHistory();
  }, [config.enabled]);
  useEffect(() => {
    if (!isServerSyncing || isSyncing || !status.lastSummary?.length) return;
    const key = status.lastSummary.join("\n");
    if (key === statusSummaryKeyRef.current) return;
    statusSummaryKeyRef.current = key;
    setLogs([
      "⏱ 检测到定时同步正在运行，正在显示后端同步细节...",
      ...status.lastSummary.map((item) => `> ${item}`),
    ]);
    setProgress(Math.max(0, Math.min(100, status.syncProgress ?? 30)));
  }, [isServerSyncing, isSyncing, status.lastSummary, status.syncProgress]);
  useEffect(() => {
    if (!isSyncing && status.status === "success") setProgress(100);
  }, [isSyncing, status.status]);

  const saveConfig = async () => {
    const protocol = config.protocol || "webdav";
    const host = config.host || config.url;
    if (!config.remotePath?.trim()) {
      warning("请填写远程路径，不要留空");
      return false;
    }
    if (
      protocol === "webdav" &&
      (!config.url || !config.username || !config.password)
    ) {
      warning("请填写完整的 WebDAV 地址、用户名和密码");
      return false;
    }
    if (protocol === "ftp" && (!host || !config.username || !config.password)) {
      warning("请填写完整的 FTP 主机、用户名和密码");
      return false;
    }
    if (
      protocol === "sftp" &&
      (!host || !config.username || (!config.password && !config.privateKey))
    ) {
      warning("请填写完整的 SFTP 主机、用户名，以及密码或私钥");
      return false;
    }
    setIsSaving(true);
    try {
      await saveWebDavConfig(config);
      success("连接成功，配置已保存");
      await onRefreshStatus();
      return true;
    } catch (err: any) {
      console.error(err);
      error(err.response?.data?.msg || "连接失败，请检查配置");
      return false;
    } finally {
      setIsSaving(false);
    }
  };
  const saveConfigBeforeSync = async () => {
    try {
      await saveWebDavConfig(config);
      await onRefreshStatus();
      return true;
    } catch (err: any) {
      error(
        err.response?.data?.msg ||
          "请先保存并测试通过当前备份配置，再开始同步",
      );
      return false;
    }
  };
  const exportBackup = async () => {
    if (isServerSyncing || isImporting || isExporting) {
      warning("请等待当前任务完成后再导出");
      return;
    }
    setIsExporting(true);
    try {
      const { blob, filename } = await downloadLocalBackupFile();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      success("备份压缩包已开始下载");
    } catch (err: any) {
      error(err.message || "导出备份失败");
    } finally {
      setIsExporting(false);
    }
  };
  const importBackup = async (file: File) => {
    setIsImporting(true);
    try {
      await importLocalBackup(file);
      success("备份已导入，即将刷新页面");
      window.setTimeout(() => window.location.reload(), 1200);
      return true;
    } catch (err: any) {
      error(err.response?.data?.msg || err.message || "导入备份失败");
      return false;
    } finally {
      setIsImporting(false);
    }
  };
  const restoreHistory = async (snapshotId: string) => {
    setIsRestoringHistory(snapshotId);
    try {
      await restoreSyncHistory(snapshotId);
      success("历史快照已恢复，即将刷新页面");
      window.setTimeout(() => window.location.reload(), 1200);
      return true;
    } catch (err: any) {
      error(err.response?.data?.msg || err.message || "历史快照恢复失败");
      return false;
    } finally {
      setIsRestoringHistory("");
    }
  };
  const cancelSync = async () => {
    setIsCancelling(true);
    try {
      await cancelWebDavSync();
      setLogs((prev) => [
        ...prev,
        "⚠️ 已请求终止同步，正在等待当前网络请求结束并释放远端锁。",
      ]);
      success("已请求终止，正在结束同步");
      await onRefreshStatus();
      return true;
    } catch (err: any) {
      error(err.response?.data?.msg || "终止同步失败");
      return false;
    } finally {
      setIsCancelling(false);
    }
  };
  const startSyncStream = async (direction: SyncDirection) => {
    if (!config.enabled) {
      warning("请先开启同步开关并保存配置");
      return;
    }
    if (isServerSyncing) {
      warning("当前已有同步任务正在运行，请等待完成后再操作");
      return;
    }
    if (!(await saveConfigBeforeSync())) return;
    setIsSyncing(true);
    statusSummaryKeyRef.current = "";
    setLogs([`🚀 开始${direction === "upload" ? "上传" : "下载"}同步任务...`]);
    setProgress(0);
    try {
      const response = await fetch(
        `/api/settings/config/sync_${direction === "upload" ? "to" : "from"}_webdav/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(getAuthToken()
              ? { Authorization: `Token ${getAuthToken()}` }
              : {}),
          },
        },
      );
      if (!response.ok)
        throw new Error(
          `请求失败: ${response.status} ${await response.text()}`,
        );
      if (!response.body) throw new Error("浏览器不支持 ReadableStream");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let terminal = false;
      const handleLine = (line: string) => {
        if (!line.trim()) return;
        const data = JSON.parse(line);
        if (typeof data.code === "number" && data.code !== 200)
          throw new Error(data.msg || "同步失败");
        if (data.msg)
          setLogs((prev) => [
            ...prev,
            `${data.step === "error" ? "❌ " : data.step === "summary" || data.step === "done" ? "✨ " : "> "}${data.msg}`,
          ]);
        if (data.progress !== undefined) setProgress(data.progress);
        if (data.step === "error") throw new Error(data.msg || "同步失败");
        if (data.step === "done") {
          terminal = true;
          success(`${direction === "upload" ? "上传" : "下载"}完成`);
          void onRefreshStatus();
          setProgress(100);
          if (direction === "download")
            window.setTimeout(() => window.location.reload(), 1500);
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          try {
            handleLine(line);
          } catch (err) {
            if (err instanceof SyntaxError) {
              console.warn("解析日志失败:", line);
              continue;
            }
            throw err;
          }
        }
      }
      if (buffer.trim()) handleLine(buffer.trim());
      if (!terminal) {
        const latest = (await getWebDavStatus()) as unknown as WebDavSyncStatus;
        if (latest.status === "running") {
          setLogs((prev) => [
            ...prev,
            "⏳ 同步日志连接已结束，后端任务仍在继续；正在显示后端状态。",
          ]);
          setProgress(30);
        } else if (latest.status === "success") {
          setLogs((prev) => [...prev, "✨ 后端已完成同步。"]);
          success(`${direction === "upload" ? "上传" : "下载"}完成`);
          setProgress(100);
        } else throw new Error(latest.lastError || "同步任务未返回完成结果");
        await onRefreshStatus();
      }
    } catch (err: any) {
      setLogs((prev) => [...prev, `❌ 错误: ${err.message || err}`]);
      setProgress(0);
      error("同步过程中发生错误");
    } finally {
      setIsSyncing(false);
      await onRefreshStatus();
    }
  };
  const operationState: SyncOperationState = {
    isSaving,
    isSyncing,
    isExporting,
    isImporting,
    isRefreshingHistory,
    isRestoringHistory,
    isCancelling,
    logs,
    progress,
    history,
    isServerSyncing,
    isCancelRequested,
    isTransferBusy: isSyncing || isServerSyncing,
  };
  return {
    operationState,
    actions: {
      saveConfig,
      refreshHistory,
      exportBackup,
      importBackup,
      restoreHistory,
      cancelSync,
      startSyncStream,
      clearLogs: () => setLogs([]),
    },
  };
};
