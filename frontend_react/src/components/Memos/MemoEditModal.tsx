import React from 'react';
import { Hash, Pin, PinOff, X } from 'lucide-react';
import { MemoItem } from '../../types/api/memo';

interface MemoEditModalProps {
  memo: MemoItem;
  editContent: string;
  editTag: string;
  editPinned: boolean;
  editSaving: boolean;
  showDiscardConfirm: boolean;
  onContentChange: (content: string) => void;
  onTagChange: (tag: string) => void;
  onPinnedChange: (pinned: boolean) => void;
  onRequestClose: () => void;
  onSubmit: (e?: React.FormEvent) => void;
  onDiscardWithoutSaving: () => void;
  onCancelDiscardConfirm: () => void;
}

export default function MemoEditModal({
  editContent,
  editTag,
  editPinned,
  editSaving,
  showDiscardConfirm,
  onContentChange,
  onTagChange,
  onPinnedChange,
  onRequestClose,
  onSubmit,
  onDiscardWithoutSaving,
  onCancelDiscardConfirm,
}: MemoEditModalProps) {
  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-md"
        onClick={onRequestClose}
      />
      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/20 animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">编辑闪念</h2>
            <p className="mt-0.5 text-xs text-slate-500">沉浸处理当前碎片，保存后回到焦点流。</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPinnedChange(!editPinned)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition ${
                editPinned
                  ? 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
              title={editPinned ? '取消置顶' : '置顶'}
            >
              {editPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              {editPinned ? '已置顶' : '置顶'}
            </button>
            <button
              type="button"
              onClick={onRequestClose}
              disabled={editSaving}
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="relative">
            <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={editTag}
              onChange={(event) => onTagChange(event.target.value)}
              placeholder="添加标签"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/15"
            />
          </div>
          <textarea
            value={editContent}
            onChange={(event) => onContentChange(event.target.value)}
            placeholder="编辑这条闪念..."
            className="min-h-[360px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/15"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">字数: {editContent.length}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onRequestClose}
              disabled={editSaving}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200/70 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!editContent.trim() || editSaving}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {editSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </form>

      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div
            className="absolute inset-0 bg-slate-950/25"
            onClick={onCancelDiscardConfirm}
          />
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/20 animate-in zoom-in-95 slide-in-from-bottom-2 duration-200">
            <button
              type="button"
              onClick={onCancelDiscardConfirm}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-900">编辑确认</h3>
              <p className="mt-6 text-base text-slate-700">有未保存的内容，要先保存吗？</p>
              <div className="mt-8 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onDiscardWithoutSaving}
                  className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  不保存
                </button>
                <button
                  type="button"
                  onClick={() => onSubmit()}
                  disabled={!editContent.trim() || editSaving}
                  className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
