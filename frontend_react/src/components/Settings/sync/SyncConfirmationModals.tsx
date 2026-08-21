import type {SyncHistoryEntry} from '@/api/setting.ts';
import ConfirmationModal from '../../common/ConfirmationModal';
import {formatDateTime} from './syncUtils';

interface SyncConfirmationModalsProps {
    cancelOpen: boolean;
    downloadOpen: boolean;
    restoreSnapshot: SyncHistoryEntry | null;
    importFile: File | null;
    isCancelling: boolean;
    isImporting: boolean;
    isRestoring: boolean;
    onCloseCancel: () => void;
    onCloseDownload: () => void;
    onCloseRestore: () => void;
    onCloseImport: () => void;
    onCancel: () => Promise<void>;
    onDownload: () => Promise<void>;
    onRestore: () => Promise<void>;
    onImport: () => Promise<void>;
}

export const SyncConfirmationModals = ({
    cancelOpen,
    downloadOpen,
    restoreSnapshot,
    importFile,
    isCancelling,
    isImporting,
    isRestoring,
    onCloseCancel,
    onCloseDownload,
    onCloseRestore,
    onCloseImport,
    onCancel,
    onDownload,
    onRestore,
    onImport,
}: SyncConfirmationModalsProps) => (
    <>
        <ConfirmationModal
            isOpen={cancelOpen}
            onClose={onCloseCancel}
            onConfirm={onCancel}
            title="终止当前同步任务？"
            description={<>将停止本次同步并释放远端存储锁占用。若正在等待网络请求，会在当前网络请求结束后停止，最长约 30 秒。</>}
            confirmText="终止同步"
            type="danger"
            isLoading={isCancelling}
        />

        <ConfirmationModal
            isOpen={downloadOpen}
            onClose={onCloseDownload}
            onConfirm={onDownload}
            title="确认从云端同步下载？"
            description={
                <div className="space-y-2 text-xs leading-relaxed text-slate-600">
                    <p>该操作将以云端快照为准全量覆盖并对齐本机数据：</p>
                    <ul className="list-disc pl-4 text-rose-600 font-medium space-y-0.5">
                        <li>快照中不存在的文集、图书与图片等会被删除</li>
                        <li>本地未上传至云端的修改将会丢失且无法直接找回</li>
                    </ul>
                    <p className="text-slate-500">建议在下载前先点击「导出本地备份」保存当前数据。确定继续？</p>
                </div>
            }
            confirmText="确认覆盖下载"
            cancelText="取消"
            type="danger"
        />

        <ConfirmationModal
            isOpen={Boolean(restoreSnapshot)}
            onClose={onCloseRestore}
            onConfirm={onRestore}
            title="确认恢复此历史快照？"
            description={
                <div className="space-y-2 text-xs leading-relaxed text-slate-600">
                    <p>
                        将恢复至 <span className="font-semibold text-slate-800 font-mono">{restoreSnapshot ? formatDateTime(restoreSnapshot.generatedAt) : ''}</span> 的历史版本。
                    </p>
                    <p className="text-slate-500">
                        恢复前系统会自动为当前本机数据生成一份安全备份；恢复完成后将自动刷新页面。确定继续？
                    </p>
                </div>
            }
            confirmText="确认恢复"
            cancelText="取消"
            type="warning"
            isLoading={isRestoring}
        />

        <ConfirmationModal
            isOpen={Boolean(importFile)}
            onClose={onCloseImport}
            onConfirm={onImport}
            title="确认导入本地备份文件？"
            description={
                <div className="space-y-2 text-xs leading-relaxed text-slate-600">
                    <p>
                        选中文件：<span className="font-mono font-medium text-slate-800">{importFile?.name}</span>
                    </p>
                    <p className="text-rose-600 font-medium">
                        导入会使用该压缩包全量覆盖当前数据库与文集数据。未包含在压缩包内的内容将不会被恢复。
                    </p>
                    <p className="text-slate-500">确定导入并覆盖当前数据？</p>
                </div>
            }
            confirmText="确认导入并覆盖"
            cancelText="取消"
            type="danger"
            isLoading={isImporting}
        />
    </>
);
